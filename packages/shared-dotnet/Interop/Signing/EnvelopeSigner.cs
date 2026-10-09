using System.Collections.Concurrent;
using System.Security.Cryptography;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Licensing;
using ClinicEz.Shared.Interop.Transport;
using ClinicEz.Shared.Security;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace ClinicEz.Shared.Interop;

/// <summary>
/// Signs the envelopes this service sends with its hub client's private key (<c>Messaging:SigningKey</c>, PEM or base64
/// of PEM). Disabled (envelopes pass through unsigned) when no key is configured, which the hub only tolerates in
/// Development.
/// </summary>
public sealed class EnvelopeSigner : IDisposable
{
    private readonly ECDsa? _key;
    private readonly string? _keyId;
    private readonly object _gate = new();

    public EnvelopeSigner(string? privateKey, string? keyId)
    {
        var pem = PemKey.Normalize(privateKey, "Messaging:SigningKey");
        if (pem is null) return;

        if (string.IsNullOrWhiteSpace(keyId)) throw new ArgumentException("A key id (the hub client id) is required to sign.", nameof(keyId));
        _key = PemKey.ImportEcdsa(pem, "Messaging:SigningKey");
        _keyId = keyId;
    }

    public bool IsEnabled => _key is not null;

    /// <summary>Returns the envelope with <see cref="InteropEnvelope.SignerKeyId"/> and <see cref="InteropEnvelope.Signature"/> set.</summary>
    public InteropEnvelope Sign(InteropEnvelope envelope)
    {
        if (_key is null) return envelope;

        var unsigned = envelope with { SignerKeyId = _keyId, Signature = null };
        string signature;
        lock (_gate) signature = EnvelopeSigning.Sign(unsigned, _key);
        return unsigned with { Signature = signature };
    }

    public void Dispose() => _key?.Dispose();
}

/// <summary>
/// Verifies the signature of every envelope this service receives against the public key the hub publishes for the signer
/// (<c>GET /v1/keys/{clientId}</c>, cached). On by default outside Development (<c>Messaging:VerifyInbound</c>).
/// Trust model: the hub vouches that a key belongs to a client, so tampering by anyone but the hub is detected; the hub
/// itself is still trusted (it could publish a different key).
/// </summary>
public sealed class EnvelopeVerifier
{
    private static readonly TimeSpan KnownKeyTtl = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan UnknownKeyTtl = TimeSpan.FromSeconds(30);

    private sealed record CachedKey(HubSignerKey? Key, DateTime ExpiresUtc);

    private readonly ConcurrentDictionary<string, CachedKey> _cache = new(StringComparer.Ordinal);

    public EnvelopeVerifier(IOptions<InteropOptions> options, IHostEnvironment? environment = null)
    {
        var o = options.Value;
        Enabled = !o.IsInProcess && (o.VerifyInbound ?? !LicenseKeyMaterial.IsDevelopment(environment));
    }

    public bool Enabled { get; }

    /// <summary>Null when the envelope is acceptable (or verification is off); otherwise why it is not.</summary>
    public async Task<string?> VerifyAsync(IHubClient hub, InteropEnvelope envelope, CancellationToken ct)
    {
        if (!Enabled) return null;
        if (string.IsNullOrWhiteSpace(envelope.Signature) || string.IsNullOrWhiteSpace(envelope.SignerKeyId))
            return "invalid_signature: the message is not signed.";
        if (hub is not IHubKeyClient keys) return "invalid_signature: this hub connection cannot supply signer keys.";

        for (var attempt = 0; attempt < 2; attempt++)
        {
            var key = await GetKeyAsync(keys, envelope.SignerKeyId, attempt > 0, ct);
            if (key is null) return $"invalid_signature: unknown signer '{envelope.SignerKeyId}'.";
            if (key.Revoked) return $"invalid_signature: signer '{envelope.SignerKeyId}' is revoked.";
            if (string.IsNullOrWhiteSpace(key.PublicKey)) return $"invalid_signature: signer '{envelope.SignerKeyId}' has no registered key.";

            using var publicKey = PemKey.ImportEcdsa(PemKey.Normalize(key.PublicKey, "signer public key")!, "signer public key");
            if (EnvelopeSigning.Verify(envelope, envelope.Signature, publicKey)) return null;
            // The signer may have rotated its key since we cached it: look once more with a fresh copy.
        }

        return $"invalid_signature: the signature of '{envelope.SignerKeyId}' does not match the message.";
    }

    private async Task<HubSignerKey?> GetKeyAsync(IHubKeyClient keys, string clientId, bool refresh, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        if (!refresh && _cache.TryGetValue(clientId, out var cached) && cached.ExpiresUtc > now) return cached.Key;

        var key = await keys.GetSignerKeyAsync(clientId, ct);
        _cache[clientId] = new CachedKey(key, now + (key is null ? UnknownKeyTtl : KnownKeyTtl));
        return key;
    }
}
