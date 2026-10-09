using System.Net;
using ClinicEz.Clinic.Application.Common.Exceptions;
using ClinicEz.Shared.Common;
using Microsoft.AspNetCore.Diagnostics;

namespace ClinicEz.Clinic.Api.Middlewares;

/// <summary>
/// Clinic-specific failures that carry a machine-readable error code the apps react to:
/// <c>paid_at_billing_counter</c> for a local payment on an invoice the shared billing counter collects. Registered before
/// the shared handler, which maps everything else.
/// </summary>
public sealed class ClinicExceptionHandler : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        if (exception is not PaidAtBillingCounterException)
        {
            return false;
        }

        httpContext.Response.StatusCode = (int)HttpStatusCode.Conflict;
        await httpContext.Response.WriteAsJsonAsync(
            ApiResponse<object>.Fail(exception.Message, [new ApiFieldError(null, PaidAtBillingCounterException.ErrorCode, exception.Message)]),
            cancellationToken);
        return true;
    }
}
