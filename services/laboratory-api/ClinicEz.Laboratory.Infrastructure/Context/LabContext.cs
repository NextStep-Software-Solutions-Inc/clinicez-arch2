using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using ClinicEz.Laboratory.Domain.Constants;
using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Shared.LocalAuth;
using Microsoft.AspNetCore.Http;

namespace ClinicEz.Laboratory.Infrastructure.Context;

/// <summary>
/// Per-request laboratory scope. Fails closed:
/// <list type="bullet">
///   <item>Authenticated staff (Facility scheme): tenant, laboratory, staff and permissions come ONLY from validated token
///   claims. Client headers (X-Tenant-Id, X-Facility-Id, X-Permissions, ...) are ignored.</item>
///   <item>Trusted internal services (Internal scheme): tenant from <c>X-Tenant-Id</c> (empty = matches nothing), with a
///   minimal service permission set.</item>
///   <item>Anonymous requests (public endpoints only): no permissions and no tenant restriction (those endpoints do their
///   own workspace resolution).</item>
///   <item>No HTTP request (MassTransit consumers, Hangfire, seeders): trusted system scope, no tenant restriction.</item>
/// </list>
/// </summary>
public sealed class LabContext : ILabContext
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public LabContext(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    private HttpContext? Http => _httpContextAccessor.HttpContext;

    private static bool IsInternal(ClaimsPrincipal user) =>
        user.Identity?.IsAuthenticated == true && user.HasClaim(FacilityAuthSchemes.InternalClaim, "true");

    private static bool IsAuthenticatedStaff(ClaimsPrincipal user) =>
        user.Identity?.IsAuthenticated == true && !IsInternal(user);

    public bool IsStaff => Http is { } http && IsAuthenticatedStaff(http.User);

    public string? TenantId
    {
        get
        {
            var http = Http;
            if (http is null) return null;

            if (IsAuthenticatedStaff(http.User))
            {
                return http.User.FindFirst(LabClaimTypes.TenantId)?.Value ?? string.Empty;
            }

            if (IsInternal(http.User))
            {
                return http.Request.Headers.TryGetValue("X-Tenant-Id", out var value) && !string.IsNullOrWhiteSpace(value)
                    ? value.ToString()
                    : string.Empty;
            }

            return null;
        }
    }

    public Guid? LaboratoryId
    {
        get
        {
            var http = Http;
            if (http is null || !IsAuthenticatedStaff(http.User)) return null;
            return Guid.TryParse(http.User.FindFirst(LabClaimTypes.LaboratoryId)?.Value, out var id) ? id : Guid.Empty;
        }
    }

    public Guid? StaffId
    {
        get
        {
            var http = Http;
            if (http is null || !IsAuthenticatedStaff(http.User)) return null;
            return Guid.TryParse(http.User.FindFirst(LabClaimTypes.Subject)?.Value, out var id) ? id : null;
        }
    }

    public IReadOnlyList<string> Permissions
    {
        get
        {
            var http = Http;
            if (http is null)
            {
                // Background/system scope (consumers, seeders) is trusted code, not a client.
                return LabPermissions.All;
            }

            if (IsInternal(http.User)) return LabPermissions.InternalService;

            if (IsAuthenticatedStaff(http.User))
            {
                return http.User.FindAll(LabClaimTypes.Permission).Select(c => c.Value).ToList();
            }

            return Array.Empty<string>();
        }
    }

    public bool HasPermission(string permission)
    {
        if (string.IsNullOrWhiteSpace(permission)) return true;
        return Permissions.Contains(permission, StringComparer.OrdinalIgnoreCase);
    }
}
