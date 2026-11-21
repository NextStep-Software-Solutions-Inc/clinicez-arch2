using Microsoft.Extensions.Configuration;

namespace ClinicEz.Shared.Documents.Security;

/// <summary>
/// Resolves the public base URL embedded in document QR codes / verification links.
/// Order: <c>Verification:BaseUrl</c> (env <c>Verification__BaseUrl</c>), then
/// <c>Clinic:PortalBaseUrl</c> / <c>PORTAL_BASE_URL</c>, then
/// <c>https://{Facility:BaseDomain}</c>. When neither is configured an empty string is returned and
/// the generated link is relative (<c>/verify/...</c>) instead of pointing at a hardcoded host.
/// </summary>
public static class VerificationUrlResolver
{
    public static string Resolve(IConfiguration? configuration)
    {
        var explicitUrl = configuration?["Verification:BaseUrl"];
        if (!string.IsNullOrWhiteSpace(explicitUrl))
        {
            return explicitUrl.Trim().TrimEnd('/');
        }

        var portalUrl = configuration?["Clinic:PortalBaseUrl"]
            ?? configuration?["Portal:BaseUrl"]
            ?? configuration?["PortalBaseUrl"]
            ?? configuration?["PORTAL_BASE_URL"];
        if (!string.IsNullOrWhiteSpace(portalUrl))
        {
            return portalUrl.Trim().TrimEnd('/');
        }

        var baseDomain = configuration?["Facility:BaseDomain"];
        if (!string.IsNullOrWhiteSpace(baseDomain))
        {
            return $"https://{baseDomain.Trim().TrimStart('.')}";
        }

        return string.Empty;
    }
}
