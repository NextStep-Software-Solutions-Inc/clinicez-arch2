namespace ClinicEz.Shared.LocalAuth;

/// <summary>
/// Facility-local JWT settings (bound from the "Jwt" configuration section).
/// Each facility service (clinic, laboratory, pharmacy) uses its own audience and signing key so that
/// a token issued by one service is never accepted by another.
/// </summary>
public sealed class FacilityJwtOptions
{
    public const string SectionName = "Jwt";

    /// <summary>Token issuer. Defaults to the service audience.</summary>
    public string Issuer { get; set; } = string.Empty;

    /// <summary>Token audience. Distinct per service (e.g. clinicez-clinic, clinicez-lab, clinicez-pharmacy).</summary>
    public string Audience { get; set; } = string.Empty;

    /// <summary>
    /// Optional base64 (or raw) signing key of at least 32 bytes. When empty a key is generated on first start
    /// and persisted in <see cref="KeyDirectory"/> so that on-prem installs need no secret provisioning.
    /// </summary>
    public string? SigningKey { get; set; }

    /// <summary>Directory used to persist an auto-generated signing key. Defaults to {AppContext.BaseDirectory}/keys.</summary>
    public string? KeyDirectory { get; set; }

    public int AccessTokenMinutes { get; set; } = 15;

    public int RefreshTokenDays { get; set; } = 30;

    /// <summary>Allowed clock skew in minutes (LAN servers may not have NTP).</summary>
    public int ClockSkewMinutes { get; set; } = 2;

    public int MaxFailedLoginAttempts { get; set; } = 5;

    public int LockoutMinutes { get; set; } = 15;

    public int MinPasswordLength { get; set; } = 10;
}
