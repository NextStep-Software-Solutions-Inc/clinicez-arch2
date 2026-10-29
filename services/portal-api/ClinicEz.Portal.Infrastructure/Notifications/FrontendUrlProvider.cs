using ClinicEz.Portal.Application.Features.Notifications;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;

namespace ClinicEz.Portal.Infrastructure.Notifications;

/// <summary>
/// The configured <c>FrontendBaseUrl</c> wins. Without it the website that made the request (Origin, then Referer)
/// is used, which is how local development works without extra setup.
/// </summary>
public sealed class FrontendUrlProvider(IConfiguration configuration, IHttpContextAccessor httpContextAccessor) : IFrontendUrlProvider
{
    public string? GetBaseUrl()
    {
        var configured = Normalize(configuration["FrontendBaseUrl"]);
        if (configured is not null) return configured;

        var request = httpContextAccessor.HttpContext?.Request;
        if (request is not null)
        {
            var headerUrl = Normalize(request.Headers.Origin.ToString()) ?? Normalize(request.Headers.Referer.ToString());
            if (headerUrl is not null) return headerUrl;

            var forwardedHost = request.Headers["X-Forwarded-Host"].ToString();
            var host = !string.IsNullOrWhiteSpace(forwardedHost) ? forwardedHost.Split(',')[0].Trim() : request.Host.Value;
            if (!string.IsNullOrWhiteSpace(host))
            {
                var proto = request.Headers["X-Forwarded-Proto"].ToString();
                var scheme = !string.IsNullOrWhiteSpace(proto) ? proto.Split(',')[0].Trim() : (request.Scheme ?? "https");
                var candidate = Normalize($"{scheme}://{host}");
                if (candidate is not null) return candidate;
            }
        }

        var baseDomain = configuration["Facility:BaseDomain"]?.Trim().TrimStart('.');
        if (!string.IsNullOrWhiteSpace(baseDomain))
        {
            return $"https://portal.{baseDomain}";
        }

        return null;
    }

    public string? GetAdminBaseUrl()
    {
        var configured = Normalize(configuration["AdminBaseUrl"]);
        if (configured is not null) return configured;

        var request = httpContextAccessor.HttpContext?.Request;
        if (request is not null)
        {
            var headerUrl = Normalize(request.Headers.Origin.ToString()) ?? Normalize(request.Headers.Referer.ToString());
            if (headerUrl is not null && IsAdminHost(headerUrl)) return headerUrl;

            var forwardedHost = request.Headers["X-Forwarded-Host"].ToString();
            var host = !string.IsNullOrWhiteSpace(forwardedHost) ? forwardedHost.Split(',')[0].Trim() : request.Host.Value;
            if (!string.IsNullOrWhiteSpace(host) && IsAdminHostString(host))
            {
                var proto = request.Headers["X-Forwarded-Proto"].ToString();
                var scheme = !string.IsNullOrWhiteSpace(proto) ? proto.Split(',')[0].Trim() : (request.Scheme ?? "https");
                var candidate = Normalize($"{scheme}://{host}");
                if (candidate is not null) return candidate;
            }
        }

        var baseDomain = configuration["Facility:BaseDomain"]?.Trim().TrimStart('.');
        if (!string.IsNullOrWhiteSpace(baseDomain))
        {
            if (baseDomain.Equals("localhost", StringComparison.OrdinalIgnoreCase))
            {
                return "http://localhost:3001";
            }
            return $"https://admin.{baseDomain}";
        }

        var env = configuration["ASPNETCORE_ENVIRONMENT"] ?? configuration["Environment"];
        if (string.Equals(env, "Development", StringComparison.OrdinalIgnoreCase))
        {
            return "http://localhost:3001";
        }

        return null;
    }

    private static bool IsAdminHost(string url)
    {
        if (Uri.TryCreate(url, UriKind.Absolute, out var uri))
        {
            return uri.Host.Contains("admin.", StringComparison.OrdinalIgnoreCase) || uri.Port == 3001;
        }
        return false;
    }

    private static bool IsAdminHostString(string host)
    {
        return host.Contains("admin.", StringComparison.OrdinalIgnoreCase) ||
               host.EndsWith(":3001", StringComparison.OrdinalIgnoreCase) ||
               host.Equals("3001", StringComparison.OrdinalIgnoreCase);
    }

    private static string? Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        if (!Uri.TryCreate(value.Trim(), UriKind.Absolute, out var uri)) return null;
        if (uri.Scheme is not ("http" or "https") || !string.IsNullOrEmpty(uri.UserInfo)) return null;
        return $"{uri.Scheme}://{uri.Authority}";
    }
}
