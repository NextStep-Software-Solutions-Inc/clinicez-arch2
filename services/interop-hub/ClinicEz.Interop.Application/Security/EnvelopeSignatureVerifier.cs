using System.Collections.Concurrent;
using ClinicEz.Interop.Application.Abstractions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Security;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace ClinicEz.Interop.Application.Security;

/// <summary>The public side of a hub client as far as signatures are concerned.</summary>
public sealed record ClientKeyInfo(string ClientId, string CellId, string Service, HubClientKind Kind, string? PublicKeyPem, bool Revoked);

/// <summary>
/// Looks up the registered signing key of a client (cached for <see cref="AuthOptions.CacheSeconds"/>, like the credential cache:
/// a rotation or revocation reaches this instance at once and other instances within the window).
/// </summary>
public sealed class ClientKeyDirectory(IServiceScopeFactory scopes, IOptions<HubOptions> options, TimeProvider time)
{
    private sealed record CacheEntry(ClientKeyInfo? Info, DateTime ExpiresUtc);

    private readonly ConcurrentDictionary<string, CacheEntry> _cache = new(StringComparer.Ordinal);

    public async Task<ClientKeyInfo?> GetAsync(string clientId, CancellationToken ct)
    {
        var now = time.GetUtcNow().UtcDateTime;
        if (_cache.TryGetValue(clientId, out var cached) && cached.ExpiresUtc > now) return cached.Info;

        using var scope = scopes.CreateScope();
        var client = await scope.ServiceProvider.GetRequiredService<IClientStore>().FindAsync(clientId, ct);
        var info = client is null
            ? null
            : new ClientKeyInfo(client.ClientId, client.CellId, client.Service, client.Kind, client.PublicKeyPem, client.Revoked);
        _cache[clientId] = new CacheEntry(info, now.AddSeconds(options.Value.Auth.CacheSeconds));
        return info;
    }

    public void Invalidate(string clientId) => _cache.TryRemove(clientId, out _);
}

/// <summary>
/// Checks that an envelope was signed by the authenticated client that sent it. A signature that is present must verify;
/// a missing one (or a client without a registered key) is refused when <see cref="SigningOptions.Required"/> is on.
/// </summary>
public sealed class EnvelopeSignatureVerifier(ClientKeyDirectory keys, IOptions<HubOptions> options)
{
    public bool Required => options.Value.Signing.Required == true;

    /// <summary>Null when the envelope is acceptable; otherwise the rejection reason.</summary>
    public async Task<string?> VerifyAsync(HubPrincipal sender, InteropEnvelope envelope, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(envelope.Signature))
            return Required ? "signature_required: envelopes must be signed with the sending client's signing key (Messaging:SigningKey)." : null;

        if (!string.Equals(envelope.SignerKeyId, sender.ClientId, StringComparison.Ordinal))
            return "invalid_signature: SignerKeyId must be the id of the client that sends the envelope.";

        var key = await keys.GetAsync(sender.ClientId, ct);
        if (string.IsNullOrWhiteSpace(key?.PublicKeyPem))
            return Required ? "signature_required: this client has no registered signing key; rotate it to obtain one." : null;

        using var publicKey = PemKey.ImportEcdsa(key.PublicKeyPem, "client public key");
        return EnvelopeSigning.Verify(envelope, envelope.Signature, publicKey)
            ? null
            : "invalid_signature: the signature does not match the envelope.";
    }
}
