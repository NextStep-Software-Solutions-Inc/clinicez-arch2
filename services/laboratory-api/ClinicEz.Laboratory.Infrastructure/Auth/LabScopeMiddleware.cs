using System;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Infrastructure.Context;
using ClinicEz.Shared.LocalAuth;
using Microsoft.AspNetCore.Http;

namespace ClinicEz.Laboratory.Infrastructure.Auth;

/// <summary>
/// Runs after authentication. For staff tokens <c>X-Facility-Id</c> is only a client hint: if present it must equal the
/// token's laboratory, otherwise 403 (prevents cross-laboratory probing with a valid token). Tenant, laboratory and
/// permissions are never taken from headers for an authenticated session (see <see cref="LabContext"/>).
/// </summary>
public sealed class LabScopeMiddleware
{
    private readonly RequestDelegate _next;

    public LabScopeMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        var user = context.User;
        if (user.Identity?.IsAuthenticated == true && !user.HasClaim(FacilityAuthSchemes.InternalClaim, "true") &&
            context.Request.Headers.TryGetValue("X-Facility-Id", out var rawFacility) &&
            Guid.TryParse(rawFacility.ToString(), out var headerFacility))
        {
            var claimed = user.FindFirst(LabClaimTypes.LaboratoryId)?.Value;
            if (!Guid.TryParse(claimed, out var tokenLab) || tokenLab != headerFacility)
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                await context.Response.WriteAsJsonAsync(new
                {
                    success = false,
                    message = "Forbidden: the requested laboratory does not match your session."
                });
                return;
            }
        }

        await _next(context);
    }
}
