using PhilHealthProxy.Infrastructure.Services;

namespace PhilHealthProxy.Api.Middlewares;

/// <summary>
/// Resolves the tenant identifier from the <c>X-Tenant-Id</c> request header
/// and stores it on the scoped <see cref="CurrentTenantService"/> for the duration
/// of the request.
/// </summary>
public sealed class TenantResolutionMiddleware(RequestDelegate next)
{
    private const string TenantIdHeader = "X-Tenant-Id";

    public async Task InvokeAsync(HttpContext context, CurrentTenantService tenantService)
    {
        if (context.Request.Headers.TryGetValue(TenantIdHeader, out var rawValue)
            && Guid.TryParse(rawValue, out var tenantId))
        {
            tenantService.SetTenantId(tenantId);
        }

        await next(context);
    }
}
