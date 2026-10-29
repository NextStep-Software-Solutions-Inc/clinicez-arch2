using System.Diagnostics;
using System.Net;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Shared.Middlewares;

public class GlobalExceptionHandler : IExceptionHandler
{
    private readonly ILogger<GlobalExceptionHandler>? _logger;

    public GlobalExceptionHandler() : this(null)
    {
    }

    public GlobalExceptionHandler(ILogger<GlobalExceptionHandler>? logger)
    {
        _logger = logger;
    }

    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        var traceId = ResolveTraceId(httpContext);

        if (!httpContext.Response.HasStarted)
        {
            httpContext.Response.Headers["X-Correlation-ID"] = traceId;
        }

        // ── 1. Unwrap Clerk SDK Errors ─────────────────────────────────────────
        exception = ClerkExceptionParser.TryUnwrap(exception);

        // ── 2. Intercept Database Exceptions (PostgreSQL & EF Core) ────────────
        if (DatabaseExceptionTranslator.TryTranslate(exception, traceId, out var dbError))
        {
            _logger?.LogError(
                exception,
                "Database error {ErrorCode} during {Method} {Path}. TraceId: {TraceId}",
                dbError.ErrorCode,
                httpContext.Request.Method,
                httpContext.Request.Path,
                traceId);

            httpContext.Response.StatusCode = dbError.StatusCode;
            var payload = ApiResponse<object>.Fail(
                dbError.Message,
                dbError.Errors,
                dbError.ErrorCode,
                traceId);

            await httpContext.Response.WriteAsJsonAsync(payload, cancellationToken);
            return true;
        }

        // ── 3. Known Application & Domain Exceptions ───────────────────────────
        var (statusCode, genericCode) = exception switch
        {
            ValidationException          => ((int)HttpStatusCode.BadRequest,            "VALIDATION_ERROR"),
            BadRequestException          => ((int)HttpStatusCode.BadRequest,            "BAD_REQUEST"),
            UnauthorizedException        => ((int)HttpStatusCode.Unauthorized,          "UNAUTHORIZED"),
            UnauthorizedAccessException  => ((int)HttpStatusCode.Unauthorized,          "UNAUTHORIZED"),
            ForbiddenException           => ((int)HttpStatusCode.Forbidden,             "FORBIDDEN"),
            TooManyRequestsException     => ((int)HttpStatusCode.TooManyRequests,       "TOO_MANY_REQUESTS"),
            ServiceUnavailableException  => ((int)HttpStatusCode.ServiceUnavailable,    "SERVICE_UNAVAILABLE"),
            ConflictException            => ((int)HttpStatusCode.Conflict,              "CONFLICT"),
            NotFoundException            => ((int)HttpStatusCode.NotFound,              "NOT_FOUND"),
            _                            => ((int)HttpStatusCode.InternalServerError,   "INTERNAL_ERROR"),
        };

        httpContext.Response.StatusCode = statusCode;

        // ── 4. Validation errors: produce one ApiFieldError per field ─────────
        if (exception is ValidationException vex && vex.Errors is not null)
        {
            _logger?.LogWarning(
                "Validation failure during {Method} {Path}. TraceId: {TraceId}",
                httpContext.Request.Method,
                httpContext.Request.Path,
                traceId);

            var fieldErrors = vex.Errors
                .SelectMany(kvp => kvp.Value.Select(msg =>
                    new ApiFieldError(kvp.Key, "VALIDATION_ERROR", msg)))
                .ToList();

            var response = ApiResponse<object>.Fail(
                vex.Message ?? "One or more validation errors occurred.",
                fieldErrors,
                "VALIDATION_ERROR",
                traceId);

            await httpContext.Response.WriteAsJsonAsync(response, cancellationToken);
            return true;
        }

        // ── 5. Unexpected Server Exceptions (HTTP 500) ────────────────────────
        if (statusCode == (int)HttpStatusCode.InternalServerError)
        {
            _logger?.LogError(
                exception,
                "Unhandled server exception during {Method} {Path}. TraceId: {TraceId}",
                httpContext.Request.Method,
                httpContext.Request.Path,
                traceId);

            // Never leak raw ORM exception strings or stack traces to clients
            var safeMessage = $"An unexpected server error occurred. Support Reference: {traceId}";
            var singleError = new ApiFieldError(null, genericCode, safeMessage);

            await httpContext.Response.WriteAsJsonAsync(
                ApiResponse<object>.Fail(safeMessage, [singleError], genericCode, traceId),
                cancellationToken);
            return true;
        }

        // ── 6. Other Known Client Exceptions (400, 401, 403, 404, 409, etc.) ─
        _logger?.LogWarning(
            "Handled application exception [{GenericCode}] ({StatusCode}) during {Method} {Path}. TraceId: {TraceId}",
            genericCode,
            statusCode,
            httpContext.Request.Method,
            httpContext.Request.Path,
            traceId);

        // Sanitize message in case an unexpected raw ORM string was attached to a domain exception
        var clientMessage = exception.Message;
        if (clientMessage.Contains("An error occurred while saving the entity changes", StringComparison.OrdinalIgnoreCase))
        {
            clientMessage = $"A database conflict occurred. Support Reference: {traceId}";
        }

        var appError = new ApiFieldError(null, genericCode, clientMessage);
        await httpContext.Response.WriteAsJsonAsync(
            ApiResponse<object>.Fail(clientMessage, [appError], genericCode, traceId),
            cancellationToken);

        return true;
    }

    /// <summary>
    /// Resolves a meaningful, traceable correlation ID following standard observability hierarchy:
    /// 1. W3C distributed trace context (OpenTelemetry / System.Diagnostics.Activity)
    /// 2. Ingress/client-propagated correlation headers (X-Correlation-ID, X-Request-ID)
    /// 3. ASP.NET Core request/connection TraceIdentifier
    /// 4. Synchronized fallback ID for isolated unit test contexts
    /// </summary>
    public static string ResolveTraceId(HttpContext httpContext)
    {
        // 1. W3C Distributed Trace Context (OpenTelemetry / Activity)
        if (Activity.Current is { } activity)
        {
            var activityTraceId = !string.IsNullOrWhiteSpace(activity.Id)
                ? activity.Id
                : (activity.TraceId != default ? activity.TraceId.ToHexString() : null);

            if (!string.IsNullOrWhiteSpace(activityTraceId))
            {
                if (string.IsNullOrWhiteSpace(httpContext.TraceIdentifier))
                {
                    httpContext.TraceIdentifier = activityTraceId;
                }
                return activityTraceId;
            }
        }

        // 2. Client / Ingress correlation headers (X-Correlation-ID, X-Request-ID)
        if (httpContext.Request.Headers.TryGetValue("X-Correlation-ID", out var correlationHeader) &&
            !string.IsNullOrWhiteSpace(correlationHeader))
        {
            var correlationId = correlationHeader.ToString().Trim();
            httpContext.TraceIdentifier = correlationId;
            return correlationId;
        }

        if (httpContext.Request.Headers.TryGetValue("X-Request-ID", out var requestHeader) &&
            !string.IsNullOrWhiteSpace(requestHeader))
        {
            var requestId = requestHeader.ToString().Trim();
            httpContext.TraceIdentifier = requestId;
            return requestId;
        }

        // 3. ASP.NET Core per-request connection trace identifier
        if (!string.IsNullOrWhiteSpace(httpContext.TraceIdentifier))
        {
            return httpContext.TraceIdentifier;
        }

        // 4. Safe fallback for uninitialized test/mock contexts; synchronize back to HttpContext
        var fallback = Guid.NewGuid().ToString("N");
        httpContext.TraceIdentifier = fallback;
        return fallback;
    }
}
