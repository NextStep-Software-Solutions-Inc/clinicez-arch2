using System;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.TeleconsultRecordings.DTOs;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Application.Features.TeleconsultRecordings.Commands;

public sealed record RequestRecordingConsentCommand(
    Guid CallId,
    Guid PatientId,
    Guid DoctorId,
    Guid? AppointmentId = null,
    Guid? ConsultationId = null,
    string? ContainerFormat = null) : IRequest<RecordingSessionDto>;

public sealed record SubmitPatientConsentCommand(
    Guid SessionId,
    bool Approved,
    string? RejectionReason = null,
    string? IpAddress = null,
    string? UserAgent = null) : IRequest<RecordingSessionDto>;

public sealed record RevokeRecordingConsentCommand(
    Guid SessionId,
    string? Reason = null) : IRequest<RecordingSessionDto>;

public sealed class ConsentCommandHandler :
    IRequestHandler<RequestRecordingConsentCommand, RecordingSessionDto>,
    IRequestHandler<SubmitPatientConsentCommand, RecordingSessionDto>,
    IRequestHandler<RevokeRecordingConsentCommand, RecordingSessionDto>
{
    private readonly IRepository<FacilitySettings> _settingsRepo;
    private readonly IRepository<TeleconsultRecordingSession> _sessionRepo;
    private readonly IRepository<Patient> _patientRepo;
    private readonly IRepository<StaffMember> _staffRepo;
    private readonly IRepository<AuditEntry> _auditRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly ILogger<ConsentCommandHandler> _logger;

    public ConsentCommandHandler(
        IRepository<FacilitySettings> settingsRepo,
        IRepository<TeleconsultRecordingSession> sessionRepo,
        IRepository<Patient> patientRepo,
        IRepository<StaffMember> staffRepo,
        IRepository<AuditEntry> auditRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        ILogger<ConsentCommandHandler> logger)
    {
        _settingsRepo = settingsRepo;
        _sessionRepo = sessionRepo;
        _patientRepo = patientRepo;
        _staffRepo = staffRepo;
        _auditRepo = auditRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _logger = logger;
    }

    public async Task<RecordingSessionDto> Handle(RequestRecordingConsentCommand request, CancellationToken ct)
    {
        // 1. Facility Recording Policy Sovereignty Guard
        var settings = await _settingsRepo.Query()
            .FirstOrDefaultAsync(s => s.ClinicId == _clinicContext.ClinicId, ct);

        var policy = settings?.TeleconsultRecordingPolicy ?? "Disabled";
        if (string.Equals(policy, "Disabled", StringComparison.OrdinalIgnoreCase))
        {
            throw new ForbiddenException("Teleconsultation recording is disabled by facility administrative policy. RECORDING_POLICY_DISABLED.");
        }

        // 2. Permission Guard: Clinician authority
        if (!_clinicContext.HasPermission(ClinicPermissions.TeleconsultRecord))
        {
            throw new ForbiddenException("Caller lacks required teleconsult:record permission. INSUFFICIENT_PERMISSIONS.");
        }

        // Check if session already exists for this CallId
        var existing = await _sessionRepo.Query()
            .FirstOrDefaultAsync(s => s.CallId == request.CallId && s.ClinicId == _clinicContext.ClinicId, ct);

        if (existing != null)
        {
            return MapToDto(existing);
        }

        var patient = await _patientRepo.Query()
            .FirstOrDefaultAsync(p => p.Id == request.PatientId && p.ClinicId == _clinicContext.ClinicId, ct)
            ?? throw new NotFoundException($"Patient {request.PatientId} not found.");

        var doctor = await _staffRepo.Query()
            .FirstOrDefaultAsync(s => s.Id == request.DoctorId && s.ClinicId == _clinicContext.ClinicId, ct);

        var doctorName = doctor != null ? $"{doctor.FirstName} {doctor.LastName}" : (_clinicContext.StaffName ?? "Attending Doctor");
        var patientName = $"{patient.FirstName} {patient.LastName}";

        var now = DateTime.UtcNow;
        var session = new TeleconsultRecordingSession
        {
            Id = Guid.NewGuid(),
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            CallId = request.CallId,
            AppointmentId = request.AppointmentId,
            ConsultationId = request.ConsultationId,
            PatientId = patient.Id,
            PatientName = patientName,
            DoctorId = request.DoctorId,
            DoctorName = doctorName,
            ConsentStatus = "ConsentPending",
            RecordingState = "PendingConsent",
            StoragePolicy = policy,
            RetentionPolicyDays = settings?.TeleconsultRecordingRetentionDays ?? 90,
            ContainerFormat = request.ContainerFormat ?? "video/webm; codecs=vp8,opus",
            ClinicianConsentAtUtc = now
        };

        await _sessionRepo.AddAsync(session, ct);

        // WORM Audit Entry
        var audit = new AuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            Timestamp = now,
            Category = ClinicAuditCategories.Clinical,
            Severity = ClinicAuditSeverities.Routine,
            Action = "teleconsult.recording.consent.requested",
            ActorStaffId = _clinicContext.StaffId,
            ActorName = _clinicContext.StaffName ?? "Attending Doctor",
            ActorRole = _clinicContext.StaffRole ?? "Doctor",
            TargetEntityType = "TeleconsultRecordingSession",
            TargetEntityId = session.Id.ToString(),
            PatientId = patient.Id,
            PatientNameMasked = MaskName(patientName),
            Outcome = ClinicAuditOutcomes.Success,
            Description = $"Recording consent requested for teleconsult call {request.CallId} with patient {MaskName(patientName)}.",
            MetadataJson = JsonSerializer.Serialize(new
            {
                SessionId = session.Id,
                session.CallId,
                session.StoragePolicy,
                session.RetentionPolicyDays
            })
        };

        await _auditRepo.AddAsync(audit, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        _logger.LogInformation("[RecordingVault] Consent requested for session {SessionId}, CallId {CallId}", session.Id, session.CallId);

        return MapToDto(session);
    }

    public async Task<RecordingSessionDto> Handle(SubmitPatientConsentCommand request, CancellationToken ct)
    {
        var session = await _sessionRepo.Query()
            .FirstOrDefaultAsync(s => s.Id == request.SessionId && s.ClinicId == _clinicContext.ClinicId, ct)
            ?? throw new NotFoundException($"Recording session {request.SessionId} not found.");

        var now = DateTime.UtcNow;

        if (request.Approved)
        {
            session.ConsentStatus = "Consented";
            session.RecordingState = "ReadyToRecord";
            session.PatientConsentAtUtc = now;
            session.PatientConsentIpAddress = request.IpAddress;
            session.PatientConsentUserAgent = request.UserAgent;

            var audit = new AuditEntry
            {
                Id = Guid.NewGuid(),
                TenantId = session.TenantId,
                ClinicId = session.ClinicId,
                Timestamp = now,
                Category = ClinicAuditCategories.Clinical,
                Severity = ClinicAuditSeverities.Routine,
                Action = "teleconsult.recording.consent.granted",
                ActorName = session.PatientName,
                ActorRole = "Patient",
                TargetEntityType = "TeleconsultRecordingSession",
                TargetEntityId = session.Id.ToString(),
                PatientId = session.PatientId,
                PatientNameMasked = MaskName(session.PatientName),
                ClientIpAddress = request.IpAddress,
                UserAgent = request.UserAgent,
                Outcome = ClinicAuditOutcomes.Success,
                Description = $"Patient granted informed consent for teleconsult recording session {session.Id}.",
                MetadataJson = JsonSerializer.Serialize(new { SessionId = session.Id, session.CallId, Approved = true })
            };
            await _auditRepo.AddAsync(audit, ct);
        }
        else
        {
            // Patient rejection locks recording in Blocked state
            session.ConsentStatus = "Rejected";
            session.RecordingState = "Blocked";
            session.RejectionReason = request.RejectionReason ?? "Patient declined recording consent";
            session.PatientConsentAtUtc = now;
            session.PatientConsentIpAddress = request.IpAddress;
            session.PatientConsentUserAgent = request.UserAgent;

            var audit = new AuditEntry
            {
                Id = Guid.NewGuid(),
                TenantId = session.TenantId,
                ClinicId = session.ClinicId,
                Timestamp = now,
                Category = ClinicAuditCategories.Clinical,
                Severity = ClinicAuditSeverities.Urgent,
                Action = "teleconsult.recording.consent.rejected",
                ActorName = session.PatientName,
                ActorRole = "Patient",
                TargetEntityType = "TeleconsultRecordingSession",
                TargetEntityId = session.Id.ToString(),
                PatientId = session.PatientId,
                PatientNameMasked = MaskName(session.PatientName),
                ClientIpAddress = request.IpAddress,
                UserAgent = request.UserAgent,
                Outcome = ClinicAuditOutcomes.Warning,
                Description = $"Patient declined teleconsult recording consent for session {session.Id}. Reason: {session.RejectionReason}",
                MetadataJson = JsonSerializer.Serialize(new
                {
                    SessionId = session.Id,
                    session.CallId,
                    Approved = false,
                    Reason = session.RejectionReason
                })
            };
            await _auditRepo.AddAsync(audit, ct);
        }

        await _unitOfWork.SaveChangesAsync(ct);
        return MapToDto(session);
    }

    public async Task<RecordingSessionDto> Handle(RevokeRecordingConsentCommand request, CancellationToken ct)
    {
        var session = await _sessionRepo.Query()
            .FirstOrDefaultAsync(s => s.Id == request.SessionId && s.ClinicId == _clinicContext.ClinicId, ct)
            ?? throw new NotFoundException($"Recording session {request.SessionId} not found.");

        var now = DateTime.UtcNow;
        session.ConsentStatus = "Revoked";
        session.RecordingState = "Stopped";
        session.StoppedAtUtc = now;

        var audit = new AuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = session.TenantId,
            ClinicId = session.ClinicId,
            Timestamp = now,
            Category = ClinicAuditCategories.Clinical,
            Severity = ClinicAuditSeverities.Urgent,
            Action = "teleconsult.recording.consent.revoked",
            ActorStaffId = _clinicContext.StaffId,
            ActorName = _clinicContext.StaffName ?? session.PatientName,
            ActorRole = _clinicContext.StaffRole ?? "Participant",
            TargetEntityType = "TeleconsultRecordingSession",
            TargetEntityId = session.Id.ToString(),
            PatientId = session.PatientId,
            PatientNameMasked = MaskName(session.PatientName),
            Outcome = ClinicAuditOutcomes.Success,
            Description = $"Recording consent was revoked for session {session.Id}. Recording halted immediately.",
            MetadataJson = JsonSerializer.Serialize(new { SessionId = session.Id, session.CallId, Reason = request.Reason })
        };

        await _auditRepo.AddAsync(audit, ct);
        await _unitOfWork.SaveChangesAsync(ct);

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

    private static string MaskName(string name)
    {
        if (string.IsNullOrWhiteSpace(name)) return "P***";
        var parts = name.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return string.Join(" ", parts.Select(p => p.Length > 1 ? $"{p[0]}***" : p));
    }
}
