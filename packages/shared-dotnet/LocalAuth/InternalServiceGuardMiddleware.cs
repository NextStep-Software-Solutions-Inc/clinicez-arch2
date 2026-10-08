using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;

namespace ClinicEz.Shared.LocalAuth;

/// <summary>
/// Default-deny for the internal service principal: after authorization, a request authenticated by the internal key is only
/// allowed on endpoints that enforce an explicit permission (<see cref="IPermissionGuarded"/>); the permission itself is then
/// checked against the service's narrow <c>InternalService</c> permission set. Staff JWT principals are unaffected.
/// </summary>
public sealed class InternalServiceGuardMiddleware
{
    private readonly RequestDelegate _next;

    public InternalServiceGuardMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        if (context.User.HasClaim(FacilityAuthSchemes.InternalClaim, "true") &&
            context.GetEndpoint()?.Metadata.GetMetadata<IPermissionGuarded>() is null)
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsync(
                "{\"succeeded\":false,\"message\":\"Forbidden: this endpoint is not available to internal service callers.\"}");
            return;
        }

        await _next(context);
    }
}

public static class InternalServiceGuardExtensions
{
    /// <summary>Register right after <c>UseAuthorization()</c>.</summary>
    public static IApplicationBuilder UseInternalServiceGuard(this IApplicationBuilder app) =>
        app.UseMiddleware<InternalServiceGuardMiddleware>();
}