using System.Security.Cryptography;
using System.Text;
using ClinicEz.Interop.Application;
using ClinicEz.Interop.Application.Abstractions;
using Microsoft.Extensions.Options;

namespace ClinicEz.Interop.Infrastructure.Security;

/// <summary>
/// Optional application-level encryption of stored envelopes (<c>Hub:PayloadEncryptionKey</c>, base64 of 32 bytes, AES-256-GCM).
/// Without a key envelopes are stored as plain JSON and rely on database/volume encryption; with a key, rows written before the key
/// was introduced still read fine. Stored form: <c>enc1:base64(nonce|tag|ciphertext)</c>.
/// </summary>
public sealed class EnvelopeProtector : IEnvelopeProtector
{
    private const string Prefix = "enc1:";
    private const int NonceBytes = 12;
    private const int TagBytes = 16;

    private readonly byte[]? _key;

    public EnvelopeProtector(IOptions<HubOptions> options)
    {
        var configured = options.Value.PayloadEncryptionKey;
        if (string.IsNullOrWhiteSpace(configured)) return;

        _key = Convert.FromBase64String(configured);
        if (_key.Length != 32) throw new InvalidOperationException("Hub:PayloadEncryptionKey must be the base64 encoding of exactly 32 bytes.");
    }

    public string Protect(string envelopeJson)
    {
        if (_key is null) return envelopeJson;

        var plain = Encoding.UTF8.GetBytes(envelopeJson);
        var nonce = RandomNumberGenerator.GetBytes(NonceBytes);
        var cipher = new byte[plain.Length];
        var tag = new byte[TagBytes];
        using var aes = new AesGcm(_key, TagBytes);
        aes.Encrypt(nonce, plain, cipher, tag);

        var blob = new byte[NonceBytes + TagBytes + cipher.Length];
        nonce.CopyTo(blob, 0);
        tag.CopyTo(blob, NonceBytes);
        cipher.CopyTo(blob, NonceBytes + TagBytes);
        return Prefix + Convert.ToBase64String(blob);
    }

    public string Unprotect(string stored)
    {
        if (!stored.StartsWith(Prefix, StringComparison.Ordinal)) return stored;
        if (_key is null) throw new InvalidOperationException("A stored envelope is encrypted but Hub:PayloadEncryptionKey is not configured.");

        var blob = Convert.FromBase64String(stored[Prefix.Length..]);
        var nonce = blob.AsSpan(0, NonceBytes);
        var tag = blob.AsSpan(NonceBytes, TagBytes);
        var cipher = blob.AsSpan(NonceBytes + TagBytes);
        var plain = new byte[cipher.Length];
        using var aes = new AesGcm(_key, TagBytes);
        aes.Decrypt(nonce, cipher, tag, plain);
        return Encoding.UTF8.GetString(plain);
    }
}
