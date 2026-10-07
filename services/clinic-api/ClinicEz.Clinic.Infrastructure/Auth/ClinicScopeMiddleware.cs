using System;
using System.Threading.Tasks;
using ClinicEz.Clinic.Infrastructure.Context;
using ClinicEz.Shared.LocalAuth;
using Microsoft.AspNetCore.Http;

namespace ClinicEz.Clinic.Infrastructure.Auth;

/// <summary>
/// Runs after authentication.
/// <list type="bullet">
///   <item>Staff tokens: <c>X-Clinic-Id</c> is only a client hint. If present it must equal the token's clinic, otherwise 403
///   (prevents cross-clinic probing with a valid token).</item>
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
            var hasHeader = context.Request.Headers.TryGetValue("X-Clinic-Id", out var rawClinic) &&
                            Guid.TryParse(rawClinic.ToString(), out _);

            if (!isInternal && hasHeader)
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

            if (isInternal && !hasHeader &&
                context.Request.Headers.TryGetValue("X-Tenant-Id", out var tenantHeader) &&
                !string.IsNullOrWhiteSpace(tenantHeader))
            {
                var resolved = await workspaces.ResolveAsync(tenantHeader.ToString(), context.RequestAborted);
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
                context.Request.Headers.TryGetValue("X-Tenant-Id", out var anonTenant);
                var resolved = await workspaces.ResolveAsync(anonTenant.ToString(), context.RequestAborted);
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
        return path.StartsWithSegments("/api/v1") && !path.StartsWithSegments("/api/v1/auth");
    }
}
