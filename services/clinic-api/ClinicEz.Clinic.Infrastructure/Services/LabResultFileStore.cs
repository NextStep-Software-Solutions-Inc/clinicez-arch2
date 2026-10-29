using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;

namespace ClinicEz.Clinic.Infrastructure.Services;

public sealed class LabResultFileStore : ILabResultFileStore
{
    private readonly IClinicEncryptionService _encryption;
    private readonly IClinicStorageService _storage;

    public LabResultFileStore(IClinicEncryptionService encryption, IClinicStorageService storage)
    {
        _encryption = encryption;
        _storage = storage;
    }

    public async Task StoreAsync(LabResult result, byte[] content, CancellationToken ct)
    {
        var encrypted = await _encryption.EncryptAsync(content, result.TenantId, result.ClinicId, ct);
        var storageKey = $"tenants/{result.TenantId}/clinics/{result.ClinicId}/lab-results/{result.Id:N}.cez";
        await _storage.SaveEncryptedFileAsync(storageKey, encrypted.Ciphertext, ct);

        result.StorageKey = storageKey;
        result.FileSizeBytes = content.LongLength;
        result.EncryptionIvBase64 = encrypted.IvBase64;
        result.EncryptionTagBase64 = encrypted.TagBase64;
        result.WrappedKeyJson = encrypted.WrappedKeyJson;
        result.EncryptedHash = encrypted.EncryptedHash;
    }

    public async Task<byte[]?> ReadAsync(LabResult result, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(result.StorageKey)
            || result.EncryptionIvBase64 == null
            || result.EncryptionTagBase64 == null
            || result.WrappedKeyJson == null)
        {
            return null;
        }

        var ciphertext = await _storage.ReadEncryptedFileAsync(result.StorageKey, ct);
        return await _encryption.DecryptAsync(
            ciphertext, result.EncryptionIvBase64, result.EncryptionTagBase64, result.WrappedKeyJson,
            result.TenantId, result.ClinicId, ct);
    }
}
