using System;
using System.Text;
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
/// Ingests <c>comms.transcript.archived</c> events into the addressed clinic's chart.
/// Creates a Verified ClinicRecordAttachment and writes a WORM audit entry.
/// </summary>
public sealed class CommsTranscriptArchivedHandler : IInteropHandler<CommsTranscriptArchivedPayload>
{
    private readonly ApplicationDbContext _db;
    private readonly ClinicRecipientResolver _recipient;
    private readonly ILogger<CommsTranscriptArchivedHandler> _logger;

    public CommsTranscriptArchivedHandler(
        ApplicationDbContext db,
        ClinicRecipientResolver recipient,
        ILogger<CommsTranscriptArchivedHandler> logger)
    {
        _db = db;
        _recipient = recipient;
        _logger = logger;
    }

    public async Task HandleAsync(CommsTranscriptArchivedPayload message, InteropMessageContext context, CancellationToken ct)
    {
        var clinic = await _recipient.ResolveAsync(context, ct);
        if (clinic == null) return;

        _logger.LogInformation(
            "[CommsTranscriptArchivedHandler] Ingesting transcript for Conversation {ConversationId} (Patient: {PatientId}, SHA256: {Sha256}) into Clinic {ClinicId}",
            message.ConversationId, message.PatientId, message.TranscriptSha256, clinic.ClinicId);

        var attachment = new ClinicRecordAttachment
        {
            TenantId = message.TenantId,
            ClinicId = clinic.ClinicId,
            PatientId = message.PatientId,
            RecordType = "CommunicationTranscript",
            Title = message.Title,
            FileName = $"transcript-{message.ConversationId}.json",
            ContentType = "application/json",
            FileSizeBytes = Encoding.UTF8.GetByteCount(message.TranscriptJson),
            StorageUri = $"data:application/json;base64,{Convert.ToBase64String(Encoding.UTF8.GetBytes(message.TranscriptJson))}",
            DocumentDate = DateOnly.FromDateTime(message.ClosedAtUtc),
            Notes = $"Transcript SHA-256: {message.TranscriptSha256}; Disposition: {message.TriageDisposition}; Messages: {message.PublicMessageCount}/{message.TotalMessageCount}",
            UploadedByStaffName = message.ClosedByStaffName ?? "Comms Triage",
            VerificationStatus = "Verified",
            VerifiedAt = DateTime.UtcNow,
            EncryptedHash = message.TranscriptSha256
        };

        _db.RecordAttachments.Add(attachment);

        var audit = new ClinicAuditEntry
        {
            TenantId = message.TenantId,
            ClinicId = clinic.ClinicId,
            Timestamp = DateTime.UtcNow,
            Category = ClinicAuditCategories.Clinical,
            Severity = ClinicAuditSeverities.Routine,
            Action = "comms.transcript.archived",
            ActorName = message.ClosedByStaffName ?? "Comms Triage",
            ActorRole = "System",
            TargetEntityType = "ClinicRecordAttachment",
            TargetEntityId = attachment.Id.ToString(),
            PatientId = message.PatientId,
            Outcome = ClinicAuditOutcomes.Success,
            Description = $"Archived communication transcript for conversation {message.ConversationId} with SHA256: {message.TranscriptSha256}",
            MetadataJson = JsonSerializer.Serialize(new
            {
                message.ConversationId,
                message.TranscriptSha256,
                message.Category,
                message.TriageDisposition,
                message.DeclineReasonCode,
                message.TotalMessageCount,
                message.PublicMessageCount
            }, InteropJson.Options)
        };

        _db.ClinicAuditEntries.Add(audit);

        await _db.SaveChangesAsync(ct);
    }
}
