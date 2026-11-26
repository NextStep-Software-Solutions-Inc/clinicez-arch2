using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;

namespace ClinicEz.Patient.Application.Features.Communications;

public static class CommsAttachmentHelpers
{
    private static readonly HashSet<string> GenericStaffNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "Staff",
        "Staff Member",
        "Clinic Staff",
        "Attending Clinician",
        "Facility",
        "Clinician"
    };

    public static string ResolveSenderDisplayName(
        string? senderType,
        string? rawSenderName,
        string? facilityName,
        string? patientFullName,
        string? submittingAccountName = null)
    {
        var isPatientSide = string.Equals(senderType, "Patient", StringComparison.OrdinalIgnoreCase)
            || string.Equals(senderType, "Guardian", StringComparison.OrdinalIgnoreCase);

        if (isPatientSide)
        {
            return string.IsNullOrWhiteSpace(rawSenderName) ? "Patient" : rawSenderName.Trim();
        }

        var trimmedSender = rawSenderName?.Trim() ?? string.Empty;
        var resolvedFacility = string.IsNullOrWhiteSpace(facilityName) ? "Clinic" : facilityName.Trim();

        if (string.IsNullOrWhiteSpace(trimmedSender) || GenericStaffNames.Contains(trimmedSender))
        {
            return resolvedFacility;
        }

        if (!string.IsNullOrWhiteSpace(patientFullName) &&
            string.Equals(trimmedSender, patientFullName.Trim(), StringComparison.OrdinalIgnoreCase))
        {
            return resolvedFacility;
        }

        if (!string.IsNullOrWhiteSpace(submittingAccountName) &&
            string.Equals(trimmedSender, submittingAccountName.Trim(), StringComparison.OrdinalIgnoreCase))
        {
            return resolvedFacility;
        }

        return trimmedSender;
    }

    public static string ComputeInboundStorageKey(Guid patientId, string attachmentKey, string fileName)
    {
        var hashBytes = SHA256.HashData(Encoding.UTF8.GetBytes(attachmentKey ?? string.Empty));
        var hashPrefix = Convert.ToHexString(hashBytes)[..16].ToLowerInvariant();
        var safeFileName = SanitizeFileName(fileName);
        return $"comms/attachments/{patientId}/{hashPrefix}/{safeFileName}";
    }

    public static string ComputeChunkStorageKey(Guid patientId, string attachmentKey, int chunkIndex)
    {
        var hashBytes = SHA256.HashData(Encoding.UTF8.GetBytes(attachmentKey ?? string.Empty));
        var hashPrefix = Convert.ToHexString(hashBytes)[..24].ToLowerInvariant();
        return $"comms/chunks/{patientId}/{hashPrefix}/{chunkIndex:D4}.part";
    }

    public static string SanitizeFileName(string? fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName)) return "attachment.bin";
        var name = System.IO.Path.GetFileName(fileName.Trim());
        name = Regex.Replace(name, @"[^\w\.\-_]", "_");
        return name.Length > 120 ? name[^120..] : name;
    }

    public static void EnqueueAttachmentChunks(
        IInteropPublisher publisher,
        Guid patientId,
        string tenantId,
        string facilityId,
        FacilityType targetFacilityType,
        string facilityTypeString,
        Guid conversationId,
        Guid? messageId,
        PatientMessageAttachment attachment,
        byte[] plaintextBytes)
    {
        if (plaintextBytes.Length == 0)
        {
            return;
        }

        var maxChunk = CommsAttachmentTransferLimits.MaxChunkRawBytes;
        var totalChunks = (plaintextBytes.Length + maxChunk - 1) / maxChunk;
        var from = Party.ForPatient(patientId.ToString());
        var to = Party.ForFacility(tenantId, facilityId, targetFacilityType, InteropServices.Comms);

        for (var chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++)
        {
            var offset = chunkIndex * maxChunk;
            var count = Math.Min(maxChunk, plaintextBytes.Length - offset);
            var base64 = Convert.ToBase64String(plaintextBytes, offset, count);

            var chunkPayload = new CommsAttachmentChunkPayload(
                AttachmentKey: attachment.StorageKey,
                ConversationId: conversationId,
                MessageId: messageId,
                TenantId: tenantId,
                FacilityId: facilityId,
                FacilityType: facilityTypeString,
                PatientId: patientId,
                FileName: attachment.FileName,
                ContentType: attachment.ContentType,
                TotalSizeBytes: plaintextBytes.Length,
                HashSha256: attachment.HashSha256,
                ChunkIndex: chunkIndex,
                TotalChunks: totalChunks,
                ContentBase64: base64);

            publisher.Enqueue(
                InteropTypes.CommsAttachmentChunk,
                from,
                to,
                conversationId,
                chunkPayload);
        }
    }
}
