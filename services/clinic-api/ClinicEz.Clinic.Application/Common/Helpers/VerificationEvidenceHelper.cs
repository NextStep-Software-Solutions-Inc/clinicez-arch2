using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Shared.Exceptions;
using Microsoft.AspNetCore.Http;

namespace ClinicEz.Clinic.Application.Common.Helpers;

/// <summary>
/// Validates and stores verification evidence documents (DOH LTO and PRC proofs) via <see cref="IClinicStorageService"/>.
/// </summary>
public static class VerificationEvidenceHelper
{
    public const int MaxFileSizeBytes = 5 * 1024 * 1024; // 5 MB

    private static readonly Dictionary<string, string> AllowedMimeToExtension = new(StringComparer.OrdinalIgnoreCase)
    {
        ["application/pdf"] = ".pdf",
        ["image/jpeg"] = ".jpg",
        ["image/jpg"] = ".jpg",
        ["image/png"] = ".png"
    };

    private static readonly Dictionary<string, string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        [".pdf"] = ".pdf",
        [".jpg"] = ".jpg",
        [".jpeg"] = ".jpeg",
        [".png"] = ".png"
    };

    public static string ValidateAndResolveExtension(string? fileName, string? contentType, long fileSizeBytes)
    {
        if (fileSizeBytes <= 0)
        {
            throw new ValidationException("Evidence file is required and cannot be empty.");
        }

        if (fileSizeBytes > MaxFileSizeBytes)
        {
            throw new ValidationException("Evidence file size exceeds the 5 MB limit.");
        }

        var normalizedMime = NormalizeContentType(contentType);
        var rawExtension = Path.GetExtension(fileName ?? string.Empty);

        if (!string.IsNullOrWhiteSpace(rawExtension) && !AllowedExtensions.ContainsKey(rawExtension))
        {
            throw new ValidationException("Only PDF, JPEG, and PNG evidence files are supported.");
        }

        if (!string.IsNullOrWhiteSpace(normalizedMime) &&
            !string.Equals(normalizedMime, "application/octet-stream", StringComparison.OrdinalIgnoreCase))
        {
            if (!AllowedMimeToExtension.TryGetValue(normalizedMime, out var mimeExt))
            {
                throw new ValidationException("Only PDF, JPEG, and PNG evidence files are supported.");
            }

            return !string.IsNullOrWhiteSpace(rawExtension)
                ? AllowedExtensions[rawExtension]
                : mimeExt;
        }

        if (!string.IsNullOrWhiteSpace(rawExtension) && AllowedExtensions.TryGetValue(rawExtension, out var ext))
        {
            return ext;
        }

        throw new ValidationException("Only PDF, JPEG, and PNG evidence files are supported.");
    }

    public static async Task<(string FileName, string ContentType, long Length, byte[] Bytes)> ReadValidatedFormFileAsync(
        IFormFile? file,
        CancellationToken ct)
    {
        if (file == null || file.Length <= 0)
        {
            throw new ValidationException("Evidence file is required and cannot be empty.");
        }

        ValidateAndResolveExtension(file.FileName, file.ContentType, file.Length);

        using var memoryStream = new MemoryStream((int)file.Length);
        await file.CopyToAsync(memoryStream, ct);
        return (
            string.IsNullOrWhiteSpace(file.FileName) ? "evidence" : file.FileName,
            string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType,
            file.Length,
            memoryStream.ToArray());
    }

    public static async Task<string> StoreEncryptedEvidenceAsync(
        IClinicStorageService storageService,
        IClinicEncryptionService? encryptionService,
        string tenantId,
        Guid clinicId,
        string storageKey,
        byte[] fileBytes,
        CancellationToken ct)
    {
        byte[] payloadToSave = fileBytes;
        if (encryptionService != null)
        {
            var encrypted = await encryptionService.EncryptAsync(fileBytes, tenantId, clinicId, ct);
            payloadToSave = encrypted.Ciphertext;
        }

        var savedKey = await storageService.SaveEncryptedFileAsync(storageKey, payloadToSave, ct);
        return string.IsNullOrWhiteSpace(savedKey) ? storageKey : savedKey;
    }

    private static string NormalizeContentType(string? contentType)
    {
        if (string.IsNullOrWhiteSpace(contentType))
            return string.Empty;

        var semiIdx = contentType.IndexOf(';');
        return (semiIdx >= 0 ? contentType[..semiIdx] : contentType).Trim();
    }
}
