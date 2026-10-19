using ClinicEz.PhilHealthProxy.Domain.Models;

namespace ClinicEz.PhilHealthProxy.Domain.Interfaces;

/// <summary>
/// Provides payload encryption and decryption per PhilHealth PKA v1.1 Annex D:
/// - AES-256-CBC algorithm
/// - SHA-256 key derivation from tenant cipher key (first 32 bytes)
/// - 16-byte random Initialization Vector (Base64-encoded)
/// - SHA-256 integrity hash of unencrypted raw XML
/// - JSON envelope packaging
/// </summary>
public interface IPhilHealthPayloadEncryptor
{
    /// <summary>
    /// Encrypts raw XML text using the tenant's cipher key and packages it into the PhilHealth JSON envelope string.
    /// </summary>
    string EncryptPayload(string rawXml, string cipherKey);

    /// <summary>
    /// Encrypts raw XML text and returns the strongly typed payload envelope.
    /// </summary>
    PhilHealthEncryptedPayload Encrypt(string rawXml, string cipherKey);

    /// <summary>
    /// Decrypts a PhilHealth JSON envelope string using the tenant's cipher key, verifies the SHA-256 hash, and returns the raw XML string.
    /// </summary>
    string DecryptPayload(string jsonEnvelope, string cipherKey);

    /// <summary>
    /// Decrypts a strongly typed PhilHealth payload envelope using the tenant's cipher key, verifies the SHA-256 hash, and returns the raw XML string.
    /// </summary>
    string Decrypt(PhilHealthEncryptedPayload envelope, string cipherKey);
}
