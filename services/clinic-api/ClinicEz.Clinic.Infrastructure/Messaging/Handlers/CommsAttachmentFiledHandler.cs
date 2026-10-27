using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Messaging.Handlers;

/// <summary>
/// Ingests <c>comms.attachment.filed</c> events into the addressed clinic's chart.
/// Creates a Verified ClinicRecordAttachment and writes a WORM audit entry.
/// </summary>
public sealed class CommsAttachmentFiledHandler : IInteropHandler<CommsAttachmentFiledPayload>
{
    private readonly ApplicationDbContext _db;
    private readonly ClinicRecipientResolver _recipient;
    private readonly ILogger<CommsAttachmentFiledHandler> _logger;

    public CommsAttachmentFiledHandler(
        ApplicationDbContext db,
        ClinicRecipientResolver recipient,
        ILogger<CommsAttachmentFiledHandler> logger)
    {
        _db = db;
        _recipient = recipient;
        _logger = logger;
    }

    public async Task HandleAsync(CommsAttachmentFiledPayload message, InteropMessageContext context, CancellationToken ct)
    {
        var clinic = await _recipient.ResolveAsync(context, ct);
        if (clinic == null) return;

        _logger.LogInformation(
            "[CommsAttachmentFiledHandler] Ingesting attachment {AttachmentId} ({FileName}, RecordType: {RecordType}) for Patient {PatientId} into Clinic {ClinicId}",
            message.AttachmentId, message.SafeFileName, message.RecordType, message.PatientId, clinic.ClinicId);

        var attachment = new ClinicRecordAttachment
        {
            TenantId = message.TenantId,
            ClinicId = clinic.ClinicId,
            PatientId = message.PatientId,
            ConsultationId = message.ConsultationId,
            RecordType = string.IsNullOrWhiteSpace(message.RecordType) ? "CommunicationAttachment" : message.RecordType,
            Title = message.Title,
            FileName = message.SafeFileName,
            ContentType = message.ContentType,
            FileSizeBytes = message.FileSizeBytes,
            StorageUri = message.StoragePath,
            DocumentDate = DateOnly.FromDateTime(message.FiledAtUtc),
            Notes = message.Notes,
            UploadedByStaffId = Guid.TryParse(message.FiledByStaffId, out var staffId) ? staffId : null,
            UploadedByStaffName = message.FiledByStaffName,
            VerificationStatus = "Verified",
            VerifiedAt = DateTime.UtcNow,
            EncryptedHash = message.SHA256Checksum
        };

        _db.RecordAttachments.Add(attachment);

        var audit = new ClinicAuditEntry
        {
            TenantId = message.TenantId,
            ClinicId = clinic.ClinicId,
            Timestamp = DateTime.UtcNow,
            Category = ClinicAuditCategories.Clinical,
            Severity = ClinicAuditSeverities.Routine,
            Action = "comms.attachment.filed",
            ActorName = message.FiledByStaffName,
            ActorRole = "Staff",
            TargetEntityType = "ClinicRecordAttachment",
            TargetEntityId = attachment.Id.ToString(),
            PatientId = message.PatientId,
            Outcome = ClinicAuditOutcomes.Success,
            Description = $"Filed attachment '{message.SafeFileName}' to medical chart from conversation {message.ConversationId}",
            MetadataJson = JsonSerializer.Serialize(new
            {
                message.AttachmentId,
                message.ConversationId,
                message.SafeFileName,
                message.SHA256Checksum,
                message.RecordType,
                message.ConsultationId
            }, InteropJson.Options)
        };

        _db.ClinicAuditEntries.Add(audit);

        await _db.SaveChangesAsync(ct);
    }
}
