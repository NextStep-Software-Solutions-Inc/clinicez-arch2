using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;

namespace ClinicEz.Clinic.Application.Features.Records.Queries;

public sealed record DownloadRecordAttachmentResult(
    byte[] FileBytes,
    string ContentType,
    string FileName
);

public sealed record DownloadRecordAttachmentQuery(Guid AttachmentId) : IRequest<DownloadRecordAttachmentResult?>;

public sealed class DownloadRecordAttachmentQueryHandler : IRequestHandler<DownloadRecordAttachmentQuery, DownloadRecordAttachmentResult?>
{
    private readonly IRepository<RecordAttachment> _attachmentRepo;
    private readonly IClinicContext _clinicContext;
    private readonly IClinicEncryptionService _encryptionService;
    private readonly IClinicStorageService _storageService;

    public DownloadRecordAttachmentQueryHandler(
        IRepository<RecordAttachment> attachmentRepo,
        IClinicContext clinicContext,
        IClinicEncryptionService encryptionService,
        IClinicStorageService storageService)
    {
        _attachmentRepo = attachmentRepo;
        _clinicContext = clinicContext;
        _encryptionService = encryptionService;
        _storageService = storageService;
    }

    public async Task<DownloadRecordAttachmentResult?> Handle(DownloadRecordAttachmentQuery request, CancellationToken ct)
    {
        var attachment = await _attachmentRepo.GetByIdAsync(request.AttachmentId, ct);
        if (attachment == null)
        {
            return null;
        }

        // Clinic isolation validation
        if (_clinicContext.ClinicId != Guid.Empty && attachment.ClinicId != _clinicContext.ClinicId)
        {
            return null;
        }

        // Check if file exists in storage
        var exists = await _storageService.FileExistsAsync(attachment.StorageUri, ct);
        if (!exists)
        {
            return null;
        }

        var ciphertext = await _storageService.ReadEncryptedFileAsync(attachment.StorageUri, ct);

        byte[] plaintextBytes;
        // If encrypted with CMK envelope encryption, decrypt
        if (!string.IsNullOrWhiteSpace(attachment.EncryptionIvBase64) &&
            !string.IsNullOrWhiteSpace(attachment.EncryptionTagBase64) &&
            !string.IsNullOrWhiteSpace(attachment.WrappedKeyJson))
        {
            var tenantId = attachment.TenantId ?? _clinicContext.TenantId ?? "default";
            var clinicId = attachment.ClinicId != Guid.Empty ? attachment.ClinicId : _clinicContext.ClinicId;
            plaintextBytes = await _encryptionService.DecryptAsync(
                ciphertext,
                attachment.EncryptionIvBase64,
                attachment.EncryptionTagBase64,
                attachment.WrappedKeyJson,
                tenantId,
                clinicId,
                ct);
        }
        else
        {
            // Plaintext fallback if legacy unencrypted
            plaintextBytes = ciphertext;
        }

        return new DownloadRecordAttachmentResult(
            plaintextBytes,
            string.IsNullOrWhiteSpace(attachment.ContentType) ? "application/octet-stream" : attachment.ContentType,
            attachment.FileName
        );
    }
}
