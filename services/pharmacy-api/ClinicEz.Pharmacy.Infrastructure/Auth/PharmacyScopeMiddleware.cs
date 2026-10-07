using System;
using System.Threading.Tasks;
using ClinicEz.Pharmacy.Infrastructure.Context;
using ClinicEz.Shared.LocalAuth;
using Microsoft.AspNetCore.Http;

namespace ClinicEz.Pharmacy.Infrastructure.Auth;

/// <summary>
/// Runs after authentication.
/// <list type="bullet">
///   <item>Staff tokens: <c>X-Facility-Id</c> is only a client hint. If present it must equal the token's pharmacy, otherwise 403
///   (prevents cross-pharmacy probing with a valid token).</item>
///   <item>Internal services: resolves the pharmacy for the supplied tenant (or the only activated pharmacy) when
///   <c>X-Facility-Id</c> is absent.</item>
/// </list>
/// </summary>
public sealed class PharmacyScopeMiddleware
{
    private readonly RequestDelegate _next;

    public PharmacyScopeMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context, IWorkspaceResolver workspaces)
    {
        var user = context.User;
        if (user.Identity?.IsAuthenticated == true)
        {
            var isInternal = user.HasClaim(FacilityAuthSchemes.InternalClaim, "true");
            var hasHeader = context.Request.Headers.TryGetValue("X-Facility-Id", out var rawFacility) &&
                            Guid.TryParse(rawFacility.ToString(), out _);

            if (!isInternal && hasHeader)
            {
                var claimed = user.FindFirst(PharmacyClaimTypes.PharmacyId)?.Value;
                if (!Guid.TryParse(claimed, out var tokenPharmacy) ||
                    !Guid.TryParse(rawFacility.ToString(), out var headerPharmacy) ||
                    tokenPharmacy != headerPharmacy)
                {
                    context.Response.StatusCode = StatusCodes.Status403Forbidden;
                    await context.Response.WriteAsJsonAsync(new
                    {
                        success = false,
                        message = "Forbidden: the requested pharmacy does not match your session."
                    });
                    return;
                }
            }

            if (isInternal && !hasHeader)
            {
                context.Request.Headers.TryGetValue("X-Tenant-Id", out var tenantHeader);
                var resolved = await workspaces.ResolveAsync(tenantHeader.ToString(), context.RequestAborted);
                if (resolved is not null)
                {
                    context.Items[PharmacyContext.InternalTenantItemKey] = resolved.TenantId;
                    context.Items[PharmacyContext.InternalPharmacyItemKey] = resolved.PharmacyId;
                }
            }
        }

        await _next(context);
    }
}