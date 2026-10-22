namespace ClinicEz.Shared.Security.Turnstile;

/// <summary>
/// Resolves whether Cloudflare Turnstile bot protection is active and which site key to use,
/// enforcing the hierarchy where infrastructure environment variables override facility settings.
/// </summary>
public interface ITurnstileSettingResolver
{
    /// <summary>
    /// Resolves whether Turnstile bot challenge is enabled given an optional facility-level setting.
    /// Hierarchy:
    /// 1. Environment variable / Configuration: "TURNSTILE_ENABLED" or "Turnstile:Enabled"
    ///    - If explicitly present (true/false), ENVIRONMENT WINS (overrides facility setting).
    /// 2. If environment variable is absent/null:
    ///    - Facility-level setting controls (facilityEnabled ?? false).
    /// </summary>
    bool IsEnabled(bool? facilityEnabled = null);

    /// <summary>
    /// Resolves the site key to use, checking environment variables "Turnstile:SiteKey" / "TURNSTILE_SITE_KEY",
    /// then facility setting, falling back to official Cloudflare test site key.
    /// </summary>
    string GetSiteKey(string? facilitySiteKey = null);

    /// <summary>
    /// Checks whether the environment variable is actively overriding the facility setting.
    /// Useful for displaying status badges in the settings UI.
    /// </summary>
    (bool IsOverridden, bool? OverrideValue) GetEnvironmentOverride();
}
