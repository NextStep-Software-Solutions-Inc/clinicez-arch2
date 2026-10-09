using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.Routing.Patterns;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interfaces;
using ClinicEz.Patient.Domain.Interfaces;

namespace ClinicEz.Patient.Api.Middleware;

/// <summary>
/// Object-level authorisation for the patient plane: a caller may only address their own patient record.
/// It applies by route shape instead of per endpoint, so a new patient route cannot forget it:
/// <list type="bullet">
///   <item><description>any route with a <c>{patientId}</c> parameter, or <c>{id}</c> directly after a literal <c>patients</c> segment: the patient must be linked to the caller's Clerk user;</description></item>
///   <item><description><c>patients/by-clerk/{clerkUserId}</c>: the Clerk user must be the caller;</description></item>
///   <item><description>a <c>forPatientId</c> query value (membership lookups on clinic search/detail): the patient must be linked to the caller.</description></item>
/// </list>
/// Missing and foreign patients are indistinguishable (both 403), so ids cannot be probed.
/// Must run after authentication and authorisation.
/// </summary>
public sealed class PatientOwnershipMiddleware
{
    public const string PatientIdParameter = "patientId";
    public const string PatientRouteIdParameter = "id";
    public const string ClerkUserIdParameter = "clerkUserId";
    public const string ForPatientIdQuery = "forPatientId";

    private readonly RequestDelegate _next;

    public PatientOwnershipMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context, IPatientRepository patients, ICurrentUserService currentUser)
    {
        if (context.GetEndpoint() is RouteEndpoint endpoint)
        {
            var parameter = ResolveGuardedParameter(endpoint.RoutePattern);
            var queryPatientId = context.Request.Query[ForPatientIdQuery].ToString();
            var queryGuarded = !string.IsNullOrEmpty(queryPatientId);

            if (parameter is not null || queryGuarded)
            {
                var userId = currentUser.UserId;
                if (string.IsNullOrWhiteSpace(userId))
                {
                    context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                    return;
                }

                var allowed = true;
                if (parameter is not null)
                {
                    var routeValue = context.Request.RouteValues[parameter]?.ToString();
                    allowed = parameter == ClerkUserIdParameter
                        ? string.Equals(routeValue, userId, StringComparison.Ordinal)
                        : await OwnsAsync(patients, routeValue, userId, context.RequestAborted);
                }

                if (allowed && queryGuarded)
                    allowed = await OwnsAsync(patients, queryPatientId, userId, context.RequestAborted);

                if (!allowed)
                    throw new ForbiddenException("You do not have access to this patient record.");
            }
        }

        await _next(context);
    }

    private static async Task<bool> OwnsAsync(IPatientRepository patients, string? value, string userId, CancellationToken ct) =>
        Guid.TryParse(value, out var patientId) && await patients.IsOwnedByAsync(patientId, userId, ct);

    /// <summary>The route parameter that names a patient (or the caller's identity) for the pattern, if any.</summary>
    public static string? ResolveGuardedParameter(RoutePattern pattern)
    {
        var segments = pattern.PathSegments;
        for (var i = 0; i < segments.Count; i++)
        {
            if (SingleParameter(segments[i]) is PatientIdParameter)
                return PatientIdParameter;

            if (i + 1 >= segments.Count) continue;

            var literal = SingleLiteral(segments[i]);
            var next = SingleParameter(segments[i + 1]);
            if (literal == "patients" && next == PatientRouteIdParameter)
                return PatientRouteIdParameter;
            if (literal == "by-clerk" && next == ClerkUserIdParameter)
                return ClerkUserIdParameter;
        }

        return null;
    }

    private static string? SingleParameter(RoutePatternPathSegment segment) =>
        segment.Parts is [RoutePatternParameterPart parameter] ? parameter.Name : null;

    private static string? SingleLiteral(RoutePatternPathSegment segment) =>
        segment.Parts is [RoutePatternLiteralPart literal] ? literal.Content : null;
}
