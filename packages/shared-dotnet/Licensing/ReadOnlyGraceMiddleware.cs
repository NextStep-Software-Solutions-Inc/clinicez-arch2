using ClinicEz.Shared.Common;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace ClinicEz.Shared.Licensing;

/// <summary>Stable machine-readable codes returned by <see cref="ReadOnlyGraceMiddleware"/>.</summary>
public static class LicenseErrorCodes
{
    public const string ReadOnly = "license_read_only";
    public const string Expired = "license_expired";
    public const string Tampered = "license_tampered";
}

public sealed class ReadOnlyGraceOptions
{
    /// <summary>
    /// Path prefixes that stay reachable whatever the license state, so a facility can still sign in and install a renewed
    /// license (for example <c>/api/v1/auth</c>, <c>/api/v1/license</c>, <c>/health</c>).
    /// </summary>
    public List<string> ExemptPathPrefixes { get; } = [];
}

/// <summary>
/// Enforces the license of the request's facility, as reported by <see cref="IFacilityLicenseState"/>
/// (<see cref="LicenseValidationResult.IsReadOnlyGrace"/> is the source of truth for grace):
/// <list type="bullet">
/// <item>valid or no facility context: pass through;</item>
/// <item>expired, inside the read-only grace window: GET/HEAD/OPTIONS pass, anything that changes data is HTTP 402
/// <c>license_read_only</c>;</item>
/// <item>expired beyond grace: everything outside the exempt paths is HTTP 402 <c>license_expired</c>;</item>
/// <item>tampered: everything outside the exempt paths is HTTP 403 <c>license_tampered</c>;</item>
/// <item>missing: pass through (the activation flow handles it).</item>
/// </list>
/// </summary>
public sealed class ReadOnlyGraceMiddleware
{
    public const string ReadOnlyUntilHeader = "X-License-Read-Only-Until";

    private readonly RequestDelegate _next;
    private readonly ReadOnlyGraceOptions _options;

    public ReadOnlyGraceMiddleware(RequestDelegate next, IOptions<ReadOnlyGraceOptions> options)
    {
        _next = next;
        _options = options.Value;
    }

    public async Task InvokeAsync(HttpContext context, IFacilityLicenseState state)
    {
        if (IsExempt(context.Request.Path))
        {
            await _next(context);
            return;
        }

        var license = await state.GetAsync(context, context.RequestAborted);
        if (license is null || license.IsValid || license.IsMissing)
        {
            await _next(context);
            return;
        }

        if (license.IsTampered)
        {
            await RejectAsync(context, StatusCodes.Status403Forbidden, LicenseErrorCodes.Tampered,
                "The facility license failed verification. Contact support to restore access.");
            return;
        }

        if (license.IsReadOnlyGrace)
        {
            if (license.ReadOnlyGraceUntilUtc is { } until)
            {
                context.Response.Headers[ReadOnlyUntilHeader] = until.ToString("O");
            }

            if (IsSafeMethod(context.Request.Method))
            {
                await _next(context);
                return;
            }

            await RejectAsync(context, StatusCodes.Status402PaymentRequired, LicenseErrorCodes.ReadOnly,
                "The facility subscription has expired. The facility is read-only until the subscription is renewed.");
            return;
        }

        await RejectAsync(context, StatusCodes.Status402PaymentRequired, LicenseErrorCodes.Expired,
            "The facility subscription and its read-only grace period have ended. Renew the subscription to continue.");
    }

    private bool IsExempt(PathString path) =>
        _options.ExemptPathPrefixes.Any(prefix => path.StartsWithSegments(prefix, StringComparison.OrdinalIgnoreCase));

    private static bool IsSafeMethod(string method) =>
        HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method);

    private static async Task RejectAsync(HttpContext context, int status, string code, string message)
    {
        context.Response.StatusCode = status;
        await context.Response.WriteAsJsonAsync(
            ApiResponse<object>.Fail(message, [new ApiFieldError(null, code, message)]),
            context.RequestAborted);
    }
}

public static class ReadOnlyGraceExtensions
{
    /// <summary>
    /// Registers the service's <typeparamref name="TState"/> (an <see cref="IFacilityLicenseState"/>, usually derived from
    /// <see cref="FacilityLicenseStateBase"/>) and the paths that must stay reachable regardless of the license.
    /// </summary>
    public static IServiceCollection AddReadOnlyGrace<TState>(this IServiceCollection services, params string[] exemptPathPrefixes)
        where TState : class, IFacilityLicenseState
    {
        services.AddScoped<IFacilityLicenseState, TState>();
        services.AddOptions<ReadOnlyGraceOptions>().Configure(o => o.ExemptPathPrefixes.AddRange(exemptPathPrefixes));
        return services;
    }

    /// <summary>Add after authentication and after the middleware that establishes the request's facility.</summary>
    public static IApplicationBuilder UseReadOnlyGrace(this IApplicationBuilder app) =>
        app.UseMiddleware<ReadOnlyGraceMiddleware>();
}
