using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Messaging.Handlers;

/// <summary>
/// Ingests <c>comms.recording.consent.logged</c> events from communications platform.
/// Updates dual consent status, transitions recording state, and writes immutable WORM audit logs.
/// </summary>
public sealed class CommsRecordingConsentLoggedHandler : IInteropHandler<CommsRecordingConsentLoggedPayload>
{
    private readonly ApplicationDbContext _db;
    private readonly ClinicRecipientResolver _recipient;
    private readonly ILogger<CommsRecordingConsentLoggedHandler> _logger;

    public CommsRecordingConsentLoggedHandler(
        ApplicationDbContext db,
        ClinicRecipientResolver recipient,
        ILogger<CommsRecordingConsentLoggedHandler> logger)
    {
        _db = db;
        _recipient = recipient;
        _logger = logger;
    }

    public async Task HandleAsync(CommsRecordingConsentLoggedPayload message, InteropMessageContext context, CancellationToken ct)
    {
        var clinic = await _recipient.ResolveAsync(context, ct);
        if (clinic == null) return;

        _logger.LogInformation(
            "[CommsRecordingConsentLoggedHandler] Processing recording consent for CallId {CallId}, Patient {PatientId}, Decision {Decision}",
            message.CallId, message.PatientId, message.Decision);

        var session = await _db.TeleconsultRecordingSessions
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => !s.IsDeleted && s.ClinicId == clinic.ClinicId && s.CallId == message.CallId, ct);

        bool isConsented = string.Equals(message.Decision, "Consented", StringComparison.OrdinalIgnoreCase);
        bool isDeclined = string.Equals(message.Decision, "Declined", StringComparison.OrdinalIgnoreCase)
                       || string.Equals(message.Decision, "Rejected", StringComparison.OrdinalIgnoreCase);

        var now = DateTime.UtcNow;

        if (session != null)
        {
            // Idempotency check: if identical decision already recorded at exact timestamp, exit safely
            if (string.Equals(session.ConsentStatus, message.Decision, StringComparison.OrdinalIgnoreCase) &&
                session.PatientConsentAtUtc == message.LoggedAtUtc)
            {
                return;
            }

            session.ConsentStatus = message.Decision;
            if (isConsented)
            {
                session.PatientConsentAtUtc = message.LoggedAtUtc;
                session.RecordingState = "ReadyToRecord";
            }
            else if (isDeclined)
            {
                session.RecordingState = "Blocked";
                session.RejectionReason ??= $"Patient {message.Decision.ToLowerInvariant()} recording consent via comms";
            }

            session.UpdatedAt = now;
        }
        else
        {
            // Check if appointment exists to initialize session on the fly
            var appointment = await _db.Appointments
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync(a => !a.IsDeleted && a.ClinicId == clinic.ClinicId && a.CallId == message.CallId, ct);

            if (appointment == null)
            {
                _logger.LogWarning("[CommsRecordingConsentLoggedHandler] No session or appointment found for CallId {CallId} in Clinic {ClinicId}",
                    message.CallId, clinic.ClinicId);
                return;
            }

            session = new TeleconsultRecordingSession
            {
                Id = message.ConsentId != Guid.Empty ? message.ConsentId : Guid.NewGuid(),
                TenantId = clinic.TenantId,
                ClinicId = clinic.ClinicId,
                CallId = message.CallId,
                AppointmentId = appointment.Id,
                PatientId = appointment.PatientId,
                PatientName = appointment.PatientName ?? "Patient",
                DoctorId = appointment.DoctorId ?? Guid.Empty,
                DoctorName = appointment.DoctorName ?? "Attending Doctor",
                ConsentStatus = message.Decision,
                RecordingState = isConsented ? "ReadyToRecord" : (isDeclined ? "Blocked" : "PendingConsent"),
                StoragePolicy = !string.IsNullOrWhiteSpace(message.TargetPolicy) ? message.TargetPolicy : (clinic.TeleconsultRecordingPolicy ?? "WorkspaceVaultOnly"),
                RetentionPolicyDays = clinic.TeleconsultRecordingRetentionDays,
                ContainerFormat = "video/webm; codecs=vp8,opus",
                PatientConsentAtUtc = isConsented ? message.LoggedAtUtc : null,
                RejectionReason = isDeclined ? $"Patient {message.Decision.ToLowerInvariant()} recording consent via comms" : null,
                CreatedAt = now,
                UpdatedAt = now
            };

            _db.TeleconsultRecordingSessions.Add(session);
        }

        // Immutable WORM Audit Entry
        var audit = new AuditEntry
        {
            Id = Guid.NewGuid(),
            TenantId = session.TenantId,
            ClinicId = session.ClinicId,
            Timestamp = now,
            Category = ClinicAuditCategories.Clinical,
            Severity = isDeclined ? ClinicAuditSeverities.Urgent : ClinicAuditSeverities.Routine,
            Action = "teleconsult.recording.consent_logged",
            ActorName = session.PatientName,
            ActorRole = "Patient",
            TargetEntityType = "TeleconsultRecordingSession",
            TargetEntityId = session.Id.ToString(),
            PatientId = session.PatientId,
            PatientNameMasked = MaskName(session.PatientName),
            Outcome = isDeclined ? ClinicAuditOutcomes.Warning : ClinicAuditOutcomes.Success,
            Description = $"Patient recording consent logged via comms for session {session.Id} (CallId: {session.CallId}, Decision: {message.Decision}).",
            MetadataJson = JsonSerializer.Serialize(new
            {
                ConsentId = message.ConsentId,
                CallId = message.CallId,
                Decision = message.Decision,
                TargetPolicy = message.TargetPolicy,
                Version = message.Version,
                LoggedAtUtc = message.LoggedAtUtc,
                SessionId = session.Id
            }, InteropJson.Options)
        };

        _db.AuditEntries.Add(audit);
        await _db.SaveChangesAsync(ct);
    }

    private static string MaskName(string fullName)
    {
        if (string.IsNullOrWhiteSpace(fullName)) return "***";
        var parts = fullName.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 1) return parts[0][0] + "***";
        return $"{parts[0][0]}*** {parts[^1][0]}***";
    }
}
