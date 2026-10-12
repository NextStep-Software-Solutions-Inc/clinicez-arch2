using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.LocalAuth;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;

namespace ClinicEz.Clinic.Infrastructure.Context;

/// <summary>
/// Per-request clinic scope. Fails closed:
/// <list type="bullet">
///   <item>Authenticated staff (Facility scheme): tenant, clinic, staff and permissions come ONLY from validated token claims.
///   Client headers (X-Permissions, X-Staff-Id, ...) are ignored.</item>
///   <item>Trusted internal services (Internal scheme): tenant/clinic come from the scoped values resolved by
///   <c>InternalScopeMiddleware</c> (or X-Tenant-Id/X-Clinic-Id), with a minimal service permission set.</item>
///   <item>Anonymous requests: workspace hints only (X-Tenant-Id / X-Clinic-Id). No permissions, and an unresolvable clinic
///   maps to <see cref="UnauthenticatedClinicId"/> so global query filters match nothing.</item>
///   <item>No HTTP request (background consumers, seeders): single-clinic configuration, or an empty clinic id which
///   explicitly means "system scope".</item>
/// </list>
/// </summary>
public sealed class ClinicContext : IClinicContext, IClinicScopeSetter
{
    /// <summary>Sentinel for "no authenticated clinic". Never matches any real clinic row.</summary>
    public static readonly Guid UnauthenticatedClinicId = new("00000000-0000-0000-0000-00000000dead");

    public const string InternalTenantItemKey = "clinicez.internal.tenant";
    public const string InternalClinicItemKey = "clinicez.internal.clinic";

    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly IConfiguration _configuration;
    private (string TenantId, Guid ClinicId, Guid? BranchId)? _explicitScope;

    public ClinicContext(IHttpContextAccessor httpContextAccessor, IConfiguration configuration)
    {
        _httpContextAccessor = httpContextAccessor;
        _configuration = configuration;
    }

    public void Enter(string tenantId, Guid clinicId, Guid? branchId = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(tenantId);
        if (clinicId == Guid.Empty || clinicId == UnauthenticatedClinicId)
            throw new ArgumentException("A real clinic id is required.", nameof(clinicId));
        _explicitScope = (tenantId, clinicId, branchId);
    }

    private HttpContext? Http => _httpContextAccessor.HttpContext;

    private static bool IsInternal(ClaimsPrincipal user) =>
        user.Identity?.IsAuthenticated == true && user.HasClaim(FacilityAuthSchemes.InternalClaim, "true");

    private static bool IsStaff(ClaimsPrincipal user) =>
        user.Identity?.IsAuthenticated == true && !IsInternal(user);

    private static string? Header(HttpContext http, string name) =>
        http.Request.Headers.TryGetValue(name, out var value) && !string.IsNullOrWhiteSpace(value)
            ? value.ToString()
            : null;

    public string TenantId
    {
        get
        {
            if (_explicitScope is { } explicitScope) return explicitScope.TenantId;

            var http = Http;
            if (http is null)
            {
                return _configuration["ClinicSettings:TenantId"] ?? "tenant_default";
            }

            if (IsStaff(http.User))
            {
                return http.User.FindFirst(ClinicClaimTypes.TenantId)?.Value ?? string.Empty;
            }

            if (IsInternal(http.User))
            {
                if (http.Items.TryGetValue(InternalTenantItemKey, out var scoped) && scoped is string scopedTenant)
                    return scopedTenant;
                return Header(http, "X-Tenant-Id") ?? string.Empty;
            }

            if (http.Items.TryGetValue(InternalTenantItemKey, out var anonScopedTenant) && anonScopedTenant is string anonTenantId)
                return anonTenantId;
            return Header(http, "X-Tenant-Id") ?? _configuration["ClinicSettings:TenantId"] ?? "tenant_default";
        }
    }

    public Guid ClinicId
    {
        get
        {
            if (_explicitScope is { } explicitScope) return explicitScope.ClinicId;

            var http = Http;
            if (http is null)
            {
                return Guid.TryParse(_configuration["ClinicSettings:ClinicId"], out var configured) ? configured : Guid.Empty;
            }

            if (IsStaff(http.User))
            {
                return Guid.TryParse(http.User.FindFirst(ClinicClaimTypes.ClinicId)?.Value, out var claimed)
                    ? claimed
                    : UnauthenticatedClinicId;
            }

            if (IsInternal(http.User))
            {
                if (http.Items.TryGetValue(InternalClinicItemKey, out var scoped) && scoped is Guid scopedClinic)
                    return scopedClinic;
                return Guid.TryParse(Header(http, "X-Clinic-Id"), out var headerClinic) ? headerClinic : UnauthenticatedClinicId;
            }

            if (Guid.TryParse(Header(http, "X-Clinic-Id"), out var hint)) return hint;
            if (http.Items.TryGetValue(InternalClinicItemKey, out var anonScopedClinic) && anonScopedClinic is Guid anonClinicId) return anonClinicId;
            return UnauthenticatedClinicId;
        }
    }

    public Guid? BranchId
    {
        get
        {
            if (_explicitScope is { } explicitScope && explicitScope.BranchId.HasValue) return explicitScope.BranchId.Value;

            var http = Http;
            if (http is null)
            {
                return Guid.TryParse(_configuration["ClinicSettings:BranchId"], out var configured) ? configured : null;
            }

            if (IsStaff(http.User))
            {
                return Guid.TryParse(http.User.FindFirst(ClinicClaimTypes.BranchId)?.Value, out var claimed) ? claimed : null;
            }

            // Branch is an operational hint (not a security boundary) for internal callers.
            return IsInternal(http.User) && Guid.TryParse(Header(http, "X-Branch-Id"), out var hint) ? hint : null;
        }
    }

    public Guid? StaffId
    {
        get
        {
            var http = Http;
            if (http is null || !IsStaff(http.User)) return null;
            return Guid.TryParse(http.User.FindFirst(ClinicClaimTypes.Subject)?.Value, out var id) ? id : null;
        }
    }

    public IReadOnlyList<string> Permissions
    {
        get
        {
            if (_explicitScope is not null) return ClinicPermissions.InternalService;

            var http = Http;
            if (http is null)
            {
                // Background/system scope (consumers, seeders) is trusted code, not a client.
                return ClinicPermissions.All;
            }

            if (IsInternal(http.User)) return ClinicPermissions.InternalService;

            if (IsStaff(http.User))
            {
                return http.User.FindAll(ClinicClaimTypes.Permission).Select(c => c.Value).ToList();
            }

            return Array.Empty<string>();
        }
    }

    public bool HasPermission(string permission)
    {
        if (string.IsNullOrWhiteSpace(permission)) return true;
        var perms = Permissions;
        return perms.Contains("*") || perms.Contains(permission, StringComparer.OrdinalIgnoreCase);
    }
}
