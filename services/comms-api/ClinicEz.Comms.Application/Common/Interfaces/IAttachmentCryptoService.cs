using System;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Comms.Application.Common.Interfaces;

public sealed record AttachmentCryptoMetadata(
    string Algorithm,
    string KeyId,
    string IvBase64,
    string TagBase64,
    string WrappedKeyJson);

public sealed record EncryptedAttachmentResult(
    byte[] Ciphertext,
    AttachmentCryptoMetadata Metadata,
    string PlainSha256Checksum);

public interface IAttachmentCryptoService
{
    /// <summary>Encrypts plaintext attachment with the local cell master key ring.</summary>
    Task<EncryptedAttachmentResult> EncryptAsync(
        byte[] plaintext,
        string tenantId,
        string facilityId,
        CancellationToken ct = default);

    /// <summary>Decrypts at-rest ciphertext using local cell key material.</summary>
    Task<byte[]> DecryptAsync(
        byte[] ciphertext,
        AttachmentCryptoMetadata metadata,
        string tenantId,
        string facilityId,
        CancellationToken ct = default);

    /// <summary>Re-encrypts a decrypted plaintext with the bundle session key for export.</summary>
    Task<byte[]> EncryptForBundleAsync(
        byte[] plaintext,
        byte[] bundleSessionKey,
        out string bundleIvBase64,
        out string bundleTagBase64);

    /// <summary>Decrypts a bundle attachment payload using the bundle session key on import.</summary>
    Task<byte[]> DecryptFromBundleAsync(
        byte[] bundleCiphertext,
        byte[] bundleSessionKey,
        string bundleIvBase64,
        string bundleTagBase64);
}
