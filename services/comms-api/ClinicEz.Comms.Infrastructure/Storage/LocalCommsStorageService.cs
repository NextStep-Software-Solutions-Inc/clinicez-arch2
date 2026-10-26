using System;
using System.IO;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using Microsoft.Extensions.Configuration;

namespace ClinicEz.Comms.Infrastructure.Storage;

public class LocalCommsStorageService : ICommsStorageService
{
    private readonly string _basePath;

    public LocalCommsStorageService(IConfiguration configuration)
    {
        _basePath = configuration["Storage:BasePath"]
            ?? Path.Combine(AppContext.BaseDirectory, "Storage", "Comms");
    }

    public async Task<string> SaveEncryptedAttachmentAsync(
        string tenantId,
        string facilityId,
        Guid attachmentId,
        byte[] ciphertext,
        CancellationToken ct = default)
    {
        var sanitizedTenant = SanitizePathSegment(tenantId);
        var sanitizedFacility = SanitizePathSegment(facilityId);

        var now = DateTime.UtcNow;
        var relativeDir = Path.Combine(
            "tenants", sanitizedTenant,
            "facilities", sanitizedFacility,
            "comms", "attachments",
            now.ToString("yyyy"), now.ToString("MM"));

        var fullDir = Path.Combine(_basePath, relativeDir);
        Directory.CreateDirectory(fullDir);

        var relativePath = Path.Combine(relativeDir, $"{attachmentId:N}.enc");
        var fullPath = Path.Combine(_basePath, relativePath);

        await File.WriteAllBytesAsync(fullPath, ciphertext, ct);

        // Normalize forward slashes for storage path
        return relativePath.Replace('\\', '/');
    }

    public async Task<byte[]?> ReadEncryptedAttachmentAsync(string storagePath, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(storagePath)) return null;

        var normalized = storagePath.Replace('/', Path.DirectorySeparatorChar).Replace('\\', Path.DirectorySeparatorChar);
        var fullPath = Path.Combine(_basePath, normalized);

        if (!File.Exists(fullPath)) return null;

        return await File.ReadAllBytesAsync(fullPath, ct);
    }

    public Task<bool> DeleteAttachmentAsync(string storagePath, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(storagePath)) return Task.FromResult(false);

        var normalized = storagePath.Replace('/', Path.DirectorySeparatorChar).Replace('\\', Path.DirectorySeparatorChar);
        var fullPath = Path.Combine(_basePath, normalized);

        if (File.Exists(fullPath))
        {
            File.Delete(fullPath);
            return Task.FromResult(true);
        }

        return Task.FromResult(false);
    }

    private static string SanitizePathSegment(string input)
    {
        if (string.IsNullOrWhiteSpace(input)) return "default";
        var cleaned = Regex.Replace(input, @"[^\w\-]", "_");
        return cleaned.Length > 64 ? cleaned[..64] : cleaned;
    }
}
