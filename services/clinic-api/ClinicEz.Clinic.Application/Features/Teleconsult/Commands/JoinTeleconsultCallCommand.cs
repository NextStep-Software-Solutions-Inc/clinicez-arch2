using System;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Exceptions;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Requests;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Application.Features.Teleconsult.Commands;

public sealed record JoinTeleconsultCallCommand(Guid AppointmentId) : IRequest<TeleconsultCallJoinDto>;

public sealed record TeleconsultCallJoinDto(
    Guid AppointmentId,
    Guid CallId,
    string RoomName,
    string? RelayUrl,
    string? ClinicianToken,
    string ParticipantIdentity,
    bool MediaAvailable,
    string? MediaStatusMessage,
    string RecordingPolicy,
    bool RecordingConsentRequired,
    string? AccessToken = null,
    string? Token = null,
    string? LiveKitServerUrl = null,
    bool IsFallbackToken = false,
    DateTime? ExpiresAtUtc = null);

public sealed class JoinTeleconsultCallCommandHandler : IRequestHandler<JoinTeleconsultCallCommand, TeleconsultCallJoinDto>
{
    private static readonly Regex ZeroPhiRoomRegex = new(@"^call-[0-9a-fA-F\-]{32,36}$", RegexOptions.Compiled);
    private static readonly Regex ZeroPhiParticipantRegex = new(@"^(staff|patient|guest|participant)(:|-)[0-9a-zA-Z\-_]{1,64}$", RegexOptions.Compiled);

    private readonly IRepository<Appointment> _appointmentRepo;
    private readonly IRepository<FacilitySettings> _settingsRepo;
    private readonly IRepository<AuditEntry> _auditRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IInteropRequestClient _requestClient;
    private readonly IInteropPublisher _publisher;
    private readonly ILogger<JoinTeleconsultCallCommandHandler> _logger;

    public JoinTeleconsultCallCommandHandler(
        IRepository<Appointment> appointmentRepo,
        IRepository<FacilitySettings> settingsRepo,
        IRepository<AuditEntry> auditRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IInteropRequestClient requestClient,
        IInteropPublisher publisher,
        ILogger<JoinTeleconsultCallCommandHandler> logger)
    {
        _appointmentRepo = appointmentRepo;
        _settingsRepo = settingsRepo;
        _auditRepo = auditRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _requestClient = requestClient;
        _publisher = publisher;
        _logger = logger;
    }

    public async Task<TeleconsultCallJoinDto> Handle(JoinTeleconsultCallCommand request, CancellationToken ct)
    {
        // 1. RBAC check
        if (!_clinicContext.HasPermission(ClinicPermissions.ConsultationsWrite) &&
            !_clinicContext.HasPermission(ClinicPermissions.ConsultationsSign))
        {
            throw new ForbiddenException("Staff requires ConsultationsWrite or ConsultationsSign authority to join teleconsultation call.");
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
            throw new InvalidOperationException("Appointment is not a teleconsultation or has no CallId.");
        }

        // 3. Admission gate check
        if (appointment.AdmittedAtUtc == null)
        {
            if (appointment.PaymentPolicy == TeleconsultPaymentPolicy.Prepaid &&
                appointment.PaymentStatus != TeleconsultPaymentStatus.Paid &&
                appointment.PaymentStatus != TeleconsultPaymentStatus.Exempt &&
                appointment.PaymentStatus != TeleconsultPaymentStatus.Overridden)
            {
                throw new TeleconsultPaymentRequiredException(appointment.Id, appointment.PaidAmount ?? 400.00m);
            }

            throw new InvalidOperationException("Patient has not been admitted to the teleconsultation session yet.");
        }

        var callId = appointment.CallId.Value;
        var roomName = $"call-{callId:N}";
        var staffId = _clinicContext.StaffId ?? throw new UnauthorizedException("Authenticated staff identity required.");
        var staffIdentity = $"staff:{staffId:N}";
        var patientIdentity = $"patient:{appointment.PatientId:N}";

        // 4. Zero-PHI regex validation
        if (!ZeroPhiRoomRegex.IsMatch(roomName))
        {
            throw new ArgumentException($"Room name '{roomName}' violates zero-PHI regex.");
        }

        if (!ZeroPhiParticipantRegex.IsMatch(staffIdentity))
        {
            throw new ArgumentException($"Staff identity '{staffIdentity}' violates zero-PHI regex.");
        }

        if (!ZeroPhiParticipantRegex.IsMatch(patientIdentity))
        {
            throw new ArgumentException($"Patient identity '{patientIdentity}' violates zero-PHI regex.");
        }

        // 5. Query facility recording policy settings
        var settings = await _settingsRepo.Query(s => s.ClinicId == _clinicContext.ClinicId).FirstOrDefaultAsync(ct);
        var recordingPolicy = settings?.TeleconsultRecordingPolicy ?? "Disabled";
        var recordingConsentRequired = settings?.TeleconsultRecordingConsentRequired ?? true;

        // 6. Request LiveKit room tokens from Party.Media with 10s timeout
        bool mediaAvailable = false;
        string? mediaStatusMessage = null;
        string? relayUrl = null;
        string? clinicianToken = null;
        string? patientToken = null;

        try
        {
            var mediaResponse = await _requestClient.RequestAsync<MediaRoomRequestedPayload, MediaRoomRespondedPayload>(
                requestType: InteropTypes.MediaRoomRequested,
                replyType: InteropTypes.MediaRoomResponded,
                from: Party.ForFacility(_clinicContext.TenantId, _clinicContext.ClinicId.ToString(), FacilityType.Clinic),
                to: Party.Media,
                payload: new MediaRoomRequestedPayload(
                    _clinicContext.TenantId,
                    callId,
                    roomName,
                    new[] { staffIdentity, patientIdentity }
                ),
                timeout: TimeSpan.FromSeconds(10),
                ct: ct);

            if (mediaResponse != null && mediaResponse.Success)
            {
                mediaAvailable = true;
                relayUrl = mediaResponse.RelayUrl;
                if (mediaResponse.ParticipantTokens != null)
                {
                    mediaResponse.ParticipantTokens.TryGetValue(staffIdentity, out clinicianToken);
                    mediaResponse.ParticipantTokens.TryGetValue(patientIdentity, out patientToken);
                }
            }
            else
            {
                mediaAvailable = false;
                mediaStatusMessage = mediaResponse?.ErrorMessage ?? "Media broker returned unready status. Call state maintained in offline signaling mode.";
            }
        }
        catch (InteropRequestTimeoutException ex)
        {
            _logger.LogWarning(ex, "[TeleconsultMedia] Timeout requesting media room for call {CallId}. Falling back to offline signaling mode.", callId);
            mediaAvailable = false;
            mediaStatusMessage = "Media broker unavailable. Call state maintained in offline signaling mode.";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[TeleconsultMedia] Error requesting media room for call {CallId}. Falling back to offline signaling mode.", callId);
            mediaAvailable = false;
            mediaStatusMessage = "Media broker unavailable. Call state maintained in offline signaling mode.";
        }

        // Graceful offline fallback tokens
        bool isFallbackToken = !mediaAvailable;
        if (!mediaAvailable)
        {
            clinicianToken = $"fallback-token-{Guid.NewGuid():N}";
            patientToken = $"fallback-token-{Guid.NewGuid():N}";
            relayUrl ??= "wss://media.clinicez.internal";
        }

        var expiresAt = DateTime.UtcNow.AddMinutes(60);

        // 7. Enqueue comms.call.state.changed
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
                Status: "Admitted",
                RoomName: roomName,
                JoinToken: patientToken,
                StateVersion: 1,
                ChangedAtUtc: DateTime.UtcNow,
                RelayUrl: relayUrl
            ));

        // 8. Immutable WORM Audit Entry
        var now = DateTime.UtcNow;
        var audit = new AuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            Timestamp = now,
            Category = ClinicAuditCategories.Clinical,
            Severity = ClinicAuditSeverities.Routine,
            Action = "teleconsult.call.joined",
            ActorStaffId = _clinicContext.StaffId,
            ActorName = _clinicContext.StaffName ?? "Attending Clinician",
            ActorRole = _clinicContext.StaffRole ?? "Doctor",
            TargetEntityType = "Appointment",
            TargetEntityId = appointment.Id.ToString(),
            PatientId = appointment.PatientId,
            PatientNameMasked = MaskName(appointment.PatientName),
            Outcome = ClinicAuditOutcomes.Success,
            Description = $"Clinician {_clinicContext.StaffName ?? "Staff"} joined teleconsultation call {callId}. MediaAvailable: {mediaAvailable}.",
            MetadataJson = JsonSerializer.Serialize(new
            {
                AppointmentId = appointment.Id,
                CallId = callId,
                RoomName = roomName,
                ParticipantIdentity = staffIdentity,
                MediaAvailable = mediaAvailable,
                MediaStatusMessage = mediaStatusMessage,
                JoinedAtUtc = now
            }, InteropJson.Options)
        };

        await _auditRepo.AddAsync(audit, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return new TeleconsultCallJoinDto(
            AppointmentId: appointment.Id,
            CallId: callId,
            RoomName: roomName,
            RelayUrl: relayUrl,
            ClinicianToken: clinicianToken,
            ParticipantIdentity: staffIdentity,
            MediaAvailable: mediaAvailable,
            MediaStatusMessage: mediaStatusMessage,
            RecordingPolicy: recordingPolicy,
            RecordingConsentRequired: recordingConsentRequired,
            AccessToken: clinicianToken,
            Token: clinicianToken,
            LiveKitServerUrl: relayUrl,
            IsFallbackToken: isFallbackToken,
            ExpiresAtUtc: expiresAt);
    }

    private static string MaskName(string? name)
    {
        if (string.IsNullOrWhiteSpace(name)) return "P***";
        var parts = name.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return string.Join(" ", parts.Select(p => p.Length > 1 ? $"{p[0]}***" : p));
    }
}
