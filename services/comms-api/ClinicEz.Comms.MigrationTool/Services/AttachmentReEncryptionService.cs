using System;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.MigrationTool.Models;

namespace ClinicEz.Comms.MigrationTool.Services;

public class AttachmentReEncryptionService
{
    private const int KdfIterations = 100000;
    private const int KeySizeBytes = 32;

    public static (byte[] BundleSessionKey, CryptoInfo Crypto) CreateAndWrapSessionKey(
        string passphrase,
        string signerClientId,
        string signerPublicKeyPem)
    {
        var sessionKey = RandomNumberGenerator.GetBytes(KeySizeBytes);
        var salt = RandomNumberGenerator.GetBytes(16);

        var kek = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(passphrase),
            salt,
            KdfIterations,
            HashAlgorithmName.SHA256,
            KeySizeBytes);

        var wrapIv = RandomNumberGenerator.GetBytes(12);
        var wrapTag = new byte[16];
        var wrappedSessionKey = new byte[sessionKey.Length];

        using (var aesGcm = new AesGcm(kek, 16))
        {
            aesGcm.Encrypt(wrapIv, sessionKey, wrappedSessionKey, wrapTag);
        }

        var crypto = new CryptoInfo
        {
            SessionKeyAlgorithm = "AES-256-GCM",
            KeyDerivation = "PBKDF2-HMAC-SHA256",
            KdfSaltBase64 = Convert.ToBase64String(salt),
            KdfIterations = KdfIterations,
            SessionKeyIvBase64 = Convert.ToBase64String(wrapIv),
            SessionKeyTagBase64 = Convert.ToBase64String(wrapTag),
            WrappedSessionKeyBase64 = Convert.ToBase64String(wrappedSessionKey),
            SignerClientId = signerClientId,
            SignerPublicKeyPem = signerPublicKeyPem
        };

        return (sessionKey, crypto);
    }

    public static byte[] UnwrapSessionKey(CryptoInfo crypto, string passphrase)
    {
        ArgumentNullException.ThrowIfNull(crypto);
        if (string.IsNullOrWhiteSpace(passphrase))
            throw new ArgumentException("Passphrase is required to unwrap bundle session key.", nameof(passphrase));

        var salt = Convert.FromBase64String(crypto.KdfSaltBase64);
        var kek = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(passphrase),
            salt,
            crypto.KdfIterations,
            HashAlgorithmName.SHA256,
            KeySizeBytes);

        var wrapIv = Convert.FromBase64String(crypto.SessionKeyIvBase64);
        var wrapTag = Convert.FromBase64String(crypto.SessionKeyTagBase64);
        var wrappedSessionKey = Convert.FromBase64String(crypto.WrappedSessionKeyBase64);
        var sessionKey = new byte[wrappedSessionKey.Length];

        using (var aesGcm = new AesGcm(kek, 16))
        {
            aesGcm.Decrypt(wrapIv, wrappedSessionKey, wrapTag, sessionKey);
        }

        return sessionKey;
    }

    public static async Task<(byte[] BundleCiphertext, string IvBase64, string TagBase64)> ExportAttachmentAsync(
        IAttachmentCryptoService sourceCrypto,
        byte[] sourceCiphertext,
        AttachmentCryptoMetadata metadata,
        string expectedSha256Checksum,
        string tenantId,
        string facilityId,
        byte[] bundleSessionKey,
        CancellationToken ct = default)
    {
        var plaintext = await sourceCrypto.DecryptAsync(sourceCiphertext, metadata, tenantId, facilityId, ct);
        var actualSha256 = Convert.ToHexString(SHA256.HashData(plaintext)).ToLowerInvariant();

        if (!string.Equals(actualSha256, expectedSha256Checksum, StringComparison.OrdinalIgnoreCase))
        {
            throw new CryptographicException(
                $"Attachment integrity verification failed: Plaintext SHA256 '{actualSha256}' does not match recorded checksum '{expectedSha256Checksum}'.");
        }

        var bundleCiphertext = await sourceCrypto.EncryptForBundleAsync(
            plaintext,
            bundleSessionKey,
            out var ivBase64,
            out var tagBase64);

        return (bundleCiphertext, ivBase64, tagBase64);
    }

    public static async Task<EncryptedAttachmentResult> ImportAttachmentAsync(
        IAttachmentCryptoService targetCrypto,
        byte[] bundleCiphertext,
        string bundleIvBase64,
        string bundleTagBase64,
        string expectedSha256Checksum,
        string tenantId,
        string facilityId,
        byte[] bundleSessionKey,
        CancellationToken ct = default)
    {
        var plaintext = await targetCrypto.DecryptFromBundleAsync(
            bundleCiphertext,
            bundleSessionKey,
            bundleIvBase64,
            bundleTagBase64);

        var actualSha256 = Convert.ToHexString(SHA256.HashData(plaintext)).ToLowerInvariant();

        if (!string.Equals(actualSha256, expectedSha256Checksum, StringComparison.OrdinalIgnoreCase))
        {
            throw new CryptographicException(
                $"Imported bundle attachment payload corrupted: SHA-256 '{actualSha256}' does not match expected '{expectedSha256Checksum}'.");
        }

        // Re-encrypt with Target Cell Master Key
        var targetResult = await targetCrypto.EncryptAsync(plaintext, tenantId, facilityId, ct);
        return targetResult;
    }
}
