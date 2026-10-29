using System;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
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
/// Ingests <c>comms.transcript.archived</c> events into the addressed clinic's chart.
/// Creates a Verified ClinicRecordAttachment and writes a WORM audit entry.
/// </summary>
public sealed class CommsTranscriptArchivedHandler : IInteropHandler<CommsTranscriptArchivedPayload>
{
    private readonly ApplicationDbContext _db;
    private readonly ClinicRecipientResolver _recipient;
    private readonly ILogger<CommsTranscriptArchivedHandler> _logger;
    private readonly IClinicEncryptionService? _encryption;
    private readonly IClinicStorageService? _storage;

    public CommsTranscriptArchivedHandler(
        ApplicationDbContext db,
        ClinicRecipientResolver recipient,
        ILogger<CommsTranscriptArchivedHandler> logger,
        IClinicEncryptionService? encryption = null,
        IClinicStorageService? storage = null)
    {
        _db = db;
        _recipient = recipient;
        _logger = logger;
        _encryption = encryption;
        _storage = storage;
    }

    public async Task HandleAsync(CommsTranscriptArchivedPayload message, InteropMessageContext context, CancellationToken ct)
    {
        var clinic = await _recipient.ResolveAsync(context, ct);
        if (clinic == null) return;

        _logger.LogInformation(
            "[CommsTranscriptArchivedHandler] Ingesting transcript for Conversation {ConversationId} (Patient: {PatientId}, SHA256: {Sha256}) into Clinic {ClinicId}",
            message.ConversationId, message.PatientId, message.TranscriptSha256, clinic.ClinicId);

        var patient = await _db.Patients
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(p => !p.IsDeleted && p.ClinicId == clinic.ClinicId && (p.CloudPatientId == message.PatientId || p.Id == message.PatientId), ct);

        var resolvedPatientId = patient?.Id ?? message.PatientId;

        string storageUri;
        var contentBytes = Encoding.UTF8.GetBytes(message.TranscriptJson);
        if (_encryption != null && _storage != null)
        {
            var encrypted = await _encryption.EncryptAsync(contentBytes, message.TenantId, clinic.ClinicId, ct);
            var storageKey = $"tenants/{message.TenantId}/clinics/{clinic.ClinicId}/transcripts/{message.ConversationId}.cez";
            await _storage.SaveEncryptedFileAsync(storageKey, encrypted.Ciphertext, ct);
            storageUri = storageKey;
        }
        else
        {
            // Cryptographic encryption at rest fallback using AES-256-GCM
            var key = SHA256.HashData(Encoding.UTF8.GetBytes($"{message.TenantId}:{clinic.ClinicId}:transcript-protection"));
            var nonce = new byte[12];
            RandomNumberGenerator.Fill(nonce);
            var ciphertext = new byte[contentBytes.Length];
            var tag = new byte[16];
            using (var aesGcm = new AesGcm(key, 16))
            {
                aesGcm.Encrypt(nonce, contentBytes, ciphertext, tag);
            }
            var payload = new byte[12 + 16 + ciphertext.Length];
            Buffer.BlockCopy(nonce, 0, payload, 0, 12);
            Buffer.BlockCopy(tag, 0, payload, 12, 16);
            Buffer.BlockCopy(ciphertext, 0, payload, 28, ciphertext.Length);
            storageUri = $"encrypted:aes-256-gcm;base64,{Convert.ToBase64String(payload)}";
        }

        var attachment = new RecordAttachment
        {
            TenantId = message.TenantId,
            ClinicId = clinic.ClinicId,
            PatientId = resolvedPatientId,
            RecordType = "CommunicationTranscript",
            Title = message.Title,
            FileName = $"transcript-{message.ConversationId}.json",
            ContentType = "application/json",
            FileSizeBytes = contentBytes.Length,
            StorageUri = storageUri,
            DocumentDate = DateOnly.FromDateTime(message.ClosedAtUtc),
            Notes = $"Transcript SHA-256: {message.TranscriptSha256}; Disposition: {message.TriageDisposition}; Messages: {message.PublicMessageCount}/{message.TotalMessageCount}",
            UploadedByStaffName = message.ClosedByStaffName ?? "Comms Triage",
            VerificationStatus = "Verified",
            VerifiedAt = DateTime.UtcNow,
            EncryptedHash = message.TranscriptSha256
        };

        _db.RecordAttachments.Add(attachment);

        var audit = new AuditEntry
        {
            TenantId = message.TenantId,
            ClinicId = clinic.ClinicId,
            Timestamp = DateTime.UtcNow,
            Category = ClinicAuditCategories.Clinical,
            Severity = ClinicAuditSeverities.Routine,
            Action = "comms.transcript.archived",
            ActorName = message.ClosedByStaffName ?? "Comms Triage",
            ActorRole = "System",
            TargetEntityType = "RecordAttachment",
            TargetEntityId = attachment.Id.ToString(),
            PatientId = resolvedPatientId,
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

        _db.AuditEntries.Add(audit);

        await _db.SaveChangesAsync(ct);
    }
}
