using System;
using Microsoft.Extensions.Configuration;

namespace ClinicEz.Shared.Security.Turnstile;

/// <summary>
/// Implements the two-tier control hierarchy for Turnstile bot protection:
/// Environment Variable (DevOps / Infrastructure) > Facility Setting (Clinic Admin Runtime).
/// </summary>
public sealed class TurnstileSettingResolver : ITurnstileSettingResolver
{
    private readonly IConfiguration _configuration;

    public TurnstileSettingResolver(IConfiguration configuration)
    {
        _configuration = configuration ?? throw new ArgumentNullException(nameof(configuration));
    }

    public (bool IsOverridden, bool? OverrideValue) GetEnvironmentOverride()
    {
        var rawEnv = _configuration["TURNSTILE_ENABLED"] ?? _configuration["Turnstile:Enabled"];
        if (!string.IsNullOrWhiteSpace(rawEnv) && bool.TryParse(rawEnv, out var parsedValue))
        {
            return (true, parsedValue);
        }

        return (false, null);
    }

    public bool IsEnabled(bool? facilityEnabled = null)
    {
        var (isOverridden, overrideValue) = GetEnvironmentOverride();
        if (isOverridden && overrideValue.HasValue)
        {
            return overrideValue.Value;
        }

        return facilityEnabled ?? false;
    }

    public string GetSiteKey(string? facilitySiteKey = null)
    {
        var envSiteKey = _configuration["Turnstile:SiteKey"] ?? _configuration["TURNSTILE_SITE_KEY"];
        if (!string.IsNullOrWhiteSpace(envSiteKey))
        {
            return envSiteKey.Trim();
        }

        if (!string.IsNullOrWhiteSpace(facilitySiteKey))
        {
            return facilitySiteKey.Trim();
        }

        return CloudflareTurnstileValidator.OfficialTestSiteKeyPass;
    }
}
