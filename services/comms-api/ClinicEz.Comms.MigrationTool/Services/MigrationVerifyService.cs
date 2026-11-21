using System;
using System.IO;
using System.Security.Cryptography;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.MigrationTool.Models;
using ClinicEz.Shared.Security;

namespace ClinicEz.Comms.MigrationTool.Services;

public sealed record VerificationReport(
    bool IsValid,
    string TenantId,
    string ManifestVersion,
    string SchemaVersion,
    int TotalDatasets,
    int TotalAttachments,
    string? FailureReason);

public class MigrationVerifyService
{
    private readonly IAttachmentCryptoService? _crypto;

    public MigrationVerifyService(IAttachmentCryptoService? crypto = null)
    {
        _crypto = crypto;
    }

    public async Task<VerificationReport> VerifyAsync(
        string bundlePath,
        string? bundlePassphrase = null,
        string? trustedSignerPublicKeyPemOrBase64 = null,
        CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(bundlePath);

        ECDsa? trustedKey = null;
        try
        {
            if (!string.IsNullOrWhiteSpace(trustedSignerPublicKeyPemOrBase64))
            {
                var keyString = trustedSignerPublicKeyPemOrBase64.Trim();
                if (!keyString.Contains('\n') && !keyString.Contains("-----BEGIN") && File.Exists(keyString))
                {
                    keyString = await File.ReadAllTextAsync(keyString, ct);
                }

                var normalizedTrustedKey = PemKey.Normalize(keyString, "TrustedSignerPublicKey");
                trustedKey = PemKey.ImportEcdsa(normalizedTrustedKey!, "TrustedSignerPublicKey");
            }

            var extracted = await MigrationBundleService.ExtractAndValidateBundleAsync(bundlePath, trustedKey, ct);
            var manifest = extracted.Manifest;

            if (!string.IsNullOrWhiteSpace(bundlePassphrase) && _crypto != null)
            {
                var bundleSessionKey = AttachmentReEncryptionService.UnwrapSessionKey(manifest.Crypto, bundlePassphrase);

                if (extracted.DatasetBytes.TryGetValue("attachmentsMetadata", out var attBytes))
                {
                    var attList = JsonSerializer.Deserialize<System.Collections.Generic.List<MessageAttachmentRecord>>(
                        attBytes, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }) ?? new();

                    foreach (var att in attList)
                    {
                        if (!string.IsNullOrWhiteSpace(att.BundleCiphertextFileName) &&
                            extracted.AttachmentPayloads.TryGetValue(att.BundleCiphertextFileName, out var bundlePayload))
                        {
                            var plaintext = await _crypto.DecryptFromBundleAsync(
                                bundlePayload,
                                bundleSessionKey,
                                att.BundleIvBase64,
                                att.BundleTagBase64);

                            var actualSha256 = Convert.ToHexString(SHA256.HashData(plaintext)).ToLowerInvariant();
                            if (!string.Equals(actualSha256, att.SHA256Checksum, StringComparison.OrdinalIgnoreCase))
                            {
                                return new VerificationReport(
                                    IsValid: false,
                                    manifest.TenantId,
                                    manifest.ManifestVersion,
                                    manifest.SchemaVersion,
                                    manifest.Datasets.Count,
                                    manifest.AttachmentsSummary.TotalCount,
                                    $"Attachment '{att.Id}' checksum mismatch.");
                            }
                        }
                    }
                }
            }

            return new VerificationReport(
                IsValid: true,
                manifest.TenantId,
                manifest.ManifestVersion,
                manifest.SchemaVersion,
                manifest.Datasets.Count,
                manifest.AttachmentsSummary.TotalCount,
                null);
        }
        catch (Exception ex)
        {
            return new VerificationReport(
                IsValid: false,
                string.Empty,
                string.Empty,
                string.Empty,
                0,
                0,
                ex.Message);
        }
        finally
        {
            trustedKey?.Dispose();
        }
    }

    public static async Task<MigrationManifest> InspectAsync(string bundlePath, CancellationToken ct = default)
    {
        if (!File.Exists(bundlePath))
            throw new FileNotFoundException($"Bundle file not found: {bundlePath}", bundlePath);

        using var zipFile = File.OpenRead(bundlePath);
        using var archive = new System.IO.Compression.ZipArchive(zipFile, System.IO.Compression.ZipArchiveMode.Read);

        var manifestEntry = archive.GetEntry("bundle-manifest.json")
            ?? throw new CryptographicException("Archive missing bundle-manifest.json.");

        await using var stream = manifestEntry.Open();
        var manifest = await JsonSerializer.DeserializeAsync<MigrationManifest>(stream,
            new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }, ct)
            ?? throw new CryptographicException("Failed to deserialize bundle-manifest.json.");

        return manifest;
    }
}
