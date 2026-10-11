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
        if (request is null) return null;

        return Normalize(request.Headers.Origin.ToString()) ?? Normalize(request.Headers.Referer.ToString());
    }

    private static string? Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        if (!Uri.TryCreate(value.Trim(), UriKind.Absolute, out var uri)) return null;
        if (uri.Scheme is not ("http" or "https") || !string.IsNullOrEmpty(uri.UserInfo)) return null;
        return $"{uri.Scheme}://{uri.Authority}";
    }
}
