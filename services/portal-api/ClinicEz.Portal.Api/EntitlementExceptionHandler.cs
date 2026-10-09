using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Features.Licensing;
using ClinicEz.Shared.Common;
using Microsoft.AspNetCore.Diagnostics;

namespace ClinicEz.Portal.Api;

/// <summary>
/// Turns an <see cref="EntitlementException"/> into a response clients can act on: the error carries the machine-readable
/// code (<c>subscription_inactive</c> 402, <c>feature_unavailable</c> 403, <c>limit_reached</c> / <c>allocation_exceeds_pool</c> 409).
/// </summary>
public sealed class EntitlementExceptionHandler : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        if (exception is not EntitlementException entitlement)
        {
            return false;
        }

        httpContext.Response.StatusCode = entitlement.Code switch
        {
            EntitlementGuard.SubscriptionInactiveCode => StatusCodes.Status402PaymentRequired,
            EntitlementGuard.FeatureUnavailableCode => StatusCodes.Status403Forbidden,
            EntitlementGuard.LimitReachedCode or FacilityAllocationService.ExceedsPoolCode => StatusCodes.Status409Conflict,
            _ => StatusCodes.Status400BadRequest
        };
        await httpContext.Response.WriteAsJsonAsync(
            ApiResponse<object>.Fail(entitlement.Message, [new ApiFieldError(null, entitlement.Code, entitlement.Message)]),
            cancellationToken);
        return true;
    }
}
