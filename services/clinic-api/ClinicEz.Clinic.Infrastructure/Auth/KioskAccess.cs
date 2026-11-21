using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Clinic.Infrastructure.Auth;

public sealed record KioskAccessInfo(bool IsKioskIntakeEnabled, int KioskTokenVersion);

public interface IKioskAccessCache : IKioskAccessInvalidator
{
    Task<KioskAccessInfo?> GetAsync(Guid clinicId, CancellationToken ct = default);
}

public sealed class KioskAccessCache : IKioskAccessCache
{
    private static readonly TimeSpan Ttl = TimeSpan.FromSeconds(60);
    private readonly IMemoryCache _cache;
    private readonly IServiceScopeFactory _scopes;

    public KioskAccessCache(IMemoryCache cache, IServiceScopeFactory scopes)
    {
        _cache = cache;
        _scopes = scopes;
    }

    public async Task<KioskAccessInfo?> GetAsync(Guid clinicId, CancellationToken ct = default)
    {
        if (_cache.TryGetValue(Key(clinicId), out KioskAccessInfo? cached)) return cached;

        using var scope = _scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var settings = await db.Settings.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(s => s.ClinicId == clinicId && !s.IsDeleted, ct);

        var info = settings is null
            ? null
            : new KioskAccessInfo(settings.IsKioskIntakeEnabled, settings.KioskTokenVersion);

        if (info is not null)
        {
            _cache.Set(Key(clinicId), info, Ttl);
        }
        return info;
    }

    public void Invalidate(Guid clinicId) => _cache.Remove(Key(clinicId));

    private static string Key(Guid clinicId) => $"clinic-kiosk-access:{clinicId}";
}
