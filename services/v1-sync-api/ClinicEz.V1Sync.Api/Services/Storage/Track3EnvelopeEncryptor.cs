using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;

namespace ClinicEz.V1Sync.Api.Services.Storage;

public sealed record Track3EncryptedPayload(
    byte[] Ciphertext,
    string IvBase64,
    string TagBase64,
    string EncryptedHash,
    long EncryptedSizeBytes,
    string WrappedKeyJson,
    string EncryptionAlgorithm,
    string EncryptionKeyId
);

/// <summary>
/// Envelope encryptor matching ClinicEz.Clinic.Infrastructure.Services.Storage.ClinicEncryptionService (CMK)
/// and ClinicEz.Patient.Infrastructure.Services.Encryption.PatientEncryptionService (PMK) byte-for-byte.
/// Never throws at startup when secrets are absent; reports readiness via IsClinicConfigured / IsPatientConfigured.
/// </summary>
public sealed class Track3EnvelopeEncryptor
{
    public const int MinSecretLength = 32;
    public const string ClinicMasterSecretKey = "ClinicEncryption:MasterSecret";
    public const string ClinicPreviousMasterSecretsKey = "ClinicEncryption:PreviousMasterSecrets";
    public const string PatientMasterSecretKey = "PatientEncryption:MasterSecret";
    public const string PatientPreviousMasterSecretsKey = "PatientEncryption:PreviousMasterSecrets";

    private readonly KeyRingState _clinicRing;
    private readonly KeyRingState _patientRing;

    public Track3EnvelopeEncryptor(IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        _clinicRing = BuildKeyRing(configuration, ClinicMasterSecretKey, ClinicPreviousMasterSecretsKey);
        _patientRing = BuildKeyRing(configuration, PatientMasterSecretKey, PatientPreviousMasterSecretsKey);
    }

    public bool IsClinicConfigured => _clinicRing.IsConfigured;
    public bool IsPatientConfigured => _patientRing.IsConfigured;

    public Track3EncryptedPayload EncryptForClinic(byte[] plaintextBytes, string tenantId, Guid clinicId)
    {
        ArgumentNullException.ThrowIfNull(plaintextBytes);
        ArgumentException.ThrowIfNullOrWhiteSpace(tenantId);

        var ring = RequireRing(_clinicRing, ClinicMasterSecretKey, ClinicPreviousMasterSecretsKey);
        var (keyId, masterSecret) = ring.Current;
        var cmk = DeriveClinicMasterKey(masterSecret, tenantId, clinicId);
        try
        {
            return EncryptWithKek(plaintextBytes, cmk, keyId, "cmk-v1");
        }
        finally
        {
            CryptographicOperations.ZeroMemory(cmk);
        }
    }

    public byte[] DecryptForClinic(
        byte[] ciphertext,
        string ivBase64,
        string tagBase64,
        string wrappedKeyJson,
        string tenantId,
        Guid clinicId)
    {
        ArgumentNullException.ThrowIfNull(ciphertext);
        ArgumentException.ThrowIfNullOrWhiteSpace(ivBase64);
        ArgumentException.ThrowIfNullOrWhiteSpace(tagBase64);
        ArgumentException.ThrowIfNullOrWhiteSpace(wrappedKeyJson);
        ArgumentException.ThrowIfNullOrWhiteSpace(tenantId);

        var ring = RequireRing(_clinicRing, ClinicMasterSecretKey, ClinicPreviousMasterSecretsKey);
        var (fileIv, fileTag) = DecodeFileIvAndTag(ivBase64, tagBase64);

        var dek = UnwrapDek(
            wrappedKeyJson,
            ring,
            secret => DeriveClinicMasterKey(secret, tenantId, clinicId),
            "Failed to decrypt DEK. Ensure tenant/clinic key matches and the secret that wrapped it is still configured (ClinicEncryption:MasterSecret or ClinicEncryption:PreviousMasterSecrets)."
        );

        try
        {
            var plaintext = new byte[ciphertext.Length];
            using var aesGcmFile = new AesGcm(dek, 16);
            aesGcmFile.Decrypt(fileIv, ciphertext, fileTag, plaintext);
            return plaintext;
        }
        catch (ArgumentException ex)
        {
            throw new CryptographicException("Invalid file encryption nonce, tag, or key parameters.", ex);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(dek);
        }
    }

    public Track3EncryptedPayload EncryptForPatient(byte[] plaintextBytes, Guid patientId)
    {
        ArgumentNullException.ThrowIfNull(plaintextBytes);
        if (patientId == Guid.Empty) throw new ArgumentException("Patient ID cannot be empty.", nameof(patientId));

        var ring = RequireRing(_patientRing, PatientMasterSecretKey, PatientPreviousMasterSecretsKey);
        var (keyId, masterSecret) = ring.Current;
        var pmk = DerivePatientMasterKey(masterSecret, patientId);
        try
        {
            return EncryptWithKek(plaintextBytes, pmk, keyId, "pmk-v1");
        }
        finally
        {
            CryptographicOperations.ZeroMemory(pmk);
        }
    }

    public byte[] DecryptForPatient(
        byte[] ciphertext,
        string ivBase64,
        string tagBase64,
        string wrappedKeyJson,
        Guid patientId)
    {
        ArgumentNullException.ThrowIfNull(ciphertext);
        ArgumentException.ThrowIfNullOrWhiteSpace(ivBase64);
        ArgumentException.ThrowIfNullOrWhiteSpace(tagBase64);
        ArgumentException.ThrowIfNullOrWhiteSpace(wrappedKeyJson);
        if (patientId == Guid.Empty) throw new ArgumentException("Patient ID cannot be empty.", nameof(patientId));

        var ring = RequireRing(_patientRing, PatientMasterSecretKey, PatientPreviousMasterSecretsKey);
        var (fileIv, fileTag) = DecodeFileIvAndTag(ivBase64, tagBase64);

        var dek = UnwrapDek(
            wrappedKeyJson,
            ring,
            secret => DerivePatientMasterKey(secret, patientId),
            "Failed to decrypt DEK. Ensure patient key matches and the master secret that wrapped it is configured."
        );

        try
        {
            var plaintext = new byte[ciphertext.Length];
            using var aesGcmFile = new AesGcm(dek, 16);
            aesGcmFile.Decrypt(fileIv, ciphertext, fileTag, plaintext);
            return plaintext;
        }
        catch (ArgumentException ex)
        {
            throw new CryptographicException("Invalid file encryption nonce, tag, or key parameters.", ex);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(dek);
        }
    }

    private static Track3EncryptedPayload EncryptWithKek(
        byte[] plaintextBytes,
        byte[] kek,
        string keyId,
        string keyScheme)
    {
        var dek = RandomNumberGenerator.GetBytes(32);
        var fileIv = RandomNumberGenerator.GetBytes(12);
        var ciphertext = new byte[plaintextBytes.Length];
        var fileTag = new byte[16];

        var wrapIv = RandomNumberGenerator.GetBytes(12);
        var wrappedDekCiphertext = new byte[dek.Length];
        var wrapTag = new byte[16];

        try
        {
            using (var aesGcmFile = new AesGcm(dek, 16))
            {
                aesGcmFile.Encrypt(fileIv, plaintextBytes, ciphertext, fileTag);
            }

            using (var aesGcmKek = new AesGcm(kek, 16))
            {
                aesGcmKek.Encrypt(wrapIv, dek, wrappedDekCiphertext, wrapTag);
            }
        }
        finally
        {
            CryptographicOperations.ZeroMemory(dek);
        }

        var encryptedHash = Convert.ToHexString(SHA256.HashData(ciphertext)).ToLowerInvariant();
        var wrappedKeyPayload = new WrappedKeyModel
        {
            Alg = "AES-256-GCM",
            Kid = keyId,
            Iv = Convert.ToBase64String(wrapIv),
            Tag = Convert.ToBase64String(wrapTag),
            CipherText = Convert.ToBase64String(wrappedDekCiphertext)
        };

        // MUST use default JsonSerializerOptions (PascalCase) to match ClinicEncryptionService & PatientEncryptionService
        var wrappedKeyJson = JsonSerializer.Serialize(wrappedKeyPayload);

        return new Track3EncryptedPayload(
            Ciphertext: ciphertext,
            IvBase64: Convert.ToBase64String(fileIv),
            TagBase64: Convert.ToBase64String(fileTag),
            EncryptedHash: encryptedHash,
            EncryptedSizeBytes: ciphertext.LongLength,
            WrappedKeyJson: wrappedKeyJson,
            EncryptionAlgorithm: "AES-256-GCM",
            EncryptionKeyId: keyScheme
        );
    }

    private static (byte[] Iv, byte[] Tag) DecodeFileIvAndTag(string ivBase64, string tagBase64)
    {
        byte[] fileIv;
        byte[] fileTag;
        try
        {
            fileIv = Convert.FromBase64String(ivBase64);
            fileTag = Convert.FromBase64String(tagBase64);
        }
        catch (FormatException ex)
        {
            throw new CryptographicException("Invalid Base64 in encryption IV or tag.", ex);
        }

        if (fileIv.Length != 12 || fileTag.Length != 16)
        {
            throw new CryptographicException("Invalid encryption IV or tag length.");
        }

        return (fileIv, fileTag);
    }

    private static byte[] UnwrapDek(
        string wrappedKeyJson,
        KeyRingState ring,
        Func<byte[], byte[]> deriveKek,
        string failureMessage)
    {
        WrappedKeyModel model;
        try
        {
            model = JsonSerializer.Deserialize<WrappedKeyModel>(wrappedKeyJson)
                ?? throw new CryptographicException("Invalid wrapped key format.");
        }
        catch (JsonException ex)
        {
            throw new CryptographicException("Invalid wrapped key JSON.", ex);
        }

        if (!string.Equals(model.Alg, "AES-256-GCM", StringComparison.Ordinal))
        {
            throw new CryptographicException($"Unsupported wrapped key algorithm '{model.Alg}'.");
        }

        if (string.IsNullOrWhiteSpace(model.Iv) ||
            string.IsNullOrWhiteSpace(model.Tag) ||
            string.IsNullOrWhiteSpace(model.CipherText))
        {
            throw new CryptographicException("Wrapped key is missing required fields.");
        }

        byte[] wrapIv;
        byte[] wrapTag;
        byte[] wrappedDekCiphertext;
        try
        {
            wrapIv = Convert.FromBase64String(model.Iv);
            wrapTag = Convert.FromBase64String(model.Tag);
            wrappedDekCiphertext = Convert.FromBase64String(model.CipherText);
        }
        catch (FormatException ex)
        {
            throw new CryptographicException("Invalid Base64 in wrapped key.", ex);
        }

        if (wrapIv.Length != 12 || wrapTag.Length != 16 || wrappedDekCiphertext.Length is not (16 or 24 or 32))
        {
            throw new CryptographicException("Invalid wrapped key nonce, tag, or ciphertext length.");
        }

        CryptographicException? failure = null;
        foreach (var masterSecret in ring.CandidatesFor(model.Kid))
        {
            var kek = deriveKek(masterSecret);
            var dek = new byte[wrappedDekCiphertext.Length];

            try
            {
                using var aesGcmKek = new AesGcm(kek, 16);
                aesGcmKek.Decrypt(wrapIv, wrappedDekCiphertext, wrapTag, dek);
                return dek;
            }
            catch (CryptographicException ex)
            {
                CryptographicOperations.ZeroMemory(dek);
                failure = ex;
            }
            catch (ArgumentException ex)
            {
                CryptographicOperations.ZeroMemory(dek);
                throw new CryptographicException("Invalid wrapped key parameters.", ex);
            }
            finally
            {
                CryptographicOperations.ZeroMemory(kek);
            }
        }

        throw new CryptographicException(failureMessage, failure);
    }

    private static byte[] DeriveClinicMasterKey(byte[] masterSecret, string tenantId, Guid clinicId)
    {
        var salt = Encoding.UTF8.GetBytes(tenantId.Trim().ToLowerInvariant());
        var info = Encoding.UTF8.GetBytes($"{clinicId:N}:ClinicEz:ClinicEncryption:v1");
        return HKDF.DeriveKey(HashAlgorithmName.SHA256, masterSecret, 32, salt, info);
    }

    private static byte[] DerivePatientMasterKey(byte[] masterSecret, Guid patientId)
    {
        var salt = Encoding.UTF8.GetBytes(patientId.ToString("D").ToLowerInvariant());
        var info = Encoding.UTF8.GetBytes("clinicez-pmk-v1");
        return HKDF.DeriveKey(HashAlgorithmName.SHA256, masterSecret, 32, salt, info);
    }

    private static KeyRingState BuildKeyRing(IConfiguration configuration, string masterKey, string previousKey)
    {
        var current = configuration[masterKey];
        if (string.IsNullOrWhiteSpace(current))
        {
            return new KeyRingState(false, $"'{masterKey}' is not configured.", Array.Empty<KeyEntry>());
        }

        var secrets = new List<string> { current };
        secrets.AddRange(configuration.GetSection(previousKey).GetChildren()
            .Select(c => c.Value)
            .Where(v => !string.IsNullOrWhiteSpace(v))!);

        if (secrets.Any(s => s.Length < MinSecretLength))
        {
            return new KeyRingState(
                false,
                $"Every encryption secret ('{masterKey}' and '{previousKey}') must be at least {MinSecretLength} characters.",
                Array.Empty<KeyEntry>());
        }

        var entries = secrets
            .Distinct(StringComparer.Ordinal)
            .Select(s =>
            {
                var bytes = Encoding.UTF8.GetBytes(s);
                var kid = Convert.ToHexString(SHA256.HashData(bytes), 0, 4).ToLowerInvariant();
                return new KeyEntry(kid, bytes);
            })
            .ToList();

        return new KeyRingState(true, null, entries);
    }

    private static KeyRingState RequireRing(KeyRingState state, string masterKey, string previousKey)
    {
        if (!state.IsConfigured)
        {
            throw new InvalidOperationException(
                state.ConfigError ?? $"Encryption key ring ('{masterKey}' / '{previousKey}') is not configured.");
        }
        return state;
    }

    private sealed record KeyEntry(string KeyId, byte[] Secret);

    private sealed class KeyRingState
    {
        public KeyRingState(bool isConfigured, string? configError, IReadOnlyList<KeyEntry> entries)
        {
            IsConfigured = isConfigured;
            ConfigError = configError;
            Entries = entries;
        }

        public bool IsConfigured { get; }
        public string? ConfigError { get; }
        public IReadOnlyList<KeyEntry> Entries { get; }
        public (string KeyId, byte[] Secret) Current => (Entries[0].KeyId, Entries[0].Secret);

        public IEnumerable<byte[]> CandidatesFor(string? keyId) =>
            string.IsNullOrEmpty(keyId)
                ? Entries.Select(e => e.Secret)
                : Entries.Where(e => e.KeyId == keyId).Select(e => e.Secret);
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
