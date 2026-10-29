using System;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Domain.Models;

namespace ClinicEz.PhilHealthProxy.Infrastructure.Services;

/// <summary>
/// Implements PhilHealth PCAPI v2.0 Annex C payload cryptography:
/// - AES-256-CBC algorithm with PaddingMode.None
/// - Manual 0x00 null-byte padding (0 bytes added when plainBytes.Length % 16 == 0)
/// - SHA-256 key derivation (32 bytes) from facility cipher key
/// - 16-byte cryptographically secure random IV (Base64-encoded)
/// - Lowercase hexadecimal SHA-256 integrity hash of plain data computed before padding
/// - Envelope packaging with docMimeType "application/json" or "application/pdf"
/// </summary>
public sealed class PhilHealthPayloadEncryptor : IPhilHealthPayloadEncryptor
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = null,
        WriteIndented = false
    };

    public PhilHealthEncryptedPayload EncryptJson(string plainJson, string cipherKey)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(plainJson);
        byte[] bytes = Encoding.UTF8.GetBytes(plainJson);
        return EncryptBytes(bytes, "application/json", cipherKey);
    }

    public string EncryptJsonToString(string plainJson, string cipherKey)
    {
        var envelope = EncryptJson(plainJson, cipherKey);
        return JsonSerializer.Serialize(envelope, JsonOptions);
    }

    public PhilHealthEncryptedPayload EncryptBytes(byte[] plainBytes, string mimeType, string cipherKey)
    {
        ArgumentNullException.ThrowIfNull(plainBytes);
        ArgumentException.ThrowIfNullOrWhiteSpace(cipherKey);
        ArgumentException.ThrowIfNullOrWhiteSpace(mimeType);

        // Step 1: Compute SHA-256 of plain bytes before padding
        string hash = Convert.ToHexString(SHA256.HashData(plainBytes)).ToLowerInvariant();

        // Step 2: Key derivation (32 bytes)
        byte[] key = SHA256.HashData(Encoding.UTF8.GetBytes(cipherKey));

        // Step 3: 16-byte random IV
        byte[] iv = RandomNumberGenerator.GetBytes(16);

        // Step 4: Manual null-byte (0x00) padding to a multiple of 16 (0 bytes if already multiple)
        int remainder = plainBytes.Length % 16;
        int padLength = remainder == 0 ? 0 : 16 - remainder;
        byte[] paddedBytes = new byte[plainBytes.Length + padLength];
        Buffer.BlockCopy(plainBytes, 0, paddedBytes, 0, plainBytes.Length);

        // Step 5: AES-256-CBC encryption with PaddingMode.None
        byte[] cipherTextBytes;
        using (var aes = Aes.Create())
        {
            aes.KeySize = 256;
            aes.Mode = CipherMode.CBC;
            aes.Padding = PaddingMode.None;
            aes.Key = key;
            aes.IV = iv;

            using var encryptor = aes.CreateEncryptor();
            cipherTextBytes = encryptor.TransformFinalBlock(paddedBytes, 0, paddedBytes.Length);
        }

        return new PhilHealthEncryptedPayload
        {
            DocMimeType = mimeType,
            Hash = hash,
            Key1 = string.Empty,
            Key2 = string.Empty,
            Iv = Convert.ToBase64String(iv),
            Doc = Convert.ToBase64String(cipherTextBytes)
        };
    }

    public string DecryptJsonFromString(string jsonEnvelope, string cipherKey)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(jsonEnvelope);
        var envelope = JsonSerializer.Deserialize<PhilHealthEncryptedPayload>(jsonEnvelope, JsonOptions)
            ?? throw new CryptographicException("Failed to deserialize PhilHealth encrypted payload envelope JSON.");
        return DecryptJson(envelope, cipherKey);
    }

    public string DecryptJson(PhilHealthEncryptedPayload envelope, string cipherKey)
    {
        byte[] unpadded = DecryptBytes(envelope, cipherKey);
        return Encoding.UTF8.GetString(unpadded);
    }

    public byte[] DecryptPdfFromString(string jsonEnvelope, string cipherKey)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(jsonEnvelope);
        var envelope = JsonSerializer.Deserialize<PhilHealthEncryptedPayload>(jsonEnvelope, JsonOptions)
            ?? throw new CryptographicException("Failed to deserialize PhilHealth encrypted payload envelope JSON.");
        return DecryptPdf(envelope, cipherKey);
    }

    public byte[] DecryptPdf(PhilHealthEncryptedPayload envelope, string cipherKey)
    {
        byte[] unpadded = DecryptBytes(envelope, cipherKey);

        // Assert PDF signature marker %%EOF is present in decrypted content
        string trailer = Encoding.ASCII.GetString(unpadded[Math.Max(0, unpadded.Length - 1024)..]);
        if (!trailer.Contains("%%EOF"))
        {
            throw new CryptographicException("Decrypted PDF payload is missing mandatory %%EOF marker.");
        }

        return unpadded;
    }

    public byte[] DecryptBytes(PhilHealthEncryptedPayload envelope, string cipherKey)
    {
        ArgumentNullException.ThrowIfNull(envelope);
        ArgumentException.ThrowIfNullOrWhiteSpace(cipherKey);
        ArgumentException.ThrowIfNullOrWhiteSpace(envelope.Iv, nameof(envelope.Iv));
        ArgumentException.ThrowIfNullOrWhiteSpace(envelope.Doc, nameof(envelope.Doc));

        byte[] key = SHA256.HashData(Encoding.UTF8.GetBytes(cipherKey));
        byte[] iv = Convert.FromBase64String(envelope.Iv);
        byte[] cipherTextBytes = Convert.FromBase64String(envelope.Doc);

        byte[] decryptedPadded;
        using (var aes = Aes.Create())
        {
            aes.KeySize = 256;
            aes.Mode = CipherMode.CBC;
            aes.Padding = PaddingMode.None;
            aes.Key = key;
            aes.IV = iv;

            using var decryptor = aes.CreateDecryptor();
            decryptedPadded = decryptor.TransformFinalBlock(cipherTextBytes, 0, cipherTextBytes.Length);
        }

        // Remove trailing 0x00 null bytes
        int end = decryptedPadded.Length;
        while (end > 0 && decryptedPadded[end - 1] == 0x00)
        {
            end--;
        }
        byte[] unpaddedBytes = decryptedPadded[..end];

        // Verify SHA-256 payload integrity
        if (!string.IsNullOrWhiteSpace(envelope.Hash))
        {
            string computedHash = Convert.ToHexString(SHA256.HashData(unpaddedBytes)).ToLowerInvariant();
            if (!string.Equals(computedHash, envelope.Hash.Trim(), StringComparison.OrdinalIgnoreCase))
            {
                throw new CryptographicException(
                    $"Payload integrity check failed. Expected hash: '{envelope.Hash}', computed hash: '{computedHash}'.");
            }
        }

        return unpaddedBytes;
    }

    public string EncryptPayload(string rawText, string cipherKey) => EncryptJsonToString(rawText, cipherKey);
    public PhilHealthEncryptedPayload Encrypt(string rawText, string cipherKey) => EncryptJson(rawText, cipherKey);
    public string DecryptPayload(string jsonEnvelope, string cipherKey) => DecryptJsonFromString(jsonEnvelope, cipherKey);
    public string Decrypt(PhilHealthEncryptedPayload envelope, string cipherKey) => DecryptJson(envelope, cipherKey);
}
