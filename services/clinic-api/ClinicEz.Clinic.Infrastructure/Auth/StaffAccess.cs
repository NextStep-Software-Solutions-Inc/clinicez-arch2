using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Infrastructure.Context;
using ClinicEz.Clinic.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Clinic.Infrastructure.Auth;

public sealed record StaffAccessInfo(bool IsActive, int TokenVersion, IReadOnlyList<string> Permissions);

public interface IStaffAccessCache : ClinicEz.Clinic.Domain.Interfaces.IStaffAccessInvalidator
{
    Task<StaffAccessInfo?> GetAsync(Guid staffId, CancellationToken ct = default);
}

public static class StaffPermissions
{
    /// <summary>Permissions come from the staff member's clinic role; legacy Admin staff without a role keep full access.</summary>
    public static IReadOnlyList<string> For(StaffMember staff)
    {
        if (staff.ClinicRole is { } role) return role.Permissions.ToList();
        return staff.Role == StaffRole.Admin ? ClinicPermissions.All : Array.Empty<string>();
    }
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
        var staff = await db.StaffMembers.IgnoreQueryFilters().AsNoTracking()
            .Include(s => s.ClinicRole)
            .FirstOrDefaultAsync(s => s.Id == staffId && !s.IsDeleted, ct);

        var info = staff is null ? null : new StaffAccessInfo(staff.IsActive, staff.TokenVersion, StaffPermissions.For(staff));
        _cache.Set(Key(staffId), info, Ttl);
        return info;
    }

    public void Invalidate(Guid staffId) => _cache.Remove(Key(staffId));

    private static string Key(Guid staffId) => $"clinic-staff-access:{staffId}";
}

public static class ClinicTokenEvents
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

        var tokenType = principal.FindFirst(ClinicClaimTypes.TokenType)?.Value;
        if (string.Equals(tokenType, "kiosk", StringComparison.OrdinalIgnoreCase))
        {
            if (!Guid.TryParse(principal.FindFirst(ClinicClaimTypes.ClinicId)?.Value, out var clinicId) ||
                !int.TryParse(principal.FindFirst(ClinicClaimTypes.TokenVersion)?.Value, out var kioskVersion))
            {
                context.Fail("Malformed kiosk token claims.");
                return;
            }

            var kioskCache = context.HttpContext.RequestServices.GetRequiredService<IKioskAccessCache>();
            var kioskInfo = await kioskCache.GetAsync(clinicId, context.HttpContext.RequestAborted);
            if (kioskInfo is null || !kioskInfo.IsKioskIntakeEnabled || kioskInfo.KioskTokenVersion != kioskVersion)
            {
                context.Fail("Kiosk session is no longer valid.");
                return;
            }

            // Kiosk tokens receive ZERO staff permissions
            return;
        }

        if (!Guid.TryParse(principal.FindFirst(ClinicClaimTypes.Subject)?.Value, out var staffId) ||
            !int.TryParse(principal.FindFirst(ClinicClaimTypes.TokenVersion)?.Value, out var version))
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
            identity.AddClaim(new Claim(ClinicClaimTypes.Permission, permission));
        }
    }
}
