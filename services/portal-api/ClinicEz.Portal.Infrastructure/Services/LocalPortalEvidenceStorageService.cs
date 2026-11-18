using System;
using System.IO;
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
        var fullPath = Path.GetFullPath(Path.Combine(_storageRoot, objectKey.Replace('/', Path.DirectorySeparatorChar)));
        if (!fullPath.StartsWith(_storageRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Invalid storage key path.");

        var dir = Path.GetDirectoryName(fullPath);
        if (!string.IsNullOrEmpty(dir))
            Directory.CreateDirectory(dir);

        await File.WriteAllBytesAsync(fullPath, content, ct);
        logger.LogInformation("Stored LTO verification evidence ({Size} bytes) at {ObjectKey}", content.Length, objectKey);
        return objectKey;
    }
}
