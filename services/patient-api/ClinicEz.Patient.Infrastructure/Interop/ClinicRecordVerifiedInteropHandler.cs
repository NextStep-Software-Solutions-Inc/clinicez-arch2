using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Patient.Infrastructure.Interop;

/// <summary>
/// Handles <c>clinic.record.verified</c>: the clinic reviewed a document the patient shared. Only the
/// clinic named in the payload may speak for it, and only to the patient the payload is about.
/// </summary>
public sealed class ClinicRecordVerifiedInteropHandler : IInteropHandler<ClinicRecordVerifiedEvent>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ILogger<ClinicRecordVerifiedInteropHandler> _logger;

    public ClinicRecordVerifiedInteropHandler(ApplicationDbContext dbContext, ILogger<ClinicRecordVerifiedInteropHandler> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    public async Task HandleAsync(ClinicRecordVerifiedEvent message, InteropMessageContext context, CancellationToken ct)
    {
        if (!IsFromClinic(context.From, message)
            || context.To.Kind != PartyKind.Patient
            || context.To.PatientId != message.PatientId.ToString())
        {
            _logger.LogWarning(
                "Ignoring clinic.record.verified {MessageId} from {Sender} to {Recipient}: not clinic {ClinicId} of tenant {TenantId} addressing patient {PatientId}.",
                context.MessageId, context.From.Address, context.To.Address, message.ClinicId, message.TenantId, message.PatientId);
            return;
        }

        _logger.LogInformation(
            "[ClinicEz.Patient] Received ClinicRecordVerifiedEvent for Attachment {AttachmentId}, Patient {PatientId}, Status {Status}",
            message.AttachmentId, message.PatientId, message.VerificationStatus);

        // Find file record if exists
        var file = await _dbContext.FileRecords
            .FirstOrDefaultAsync(f => f.Id == message.AttachmentId && f.PatientId == message.PatientId, ct);

        if (file != null)
        {
            file.SyncStatus = message.VerificationStatus == "Verified" ? FileSyncStatus.Synced : FileSyncStatus.Failed;
            file.SyncError = message.RejectionReason;
            file.UpdatedAt = DateTime.UtcNow;
        }

        // Add a notification for the patient (once: the message can be redelivered)
        var isVerified = string.Equals(message.VerificationStatus, "Verified", StringComparison.OrdinalIgnoreCase);
        var sourceId = message.AttachmentId.ToString();
        var payload = $"{{\"attachmentId\":\"{message.AttachmentId}\",\"status\":\"{message.VerificationStatus}\"}}";

        var alreadyNotified = await _dbContext.Notifications.AnyAsync(
            n => n.PatientId == message.PatientId && n.SourceId == sourceId && n.Payload == payload, ct);

        if (!alreadyNotified)
        {
            var notification = new Notification
            {
                Id = Guid.NewGuid(),
                PatientId = message.PatientId,
                Type = NotificationType.System,
                Category = NotificationCategory.Clinic,
                Title = isVerified ? "Document Verified by Clinic" : "Document Review Update",
                Body = isVerified
                    ? $"Your document '{message.Title}' has been verified and recorded by {message.VerifiedByStaffName ?? "the clinic staff"}."
                    : $"Your document '{message.Title}' review update: {message.RejectionReason ?? "Rejected by clinic."}",
                IsRead = false,
                SourceId = sourceId,
                Payload = payload,
                CreatedAt = DateTime.UtcNow
            };

            await _dbContext.Notifications.AddAsync(notification, ct);
        }

        await _dbContext.SaveChangesAsync(ct);

        _logger.LogInformation("[ClinicEz.Patient] Processed verification notification for Patient {PatientId}", message.PatientId);
    }

    private static bool IsFromClinic(Party from, ClinicRecordVerifiedEvent message) =>
        from.Kind == PartyKind.Facility
        && string.Equals(from.TenantId, message.TenantId, StringComparison.Ordinal)
        && Guid.TryParse(from.FacilityId, out var facilityId)
        && facilityId == message.ClinicId;
}
