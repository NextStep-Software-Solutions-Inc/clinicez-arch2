using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Infrastructure.Persistence;

namespace ClinicEz.Clinic.Infrastructure.Services;

public sealed class RecordAttachmentStorage : IRecordAttachmentStorage
{
    private readonly IClinicEncryptionService _encryption;
    private readonly IClinicStorageService _storage;
    private readonly ApplicationDbContext _db;

    public RecordAttachmentStorage(
        IClinicEncryptionService encryption,
        IClinicStorageService storage,
        ApplicationDbContext db)
    {
        _encryption = encryption;
        _storage = storage;
        _db = db;
    }

    public async Task<RecordAttachment> EncryptAndStoreAsync(
        string tenantId,
        Guid clinicId,
        Guid patientId,
        Guid? consultationId,
        string fileName,
        string contentType,
        byte[] content,
        string recordType,
        string? notes,
        string uploadedByName,
        CancellationToken ct = default)
    {
        var attachmentId = Guid.NewGuid();
        var encrypted = await _encryption.EncryptAsync(content, tenantId, clinicId, ct);
        var storageKey = $"tenants/{tenantId}/clinics/{clinicId}/records/{attachmentId}.cez";
        await _storage.SaveEncryptedFileAsync(storageKey, encrypted.Ciphertext, ct);

        var attachment = new RecordAttachment
        {
            Id = attachmentId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = patientId,
            ConsultationId = consultationId,
            RecordType = recordType,
            Title = fileName,
            FileName = fileName,
            ContentType = string.IsNullOrWhiteSpace(contentType) ? "application/octet-stream" : contentType,
            FileSizeBytes = content.LongLength,
            StorageUri = storageKey,
            DocumentDate = DateOnly.FromDateTime(DateTime.UtcNow),
            Notes = notes,
            UploadedByStaffName = uploadedByName,
            VerificationStatus = "Verified",
            VerifiedAt = DateTime.UtcNow,
            VerifiedByStaffName = uploadedByName,
            EncryptionAlgorithm = encrypted.EncryptionAlgorithm,
            EncryptionKeyId = "cmk-v1",
            EncryptionIvBase64 = encrypted.IvBase64,
            EncryptionTagBase64 = encrypted.TagBase64,
            EncryptedSizeBytes = encrypted.EncryptedSizeBytes,
            EncryptedHash = encrypted.EncryptedHash,
            WrappedKeyJson = encrypted.WrappedKeyJson,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "System:RecordAttachmentStorage"
        };

        await _db.RecordAttachments.AddAsync(attachment, ct);
        return attachment;
    }
}
