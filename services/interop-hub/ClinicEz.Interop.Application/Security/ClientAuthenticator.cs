using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using ClinicEz.Interop.Application.Abstractions;
using ClinicEz.Shared.Interop.Contracts;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace ClinicEz.Interop.Application.Security;

/// <summary>The authenticated caller, derived from its credentials (never from the request).</summary>
public sealed record HubPrincipal(string ClientId, string CellId, HubClientKind Kind, string Service);

/// <summary>
/// Verifies <c>X-Hub-Client</c> / <c>X-Hub-Secret</c>. PBKDF2 is deliberately slow, so verified credentials are cached
/// in memory for <see cref="AuthOptions.CacheSeconds"/> as an HMAC of the presented secret (the secret itself is never kept).
/// Rotation/revocation invalidates this instance's cache at once and other instances within the cache window.
/// </summary>
public sealed class ClientAuthenticator(IServiceScopeFactory scopes, IOptions<HubOptions> options, TimeProvider time)
{
    private sealed record CacheEntry(HubPrincipal Principal, byte[] SecretMac, DateTime ExpiresUtc);

    private readonly ConcurrentDictionary<string, CacheEntry> _cache = new(StringComparer.Ordinal);
    private readonly byte[] _cacheKey = RandomNumberGenerator.GetBytes(32);

    public async Task<HubPrincipal?> AuthenticateAsync(string? clientId, string? secret, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrEmpty(secret)) return null;

        var now = time.GetUtcNow().UtcDateTime;
        var mac = HMACSHA256.HashData(_cacheKey, Encoding.UTF8.GetBytes(secret));
        if (_cache.TryGetValue(clientId, out var cached)
            && cached.ExpiresUtc > now
            && CryptographicOperations.FixedTimeEquals(cached.SecretMac, mac))
            return cached.Principal;

        using var scope = scopes.CreateScope();
        var client = await scope.ServiceProvider.GetRequiredService<IClientStore>().FindAsync(clientId, ct);
        if (client is null || client.Revoked)
        {
            SecretHasher.BurnVerify(secret);
            return null;
        }

        if (!SecretHasher.Verify(secret, client.SecretHash)) return null;

        var principal = new HubPrincipal(client.ClientId, client.CellId, client.Kind, client.Service);
        _cache[clientId] = new CacheEntry(principal, mac, now.AddSeconds(options.Value.Auth.CacheSeconds));
        return principal;
    }

    /// <summary>Drops a client from the cache (called on rotate / revoke).</summary>
    public void Invalidate(string clientId) => _cache.TryRemove(clientId, out _);
}
