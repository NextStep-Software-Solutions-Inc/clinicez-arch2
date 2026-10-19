using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Clinic.Application.Common.Interfaces;

public sealed record ClinicEncryptedPayload(
    byte[] Ciphertext,
    string IvBase64,
    string TagBase64,
    string EncryptedHash,
    long EncryptedSizeBytes,
    string WrappedKeyJson,
    string EncryptionAlgorithm = "AES-256-GCM"
);

public interface IClinicEncryptionService
{
    /// <summary>
    /// Encrypts plaintext stream using a per-file DEK (AES-256-GCM), which is wrapped with the Clinic Master Key.
    /// </summary>
    Task<ClinicEncryptedPayload> EncryptAsync(
        Stream plaintextStream,
        string tenantId,
        Guid clinicId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Encrypts plaintext bytes using a per-file DEK (AES-256-GCM), which is wrapped with the Clinic Master Key.
    /// </summary>
    Task<ClinicEncryptedPayload> EncryptAsync(
        byte[] plaintextBytes,
        string tenantId,
        Guid clinicId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Decrypts ciphertext bytes using the wrapped DEK and Clinic Master Key, verifying the integrity tag and IV.
    /// </summary>
    Task<byte[]> DecryptAsync(
        byte[] ciphertext,
        string ivBase64,
        string tagBase64,
        string wrappedKeyJson,
        string tenantId,
        Guid clinicId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Decrypts an encrypted stream using the wrapped DEK and Clinic Master Key, returning a decrypted MemoryStream.
    /// </summary>
    Task<MemoryStream> DecryptToStreamAsync(
        Stream encryptedStream,
        string ivBase64,
        string tagBase64,
        string wrappedKeyJson,
        string tenantId,
        Guid clinicId,
        CancellationToken cancellationToken = default);
}
