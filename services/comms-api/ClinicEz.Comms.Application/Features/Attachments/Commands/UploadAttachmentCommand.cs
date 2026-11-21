using System;
using System.IO;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Application.Models;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Comms.Domain.Enums;
using ClinicEz.Shared.Exceptions;
using MediatR;

namespace ClinicEz.Comms.Application.Features.Attachments.Commands;

public sealed record UploadAttachmentCommand(
    Stream ContentStream,
    string FileName,
    string ContentType,
    long FileSizeBytes,
    string TenantId,
    string FacilityId) : IRequest<CommsAttachmentDto>;

public sealed class UploadAttachmentCommandHandler : IRequestHandler<UploadAttachmentCommand, CommsAttachmentDto>
{
    private readonly ICommsDbContext _db;
    private readonly IAttachmentPipeline _pipeline;
    private readonly ICommsStorageService _storage;

    public UploadAttachmentCommandHandler(
        ICommsDbContext db,
        IAttachmentPipeline pipeline,
        ICommsStorageService storage)
    {
        _db = db;
        _pipeline = pipeline;
        _storage = storage;
    }

    public async Task<CommsAttachmentDto> Handle(UploadAttachmentCommand request, CancellationToken ct)
    {
        if (request.FileSizeBytes > 10 * 1024 * 1024)
        {
            throw new ValidationException("Attachment exceeds maximum allowed size of 10MB.");
        }

        var processResult = await _pipeline.ProcessAsync(
            request.ContentStream,
            request.FileName,
            request.ContentType,
            ct);

        var attachmentId = Guid.NewGuid();
        var attachment = new MessageAttachment
        {
            Id = attachmentId,
            TenantId = request.TenantId,
            FacilityId = request.FacilityId,
            OriginalFileName = request.FileName,
            SafeFileName = processResult.SafeFileName,
            ContentType = processResult.ContentType,
            OriginalSizeBytes = request.FileSizeBytes,
            SanitizedSizeBytes = processResult.SanitizedBytes.Length,
            SHA256Checksum = processResult.Sha256Hash,
            StrippedExif = processResult.StrippedExif,
            CreatedAtUtc = DateTime.UtcNow,
            ScannedAtUtc = DateTime.UtcNow
        };

        if (!processResult.IsClean)
        {
            attachment.Status = AttachmentStatus.Quarantined;
            attachment.QuarantineReason = processResult.QuarantineReason ?? "Security violation detected.";
            attachment.StoragePath = string.Empty;
        }
        else
        {
            attachment.Status = AttachmentStatus.Clean;

            // Generate ephemeral DEK and encrypt with AES-256-GCM
            var dek = RandomNumberGenerator.GetBytes(32);
            var iv = RandomNumberGenerator.GetBytes(12);
            var ciphertext = new byte[processResult.SanitizedBytes.Length];
            var tag = new byte[16];

            using (var aesGcm = new AesGcm(dek, 16))
            {
                aesGcm.Encrypt(iv, processResult.SanitizedBytes, ciphertext, tag);
            }

            // Save encrypted ciphertext
            var storagePath = await _storage.SaveEncryptedAttachmentAsync(
                request.TenantId,
                request.FacilityId,
                attachmentId,
                ciphertext,
                ct);

            attachment.StoragePath = storagePath;
            attachment.EncryptionIvBase64 = Convert.ToBase64String(iv);
            attachment.EncryptionTagBase64 = Convert.ToBase64String(tag);
            attachment.WrappedKeyJson = Convert.ToBase64String(dek); // Mock wrap for test/local
        }

        _db.MessageAttachments.Add(attachment);
        await _db.SaveChangesAsync(ct);

        return new CommsAttachmentDto(
            attachment.Id,
            attachment.StoragePath,
            attachment.SafeFileName,
            attachment.ContentType,
            attachment.SanitizedSizeBytes,
            attachment.SHA256Checksum,
            attachment.Status,
            attachment.QuarantineReason,
            attachment.StrippedExif);
    }
}
