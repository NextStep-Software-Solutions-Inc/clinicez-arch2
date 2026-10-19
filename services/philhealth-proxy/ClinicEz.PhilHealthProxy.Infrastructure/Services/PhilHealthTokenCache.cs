using System.Collections.Concurrent;

namespace ClinicEz.PhilHealthProxy.Infrastructure.Services;

/// <summary>
/// Caches per-tenant PhilHealth access tokens so that every SOAP call does not
/// need to re-authenticate via <c>getToken</c>.
/// </summary>
public interface IPhilHealthTokenCache
{
    string? Get(Guid tenantId);
    void Set(Guid tenantId, string token, TimeSpan ttl);
    void Invalidate(Guid tenantId);
}

internal sealed class PhilHealthTokenCache : IPhilHealthTokenCache
{
    private readonly record struct CachedEntry(string Token, DateTimeOffset ExpiresAt);

    private readonly ConcurrentDictionary<Guid, CachedEntry> _store = new();

    public string? Get(Guid tenantId)
    {
        if (_store.TryGetValue(tenantId, out var entry) && entry.ExpiresAt > DateTimeOffset.UtcNow)
            return entry.Token;

        _store.TryRemove(tenantId, out _);
        return null;
    }

    public void Set(Guid tenantId, string token, TimeSpan ttl)
        => _store[tenantId] = new CachedEntry(token, DateTimeOffset.UtcNow.Add(ttl));

    public void Invalidate(Guid tenantId)
        => _store.TryRemove(tenantId, out _);
}
