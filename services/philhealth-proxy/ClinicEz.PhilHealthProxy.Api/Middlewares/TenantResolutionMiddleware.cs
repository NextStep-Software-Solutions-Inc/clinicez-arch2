using ClinicEz.PhilHealthProxy.Infrastructure.Services;

namespace ClinicEz.PhilHealthProxy.Api.Middlewares;

/// <summary>
/// Resolves the tenant identifier from the <c>X-Tenant-Id</c> request header
/// and stores it on the scoped <see cref="CurrentTenantService"/> for the duration
/// of the request.
/// </summary>
public sealed class TenantResolutionMiddleware(RequestDelegate next)
{
    private const string TenantIdHeader = "X-Tenant-Id";
    private const string BranchIdHeader = "X-Branch-Id";
    private const string FacilityIdHeader = "X-Facility-Id";

    public async Task InvokeAsync(HttpContext context, CurrentTenantService tenantService)
    {
        if (context.Request.Headers.TryGetValue(TenantIdHeader, out var rawTenant)
            && Guid.TryParse(rawTenant, out var tenantId))
        {
            tenantService.SetTenantId(tenantId);
        }

        if ((context.Request.Headers.TryGetValue(BranchIdHeader, out var rawBranch) && Guid.TryParse(rawBranch, out var branchId))
            || (context.Request.Headers.TryGetValue(FacilityIdHeader, out var rawFacility) && Guid.TryParse(rawFacility, out branchId)))
        {
            tenantService.SetBranchId(branchId);
        }

        await next(context);
    }
}
