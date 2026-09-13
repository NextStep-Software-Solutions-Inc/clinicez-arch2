using System.Net;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http;

namespace ClinicEz.Shared.Middlewares;

public class GlobalExceptionHandler : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        // ── Unwrap Clerk SDK Errors ─────────────────────────────────────────
        exception = ClerkExceptionParser.TryUnwrap(exception);

        var (statusCode, genericCode) = exception switch
        {
            ValidationException          => ((int)HttpStatusCode.BadRequest,            "VALIDATION_ERROR"),
            BadRequestException          => ((int)HttpStatusCode.BadRequest,            "BAD_REQUEST"),
            UnauthorizedException        => ((int)HttpStatusCode.Unauthorized,          "UNAUTHORIZED"),
            ForbiddenException           => ((int)HttpStatusCode.Forbidden,             "FORBIDDEN"),
            TooManyRequestsException     => ((int)HttpStatusCode.TooManyRequests,       "TOO_MANY_REQUESTS"),
            ServiceUnavailableException  => ((int)HttpStatusCode.ServiceUnavailable,    "SERVICE_UNAVAILABLE"),
            ConflictException            => ((int)HttpStatusCode.Conflict,              "CONFLICT"),
            NotFoundException            => ((int)HttpStatusCode.NotFound,              "NOT_FOUND"),
            _                            => ((int)HttpStatusCode.InternalServerError,   "INTERNAL_ERROR"),
        };

        httpContext.Response.StatusCode = statusCode;

        // ── Validation errors: produce one ApiFieldError per field ────────────
        if (exception is ValidationException vex && vex.Errors is not null)
        {
            var fieldErrors = vex.Errors
                .SelectMany(kvp => kvp.Value.Select(msg =>
                    new ApiFieldError(kvp.Key, "VALIDATION_ERROR", msg)))
                .ToList();

            var response = ApiResponse<object>.Fail(
                vex.Message ?? "One or more validation errors occurred.",
                fieldErrors);

            await httpContext.Response.WriteAsJsonAsync(response, cancellationToken);
            return true;
        }

        // ── All other exceptions: single top-level error ───────────────────────
        var singleError = new ApiFieldError(null, genericCode, exception.Message);
        await httpContext.Response.WriteAsJsonAsync(
            ApiResponse<object>.Fail(exception.Message, [singleError]),
            cancellationToken);

        return true;
    }
}
