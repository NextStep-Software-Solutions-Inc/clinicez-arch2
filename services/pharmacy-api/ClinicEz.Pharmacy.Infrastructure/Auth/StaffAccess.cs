using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Pharmacy.Domain.Constants;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Infrastructure.Context;
using ClinicEz.Pharmacy.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Pharmacy.Infrastructure.Auth;

public sealed record StaffAccessInfo(bool IsActive, int TokenVersion, IReadOnlyList<string> Permissions);

public interface IStaffAccessCache
{
    Task<StaffAccessInfo?> GetAsync(Guid staffId, CancellationToken ct = default);

    void Invalidate(Guid staffId);
}

public static class StaffPermissions
{
    /// <summary>Permissions are derived from the staff member's <see cref="PharmacyStaffMember.Role"/>.</summary>
    public static IReadOnlyList<string> For(PharmacyStaffMember staff) => PharmacyRolePermissions.For(staff.Role);
}

/// <summary>
/// Short-lived (60 s) cache of per-staff access data so permissions are looked up from the database
/// (role changes and revocation take effect quickly) without a query on every request.
/// </summary>
public sealed class StaffAccessCache : IStaffAccessCache
{
    private static readonly TimeSpan Ttl = TimeSpan.FromSeconds(60);
    private readonly IMemoryCache _cache;
    private readonly IServiceScopeFactory _scopes;

    public StaffAccessCache(IMemoryCache cache, IServiceScopeFactory scopes)
    {
        _cache = cache;
        _scopes = scopes;
    }

    public async Task<StaffAccessInfo?> GetAsync(Guid staffId, CancellationToken ct = default)
    {
        if (_cache.TryGetValue(Key(staffId), out StaffAccessInfo? cached)) return cached;

        using var scope = _scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var staff = await db.PharmacyStaffMembers.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == staffId && !s.IsDeleted, ct);

        var info = staff is null ? null : new StaffAccessInfo(staff.IsActive, staff.TokenVersion, StaffPermissions.For(staff));
        _cache.Set(Key(staffId), info, Ttl);
        return info;
    }

    public void Invalidate(Guid staffId) => _cache.Remove(Key(staffId));

    private static string Key(Guid staffId) => $"pharmacy-staff-access:{staffId}";
}

public static class PharmacyTokenEvents
{
    /// <summary>
    /// Runs after the JWT signature, issuer, audience and lifetime are validated. Rejects sessions of deactivated staff or
    /// revoked token versions and adds the staff member's current permissions (from the database) as claims.
    /// </summary>
    public static async Task OnTokenValidated(TokenValidatedContext context)
    {
        var principal = context.Principal;
        if (principal?.Identity is not ClaimsIdentity identity)
        {
            context.Fail("Invalid principal.");
            return;
        }

        if (!Guid.TryParse(principal.FindFirst(PharmacyClaimTypes.Subject)?.Value, out var staffId) ||
            !int.TryParse(principal.FindFirst(PharmacyClaimTypes.TokenVersion)?.Value, out var version))
        {
            context.Fail("Malformed token claims.");
            return;
        }

        var cache = context.HttpContext.RequestServices.GetRequiredService<IStaffAccessCache>();
        var info = await cache.GetAsync(staffId, context.HttpContext.RequestAborted);
        if (info is null || !info.IsActive || info.TokenVersion != version)
        {
            context.Fail("Session is no longer valid.");
            return;
        }

        foreach (var permission in info.Permissions)
        {
            identity.AddClaim(new Claim(PharmacyClaimTypes.Permission, permission));
        }
    }
}