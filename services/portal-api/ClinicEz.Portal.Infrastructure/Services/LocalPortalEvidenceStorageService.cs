using System;
using System.IO;
using System.Security;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
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
        var root = !string.IsNullOrWhiteSpace(configured)
            ? Path.GetFullPath(configured)
            : Path.Combine(AppContext.BaseDirectory, "Storage", "VerificationEvidence");
        Directory.CreateDirectory(root);
        return root;
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

        if (!File.Exists(fullPath))
            return null;

        var bytes = await File.ReadAllBytesAsync(fullPath, ct);
        var ext = Path.GetExtension(fullPath).ToLowerInvariant();
        var contentType = ext switch
        {
            ".pdf" => "application/pdf",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            _ => "application/octet-stream"
        };

        var fileName = SanitizeFileName(Path.GetFileName(fullPath));
        return new PortalEvidenceFile(bytes, contentType, fileName);
    }

    private static string SanitizeFileName(string? name)
    {
        if (string.IsNullOrWhiteSpace(name))
            return "verification-evidence";

        var sb = new StringBuilder(name.Length);
        foreach (var ch in name)
        {
            if (char.IsLetterOrDigit(ch) || ch is '.' or '-' or '_' or ' ')
                sb.Append(ch);
        }

        var cleaned = sb.ToString().Trim();
        return string.IsNullOrWhiteSpace(cleaned) ? "verification-evidence" : cleaned;
    }
}
