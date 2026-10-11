using System.Security.Claims;
using ClinicEz.Billing.Application.Abstractions;
using ClinicEz.Billing.Domain.Constants;
using ClinicEz.Billing.Domain.Enums;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.LocalAuth;
using Microsoft.AspNetCore.Http;

namespace ClinicEz.Billing.Infrastructure.Auth;

/// <summary>
/// Per-request billing scope. Fails closed:
/// <list type="bullet">
///   <item>Authenticated cashier (Facility scheme): tenant, counter facility, user, role and permissions come ONLY from validated
///   token claims (permissions and role re-derived from the database on every request). Client headers are ignored.</item>
///   <item>Trusted internal service (Internal scheme): tenant from <c>X-Tenant-Id</c> (a missing one matches nothing) and only
///   the narrow <see cref="BillingPermissions.InternalService"/> set; it is never a cashier.</item>
///   <item>Anonymous requests and background code (interop handlers): no tenant filter, no permissions; handlers scope by the
///   envelope explicitly.</item>
/// </list>
/// </summary>
public sealed class BillingContext : IBillingContext
{
    private readonly IHttpContextAccessor _accessor;

    public BillingContext(IHttpContextAccessor accessor) => _accessor = accessor;

    private HttpContext? Http => _accessor.HttpContext;

    private static bool IsInternal(ClaimsPrincipal user) =>
        user.Identity?.IsAuthenticated == true && user.HasClaim(FacilityAuthSchemes.InternalClaim, "true");

    private static bool IsStaff(ClaimsPrincipal user) =>
        user.Identity?.IsAuthenticated == true && !IsInternal(user);

    public string? TenantId
    {
        get
        {
            var http = Http;
            if (http is null) return null;

            if (IsStaff(http.User)) return http.User.FindFirst(BillingClaimTypes.TenantId)?.Value ?? string.Empty;

            if (IsInternal(http.User))
            {
                return http.Request.Headers.TryGetValue("X-Tenant-Id", out var value) && !string.IsNullOrWhiteSpace(value)
                    ? value.ToString().Trim()
                    : string.Empty;
            }

            return null;
        }
    }

    public BillingCaller? TryGetStaff()
    {
        var user = Http?.User;
        if (user is null || !IsStaff(user)) return null;

        var tenantId = user.FindFirst(BillingClaimTypes.TenantId)?.Value;
        var facilityId = user.FindFirst(BillingClaimTypes.FacilityId)?.Value;
        if (!Guid.TryParse(user.FindFirst(BillingClaimTypes.Subject)?.Value, out var userId) ||
            string.IsNullOrWhiteSpace(tenantId) || string.IsNullOrWhiteSpace(facilityId) ||
            !Enum.TryParse<StaffRole>(user.FindFirst(BillingClaimTypes.StaffRole)?.Value, out var role))
        {
            return null;
        }

        return new BillingCaller(
            tenantId, facilityId, userId, user.FindFirst(BillingClaimTypes.Name)?.Value ?? string.Empty, role,
            user.FindAll(BillingClaimTypes.Permission).Select(c => c.Value).ToList());
    }

    public BillingCaller RequireStaff() =>
        TryGetStaff() ?? throw new ForbiddenException("A signed-in cashier session is required for this action.");

    public bool HasPermission(string permission)
    {
        var user = Http?.User;
        if (user is null || string.IsNullOrWhiteSpace(permission)) return false;
        if (IsInternal(user)) return BillingPermissions.InternalService.Contains(permission, StringComparer.OrdinalIgnoreCase);
        return IsStaff(user) && user.FindAll(BillingClaimTypes.Permission).Any(c => string.Equals(c.Value, permission, StringComparison.OrdinalIgnoreCase));
    }
}
