using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.TeleconsultRecordings.DTOs;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Application.Features.TeleconsultRecordings.Commands;

public sealed record PlaceLegalHoldCommand(
    Guid SessionId,
    string Reason) : IRequest<RecordingSessionDto>;

public sealed record ReleaseLegalHoldCommand(
    Guid SessionId,
    string? Reason = null) : IRequest<RecordingSessionDto>;

public sealed class LegalHoldCommandHandler :
    IRequestHandler<PlaceLegalHoldCommand, RecordingSessionDto>,
    IRequestHandler<ReleaseLegalHoldCommand, RecordingSessionDto>
{
    private readonly IRepository<TeleconsultRecordingSession> _sessionRepo;
    private readonly IRepository<AuditEntry> _auditRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly ILogger<LegalHoldCommandHandler> _logger;

    public LegalHoldCommandHandler(
        IRepository<TeleconsultRecordingSession> sessionRepo,
        IRepository<AuditEntry> auditRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        ILogger<LegalHoldCommandHandler> logger)
    {
        _sessionRepo = sessionRepo;
        _auditRepo = auditRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _logger = logger;
    }

    public async Task<RecordingSessionDto> Handle(PlaceLegalHoldCommand request, CancellationToken ct)
    {
        if (!_clinicContext.HasPermission(ClinicPermissions.SettingsManage))
        {
            throw new ForbiddenException("Only facility administrators can place medico-legal holds on recordings.");
        }

        if (string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Trim().Length < 5)
        {
            throw new BadRequestException("Substantive legal hold justification reason is mandatory (minimum 5 characters).");
        }

        var session = await _sessionRepo.Query()
            .FirstOrDefaultAsync(s => s.Id == request.SessionId && s.ClinicId == _clinicContext.ClinicId, ct)
            ?? throw new NotFoundException($"Recording session {request.SessionId} not found.");

        var now = DateTime.UtcNow;
        session.IsLegalHold = true;
        session.LegalHoldReason = request.Reason.Trim();
        session.LegalHoldPlacedAtUtc = now;
        session.LegalHoldPlacedByStaffId = _clinicContext.StaffId;
        session.LegalHoldPlacedByStaffName = _clinicContext.StaffName ?? "Facility Administrator";

        var audit = new AuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = session.TenantId,
            ClinicId = session.ClinicId,
            Timestamp = now,
            Category = ClinicAuditCategories.Operations,
            Severity = ClinicAuditSeverities.Urgent,
            Action = "teleconsult.recording.legal_hold.placed",
            ActorStaffId = _clinicContext.StaffId,
            ActorName = _clinicContext.StaffName ?? "Facility Administrator",
            ActorRole = "Admin",
            TargetEntityType = "TeleconsultRecordingSession",
            TargetEntityId = session.Id.ToString(),
            PatientId = session.PatientId,
            Outcome = ClinicAuditOutcomes.Success,
            Description = $"Medico-legal hold placed on teleconsult recording {session.Id}. Retention sweeps frozen. Reason: {request.Reason.Trim()}",
            MetadataJson = JsonSerializer.Serialize(new
            {
                SessionId = session.Id,
                session.CallId,
                Reason = request.Reason.Trim(),
                PlacedByStaffId = _clinicContext.StaffId,
                PlacedAtUtc = now
            })
        };

        await _auditRepo.AddAsync(audit, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        _logger.LogWarning("[RecordingVault] Medico-legal hold placed on session {SessionId}. Reason: {Reason}", session.Id, request.Reason);

        return MapToDto(session);
    }

    public async Task<RecordingSessionDto> Handle(ReleaseLegalHoldCommand request, CancellationToken ct)
    {
        if (!_clinicContext.HasPermission(ClinicPermissions.SettingsManage))
        {
            throw new ForbiddenException("Only facility administrators can release medico-legal holds on recordings.");
        }

        var session = await _sessionRepo.Query()
            .FirstOrDefaultAsync(s => s.Id == request.SessionId && s.ClinicId == _clinicContext.ClinicId, ct)
            ?? throw new NotFoundException($"Recording session {request.SessionId} not found.");

        var now = DateTime.UtcNow;
        var previousReason = session.LegalHoldReason;
        session.IsLegalHold = false;
        session.LegalHoldReason = null;

        var audit = new AuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = session.TenantId,
            ClinicId = session.ClinicId,
            Timestamp = now,
            Category = ClinicAuditCategories.Operations,
            Severity = ClinicAuditSeverities.Routine,
            Action = "teleconsult.recording.legal_hold.released",
            ActorStaffId = _clinicContext.StaffId,
            ActorName = _clinicContext.StaffName ?? "Facility Administrator",
            ActorRole = "Admin",
            TargetEntityType = "TeleconsultRecordingSession",
            TargetEntityId = session.Id.ToString(),
            PatientId = session.PatientId,
            Outcome = ClinicAuditOutcomes.Success,
            Description = $"Medico-legal hold released from teleconsult recording {session.Id}. Normal retention schedule resumed.",
            MetadataJson = JsonSerializer.Serialize(new
            {
                SessionId = session.Id,
                session.CallId,
                PreviousReason = previousReason,
                ReleaseReason = request.Reason,
                ReleasedByStaffId = _clinicContext.StaffId,
                ReleasedAtUtc = now
            })
        };

        await _auditRepo.AddAsync(audit, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        _logger.LogInformation("[RecordingVault] Medico-legal hold released for session {SessionId}.", session.Id);

        return MapToDto(session);
    }

    private static RecordingSessionDto MapToDto(TeleconsultRecordingSession s) =>
        new(
            s.Id,
            s.ClinicId,
            s.CallId,
            s.AppointmentId,
            s.ConsultationId,
            s.PatientId,
            s.PatientName,
            s.DoctorId,
            s.DoctorName,
            s.ConsentStatus,
            s.RecordingState,
            s.StoragePolicy,
            s.TotalDurationSeconds,
            s.SegmentCount,
            s.TotalSizeBytes,
            s.ContainerFormat,
            s.ManifestStorageKey,
            s.HasGaps,
            s.RetentionPolicyDays,
            s.ExpiresAtUtc,
            s.IsLegalHold,
            s.LegalHoldReason,
            s.IsPurged
        );
}
