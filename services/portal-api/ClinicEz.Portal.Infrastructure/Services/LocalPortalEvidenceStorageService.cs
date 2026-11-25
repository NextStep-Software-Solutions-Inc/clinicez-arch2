using System;
using System.IO;
using System.Security;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.DirectoryVerification;
using ClinicEz.Portal.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Infrastructure.Services;

public sealed class LocalPortalEvidenceStorageService(
    IConfiguration? configuration,
    ILogger<LocalPortalEvidenceStorageService> logger) : IPortalEvidenceStorageService
{
    private readonly string _storageRoot = ResolveRoot(configuration);

    private static string ResolveRoot(IConfiguration? configuration)
    {
        var configured = configuration?["Storage:BasePath"];
        return !string.IsNullOrWhiteSpace(configured)
            ? Path.GetFullPath(configured)
            : Path.Combine(AppContext.BaseDirectory, "Storage", "VerificationEvidence");
    }

    private string ResolveSafeFullPath(string objectKey)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(objectKey);

        string unescaped;
        try
        {
            unescaped = Uri.UnescapeDataString(objectKey);
        }
        catch (UriFormatException)
        {
            throw new SecurityException($"Invalid verification evidence object key '{objectKey}'.");
        }

        if (objectKey.Contains("..", StringComparison.Ordinal) ||
            unescaped.Contains("..", StringComparison.Ordinal) ||
            objectKey.Contains("%2e", StringComparison.OrdinalIgnoreCase) ||
            unescaped.Contains("%2e", StringComparison.OrdinalIgnoreCase) ||
            objectKey.Contains("%00", StringComparison.OrdinalIgnoreCase) ||
            unescaped.Contains('\0'))
        {
            throw new SecurityException($"Storage path traversal attempt detected for key '{objectKey}'.");
        }

        var normalized = unescaped
            .Replace('/', Path.DirectorySeparatorChar)
            .Replace('\\', Path.DirectorySeparatorChar)
            .TrimStart(Path.DirectorySeparatorChar);

        var fullPath = Path.GetFullPath(Path.Combine(_storageRoot, normalized));
        if (!fullPath.StartsWith(_storageRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
        {
            throw new SecurityException($"Storage path traversal attempt detected for key '{objectKey}'.");
        }

        return fullPath;
    }

    public async Task<string> SaveLtoProofAsync(
        Guid tenantId,
        Guid facilityId,
        string contentType,
        byte[] content,
        CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(content);
        if (content.Length == 0)
            throw new ArgumentException("LTO proof content cannot be empty.", nameof(content));

        var ext = contentType.Trim().ToLowerInvariant() switch
        {
            "application/pdf" => ".pdf",
            "image/jpeg" => ".jpg",
            "image/png" => ".png",
            _ => throw new ArgumentException($"Unsupported LTO proof content type '{contentType}'.", nameof(contentType))
        };

        var objectKey = $"verification/lto/{tenantId:D}/{facilityId:D}/{Guid.NewGuid():N}{ext}";
        var fullPath = ResolveSafeFullPath(objectKey);

        var dir = Path.GetDirectoryName(fullPath);
        if (!string.IsNullOrEmpty(dir))
            Directory.CreateDirectory(dir);

        await File.WriteAllBytesAsync(fullPath, content, ct);
        logger.LogInformation("Stored LTO verification evidence ({Size} bytes) at {ObjectKey}", content.Length, objectKey);
        return objectKey;
    }

    public async Task<PortalEvidenceFile?> ReadEvidenceAsync(
        string objectKey,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(objectKey))
            return null;

        string fullPath;
        try
        {
            fullPath = ResolveSafeFullPath(objectKey.Trim());
        }
        catch (SecurityException)
        {
            return null;
        }

        if (!Directory.Exists(_storageRoot) || !File.Exists(fullPath))
            return null;

        byte[] bytes;
        try
        {
            bytes = await File.ReadAllBytesAsync(fullPath, ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            logger.LogWarning(ex, "Failed reading local verification evidence at {ObjectKey}.", objectKey);
            return null;
        }

        if (bytes.Length == 0)
            return null;

        var contentType = VerificationEvidenceResolver.NormalizeContentType(null, fullPath);
        var fileName = SanitizeFileName(Path.GetFileName(fullPath));
        return new PortalEvidenceFile(bytes, contentType, fileName);
    }

    public async Task SaveCachedEvidenceAsync(
        Guid tenantId,
        Guid facilityId,
        string objectKey,
        string contentType,
        string? fileName,
        byte[] content,
        CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(content);
        if (content.Length == 0)
            throw new ArgumentException("Verification evidence content cannot be empty.", nameof(content));

        var fullPath = ResolveSafeFullPath(objectKey.Trim());
        var dir = Path.GetDirectoryName(fullPath);
        if (!string.IsNullOrEmpty(dir))
            Directory.CreateDirectory(dir);

        await File.WriteAllBytesAsync(fullPath, content, ct);
    }

    private static string SanitizeFileName(string? name)
        => VerificationEvidenceResolver.SanitizeFileName(name, null);
}
