using System;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Exceptions;
using ClinicEz.Clinic.Application.Features.TeleconsultRecordings.Commands;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Application.Features.Teleconsult.Commands;

public sealed record EndTeleconsultCallCommand(
    Guid AppointmentId,
    string? EndReason = null) : IRequest<TeleconsultCallEndResultDto>;

public sealed record TeleconsultCallEndResultDto(
    Guid AppointmentId,
    Guid CallId,
    string RoomName,
    DateTime EndedAtUtc,
    string Status,
    bool RecordingFinalized,
    bool WormAuditLogged,
    bool CommsCallStateChangedEnqueued);

public sealed class EndTeleconsultCallCommandHandler : IRequestHandler<EndTeleconsultCallCommand, TeleconsultCallEndResultDto>
{
    private readonly IRepository<Appointment> _appointmentRepo;
    private readonly IRepository<TeleconsultRecordingSession> _sessionRepo;
    private readonly IRepository<AuditEntry> _auditRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IInteropPublisher _publisher;
    private readonly ISender _sender;
    private readonly ILogger<EndTeleconsultCallCommandHandler> _logger;

    public EndTeleconsultCallCommandHandler(
        IRepository<Appointment> appointmentRepo,
        IRepository<TeleconsultRecordingSession> sessionRepo,
        IRepository<AuditEntry> auditRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IInteropPublisher publisher,
        ISender sender,
        ILogger<EndTeleconsultCallCommandHandler> logger)
    {
        _appointmentRepo = appointmentRepo;
        _sessionRepo = sessionRepo;
        _auditRepo = auditRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _publisher = publisher;
        _sender = sender;
        _logger = logger;
    }

    public async Task<TeleconsultCallEndResultDto> Handle(EndTeleconsultCallCommand request, CancellationToken ct)
    {
        // 1. RBAC check
        if (!_clinicContext.HasPermission(ClinicPermissions.ConsultationsWrite) &&
            !_clinicContext.HasPermission(ClinicPermissions.ConsultationsSign))
        {
            throw new ForbiddenException("Staff requires ConsultationsWrite or ConsultationsSign authority to end teleconsultation call.");
        }

        // 2. Fetch appointment
        var appointment = await _appointmentRepo.Query()
            .FirstOrDefaultAsync(a => a.Id == request.AppointmentId && a.ClinicId == _clinicContext.ClinicId && !a.IsDeleted, ct)
            ?? throw new NotFoundException($"Appointment {request.AppointmentId} not found.");

        if (!appointment.IsTeleconsult)
        {
            throw new BadRequestException("Appointment is not a teleconsultation.");
        }

        if (!appointment.CallId.HasValue)
        {
            throw new InvalidOperationException("Appointment has no CallId.");
        }

        var callId = appointment.CallId.Value;
        var roomName = $"call-{callId:N}";
        var now = DateTime.UtcNow;

        // 3. Auto-finalize active recording session if in progress
        bool recordingFinalized = false;
        var activeSession = await _sessionRepo.Query()
            .Include(s => s.Segments)
            .FirstOrDefaultAsync(s => s.CallId == callId && s.ClinicId == _clinicContext.ClinicId && !s.IsDeleted && s.RecordingState == "Recording", ct);

        if (activeSession != null)
        {
            try
            {
                await _sender.Send(new FinalizeRecordingSessionCommand(activeSession.Id), ct);
                recordingFinalized = true;
                _logger.LogInformation("[TeleconsultCall] Auto-finalized recording session {SessionId} on call termination.", activeSession.Id);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[TeleconsultCall] Failed to auto-finalize recording session {SessionId} for call {CallId}.", activeSession.Id, callId);
            }
        }

        // 4. Update appointment status to Completed
        appointment.Status = AppointmentStatus.Completed;
        await _unitOfWork.SaveChangesAsync(ct);

        // 5. Enqueue comms.call.state.changed (Status: Ended)
        _publisher.Enqueue(
            InteropTypes.CommsCallStateChanged,
            Party.ForFacility(_clinicContext.TenantId, _clinicContext.ClinicId.ToString(), FacilityType.Clinic),
            Party.ForPatient(appointment.PatientId.ToString()),
            callId,
            new CommsCallStateChangedPayload(
                CallId: callId,
                ConversationId: null,
                TenantId: _clinicContext.TenantId,
                FacilityId: _clinicContext.ClinicId.ToString(),
                Kind: CallKind.Teleconsult,
                Status: "Ended",
                RoomName: roomName,
                JoinToken: null,
                StateVersion: 2,
                ChangedAtUtc: now,
                RelayUrl: null
            ));

        // 6. Immutable WORM Audit Entry
        var audit = new AuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            Timestamp = now,
            Category = ClinicAuditCategories.Clinical,
            Severity = ClinicAuditSeverities.Routine,
            Action = "teleconsult.call.ended",
            ActorStaffId = _clinicContext.StaffId,
            ActorName = _clinicContext.StaffName ?? "Attending Staff",
            ActorRole = _clinicContext.StaffRole ?? "Staff",
            TargetEntityType = "Appointment",
            TargetEntityId = appointment.Id.ToString(),
            PatientId = appointment.PatientId,
            PatientNameMasked = MaskName(appointment.PatientName),
            Outcome = ClinicAuditOutcomes.Success,
            Description = $"Teleconsult call ended. Reason: {request.EndReason ?? "Normal termination"}",
            MetadataJson = JsonSerializer.Serialize(new
            {
                AppointmentId = appointment.Id,
                CallId = callId,
                EndedAtUtc = now,
                RecordingFinalized = recordingFinalized,
                Reason = request.EndReason ?? "Normal termination"
            }, InteropJson.Options)
        };

        await _auditRepo.AddAsync(audit, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return new TeleconsultCallEndResultDto(
            AppointmentId: appointment.Id,
            CallId: callId,
            RoomName: roomName,
            EndedAtUtc: now,
            Status: "Ended",
            RecordingFinalized: recordingFinalized,
            WormAuditLogged: true,
            CommsCallStateChangedEnqueued: true);
    }

    private static string MaskName(string? name)
    {
        if (string.IsNullOrWhiteSpace(name)) return "P***";
        var parts = name.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return string.Join(" ", parts.Select(p => p.Length > 1 ? $"{p[0]}***" : p));
    }
}
