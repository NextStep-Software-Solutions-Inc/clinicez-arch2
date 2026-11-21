using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Common.Interfaces;

namespace ClinicEz.Patient.Infrastructure.Services.Encryption;

public sealed class PatientEncryptionService : IPatientEncryptionService
{
    private readonly PatientEncryptionKeyRing _keyRing;

    public PatientEncryptionService(PatientEncryptionKeyRing keyRing)
    {
        _keyRing = keyRing ?? throw new ArgumentNullException(nameof(keyRing));
    }

    public async Task<PatientEncryptedPayload> EncryptAsync(
        Stream plaintextStream,
        Guid patientId,
        CancellationToken cancellationToken = default)
    {
        return await EncryptStreamAsync(patientId, plaintextStream, cancellationToken);
    }

    public Task<PatientEncryptedPayload> EncryptAsync(
        byte[] plaintextBytes,
        Guid patientId,
        CancellationToken cancellationToken = default)
    {
        return EncryptAsync(patientId, plaintextBytes, cancellationToken);
    }

    public async Task<PatientEncryptedPayload> EncryptStreamAsync(
        Guid patientId,
        Stream plaintextStream,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(plaintextStream);
        using var memoryStream = new MemoryStream();
        await plaintextStream.CopyToAsync(memoryStream, cancellationToken);
        return await EncryptAsync(patientId, memoryStream.ToArray(), cancellationToken);
    }

    public Task<PatientEncryptedPayload> EncryptAsync(
        Guid patientId,
        byte[] plaintextBytes,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(plaintextBytes);
        if (patientId == Guid.Empty) throw new ArgumentException("Patient ID cannot be empty.", nameof(patientId));

        // 1. Generate unique random 256-bit DEK
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

        // 5. Derive Patient Master Key (PMK) and wrap the DEK
        var (keyId, masterSecret) = _keyRing.Current;
        var pmk = DerivePatientMasterKey(masterSecret, patientId);
        var wrapIv = RandomNumberGenerator.GetBytes(12);
        var wrappedDekCiphertext = new byte[dek.Length];
        var wrapTag = new byte[16];

        try
        {
            using var aesGcmPmk = new AesGcm(pmk, 16);
            aesGcmPmk.Encrypt(wrapIv, dek, wrappedDekCiphertext, wrapTag);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(dek);
            CryptographicOperations.ZeroMemory(pmk);
        }

        var wrappedKeyPayload = new WrappedKeyModel
        {
            Alg = "AES-256-GCM",
            Kid = keyId,
            Iv = Convert.ToBase64String(wrapIv),
            Tag = Convert.ToBase64String(wrapTag),
            CipherText = Convert.ToBase64String(wrappedDekCiphertext)
        };

        var wrappedKeyJson = JsonSerializer.Serialize(wrappedKeyPayload);

        return Task.FromResult(new PatientEncryptedPayload(
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
        Guid patientId,
        CancellationToken cancellationToken = default)
    {
        return DecryptAsync(patientId, ciphertext, ivBase64, tagBase64, wrappedKeyJson, cancellationToken);
    }

    public Task<byte[]> DecryptAsync(
        Guid patientId,
        PatientEncryptedPayload payload,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(payload);
        return DecryptAsync(patientId, payload.Ciphertext, payload.IvBase64, payload.TagBase64, payload.WrappedKeyJson, cancellationToken);
    }

    public Task<byte[]> DecryptAsync(
        Guid patientId,
        byte[] ciphertext,
        string ivBase64,
        string tagBase64,
        string wrappedKeyJson,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(ciphertext);
        ArgumentException.ThrowIfNullOrWhiteSpace(ivBase64);
        ArgumentException.ThrowIfNullOrWhiteSpace(tagBase64);
        ArgumentException.ThrowIfNullOrWhiteSpace(wrappedKeyJson);
        if (patientId == Guid.Empty) throw new ArgumentException("Patient ID cannot be empty.", nameof(patientId));

        var fileIv = Convert.FromBase64String(ivBase64);
        var fileTag = Convert.FromBase64String(tagBase64);

        // 1. Unwrap DEK using Patient Master Key (PMK)
        var dek = UnwrapDek(wrappedKeyJson, patientId);

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
        Guid patientId,
        CancellationToken cancellationToken = default)
    {
        return await DecryptStreamAsync(patientId, encryptedStream, ivBase64, tagBase64, wrappedKeyJson, cancellationToken);
    }

    public async Task<MemoryStream> DecryptStreamAsync(
        Guid patientId,
        Stream encryptedStream,
        string ivBase64,
        string tagBase64,
        string wrappedKeyJson,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(encryptedStream);
        using var memoryStream = new MemoryStream();
        await encryptedStream.CopyToAsync(memoryStream, cancellationToken);
        var plaintextBytes = await DecryptAsync(patientId, memoryStream.ToArray(), ivBase64, tagBase64, wrappedKeyJson, cancellationToken);
        return new MemoryStream(plaintextBytes);
    }

    private byte[] UnwrapDek(string wrappedKeyJson, Guid patientId)
    {
        var model = JsonSerializer.Deserialize<WrappedKeyModel>(wrappedKeyJson)
            ?? throw new CryptographicException("Invalid wrapped key format.");

        var wrapIv = Convert.FromBase64String(model.Iv);
        var wrapTag = Convert.FromBase64String(model.Tag);
        var wrappedDekCiphertext = Convert.FromBase64String(model.CipherText);

        CryptographicException? failure = null;
        foreach (var masterSecret in _keyRing.CandidatesFor(model.Kid))
        {
            var pmk = DerivePatientMasterKey(masterSecret, patientId);
            var dek = new byte[wrappedDekCiphertext.Length];

            try
            {
                using var aesGcmPmk = new AesGcm(pmk, 16);
                aesGcmPmk.Decrypt(wrapIv, wrappedDekCiphertext, wrapTag, dek);
                return dek;
            }
            catch (CryptographicException ex)
            {
                failure = ex;
            }
            finally
            {
                CryptographicOperations.ZeroMemory(pmk);
            }
        }

        throw new CryptographicException("Failed to decrypt DEK. Ensure patient key matches and the master secret that wrapped it is configured.", failure);
    }

    private static byte[] DerivePatientMasterKey(byte[] masterSecret, Guid patientId)
    {
        var salt = Encoding.UTF8.GetBytes(patientId.ToString("D").ToLowerInvariant());
        var info = Encoding.UTF8.GetBytes("clinicez-pmk-v1");

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
