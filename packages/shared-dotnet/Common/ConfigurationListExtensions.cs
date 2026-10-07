using Microsoft.Extensions.Configuration;

namespace ClinicEz.Shared.Common;

/// <summary>
/// Reads list-style settings (allowed domains, origins, authorized parties) from configuration.
/// Supports both indexed sections (<c>Cors:AllowedDomains:0</c>, <c>Cors__AllowedDomains__0</c>)
/// and a single comma / semicolon / whitespace separated value (<c>CORS_ALLOWED_DOMAINS=a.com,b.com</c>),
/// so a list can be supplied through one GitHub secret / variable or a single docker env entry.
/// </summary>
public static class ConfigurationListExtensions
{
    private static readonly char[] Separators = [',', ';', ' ', '\n', '\r', '\t'];

    public static string[] GetStringList(this IConfiguration configuration, string key)
    {
        var section = configuration.GetSection(key);
        var values = new List<string>();

        if (!string.IsNullOrWhiteSpace(section.Value))
        {
            values.AddRange(section.Value.Split(Separators, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
        }

        foreach (var child in section.GetChildren())
        {
            if (string.IsNullOrWhiteSpace(child.Value)) continue;
            values.AddRange(child.Value.Split(Separators, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
        }

        return values.Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
    }

    /// <summary>
    /// Resolves the trusted token parties (Clerk "azp" origins). Combines the explicit list at
    /// <paramref name="key"/> with <c>https://{domain}</c> and <c>https://*.{domain}</c> for
    /// <c>Facility:BaseDomain</c> and every <c>Cors:AllowedDomains</c> entry.
    /// </summary>
    public static string[] GetAuthorizedParties(this IConfiguration configuration, string key)
    {
        var parties = new List<string>(configuration.GetStringList(key));

        var domains = new List<string>(configuration.GetStringList("Cors:AllowedDomains"));
        var baseDomain = configuration["Facility:BaseDomain"];
        if (!string.IsNullOrWhiteSpace(baseDomain)) domains.Add(baseDomain);

        foreach (var domain in domains)
        {
            var clean = domain.Trim().TrimStart('.');
            if (clean.Length == 0) continue;
            parties.Add($"https://{clean}");
            parties.Add($"https://*.{clean}");
        }

        return parties.Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
    }
}
