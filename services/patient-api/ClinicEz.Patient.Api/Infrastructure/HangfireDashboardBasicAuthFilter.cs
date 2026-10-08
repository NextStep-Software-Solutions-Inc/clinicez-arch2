using ClinicEz.Shared.Security;
using Hangfire.AspNetCore;
using Hangfire.Dashboard;

namespace ClinicEz.Patient.Api.Infrastructure;

/// <summary>
/// HTTP Basic Auth guard for the Hangfire dashboard.
/// Credentials are read from Hangfire:DashboardUsername / Hangfire:DashboardPassword
/// in configuration (user-secrets in dev, environment variables in production).
/// Never hard-coded. With no password configured the dashboard is denied to everyone.
/// </summary>
public sealed class HangfireDashboardBasicAuthFilter : IDashboardAuthorizationFilter
{
    private readonly string _username;
    private readonly string? _password;

    public HangfireDashboardBasicAuthFilter(IConfiguration configuration)
    {
        var username = configuration["Hangfire:DashboardUsername"];
        _username = string.IsNullOrWhiteSpace(username) ? "admin" : username;
        _password = configuration["Hangfire:DashboardPassword"];
    }

    public bool Authorize(DashboardContext context)
    {
        var httpContext = context.GetHttpContext();
        if (BasicAuth.Matches(httpContext.Request.Headers["Authorization"].ToString(), _username, _password))
        {
            return true;
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