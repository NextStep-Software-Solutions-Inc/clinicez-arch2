using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Domain.Models;

namespace ClinicEz.PhilHealthProxy.Infrastructure.Services;

/// <summary>
/// Implements PhilHealth PKA v1.1 Annex D payload cryptography:
/// - AES-256-CBC with PKCS7 padding
/// - SHA-256 key derivation (32 bytes) from HCI cipher key
/// - 16-byte cryptographically secure random IV
/// - Pre-encryption SHA-256 raw XML hash integrity verification
/// </summary>
public sealed class PhilHealthPayloadEncryptor : IPhilHealthPayloadEncryptor
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = null, // Use exact JsonPropertyName attributes
        WriteIndented = false
    };

    public string EncryptPayload(string rawXml, string cipherKey)
    {
        var envelope = Encrypt(rawXml, cipherKey);
        return JsonSerializer.Serialize(envelope, JsonOptions);
    }

    public PhilHealthEncryptedPayload Encrypt(string rawXml, string cipherKey)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(rawXml);
        ArgumentException.ThrowIfNullOrWhiteSpace(cipherKey);

        byte[] rawXmlBytes = Encoding.UTF8.GetBytes(rawXml);
        string hash = Convert.ToHexString(SHA256.HashData(rawXmlBytes)).ToLowerInvariant();

        byte[] key = DeriveKey(cipherKey);
        byte[] iv = RandomNumberGenerator.GetBytes(16);

        byte[] cipherTextBytes;
        using (var aes = Aes.Create())
        {
            aes.KeySize = 256;
            aes.Mode = CipherMode.CBC;
            aes.Padding = PaddingMode.PKCS7;
            aes.Key = key;
            aes.IV = iv;

            using var encryptor = aes.CreateEncryptor();
            cipherTextBytes = encryptor.TransformFinalBlock(rawXmlBytes, 0, rawXmlBytes.Length);
        }

        return new PhilHealthEncryptedPayload
        {
            DocMimeType = "<text/xml>",
            Hash = hash,
            Key1 = string.Empty,
            Key2 = string.Empty,
            Iv = Convert.ToBase64String(iv),
            Doc = Convert.ToBase64String(cipherTextBytes)
        };
    }

    public string DecryptPayload(string jsonEnvelope, string cipherKey)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(jsonEnvelope);
        ArgumentException.ThrowIfNullOrWhiteSpace(cipherKey);

        var envelope = JsonSerializer.Deserialize<PhilHealthEncryptedPayload>(jsonEnvelope, JsonOptions)
            ?? throw new CryptographicException("Failed to deserialize PhilHealth encrypted payload envelope JSON.");

        return Decrypt(envelope, cipherKey);
    }

    public string Decrypt(PhilHealthEncryptedPayload envelope, string cipherKey)
    {
        ArgumentNullException.ThrowIfNull(envelope);
        ArgumentException.ThrowIfNullOrWhiteSpace(cipherKey);
        ArgumentException.ThrowIfNullOrWhiteSpace(envelope.Iv, nameof(envelope.Iv));
        ArgumentException.ThrowIfNullOrWhiteSpace(envelope.Doc, nameof(envelope.Doc));

        byte[] key = DeriveKey(cipherKey);
        byte[] iv = Convert.FromBase64String(envelope.Iv);
        byte[] cipherTextBytes = Convert.FromBase64String(envelope.Doc);

        byte[] decryptedBytes;
        using (var aes = Aes.Create())
        {
            aes.KeySize = 256;
            aes.Mode = CipherMode.CBC;
            aes.Padding = PaddingMode.PKCS7;
            aes.Key = key;
            aes.IV = iv;

            using var decryptor = aes.CreateDecryptor();
            decryptedBytes = decryptor.TransformFinalBlock(cipherTextBytes, 0, cipherTextBytes.Length);
        }

        string rawXml = Encoding.UTF8.GetString(decryptedBytes);

        // Verify SHA-256 payload integrity if hash was supplied
        if (!string.IsNullOrWhiteSpace(envelope.Hash))
        {
            string computedHash = Convert.ToHexString(SHA256.HashData(decryptedBytes)).ToLowerInvariant();
            if (!string.Equals(computedHash, envelope.Hash.Trim(), StringComparison.OrdinalIgnoreCase))
            {
                throw new CryptographicException(
                    $"Payload integrity check failed. Expected hash: '{envelope.Hash}', computed hash: '{computedHash}'.");
            }
        }

        return rawXml;
    }

    private static byte[] DeriveKey(string cipherKey)
    {
        byte[] hash = SHA256.HashData(Encoding.UTF8.GetBytes(cipherKey));
        if (hash.Length == 32)
        {
            return hash;
        }

        byte[] key = new byte[32];
        Array.Copy(hash, key, Math.Min(hash.Length, 32));
        return key;
    }
}
