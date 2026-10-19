using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;

namespace ClinicEz.Clinic.Infrastructure.Services.Storage;

public sealed class ClinicEncryptionService : IClinicEncryptionService
{
    private readonly ClinicEncryptionKeyRing _keyRing;

    public ClinicEncryptionService(ClinicEncryptionKeyRing keyRing)
    {
        _keyRing = keyRing ?? throw new ArgumentNullException(nameof(keyRing));
    }

    public async Task<ClinicEncryptedPayload> EncryptAsync(
        Stream plaintextStream,
        string tenantId,
        Guid clinicId,
        CancellationToken cancellationToken = default)
    {
        using var memoryStream = new MemoryStream();
        await plaintextStream.CopyToAsync(memoryStream, cancellationToken);
        return await EncryptAsync(memoryStream.ToArray(), tenantId, clinicId, cancellationToken);
    }

    public Task<ClinicEncryptedPayload> EncryptAsync(
        byte[] plaintextBytes,
        string tenantId,
        Guid clinicId,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(plaintextBytes);
        ArgumentException.ThrowIfNullOrWhiteSpace(tenantId);

        // 1. Generate unique random 256-bit DEK (Data Encryption Key)
        var dek = RandomNumberGenerator.GetBytes(32);

        // 2. Generate 12-byte IV/Nonce for the file
        var fileIv = RandomNumberGenerator.GetBytes(12);

        // 3. Encrypt file payload with DEK using AES-256-GCM
        var ciphertext = new byte[plaintextBytes.Length];
        var fileTag = new byte[16];

        using (var aesGcmFile = new AesGcm(dek, 16))
        {
            aesGcmFile.Encrypt(fileIv, plaintextBytes, ciphertext, fileTag);
        }

        // 4. Compute SHA-256 hash of ciphertext
        var encryptedHash = Convert.ToHexString(SHA256.HashData(ciphertext)).ToLowerInvariant();

        // 5. Derive Clinic Master Key (CMK) and wrap the DEK
        var (keyId, masterSecret) = _keyRing.Current;
        var cmk = DeriveClinicMasterKey(masterSecret, tenantId, clinicId);
        var wrapIv = RandomNumberGenerator.GetBytes(12);
        var wrappedDekCiphertext = new byte[dek.Length];
        var wrapTag = new byte[16];

        using (var aesGcmCmk = new AesGcm(cmk, 16))
        {
            aesGcmCmk.Encrypt(wrapIv, dek, wrappedDekCiphertext, wrapTag);
        }

        // Clear in-memory raw DEK bytes
        CryptographicOperations.ZeroMemory(dek);
        CryptographicOperations.ZeroMemory(cmk);

        var wrappedKeyPayload = new WrappedKeyModel
        {
            Alg = "AES-256-GCM",
            Kid = keyId,
            Iv = Convert.ToBase64String(wrapIv),
            Tag = Convert.ToBase64String(wrapTag),
            CipherText = Convert.ToBase64String(wrappedDekCiphertext)
        };

        var wrappedKeyJson = JsonSerializer.Serialize(wrappedKeyPayload);

        return Task.FromResult(new ClinicEncryptedPayload(
            Ciphertext: ciphertext,
            IvBase64: Convert.ToBase64String(fileIv),
            TagBase64: Convert.ToBase64String(fileTag),
            EncryptedHash: encryptedHash,
            EncryptedSizeBytes: ciphertext.Length,
            WrappedKeyJson: wrappedKeyJson,
            EncryptionAlgorithm: "AES-256-GCM"
        ));
    }

    public Task<byte[]> DecryptAsync(
        byte[] ciphertext,
        string ivBase64,
        string tagBase64,
        string wrappedKeyJson,
        string tenantId,
        Guid clinicId,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(ciphertext);
        ArgumentException.ThrowIfNullOrWhiteSpace(ivBase64);
        ArgumentException.ThrowIfNullOrWhiteSpace(tagBase64);
        ArgumentException.ThrowIfNullOrWhiteSpace(wrappedKeyJson);
        ArgumentException.ThrowIfNullOrWhiteSpace(tenantId);

        var fileIv = Convert.FromBase64String(ivBase64);
        var fileTag = Convert.FromBase64String(tagBase64);

        // 1. Unwrap DEK using Clinic Master Key (CMK)
        var dek = UnwrapDek(wrappedKeyJson, tenantId, clinicId);

        try
        {
            // 2. Decrypt ciphertext with DEK using AES-256-GCM
            var plaintext = new byte[ciphertext.Length];
            using (var aesGcmFile = new AesGcm(dek, 16))
            {
                aesGcmFile.Decrypt(fileIv, ciphertext, fileTag, plaintext);
            }

            return Task.FromResult(plaintext);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(dek);
        }
    }

    public async Task<MemoryStream> DecryptToStreamAsync(
        Stream encryptedStream,
        string ivBase64,
        string tagBase64,
        string wrappedKeyJson,
        string tenantId,
        Guid clinicId,
        CancellationToken cancellationToken = default)
    {
        using var memoryStream = new MemoryStream();
        await encryptedStream.CopyToAsync(memoryStream, cancellationToken);
        var plaintextBytes = await DecryptAsync(memoryStream.ToArray(), ivBase64, tagBase64, wrappedKeyJson, tenantId, clinicId, cancellationToken);
        return new MemoryStream(plaintextBytes);
    }

    private byte[] UnwrapDek(string wrappedKeyJson, string tenantId, Guid clinicId)
    {
        var model = JsonSerializer.Deserialize<WrappedKeyModel>(wrappedKeyJson)
            ?? throw new CryptographicException("Invalid wrapped key format.");

        var wrapIv = Convert.FromBase64String(model.Iv);
        var wrapTag = Convert.FromBase64String(model.Tag);
        var wrappedDekCiphertext = Convert.FromBase64String(model.CipherText);

        CryptographicException? failure = null;
        foreach (var masterSecret in _keyRing.CandidatesFor(model.Kid))
        {
            var cmk = DeriveClinicMasterKey(masterSecret, tenantId, clinicId);
            var dek = new byte[wrappedDekCiphertext.Length];

            try
            {
                using var aesGcmCmk = new AesGcm(cmk, 16);
                aesGcmCmk.Decrypt(wrapIv, wrappedDekCiphertext, wrapTag, dek);
                return dek;
            }
            catch (CryptographicException ex)
            {
                failure = ex;
            }
            finally
            {
                CryptographicOperations.ZeroMemory(cmk);
            }
        }

        throw new CryptographicException("Failed to decrypt DEK. Ensure tenant/clinic key matches and the secret that wrapped it is still configured (ClinicEncryption:MasterSecret or ClinicEncryption:PreviousMasterSecrets).", failure);
    }

    private static byte[] DeriveClinicMasterKey(byte[] masterSecret, string tenantId, Guid clinicId)
    {
        var salt = Encoding.UTF8.GetBytes(tenantId.Trim().ToLowerInvariant());
        var info = Encoding.UTF8.GetBytes($"{clinicId:N}:ClinicEz:ClinicEncryption:v1");

        // HKDF-SHA256 (RFC 5869)
        return HKDF.DeriveKey(HashAlgorithmName.SHA256, masterSecret, 32, salt, info);
    }

    private sealed class WrappedKeyModel
    {
        public string Alg { get; set; } = "AES-256-GCM";
        public string? Kid { get; set; }
        public string Iv { get; set; } = string.Empty;
        public string Tag { get; set; } = string.Empty;
        public string CipherText { get; set; } = string.Empty;
    }
}
