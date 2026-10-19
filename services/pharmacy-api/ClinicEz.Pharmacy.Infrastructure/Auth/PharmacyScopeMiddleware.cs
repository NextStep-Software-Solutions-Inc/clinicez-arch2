using System;
using System.Threading.Tasks;
using ClinicEz.Pharmacy.Infrastructure.Context;
using Microsoft.AspNetCore.Http;

namespace ClinicEz.Pharmacy.Infrastructure.Auth;

/// <summary>
/// Runs after authentication. <c>X-Facility-Id</c> is only a client hint: if present it must equal the token's pharmacy,
/// otherwise 403 (prevents cross-pharmacy probing with a valid token).
/// </summary>
public sealed class PharmacyScopeMiddleware
{
    private readonly RequestDelegate _next;

    public PharmacyScopeMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        var user = context.User;
        if (user.Identity?.IsAuthenticated == true
            && context.Request.Headers.TryGetValue("X-Facility-Id", out var rawFacility)
            && Guid.TryParse(rawFacility.ToString(), out var headerPharmacy))
        {
            var claimed = user.FindFirst(PharmacyClaimTypes.PharmacyId)?.Value;
            if (!Guid.TryParse(claimed, out var tokenPharmacy) || tokenPharmacy != headerPharmacy)
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

        await _next(context);
    }
}