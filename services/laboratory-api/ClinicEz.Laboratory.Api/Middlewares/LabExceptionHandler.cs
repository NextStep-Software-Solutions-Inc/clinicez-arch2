using System.Net;
using ClinicEz.Laboratory.Application.Common.Exceptions;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop.Transport;
using Microsoft.AspNetCore.Diagnostics;

namespace ClinicEz.Laboratory.Api.Middlewares;

/// <summary>
/// Laboratory-specific failures that carry a machine-readable error code the apps react to:
/// <c>payment_required</c> for a prepaid order that is not yet paid, and the claim-by-QR outcomes of the hub. Registered
/// before the shared handler, which maps everything else.
/// </summary>
public sealed class LabExceptionHandler : IExceptionHandler
{
    public const string ClaimNotFound = "claim_not_found";
    public const string ClaimAlreadyRedeemed = "claim_already_redeemed";
    public const string ClaimExpired = "claim_expired";
    public const string ClaimForbidden = "claim_forbidden";
    public const string ClaimWrongFacilityType = "claim_wrong_facility_type";
    public const string ClaimUnavailable = "claim_unavailable";

    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        (int StatusCode, string Code, string Message) mapped;
        switch (exception)
        {
            case PaymentRequiredException payment:
                mapped = ((int)HttpStatusCode.Conflict, PaymentRequiredException.ErrorCode, payment.Message);
                break;
            case HubClaimException claim:
                mapped = MapClaim(claim.StatusCode);
                break;
            default:
                return false;
        }

        httpContext.Response.StatusCode = mapped.StatusCode;
        await httpContext.Response.WriteAsJsonAsync(
            ApiResponse<object>.Fail(mapped.Message, [new ApiFieldError(null, mapped.Code, mapped.Message)]),
            cancellationToken);
        return true;
    }

    // Fixed, friendly messages: the raw hub message may carry internals and is not meant for the cashier's screen.
    private static (int StatusCode, string Code, string Message) MapClaim(HttpStatusCode status) => status switch
    {
        HttpStatusCode.NotFound => (404, ClaimNotFound, "This QR code is not recognised. Check the slip and scan it again."),
        HttpStatusCode.Conflict => (409, ClaimAlreadyRedeemed, "This slip has already been claimed by a laboratory."),
        HttpStatusCode.Gone => (410, ClaimExpired, "This slip has expired. Ask the clinic to issue a new one."),
        HttpStatusCode.Forbidden => (403, ClaimForbidden, "This laboratory is not an active facility and cannot claim orders."),
        HttpStatusCode.UnprocessableEntity => (422, ClaimWrongFacilityType, "This slip is not meant for a laboratory."),
        _ => (502, ClaimUnavailable, "The claim could not be completed right now. Please try again shortly.")
    };
}
