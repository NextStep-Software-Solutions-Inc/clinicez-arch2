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

    public async Task SaveChunkAsync(string attachmentKey, int chunkIndex, byte[] bytes, CancellationToken ct = default)
    {
        var dir = GetChunkDirectory(attachmentKey);
        Directory.CreateDirectory(dir);
        var path = Path.Combine(dir, $"{chunkIndex:D4}.part");
        await File.WriteAllBytesAsync(path, bytes, ct);
    }

    public async Task<byte[]?> TryAssembleChunksAsync(string attachmentKey, int totalChunks, CancellationToken ct = default)
    {
        if (totalChunks <= 0) return null;
        var dir = GetChunkDirectory(attachmentKey);
        if (!Directory.Exists(dir)) return null;

        for (var i = 0; i < totalChunks; i++)
        {
            if (!File.Exists(Path.Combine(dir, $"{i:D4}.part")))
            {
                return null;
            }
        }

        using var ms = new MemoryStream();
        for (var i = 0; i < totalChunks; i++)
        {
            var part = await File.ReadAllBytesAsync(Path.Combine(dir, $"{i:D4}.part"), ct);
            await ms.WriteAsync(part, ct);
        }
        return ms.ToArray();
    }

    public Task DeleteChunksAsync(string attachmentKey, int totalChunks, CancellationToken ct = default)
    {
        var dir = GetChunkDirectory(attachmentKey);
        if (Directory.Exists(dir))
        {
            try { Directory.Delete(dir, recursive: true); } catch { /* best-effort cleanup */ }
        }
        return Task.CompletedTask;
    }

    private string GetChunkDirectory(string attachmentKey)
    {
        var hash = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(
            System.Text.Encoding.UTF8.GetBytes(attachmentKey ?? string.Empty)))[..24].ToLowerInvariant();
        return Path.Combine(_basePath, "_chunks", hash);
    }

    private static string SanitizePathSegment(string input)
    {
        if (string.IsNullOrWhiteSpace(input)) return "default";
        var cleaned = Regex.Replace(input, @"[^\w\-]", "_");
        return cleaned.Length > 64 ? cleaned[..64] : cleaned;
    }
}
