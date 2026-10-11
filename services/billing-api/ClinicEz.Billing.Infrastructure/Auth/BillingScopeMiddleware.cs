using ClinicEz.Billing.Application.Abstractions;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.LocalAuth;
using Microsoft.AspNetCore.Http;

namespace ClinicEz.Billing.Infrastructure.Auth;

/// <summary>
/// Runs after authentication. For cashier tokens <c>X-Facility-Id</c> is only a client hint: if present it must equal the token's
/// counter facility, otherwise 403 (prevents cross-counter probing with a valid token). Tenant, facility and permissions are never
/// taken from headers for an authenticated session (see <see cref="BillingContext"/>).
/// </summary>
public sealed class BillingScopeMiddleware
{
    private readonly RequestDelegate _next;

    public BillingScopeMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context, IBillingContext billing)
    {
        if (context.Request.Headers.TryGetValue("X-Facility-Id", out var header) && !string.IsNullOrWhiteSpace(header) &&
            context.User.Identity?.IsAuthenticated == true && !context.User.HasClaim(FacilityAuthSchemes.InternalClaim, "true"))
        {
            var staff = billing.TryGetStaff();
            if (staff is null || !string.Equals(staff.FacilityId, header.ToString().Trim(), StringComparison.Ordinal))
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                await context.Response.WriteAsJsonAsync(ApiResponse<object>.Fail("Forbidden: the requested facility does not match your session."));
                return;
            }
        }

        await _next(context);
    }
}
