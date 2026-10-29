using System;
using System.Linq;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Infrastructure.Context;
using ClinicEz.Shared.LocalAuth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;

namespace ClinicEz.Clinic.Infrastructure.Auth;

/// <summary>
/// Runs after authentication.
/// <list type="bullet">
///   <item>Staff and kiosk tokens: <c>X-Clinic-Id</c> and <c>X-Tenant-Id</c> are only client hints. If present they must equal the token's claims, otherwise 403
///   (prevents cross-clinic or cross-tenant probing with a valid token).</item>
///   <item>Kiosk tokens: restricted to endpoints with KioskIntake policy.</item>
///   <item>Internal services: resolves the clinic for the supplied tenant when <c>X-Clinic-Id</c> is absent.</item>
/// </list>
/// </summary>
public sealed class ClinicScopeMiddleware
{
    private readonly RequestDelegate _next;

    public ClinicScopeMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context, IWorkspaceResolver workspaces)
    {
        var user = context.User;
        if (user.Identity?.IsAuthenticated == true)
        {
            var isInternal = user.HasClaim(FacilityAuthSchemes.InternalClaim, "true");
            var isKiosk = string.Equals(user.FindFirst(ClinicClaimTypes.TokenType)?.Value, "kiosk", StringComparison.OrdinalIgnoreCase);
            var hasClinicHeader = context.Request.Headers.TryGetValue("X-Clinic-Id", out var rawClinic) &&
                                  Guid.TryParse(rawClinic.ToString(), out _);

            if (!isInternal)
            {
                if (hasClinicHeader)
                {
                    var claimed = user.FindFirst(ClinicClaimTypes.ClinicId)?.Value;
                    if (!Guid.TryParse(claimed, out var tokenClinic) ||
                        !Guid.TryParse(rawClinic.ToString(), out var headerClinic) ||
                        tokenClinic != headerClinic)
                    {
                        context.Response.StatusCode = StatusCodes.Status403Forbidden;
                        await context.Response.WriteAsJsonAsync(new
                        {
                            success = false,
                            message = "Forbidden: the requested clinic does not match your session."
                        });
                        return;
                    }
                }

                if (context.Request.Headers.TryGetValue("X-Tenant-Id", out var rawTenant) &&
                    !string.IsNullOrWhiteSpace(rawTenant.ToString()))
                {
                    var tokenTenant = user.FindFirst(ClinicClaimTypes.TenantId)?.Value;
                    if (!string.Equals(tokenTenant, rawTenant.ToString(), StringComparison.OrdinalIgnoreCase))
                    {
                        context.Response.StatusCode = StatusCodes.Status403Forbidden;
                        await context.Response.WriteAsJsonAsync(new
                        {
                            success = false,
                            message = "Forbidden: the requested tenant does not match your session."
                        });
                        return;
                    }
                }
            }

            if (isKiosk)
            {
                var endpoint = context.GetEndpoint();
                var authorizeData = endpoint?.Metadata.GetOrderedMetadata<IAuthorizeData>();
                var allowsKiosk = authorizeData != null && authorizeData.Any(a => a.Policy == ClinicPolicies.KioskIntake);

                if (!allowsKiosk)
                {
                    context.Response.StatusCode = StatusCodes.Status403Forbidden;
                    await context.Response.WriteAsJsonAsync(new
                    {
                        success = false,
                        message = "Forbidden: Kiosk tokens are restricted to kiosk intake endpoints."
                    });
                    return;
                }
            }

            if (isInternal && !hasClinicHeader)
            {
                var hasFacilitySlug = context.Request.Headers.TryGetValue("X-Facility-Slug", out var facHeader) && !string.IsNullOrWhiteSpace(facHeader);
                var hasTenantSlug = context.Request.Headers.TryGetValue("X-Tenant-Id", out var tenantHeader) && !string.IsNullOrWhiteSpace(tenantHeader);

                ResolvedWorkspace? resolved = null;
                if (hasFacilitySlug)
                {
                    resolved = await workspaces.ResolveFacilityAsync(facHeader.ToString(), context.RequestAborted);
                }
                else if (hasTenantSlug)
                {
                    resolved = await workspaces.ResolveTenantAsync(tenantHeader.ToString(), context.RequestAborted);
                }

                if (resolved is not null)
                {
                    context.Items[ClinicContext.InternalTenantItemKey] = resolved.TenantId;
                    context.Items[ClinicContext.InternalClinicItemKey] = resolved.ClinicId;
                }
            }
        }
        else if (ShouldResolveAnonymousScope(context))
        {
            // Public token-based endpoints (lab upload, Rx verify, document verify, student intake) carry no staff session.
            // Scope them to the requested workspace, or the only activated clinic on single-clinic/on-prem installs.
            var hasClinicHint = context.Request.Headers.TryGetValue("X-Clinic-Id", out var anonClinic) &&
                                Guid.TryParse(anonClinic.ToString(), out _);
            if (!hasClinicHint)
            {
                var hasFacilitySlug = context.Request.Headers.TryGetValue("X-Facility-Slug", out var anonFacility) && !string.IsNullOrWhiteSpace(anonFacility);
                var hasTenantSlug = context.Request.Headers.TryGetValue("X-Tenant-Id", out var anonTenant) && !string.IsNullOrWhiteSpace(anonTenant);

                ResolvedWorkspace? resolved = null;
                if (hasFacilitySlug)
                {
                    resolved = await workspaces.ResolveFacilityAsync(anonFacility.ToString(), context.RequestAborted);
                }
                else if (hasTenantSlug)
                {
                    resolved = await workspaces.ResolveTenantAsync(anonTenant.ToString(), context.RequestAborted);
                }
                else
                {
                    resolved = await workspaces.ResolveAsync(null, context.RequestAborted);
                }

                if (resolved is not null)
                {
                    context.Items[ClinicContext.InternalTenantItemKey] = resolved.TenantId;
                    context.Items[ClinicContext.InternalClinicItemKey] = resolved.ClinicId;
                }
            }
        }

        await _next(context);
    }

    private static bool ShouldResolveAnonymousScope(HttpContext context)
    {
        var endpoint = context.GetEndpoint();
        if (endpoint?.Metadata.GetMetadata<Microsoft.AspNetCore.Authorization.IAllowAnonymous>() is null) return false;
        var path = context.Request.Path;
        // Auth and license endpoints resolve their own workspace (and must keep working offline without a portal lookup).
        return path.StartsWithSegments("/api/v1")
               && !path.StartsWithSegments("/api/v1/auth")
               && !path.StartsWithSegments("/api/v1/clinic/license");
    }
}
