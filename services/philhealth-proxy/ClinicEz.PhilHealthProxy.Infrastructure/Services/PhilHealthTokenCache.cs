using System;
using System.Collections.Concurrent;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace ClinicEz.PhilHealthProxy.Infrastructure.Services;

public interface IPhilHealthTokenCache
{
    Task<string> GetOrFetchTokenAsync(
        Guid tenantId,
        string accreNo,
        Func<CancellationToken, Task<(string Token, TimeSpan ExpiresIn)>> tokenFactory,
        CancellationToken cancellationToken = default);

    string? Get(Guid tenantId, string accreNo);
    void Set(Guid tenantId, string accreNo, string token, TimeSpan ttl);
    void Invalidate(Guid tenantId, string accreNo);
    void InvalidateTenant(Guid tenantId);

    // Compatibility methods
    string? Get(Guid tenantId) => Get(tenantId, string.Empty);
    void Set(Guid tenantId, string token, TimeSpan ttl) => Set(tenantId, string.Empty, token, ttl);
    void Invalidate(Guid tenantId) => InvalidateTenant(tenantId);
}

public sealed class PhilHealthTokenCache : IPhilHealthTokenCache
{
    private readonly record struct CachedEntry(string Token, DateTimeOffset ExpiresAt);

    private readonly ConcurrentDictionary<(Guid TenantId, string AccreNo), CachedEntry> _store = new();
    private readonly ConcurrentDictionary<(Guid TenantId, string AccreNo), SemaphoreSlim> _locks = new();
    private readonly ILogger<PhilHealthTokenCache> _logger;

    public static readonly TimeSpan DefaultTtl = TimeSpan.FromMinutes(55);

    public PhilHealthTokenCache(ILogger<PhilHealthTokenCache> logger)
    {
        _logger = logger;
    }

    public async Task<string> GetOrFetchTokenAsync(
        Guid tenantId,
        string accreNo,
        Func<CancellationToken, Task<(string Token, TimeSpan ExpiresIn)>> tokenFactory,
        CancellationToken cancellationToken = default)
    {
        var key = (tenantId, (accreNo ?? string.Empty).Trim());

        // Fast path: memory cache hit
        if (_store.TryGetValue(key, out var entry) && entry.ExpiresAt > DateTimeOffset.UtcNow)
        {
            return entry.Token;
        }

        // Single-flight synchronization per (TenantId, AccreNo)
        var gate = _locks.GetOrAdd(key, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(cancellationToken);
        try
        {
            // Double-check lock
            if (_store.TryGetValue(key, out entry) && entry.ExpiresAt > DateTimeOffset.UtcNow)
            {
                return entry.Token;
            }

            _logger.LogInformation("[TokenCache] Fetching fresh token for Tenant {TenantId}, Accre {AccreNo}", tenantId, accreNo);
            var (token, expiresIn) = await tokenFactory(cancellationToken);

            // Enforce safe 55m TTL ceiling
            var ttl = expiresIn > TimeSpan.FromMinutes(55) ? TimeSpan.FromMinutes(55) : expiresIn;
            Set(tenantId, accreNo ?? string.Empty, token, ttl);

            return token;
        }
        finally
        {
            gate.Release();
        }
    }

    public string? Get(Guid tenantId, string accreNo)
    {
        var key = (tenantId, (accreNo ?? string.Empty).Trim());
        if (_store.TryGetValue(key, out var entry) && entry.ExpiresAt > DateTimeOffset.UtcNow)
        {
            return entry.Token;
        }

        _store.TryRemove(key, out _);
        return null;
    }

    public void Set(Guid tenantId, string accreNo, string token, TimeSpan ttl)
    {
        var key = (tenantId, (accreNo ?? string.Empty).Trim());
        _store[key] = new CachedEntry(token, DateTimeOffset.UtcNow.Add(ttl));
    }

    public void Invalidate(Guid tenantId, string accreNo)
    {
        var key = (tenantId, (accreNo ?? string.Empty).Trim());
        _store.TryRemove(key, out _);
        _logger.LogInformation("[TokenCache] Evicted token for Tenant {TenantId}, Accre {AccreNo}", tenantId, accreNo);
    }

    public void InvalidateTenant(Guid tenantId)
    {
        var matchingKeys = _store.Keys.Where(k => k.TenantId == tenantId).ToList();
        foreach (var key in matchingKeys)
        {
            _store.TryRemove(key, out _);
        }
        _logger.LogInformation("[TokenCache] Evicted all tokens for Tenant {TenantId}", tenantId);
    }
}
