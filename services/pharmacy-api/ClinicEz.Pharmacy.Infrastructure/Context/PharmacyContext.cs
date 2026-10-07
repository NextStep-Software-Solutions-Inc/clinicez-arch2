using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using ClinicEz.Pharmacy.Domain.Constants;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Shared.LocalAuth;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;

namespace ClinicEz.Pharmacy.Infrastructure.Context;

/// <summary>
/// Per-request pharmacy scope. Fails closed:
/// <list type="bullet">
///   <item>Authenticated staff (Facility scheme): tenant, pharmacy, staff and permissions come ONLY from validated token claims.
///   Client headers (X-Permissions, X-Tenant-Id, X-Facility-Id, ...) are ignored.</item>
///   <item>Trusted internal services (Internal scheme): tenant/pharmacy come from the scoped values resolved by
///   <c>PharmacyScopeMiddleware</c> (or X-Tenant-Id/X-Facility-Id), with the GAMOT-only service permission set.</item>
///   <item>Anonymous requests: no permissions and the <see cref="UnauthenticatedPharmacyId"/> sentinel.</item>
///   <item>No HTTP request (MassTransit consumers, seeders): configured values, trusted system scope.</item>
/// </list>
/// </summary>
public sealed class PharmacyContext : IPharmacyContext
{
    /// <summary>Sentinel for "no authenticated pharmacy". Never matches any real pharmacy row.</summary>
    public static readonly Guid UnauthenticatedPharmacyId = new("00000000-0000-0000-0000-00000000dead");

    public const string InternalTenantItemKey = "clinicez.internal.tenant";
    public const string InternalPharmacyItemKey = "clinicez.internal.pharmacy";

    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly IConfiguration _configuration;

    public PharmacyContext(IHttpContextAccessor httpContextAccessor, IConfiguration configuration)
    {
        _httpContextAccessor = httpContextAccessor;
        _configuration = configuration;
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

    public bool IsInternalService => Http is { } http && IsInternal(http.User);

    public string TenantId
    {
        get
        {
            var http = Http;
            if (http is null) return _configuration["PharmacySettings:TenantId"] ?? "default";

            if (IsStaff(http.User)) return http.User.FindFirst(PharmacyClaimTypes.TenantId)?.Value ?? string.Empty;

            if (IsInternal(http.User))
            {
                if (http.Items.TryGetValue(InternalTenantItemKey, out var scoped) && scoped is string scopedTenant)
                    return scopedTenant;
                return Header(http, "X-Tenant-Id") ?? string.Empty;
            }

            return string.Empty;
        }
    }

    public Guid PharmacyId
    {
        get
        {
            var http = Http;
            if (http is null)
                return Guid.TryParse(_configuration["PharmacySettings:PharmacyId"], out var configured) ? configured : Guid.Empty;

            if (IsStaff(http.User))
            {
                return Guid.TryParse(http.User.FindFirst(PharmacyClaimTypes.PharmacyId)?.Value, out var claimed)
                    ? claimed
                    : UnauthenticatedPharmacyId;
            }

            if (IsInternal(http.User))
            {
                if (http.Items.TryGetValue(InternalPharmacyItemKey, out var scoped) && scoped is Guid scopedPharmacy)
                    return scopedPharmacy;
                return Guid.TryParse(Header(http, "X-Facility-Id"), out var header) ? header : UnauthenticatedPharmacyId;
            }

            return UnauthenticatedPharmacyId;
        }
    }

    public Guid? StaffId
    {
        get
        {
            var http = Http;
            if (http is null || !IsStaff(http.User)) return null;
            return Guid.TryParse(http.User.FindFirst(PharmacyClaimTypes.Subject)?.Value, out var id) ? id : null;
        }
    }

    public IReadOnlyList<string> Permissions
    {
        get
        {
            var http = Http;
            // Background/system scope (consumers, seeders) is trusted code, not a client.
            if (http is null) return PharmacyPermissions.All;

            if (IsInternal(http.User)) return PharmacyPermissions.InternalService;

            if (IsStaff(http.User))
                return http.User.FindAll(PharmacyClaimTypes.Permission).Select(c => c.Value).ToList();

            return Array.Empty<string>();
        }
    }

    public bool HasPermission(string permission)
    {
        if (string.IsNullOrWhiteSpace(permission)) return true;
        return Permissions.Contains(permission, StringComparer.OrdinalIgnoreCase);
    }
}