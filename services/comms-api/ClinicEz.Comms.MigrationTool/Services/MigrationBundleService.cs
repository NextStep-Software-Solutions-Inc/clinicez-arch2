using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.MigrationTool.Models;
using ClinicEz.Shared.Security;

namespace ClinicEz.Comms.MigrationTool.Services;

public class ExtractedBundle
{
    public MigrationManifest Manifest { get; set; } = new();
    public string Signature { get; set; } = string.Empty;
    public Dictionary<string, byte[]> DatasetBytes { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, byte[]> AttachmentPayloads { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}

public class MigrationBundleService
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true
    };

    public static async Task PackageBundleAsync(
        MigrationManifest manifest,
        Dictionary<string, byte[]> datasetFiles,
        Dictionary<string, byte[]> bundleAttachments,
        string bundleSignatureBase64,
        string outputPath,
        CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(manifest);
        ArgumentNullException.ThrowIfNull(datasetFiles);
        ArgumentNullException.ThrowIfNull(bundleAttachments);
        ArgumentNullException.ThrowIfNull(bundleSignatureBase64);

        var outputDir = Path.GetDirectoryName(outputPath);
        if (!string.IsNullOrWhiteSpace(outputDir) && !Directory.Exists(outputDir))
        {
            Directory.CreateDirectory(outputDir);
        }

        if (File.Exists(outputPath))
        {
            File.Delete(outputPath);
        }

        using var zipFile = File.Open(outputPath, FileMode.CreateNew, FileAccess.ReadWrite);
        using var archive = new ZipArchive(zipFile, ZipArchiveMode.Create);

        // 1. Write bundle-manifest.json
        manifest.Signature = bundleSignatureBase64;
        var manifestJson = JsonSerializer.Serialize(manifest, JsonOpts);
        var manifestBytes = Encoding.UTF8.GetBytes(manifestJson);
        var manifestEntry = archive.CreateEntry("bundle-manifest.json", CompressionLevel.Optimal);
        await using (var stream = manifestEntry.Open())
        {
            await stream.WriteAsync(manifestBytes, ct);
        }

        // 2. Write bundle-signature.sig
        var sigEntry = archive.CreateEntry("bundle-signature.sig", CompressionLevel.NoCompression);
        await using (var stream = sigEntry.Open())
        {
            await stream.WriteAsync(Encoding.UTF8.GetBytes(bundleSignatureBase64.Trim()), ct);
        }

        // 3. Write data/*.json
        foreach (var (fileName, bytes) in datasetFiles)
        {
            var entryName = fileName.Replace('\\', '/');
            var entry = archive.CreateEntry(entryName, CompressionLevel.Optimal);
            await using var stream = entry.Open();
            await stream.WriteAsync(bytes, ct);
        }

        // 4. Write attachments/*.enc
        foreach (var (fileName, bytes) in bundleAttachments)
        {
            var entryName = fileName.Replace('\\', '/');
            var entry = archive.CreateEntry(entryName, CompressionLevel.Optimal);
            await using var stream = entry.Open();
            await stream.WriteAsync(bytes, ct);
        }
    }

    public static async Task<ExtractedBundle> ExtractAndValidateBundleAsync(
        string bundlePath,
        ECDsa? trustedPublicKey = null,
        CancellationToken ct = default)
    {
        if (!File.Exists(bundlePath))
            throw new FileNotFoundException($"Migration bundle file not found: {bundlePath}", bundlePath);

        using var zipFile = File.OpenRead(bundlePath);
        using var archive = new ZipArchive(zipFile, ZipArchiveMode.Read);

        // 1. Read manifest
        var manifestEntry = archive.GetEntry("bundle-manifest.json")
            ?? throw new CryptographicException("Archive missing bundle-manifest.json.");

        MigrationManifest manifest;
        await using (var stream = manifestEntry.Open())
        {
            manifest = await JsonSerializer.DeserializeAsync<MigrationManifest>(stream, JsonOpts, ct)
                ?? throw new CryptographicException("Failed to parse bundle-manifest.json.");
        }

        // 2. Read detached signature
        var sigEntry = archive.GetEntry("bundle-signature.sig")
            ?? throw new CryptographicException("Archive missing bundle-signature.sig.");

        string signature;
        using (var reader = new StreamReader(sigEntry.Open(), Encoding.UTF8))
        {
            signature = (await reader.ReadToEndAsync(ct)).Trim();
        }

        // 3. Verify signature
        ECDsa keyToUse;
        bool shouldDisposeKey = false;
        if (trustedPublicKey != null)
        {
            keyToUse = trustedPublicKey;
        }
        else if (!string.IsNullOrWhiteSpace(manifest.Crypto?.SignerPublicKeyPem))
        {
            var normalized = PemKey.Normalize(manifest.Crypto.SignerPublicKeyPem, "SignerPublicKeyPem");
            keyToUse = PemKey.ImportEcdsa(normalized!, "SignerPublicKeyPem");
            shouldDisposeKey = true;
        }
        else
        {
            throw new CryptographicException("No trusted signer public key provided and manifest contains no signer key.");
        }

        try
        {
            var isSignatureValid = MigrationManifestService.VerifyManifest(manifest, keyToUse, signature);
            if (!isSignatureValid)
            {
                throw new CryptographicException("Bundle signature verification failed: signature is invalid or bundle manifest was tampered with.");
            }
        }
        finally
        {
            if (shouldDisposeKey) keyToUse.Dispose();
        }

        var result = new ExtractedBundle
        {
            Manifest = manifest,
            Signature = signature
        };

        // 4. Validate and read datasets
        foreach (var (datasetKey, summary) in manifest.Datasets)
        {
            var entryName = summary.FileName.Replace('\\', '/');
            var entry = archive.GetEntry(entryName)
                ?? throw new CryptographicException($"Archive missing dataset file: {entryName}");

            byte[] bytes;
            using (var memoryStream = new MemoryStream())
            {
                await using var entryStream = entry.Open();
                await entryStream.CopyToAsync(memoryStream, ct);
                bytes = memoryStream.ToArray();
            }

            var actualSha256 = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
            if (!string.Equals(actualSha256, summary.Sha256, StringComparison.OrdinalIgnoreCase))
            {
                throw new CryptographicException(
                    $"Dataset '{datasetKey}' integrity check failed: expected SHA-256 '{summary.Sha256}', actual '{actualSha256}'.");
            }

            result.DatasetBytes[datasetKey] = bytes;
        }

        // 5. Read attachments
        foreach (var entry in archive.Entries)
        {
            var normalizedName = entry.FullName.Replace('\\', '/');
            if (normalizedName.StartsWith("attachments/", StringComparison.OrdinalIgnoreCase) &&
                normalizedName.EndsWith(".enc", StringComparison.OrdinalIgnoreCase))
            {
                using var memoryStream = new MemoryStream();
                await using var entryStream = entry.Open();
                await entryStream.CopyToAsync(memoryStream, ct);
                result.AttachmentPayloads[normalizedName] = memoryStream.ToArray();
            }
        }

        if (manifest.AttachmentsSummary.TotalCount > 0 &&
            result.AttachmentPayloads.Count != manifest.AttachmentsSummary.TotalCount)
        {
            throw new CryptographicException(
                $"Attachment count mismatch: manifest expected {manifest.AttachmentsSummary.TotalCount}, but found {result.AttachmentPayloads.Count}.");
        }

        return result;
    }
}
