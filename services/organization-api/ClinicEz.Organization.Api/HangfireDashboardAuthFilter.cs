using ClinicEz.Shared.Security;
using Hangfire.AspNetCore;
using Hangfire.Dashboard;

namespace ClinicEz.Organization.Api;

/// <summary>
/// HTTP Basic Auth guard for the Hangfire dashboard. User name from <c>Hangfire:DashboardUsername</c> (default <c>admin</c>),
/// password from <c>Hangfire:DashboardPassword</c> (environment / secret, never hardcoded). With no password configured the
/// dashboard is denied to everyone.
/// </summary>
public sealed class HangfireDashboardAuthFilter : IDashboardAuthorizationFilter
{
    private readonly string _username;
    private readonly string? _password;

    public HangfireDashboardAuthFilter(IConfiguration configuration)
    {
        var username = configuration["Hangfire:DashboardUsername"];
        _username = string.IsNullOrWhiteSpace(username) ? "admin" : username;
        _password = configuration["Hangfire:DashboardPassword"];
    }

    public bool Authorize(DashboardContext context)
    {
        var http = context.GetHttpContext();
        if (BasicAuth.Matches(http.Request.Headers.Authorization.ToString(), _username, _password))
        {
            return true;
        }

        http.Response.StatusCode = StatusCodes.Status401Unauthorized;
        http.Response.Headers.Append("WWW-Authenticate", "Basic realm=\"Hangfire Dashboard\"");
        return false;
    }
}