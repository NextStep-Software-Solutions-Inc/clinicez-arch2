using System;
using System.Linq;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Application.Models;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Comms.Domain.Enums;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;

namespace ClinicEz.Comms.Application.Common.Helpers;

public static class CommsAttachmentTransferHelper
{
    public static async Task<bool> TryMaterializeFromStagedChunksAsync(
        MessageAttachment attachment,
        string attachmentKey,
        int maxProbeChunks,
        ICommsStorageService? storage,
        IAttachmentCryptoService? crypto,
        CancellationToken ct)
    {
        if (storage == null || crypto == null || string.IsNullOrWhiteSpace(attachmentKey))
        {
            return false;
        }

        // Probe descending so multi-chunk staged files assemble completely before single-chunk subsets.
        for (var totalChunks = maxProbeChunks; totalChunks >= 1; totalChunks--)
        {
            var assembled = await storage.TryAssembleChunksAsync(attachmentKey, totalChunks, ct);
            if (assembled == null)
            {
                continue;
            }

            if (assembled.Length == 0 ||
                (attachment.OriginalSizeBytes > 0 && assembled.Length != attachment.OriginalSizeBytes))
            {
                continue;
            }

            var actualHash = Convert.ToHexString(SHA256.HashData(assembled)).ToLowerInvariant();
            if (!string.IsNullOrWhiteSpace(attachment.SHA256Checksum) &&
                !string.Equals(actualHash, attachment.SHA256Checksum.Trim(), StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            await EncryptAndSaveAsync(attachment, assembled, actualHash, storage, crypto, ct);
            await storage.DeleteChunksAsync(attachmentKey, totalChunks, ct);
            return true;
        }

        return false;
    }

    public static async Task EncryptAndSaveAsync(
        MessageAttachment attachment,
        byte[] plaintextBytes,
        string actualHash,
        ICommsStorageService storage,
        IAttachmentCryptoService crypto,
        CancellationToken ct)
    {
        var encrypted = await crypto.EncryptAsync(plaintextBytes, attachment.TenantId, attachment.FacilityId, ct);
        var storagePath = await storage.SaveEncryptedAttachmentAsync(
            attachment.TenantId,
            attachment.FacilityId,
            attachment.Id,
            encrypted.Ciphertext,
            ct);

        attachment.StoragePath = storagePath;
        attachment.SanitizedSizeBytes = plaintextBytes.Length;
        attachment.SHA256Checksum = actualHash;
        attachment.EncryptionAlgorithm = encrypted.Metadata.Algorithm;
        attachment.EncryptionKeyId = encrypted.Metadata.KeyId;
        attachment.EncryptionIvBase64 = encrypted.Metadata.IvBase64;
        attachment.EncryptionTagBase64 = encrypted.Metadata.TagBase64;
        attachment.WrappedKeyJson = encrypted.Metadata.WrappedKeyJson;
        attachment.Status = AttachmentStatus.Clean;
        attachment.ScannedAtUtc = DateTime.UtcNow;
    }

    public static async Task EnqueueAttachmentChunksToPatientAsync(
        IInteropPublisher publisher,
        ICommsStorageService? storage,
        IAttachmentCryptoService? crypto,
        Conversation conversation,
        Message message,
        MessageAttachment attachment,
        CancellationToken ct,
        string? facilityType = null)
    {
        if (storage == null ||
            crypto == null ||
            conversation.IsLocalOnly ||
            conversation.Scope != ConversationScope.PatientFacility ||
            conversation.PatientId is not { } patientId ||
            patientId == Guid.Empty ||
            message.Visibility != MessageVisibility.Public ||
            string.IsNullOrWhiteSpace(attachment.StoragePath) ||
            string.IsNullOrWhiteSpace(attachment.EncryptionIvBase64) ||
            string.IsNullOrWhiteSpace(attachment.EncryptionTagBase64) ||
            string.IsNullOrWhiteSpace(attachment.WrappedKeyJson))
        {
            return;
        }

        var ciphertext = await storage.ReadEncryptedAttachmentAsync(attachment.StoragePath, ct);
        if (ciphertext == null || ciphertext.Length == 0)
        {
            return;
        }

        var metadata = new AttachmentCryptoMetadata(
            attachment.EncryptionAlgorithm,
            attachment.EncryptionKeyId,
            attachment.EncryptionIvBase64,
            attachment.EncryptionTagBase64,
            attachment.WrappedKeyJson);

        var plaintext = await crypto.DecryptAsync(ciphertext, metadata, attachment.TenantId, attachment.FacilityId, ct);
        if (plaintext.Length == 0)
        {
            return;
        }

        var fType = CommsPatientReplicationHelper.ResolveFacilityType(facilityType);
        var from = Party.ForFacility(conversation.TenantId, conversation.FacilityId, fType, service: InteropServices.Comms);
        var to = Party.ForPatient(patientId.ToString());

        var maxChunk = CommsAttachmentTransferLimits.MaxChunkRawBytes;
        var totalChunks = (plaintext.Length + maxChunk - 1) / maxChunk;

        for (var chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++)
        {
            var offset = chunkIndex * maxChunk;
            var count = Math.Min(maxChunk, plaintext.Length - offset);
            var base64 = Convert.ToBase64String(plaintext, offset, count);

            var chunkPayload = new CommsAttachmentChunkPayload(
                AttachmentKey: attachment.StoragePath,
                ConversationId: conversation.Id,
                MessageId: message.Id,
                TenantId: conversation.TenantId,
                FacilityId: conversation.FacilityId,
                FacilityType: fType.ToString(),
                PatientId: patientId,
                FileName: attachment.SafeFileName,
                ContentType: attachment.ContentType,
                TotalSizeBytes: plaintext.Length,
                HashSha256: attachment.SHA256Checksum,
                ChunkIndex: chunkIndex,
                TotalChunks: totalChunks,
                ContentBase64: base64);

            publisher.Enqueue(
                InteropTypes.CommsAttachmentChunk,
                from,
                to,
                conversation.Id,
                chunkPayload);
        }
    }

    public static ConversationDto MapConversationDto(Conversation c) => new(
        c.Id,
        c.TenantId,
        c.FacilityId,
        c.BranchId,
        c.Scope,
        c.Kind,
        c.Title,
        c.ContextType,
        c.ContextId,
        c.Category,
        c.Status,
        c.TriageDisposition,
        c.DeclineReasonCode,
        c.AssignedStaffId,
        c.AssignedStaffName,
        c.Priority,
        c.IsEmergencyConfirmed,
        c.IsLocalOnly,
        c.ReopenCount,
        c.HomeCellId,
        c.LastMessageAtUtc,
        c.LastMessageSnippet,
        c.MessageCount,
        c.LastSeq,
        c.CreatedAtUtc,
        c.CreatedBy,
        c.ClosedAtUtc,
        c.ClosedBy,
        c.Participants.Select(p => new ParticipantDto(
            p.Id, p.ConversationId, p.TenantId, p.ParticipantType, p.ParticipantId,
            p.DisplayName, p.Role, p.JoinedAtUtc, p.LeftAtUtc, p.LastReadMessageId,
            p.LastReadAtUtc, p.IsMuted)).ToList(),
        c.PatientId,
        c.SubmittingAccountId,
        c.Relationship,
        c.GrantId,
        c.GrantWindowEndUtc,
        c.IsOffHoursSubmission,
        c.TriageDueAtUtc,
        c.TriagedAtUtc,
        c.TriagedByStaffId,
        c.TriagedByStaffName,
        c.IdleDeadlineUtc,
        c.SlaBreached,
        c.SupervisorAlertedAtUtc);
}
