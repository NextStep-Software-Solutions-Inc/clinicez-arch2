using System;
using System.Threading.Tasks;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using MassTransit;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Patient.Infrastructure.Consumers;

public class ClinicRecordVerifiedConsumer : IConsumer<ClinicRecordVerifiedEvent>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ILogger<ClinicRecordVerifiedConsumer> _logger;

    public ClinicRecordVerifiedConsumer(ApplicationDbContext dbContext, ILogger<ClinicRecordVerifiedConsumer> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    public async Task Consume(ConsumeContext<ClinicRecordVerifiedEvent> context)
    {
        var message = context.Message;
        _logger.LogInformation(
            "[ClinicEz.Patient] Received ClinicRecordVerifiedEvent for Attachment {AttachmentId}, Patient {PatientId}, Status {Status}",
            message.AttachmentId, message.PatientId, message.VerificationStatus);

        // Find file record if exists
        var file = await _dbContext.FileRecords
            .FirstOrDefaultAsync(f => f.Id == message.AttachmentId && f.PatientId == message.PatientId, context.CancellationToken);

        if (file != null)
        {
            file.SyncStatus = message.VerificationStatus == "Verified" ? FileSyncStatus.Synced : FileSyncStatus.Failed;
            file.SyncError = message.RejectionReason;
            file.UpdatedAt = DateTime.UtcNow;
        }

        // Add a notification for the patient
        var isVerified = string.Equals(message.VerificationStatus, "Verified", StringComparison.OrdinalIgnoreCase);
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
            SourceId = message.AttachmentId.ToString(),
            Payload = $"{{\"attachmentId\":\"{message.AttachmentId}\",\"status\":\"{message.VerificationStatus}\"}}",
            CreatedAt = DateTime.UtcNow
        };

        await _dbContext.Notifications.AddAsync(notification, context.CancellationToken);
        await _dbContext.SaveChangesAsync(context.CancellationToken);

        _logger.LogInformation("[ClinicEz.Patient] Processed verification notification for Patient {PatientId}", message.PatientId);
    }
}
