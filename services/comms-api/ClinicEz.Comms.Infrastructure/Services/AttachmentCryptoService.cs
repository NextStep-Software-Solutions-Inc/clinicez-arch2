using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using Microsoft.Extensions.Configuration;

namespace ClinicEz.Comms.Infrastructure.Services;

public class AttachmentCryptoService : IAttachmentCryptoService
{
    private readonly byte[] _masterSecret;

    public AttachmentCryptoService(IConfiguration configuration)
    {
        var secretStr = configuration["Storage:MasterSecret"] 
            ?? configuration["CellMasterSecret"] 
            ?? "clinicez-comms-default-cell-master-secret-key-32b!";
        _masterSecret = Encoding.UTF8.GetBytes(secretStr);
    }

    public AttachmentCryptoService(string masterSecret)
    {
        _masterSecret = Encoding.UTF8.GetBytes(masterSecret);
    }

    public Task<EncryptedAttachmentResult> EncryptAsync(
        byte[] plaintext,
        string tenantId,
        string facilityId,
        CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(plaintext);

        var plainSha256 = Convert.ToHexString(SHA256.HashData(plaintext)).ToLowerInvariant();
        var dek = RandomNumberGenerator.GetBytes(32);
        var iv = RandomNumberGenerator.GetBytes(12);
        var tag = new byte[16];
        var ciphertext = new byte[plaintext.Length];

        using (var aesGcm = new AesGcm(dek, 16))
        {
            aesGcm.Encrypt(iv, plaintext, ciphertext, tag);
        }

        // Wrap DEK with Cell Master Key derived via HKDF
        var cmk = DeriveCellMasterKey(_masterSecret, tenantId, facilityId);
        var wrapIv = RandomNumberGenerator.GetBytes(12);
        var wrapTag = new byte[16];
        var wrappedDek = new byte[dek.Length];

        using (var wrapGcm = new AesGcm(cmk, 16))
        {
            wrapGcm.Encrypt(wrapIv, dek, wrappedDek, wrapTag);
        }

        var wrappedModel = new WrappedKeyModel
        {
            Iv = Convert.ToBase64String(wrapIv),
            Tag = Convert.ToBase64String(wrapTag),
            CipherText = Convert.ToBase64String(wrappedDek),
            Kid = "cmk-v1"
        };

        var metadata = new AttachmentCryptoMetadata(
            Algorithm: "AES-256-GCM",
            KeyId: "cmk-v1",
            IvBase64: Convert.ToBase64String(iv),
            TagBase64: Convert.ToBase64String(tag),
            WrappedKeyJson: JsonSerializer.Serialize(wrappedModel));

        return Task.FromResult(new EncryptedAttachmentResult(ciphertext, metadata, plainSha256));
    }

    public Task<byte[]> DecryptAsync(
        byte[] ciphertext,
        AttachmentCryptoMetadata metadata,
        string tenantId,
        string facilityId,
        CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(ciphertext);
        ArgumentNullException.ThrowIfNull(metadata);

        byte[] dek;
        if (metadata.WrappedKeyJson.Contains("CipherText", StringComparison.OrdinalIgnoreCase))
        {
            var model = JsonSerializer.Deserialize<WrappedKeyModel>(metadata.WrappedKeyJson)
                ?? throw new CryptographicException("Failed to parse wrapped key payload.");

            var cmk = DeriveCellMasterKey(_masterSecret, tenantId, facilityId);
            var wrapIv = Convert.FromBase64String(model.Iv);
            var wrapTag = Convert.FromBase64String(model.Tag);
            var wrappedDekBytes = Convert.FromBase64String(model.CipherText);
            dek = new byte[wrappedDekBytes.Length];

            using var wrapGcm = new AesGcm(cmk, 16);
            wrapGcm.Decrypt(wrapIv, wrappedDekBytes, wrapTag, dek);
        }
        else
        {
            // Direct base64 fallback for legacy test data
            dek = Convert.FromBase64String(metadata.WrappedKeyJson);
        }

        var iv = Convert.FromBase64String(metadata.IvBase64);
        var tag = Convert.FromBase64String(metadata.TagBase64);
        var plaintext = new byte[ciphertext.Length];

        using var aesGcm = new AesGcm(dek, 16);
        aesGcm.Decrypt(iv, ciphertext, tag, plaintext);

        return Task.FromResult(plaintext);
    }

    public Task<byte[]> EncryptForBundleAsync(
        byte[] plaintext,
        byte[] bundleSessionKey,
        out string bundleIvBase64,
        out string bundleTagBase64)
    {
        ArgumentNullException.ThrowIfNull(plaintext);
        ArgumentNullException.ThrowIfNull(bundleSessionKey);

        var iv = RandomNumberGenerator.GetBytes(12);
        var tag = new byte[16];
        var ciphertext = new byte[plaintext.Length];

        using var aesGcm = new AesGcm(bundleSessionKey, 16);
        aesGcm.Encrypt(iv, plaintext, ciphertext, tag);

        bundleIvBase64 = Convert.ToBase64String(iv);
        bundleTagBase64 = Convert.ToBase64String(tag);

        return Task.FromResult(ciphertext);
    }

    public Task<byte[]> DecryptFromBundleAsync(
        byte[] bundleCiphertext,
        byte[] bundleSessionKey,
        string bundleIvBase64,
        string bundleTagBase64)
    {
        ArgumentNullException.ThrowIfNull(bundleCiphertext);
        ArgumentNullException.ThrowIfNull(bundleSessionKey);

        var iv = Convert.FromBase64String(bundleIvBase64);
        var tag = Convert.FromBase64String(bundleTagBase64);
        var plaintext = new byte[bundleCiphertext.Length];

        using var aesGcm = new AesGcm(bundleSessionKey, 16);
        aesGcm.Decrypt(iv, bundleCiphertext, tag, plaintext);

        return Task.FromResult(plaintext);
    }

    private static byte[] DeriveCellMasterKey(byte[] masterSecret, string tenantId, string facilityId)
    {
        var contextInfo = Encoding.UTF8.GetBytes($"clinicez:cmk:v1:{tenantId}:{facilityId}");
        return HKDF.DeriveKey(HashAlgorithmName.SHA256, masterSecret, 32, null, contextInfo);
    }

    private sealed class WrappedKeyModel
    {
        public string Iv { get; set; } = string.Empty;
        public string Tag { get; set; } = string.Empty;
        public string CipherText { get; set; } = string.Empty;
        public string Kid { get; set; } = string.Empty;
    }
}
