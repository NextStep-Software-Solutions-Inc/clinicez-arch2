using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Application.Features.Communications;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Patient.Infrastructure.Interop;

/// <summary>
/// Handles <c>comms.attachment.chunk</c>: receives chunked plaintext attachment bytes from a facility
/// over Interop Hub, verifies SHA-256, encrypts with the patient's PMK, stores in R2, and binds
/// crypto metadata onto <see cref="PatientMessageAttachment"/> regardless of arrival order.
/// </summary>
public sealed class CommsAttachmentChunkInteropHandler : IInteropHandler<CommsAttachmentChunkPayload>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly IStorageService _storageService;
    private readonly IPatientEncryptionService _encryptionService;
    private readonly ILogger<CommsAttachmentChunkInteropHandler> _logger;

    public CommsAttachmentChunkInteropHandler(
        ApplicationDbContext dbContext,
        IStorageService storageService,
        IPatientEncryptionService encryptionService,
        ILogger<CommsAttachmentChunkInteropHandler> logger)
    {
        _dbContext = dbContext;
        _storageService = storageService;
        _encryptionService = encryptionService;
        _logger = logger;
    }

    public async Task HandleAsync(CommsAttachmentChunkPayload message, InteropMessageContext context, CancellationToken ct)
    {
        if (context.To.Kind != PartyKind.Patient ||
            !Guid.TryParse(context.To.PatientId, out var targetPatientId) ||
            targetPatientId == Guid.Empty)
        {
            _logger.LogWarning("Ignoring comms.attachment.chunk: recipient {To} is not a valid Patient.", context.To.Address);
            return;
        }

        if (message.TotalChunks <= 0 || message.ChunkIndex < 0 || message.ChunkIndex >= message.TotalChunks)
        {
            _logger.LogWarning("Ignoring invalid comms.attachment.chunk {Index}/{Total} for {Key}.",
                message.ChunkIndex, message.TotalChunks, message.AttachmentKey);
            return;
        }

        byte[] chunkBytes;
        try
        {
            chunkBytes = Convert.FromBase64String(message.ContentBase64);
        }
        catch (FormatException)
        {
            _logger.LogWarning("Ignoring comms.attachment.chunk with invalid Base64 for {Key}.", message.AttachmentKey);
            return;
        }

        byte[]? assembledBytes = null;
        var chunkKeysToDelete = new List<string>();

        if (message.TotalChunks == 1)
        {
            assembledBytes = chunkBytes;
        }
        else
        {
            var currentChunkKey = CommsAttachmentHelpers.ComputeChunkStorageKey(targetPatientId, message.AttachmentKey, message.ChunkIndex);
            await _storageService.SaveEncryptedAsync(currentChunkKey, chunkBytes, ct);

            for (var i = 0; i < message.TotalChunks; i++)
            {
                var key = CommsAttachmentHelpers.ComputeChunkStorageKey(targetPatientId, message.AttachmentKey, i);
                chunkKeysToDelete.Add(key);
                if (i != message.ChunkIndex && !await _storageService.ObjectExistsAsync(key, ct))
                {
                    return; // Await remaining chunks
                }
            }

            using var ms = new MemoryStream();
            for (var i = 0; i < message.TotalChunks; i++)
            {
                var part = i == message.ChunkIndex
                    ? chunkBytes
                    : await _storageService.DownloadAsync(chunkKeysToDelete[i], ct);
                await ms.WriteAsync(part, ct);
            }
            assembledBytes = ms.ToArray();
        }

        var actualHash = Convert.ToHexString(SHA256.HashData(assembledBytes)).ToLowerInvariant();
        if (!string.IsNullOrWhiteSpace(message.HashSha256) &&
            !string.Equals(actualHash, message.HashSha256.Trim(), StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogWarning("SHA-256 mismatch on comms.attachment.chunk for {Key}; expected {Expected}, got {Actual}.",
                message.AttachmentKey, message.HashSha256, actualHash);
            return;
        }

        var safeFileName = CommsAttachmentHelpers.SanitizeFileName(message.FileName);
        var r2Key = CommsAttachmentHelpers.ComputeInboundStorageKey(targetPatientId, message.AttachmentKey, safeFileName);
        var encrypted = await _encryptionService.EncryptAsync(assembledBytes, targetPatientId, ct);
        await _storageService.SaveEncryptedAsync(r2Key, encrypted.Ciphertext, ct);

        foreach (var chunkKey in chunkKeysToDelete)
        {
            try { await _storageService.DeleteAsync(chunkKey, ct); } catch { /* best-effort cleanup */ }
        }

        var existing = await _dbContext.PatientMessageAttachments
            .FirstOrDefaultAsync(a =>
                (a.PatientId == targetPatientId || (a.Message != null && a.Message.Conversation.PatientId == targetPatientId)) &&
                (a.StorageKey == message.AttachmentKey || a.StorageKey == r2Key),
                ct);

        if (existing != null)
        {
            existing.PatientId ??= targetPatientId;
            existing.StorageKey = r2Key;
            existing.FileName = safeFileName;
            existing.ContentType = message.ContentType;
            existing.FileSizeBytes = assembledBytes.Length;
            existing.HashSha256 = actualHash;
            existing.IsClean = true;
            existing.ScanStatus = "Clean";
            existing.EncryptionAlgorithm = encrypted.EncryptionAlgorithm;
            existing.EncryptionIvBase64 = encrypted.IvBase64;
            existing.EncryptionTagBase64 = encrypted.TagBase64;
            existing.WrappedKeyJson = encrypted.WrappedKeyJson;
        }
        else
        {
            Guid? linkedMessageId = null;
            if (message.MessageId.HasValue &&
                await _dbContext.PatientMessages.AnyAsync(m => m.Id == message.MessageId.Value, ct))
            {
                linkedMessageId = message.MessageId.Value;
            }

            await _dbContext.PatientMessageAttachments.AddAsync(new PatientMessageAttachment
            {
                Id = Guid.NewGuid(),
                MessageId = linkedMessageId,
                PatientId = targetPatientId,
                FileName = safeFileName,
                ContentType = message.ContentType,
                FileSizeBytes = assembledBytes.Length,
                StorageKey = r2Key,
                IsClean = true,
                ScanStatus = "Clean",
                HashSha256 = actualHash,
                EncryptionAlgorithm = encrypted.EncryptionAlgorithm,
                EncryptionIvBase64 = encrypted.IvBase64,
                EncryptionTagBase64 = encrypted.TagBase64,
                WrappedKeyJson = encrypted.WrappedKeyJson
            }, ct);
        }

        await _dbContext.SaveChangesAsync(ct);
    }
}
