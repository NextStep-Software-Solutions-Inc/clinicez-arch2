using System.Text;
using Hangfire.AspNetCore;
using Hangfire.Dashboard;

namespace PatientAppBE.Api.Infrastructure;

/// <summary>
/// HTTP Basic Auth guard for the Hangfire dashboard.
/// Credentials are read from Hangfire:DashboardUsername / Hangfire:DashboardPassword
/// in configuration (user-secrets in dev, environment variables in production).
/// Never hard-coded.
/// </summary>
public sealed class HangfireDashboardBasicAuthFilter : IDashboardAuthorizationFilter
{
    private readonly string _username;
    private readonly string _password;

    public HangfireDashboardBasicAuthFilter(IConfiguration configuration)
    {
        _username = configuration["Hangfire:DashboardUsername"]
            ?? throw new InvalidOperationException("Hangfire:DashboardUsername is not configured.");
        _password = configuration["Hangfire:DashboardPassword"]
            ?? throw new InvalidOperationException("Hangfire:DashboardPassword is not configured.");
    }

    public bool Authorize(DashboardContext context)
    {
        var httpContext = context.GetHttpContext();
        var authHeader = httpContext.Request.Headers["Authorization"].ToString();

        if (!authHeader.StartsWith("Basic ", StringComparison.OrdinalIgnoreCase))
        {
            Challenge(httpContext);
            return false;
        }

        try
        {
            var encoded = authHeader["Basic ".Length..].Trim();
            var decoded = Encoding.UTF8.GetString(Convert.FromBase64String(encoded));
            var colonIndex = decoded.IndexOf(':');

            if (colonIndex > 0
                && decoded[..colonIndex] == _username
                && decoded[(colonIndex + 1)..] == _password)
            {
                return true;
            }
        }
        catch
        {
            // Malformed base64 — fall through to challenge
        }

        Challenge(httpContext);
        return false;
    }

    private static void Challenge(HttpContext ctx)
    {
        ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
        ctx.Response.Headers.Append("WWW-Authenticate", "Basic realm=\"Hangfire Dashboard\"");
    }
}
