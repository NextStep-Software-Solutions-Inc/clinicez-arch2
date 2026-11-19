using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Shared.Exceptions;
using Microsoft.AspNetCore.Http;

namespace ClinicEz.Clinic.Application.Common.Helpers;

public sealed record VerificationEvidenceFileResult(
    byte[] Bytes,
    string ContentType,
    string FileName);

/// <summary>
/// Validates, encrypts, stores, and decrypts verification evidence documents (DOH LTO and PRC proofs)
/// via <see cref="IClinicStorageService"/> and <see cref="IClinicEncryptionService"/>.
/// </summary>
public static class VerificationEvidenceHelper
{
    public const int MaxFileSizeBytes = 5 * 1024 * 1024; // 5 MB
    public const string SidecarSuffix = ".enc.json";

    private sealed record EncryptedEvidenceSidecar(
        string? IvBase64,
        string? TagBase64,
        string? WrappedKeyJson,
        string? ContentType,
        string? FileName);

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

    private static readonly Dictionary<string, string> ExtensionToMime = new(StringComparer.OrdinalIgnoreCase)
    {
        [".pdf"] = "application/pdf",
        [".jpg"] = "image/jpeg",
        [".jpeg"] = "image/jpeg",
        [".png"] = "image/png"
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
        CancellationToken ct,
        string? contentType = null,
        string? fileName = null)
    {
        byte[] payloadToSave = fileBytes;
        EncryptedEvidenceSidecar? sidecar = null;
        var resolvedMime = InferContentType(storageKey, contentType);
        var safeFileName = SanitizeFileName(fileName, storageKey);

        if (encryptionService != null)
        {
            var encrypted = await encryptionService.EncryptAsync(fileBytes, tenantId, clinicId, ct);
            payloadToSave = encrypted.Ciphertext;
            sidecar = new EncryptedEvidenceSidecar(
                encrypted.IvBase64,
                encrypted.TagBase64,
                encrypted.WrappedKeyJson,
                resolvedMime,
                safeFileName);
        }

        var savedKey = await storageService.SaveEncryptedFileAsync(storageKey, payloadToSave, ct);
        var finalKey = string.IsNullOrWhiteSpace(savedKey) ? storageKey : savedKey;

        if (sidecar != null)
        {
            var sidecarBytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(sidecar));
            await storageService.SaveEncryptedFileAsync(finalKey + SidecarSuffix, sidecarBytes, ct);
        }

        return finalKey;
    }

    public static async Task<VerificationEvidenceFileResult?> ReadDecryptedEvidenceAsync(
        IClinicStorageService storageService,
        IClinicEncryptionService? encryptionService,
        string tenantId,
        Guid clinicId,
        string? storageKey,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(storageKey))
        {
            return null;
        }

        var trimmedKey = storageKey.Trim();
        if (!await storageService.FileExistsAsync(trimmedKey, ct))
        {
            return null;
        }

        var rawBytes = await storageService.ReadEncryptedFileAsync(trimmedKey, ct);
        var contentType = InferContentType(trimmedKey, null);
        var fileName = SanitizeFileName(null, trimmedKey);

        var sidecarKey = trimmedKey + SidecarSuffix;
        if (encryptionService != null && await storageService.FileExistsAsync(sidecarKey, ct))
        {
            var sidecarBytes = await storageService.ReadEncryptedFileAsync(sidecarKey, ct);
            var sidecar = JsonSerializer.Deserialize<EncryptedEvidenceSidecar>(sidecarBytes);
            if (sidecar != null &&
                !string.IsNullOrWhiteSpace(sidecar.IvBase64) &&
                !string.IsNullOrWhiteSpace(sidecar.TagBase64) &&
                !string.IsNullOrWhiteSpace(sidecar.WrappedKeyJson))
            {
                rawBytes = await encryptionService.DecryptAsync(
                    rawBytes,
                    sidecar.IvBase64,
                    sidecar.TagBase64,
                    sidecar.WrappedKeyJson,
                    tenantId,
                    clinicId,
                    ct);
                contentType = InferContentType(trimmedKey, sidecar.ContentType);
                fileName = SanitizeFileName(sidecar.FileName, trimmedKey);
            }
        }

        return new VerificationEvidenceFileResult(rawBytes, contentType, fileName);
    }

    public static string InferContentType(string? storageKey, string? contentType)
    {
        var normalized = NormalizeContentType(contentType);
        if (!string.IsNullOrWhiteSpace(normalized) && AllowedMimeToExtension.ContainsKey(normalized))
        {
            return string.Equals(normalized, "image/jpg", StringComparison.OrdinalIgnoreCase)
                ? "image/jpeg"
                : normalized.ToLowerInvariant();
        }

        var ext = Path.GetExtension(storageKey ?? string.Empty);
        if (!string.IsNullOrWhiteSpace(ext) && ExtensionToMime.TryGetValue(ext, out var mime))
        {
            return mime;
        }

        return "application/octet-stream";
    }

    public static string SanitizeFileName(string? fileName, string? storageKey)
    {
        var candidate = !string.IsNullOrWhiteSpace(fileName)
            ? Path.GetFileName(fileName.Trim())
            : Path.GetFileName(storageKey ?? string.Empty);

        if (string.IsNullOrWhiteSpace(candidate))
        {
            return "verification-evidence";
        }

        var cleaned = new StringBuilder(candidate.Length);
        foreach (var ch in candidate)
        {
            if (char.IsLetterOrDigit(ch) || ch is '.' or '-' or '_' or ' ')
            {
                cleaned.Append(ch);
            }
        }

        var result = cleaned.ToString().Trim();
        return string.IsNullOrWhiteSpace(result) ? "verification-evidence" : result;
    }

    private static string NormalizeContentType(string? contentType)
    {
        if (string.IsNullOrWhiteSpace(contentType))
            return string.Empty;

        var semiIdx = contentType.IndexOf(';');
        return (semiIdx >= 0 ? contentType[..semiIdx] : contentType).Trim();
    }
}
