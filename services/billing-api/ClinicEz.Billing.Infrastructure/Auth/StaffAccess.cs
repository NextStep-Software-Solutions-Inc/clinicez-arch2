using System.Security.Claims;
using ClinicEz.Billing.Domain.Constants;
using ClinicEz.Billing.Domain.Enums;
using ClinicEz.Billing.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Billing.Infrastructure.Auth;

public sealed record StaffAccessInfo(bool IsActive, int TokenVersion, string TenantId, string FacilityId, StaffRole Role, string FullName)
{
    public IReadOnlyList<string> Permissions => BillingRolePermissions.For(Role);
}

public interface IStaffAccessCache
{
    Task<StaffAccessInfo?> GetAsync(Guid staffId, CancellationToken ct = default);

    void Invalidate(Guid staffId);
}

/// <summary>
/// Short-lived (60 s) cache of per-staff access data so role changes and revocation take effect quickly without a query on every
/// request. Sign-out of a deactivated cashier invalidates the entry immediately on this instance.
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
        var staff = await db.BillingStaff.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(s => s.Id == staffId, ct);

        var info = staff is null ? null : new StaffAccessInfo(staff.IsActive, staff.TokenVersion, staff.TenantId, staff.FacilityId, staff.Role, staff.FullName);
        _cache.Set(Key(staffId), info, Ttl);
        return info;
    }

    public void Invalidate(Guid staffId) => _cache.Remove(Key(staffId));

    private static string Key(Guid staffId) => $"billing-staff-access:{staffId}";
}

public static class BillingTokenEvents
{
    /// <summary>
    /// Runs after the JWT signature, issuer, audience and lifetime are validated. Rejects sessions of deactivated staff, revoked
    /// token versions, or a tenant/counter that no longer matches the staff row, then replaces the role, name and permission claims
    /// with the database values: nothing the client could have put in the token grants access.
    /// </summary>
    public static async Task OnTokenValidated(TokenValidatedContext context)
    {
        var principal = context.Principal;
        if (principal?.Identity is not ClaimsIdentity identity)
        {
            context.Fail("Invalid principal.");
            return;
        }

        if (!Guid.TryParse(principal.FindFirst(BillingClaimTypes.Subject)?.Value, out var staffId) ||
            !int.TryParse(principal.FindFirst(BillingClaimTypes.TokenVersion)?.Value, out var version))
        {
            context.Fail("Malformed token claims.");
            return;
        }

        var cache = context.HttpContext.RequestServices.GetRequiredService<IStaffAccessCache>();
        var info = await cache.GetAsync(staffId, context.HttpContext.RequestAborted);
        if (info is null || !info.IsActive || info.TokenVersion != version ||
            principal.FindFirst(BillingClaimTypes.TenantId)?.Value != info.TenantId ||
            principal.FindFirst(BillingClaimTypes.FacilityId)?.Value != info.FacilityId)
        {
            context.Fail("Session is no longer valid.");
            return;
        }

        foreach (var type in new[] { BillingClaimTypes.Permission, BillingClaimTypes.StaffRole, BillingClaimTypes.Name })
        {
            foreach (var existing in identity.FindAll(type).ToList()) identity.RemoveClaim(existing);
        }

        identity.AddClaim(new Claim(BillingClaimTypes.StaffRole, info.Role.ToString()));
        identity.AddClaim(new Claim(BillingClaimTypes.Name, info.FullName));
        foreach (var permission in info.Permissions) identity.AddClaim(new Claim(BillingClaimTypes.Permission, permission));
    }
}
