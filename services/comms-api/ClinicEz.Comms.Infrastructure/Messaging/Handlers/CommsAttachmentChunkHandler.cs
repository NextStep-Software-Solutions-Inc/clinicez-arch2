using System;
using System.Linq;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Helpers;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Infrastructure.Persistence;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Comms.Infrastructure.Messaging.Handlers;

/// <summary>
/// Ingests <c>comms.attachment.chunk</c> envelopes from <c>patient-api</c>, reassembles chunks,
/// validates SHA-256, encrypts with <see cref="IAttachmentCryptoService"/>, stores via
/// <see cref="ICommsStorageService"/>, and binds crypto metadata onto matching <c>MessageAttachment</c> rows.
/// </summary>
public sealed class CommsAttachmentChunkHandler : IInteropHandler<CommsAttachmentChunkPayload>
{
    private readonly CommsDbContext _db;
    private readonly ICommsStorageService _storage;
    private readonly IAttachmentCryptoService _crypto;
    private readonly ILogger<CommsAttachmentChunkHandler> _logger;

    public CommsAttachmentChunkHandler(
        CommsDbContext db,
        ICommsStorageService storage,
        IAttachmentCryptoService crypto,
        ILogger<CommsAttachmentChunkHandler> logger)
    {
        _db = db;
        _storage = storage;
        _crypto = crypto;
        _logger = logger;
    }

    public async Task HandleAsync(CommsAttachmentChunkPayload message, InteropMessageContext context, CancellationToken ct)
    {
        if (context.To.Kind != PartyKind.Facility)
        {
            _logger.LogWarning(
                "[CommsAttachmentChunkHandler] Dropping chunk for {Key}: target {To} is not a Facility.",
                message.AttachmentKey, context.To.Address);
            return;
        }

        if (message.TotalChunks <= 0 || message.ChunkIndex < 0 || message.ChunkIndex >= message.TotalChunks)
        {
            _logger.LogWarning(
                "[CommsAttachmentChunkHandler] Dropping invalid chunk {Index}/{Total} for {Key}.",
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
            _logger.LogWarning(
                "[CommsAttachmentChunkHandler] Dropping chunk with invalid Base64 for {Key}.",
                message.AttachmentKey);
            return;
        }

        byte[]? assembled = null;
        if (message.TotalChunks == 1)
        {
            assembled = chunkBytes;
        }
        else
        {
            await _storage.SaveChunkAsync(message.AttachmentKey, message.ChunkIndex, chunkBytes, ct);
            assembled = await _storage.TryAssembleChunksAsync(message.AttachmentKey, message.TotalChunks, ct);
            if (assembled == null)
            {
                return; // Await remaining chunks
            }
        }

        var actualHash = Convert.ToHexString(SHA256.HashData(assembled)).ToLowerInvariant();
        if (!string.IsNullOrWhiteSpace(message.HashSha256) &&
            !string.Equals(actualHash, message.HashSha256.Trim(), StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogWarning(
                "[CommsAttachmentChunkHandler] SHA-256 mismatch for {Key}: expected {Expected}, got {Actual}.",
                message.AttachmentKey, message.HashSha256, actualHash);
            return;
        }

        var attachments = await _db.MessageAttachments
            .IgnoreQueryFilters()
            .Where(a => a.TenantId == message.TenantId && a.StoragePath == message.AttachmentKey)
            .ToListAsync(ct);

        if (attachments.Count == 0)
        {
            // Inquiry/message envelope hasn't arrived yet; persist chunk 0..N so submit handler can materialize it
            if (message.TotalChunks == 1)
            {
                await _storage.SaveChunkAsync(message.AttachmentKey, 0, assembled, ct);
            }
            return;
        }

        foreach (var attachment in attachments)
        {
            await CommsAttachmentTransferHelper.EncryptAndSaveAsync(
                attachment,
                assembled,
                actualHash,
                _storage,
                _crypto,
                ct);
        }

        await _db.SaveChangesAsync(ct);
        await _storage.DeleteChunksAsync(message.AttachmentKey, message.TotalChunks, ct);
    }
}
