using ClinicEz.PhilHealthProxy.Domain.Models;

namespace ClinicEz.PhilHealthProxy.Domain.Interfaces;

/// <summary>
/// Implements PhilHealth PCAPI v2.0 Annex C payload cryptography:
/// - AES-256-CBC algorithm with PaddingMode.None
/// - Manual 0x00 null-byte padding (0 bytes added when plainBytes.Length % 16 == 0)
/// - SHA-256 key derivation (32 bytes) from facility cipher key
/// - 16-byte cryptographically secure random IV (Base64-encoded)
/// - Lowercase hexadecimal SHA-256 integrity hash of plain data computed before padding
/// - Envelope packaging with docMimeType "application/json" or "application/pdf"
/// </summary>
public interface IPhilHealthPayloadEncryptor
{
    PhilHealthEncryptedPayload EncryptJson(string plainJson, string cipherKey);
    string EncryptJsonToString(string plainJson, string cipherKey);
    PhilHealthEncryptedPayload EncryptBytes(byte[] plainBytes, string mimeType, string cipherKey);

    string DecryptJson(PhilHealthEncryptedPayload envelope, string cipherKey);
    string DecryptJsonFromString(string jsonEnvelope, string cipherKey);
    byte[] DecryptPdf(PhilHealthEncryptedPayload envelope, string cipherKey);
    byte[] DecryptPdfFromString(string jsonEnvelope, string cipherKey);
    byte[] DecryptBytes(PhilHealthEncryptedPayload envelope, string cipherKey);

    // Compatibility aliases
    string EncryptPayload(string rawText, string cipherKey) => EncryptJsonToString(rawText, cipherKey);
    PhilHealthEncryptedPayload Encrypt(string rawText, string cipherKey) => EncryptJson(rawText, cipherKey);
    string DecryptPayload(string jsonEnvelope, string cipherKey) => DecryptJsonFromString(jsonEnvelope, cipherKey);
    string Decrypt(PhilHealthEncryptedPayload envelope, string cipherKey) => DecryptJson(envelope, cipherKey);
}
