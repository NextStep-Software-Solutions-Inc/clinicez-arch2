using System.Net;
using ClinicEz.Pharmacy.Application.Common;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop.Transport;
using Microsoft.AspNetCore.Diagnostics;

namespace ClinicEz.Pharmacy.Api.Middleware;

/// <summary>
/// Maps pharmacy-specific failures to HTTP responses with a stable machine-readable <c>errors[].code</c>: gate conflicts
/// (409 payment_required / acceptance_required / invalid_state) and hub claim failures (404/409/410/403/422). Anything else is
/// left to the shared <c>GlobalExceptionHandler</c>.
/// </summary>
public sealed class PharmacyExceptionHandler : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        var (status, code, message) = exception switch
        {
            PharmacyConflictException conflict => ((int)HttpStatusCode.Conflict, conflict.Code, conflict.Message),
            HubClaimException claim => MapClaim(claim.StatusCode),
            _ => (0, string.Empty, string.Empty)
        };

        if (status == 0)
        {
            return false;
        }

        httpContext.Response.StatusCode = status;
        await httpContext.Response.WriteAsJsonAsync(
            ApiResponse<object>.Fail(message, [new ApiFieldError(null, code, message)]),
            cancellationToken);
        return true;
    }

    private static (int Status, string Code, string Message) MapClaim(HttpStatusCode hubStatus) => hubStatus switch
    {
        HttpStatusCode.NotFound => (404, "claim_not_found", "This prescription code is not recognised."),
        HttpStatusCode.Conflict => (409, "claim_already_redeemed", "This prescription code has already been used."),
        HttpStatusCode.Gone => (410, "claim_expired", "This prescription code has expired."),
        HttpStatusCode.Forbidden => (403, "claim_forbidden", "This pharmacy is not allowed to redeem prescription codes."),
        HttpStatusCode.UnprocessableEntity => (422, "claim_wrong_facility_type", "This code is not a prescription that a pharmacy can claim."),
        _ => (502, "claim_unavailable", "The prescription claim service could not process the code. Try again shortly.")
    };
}
