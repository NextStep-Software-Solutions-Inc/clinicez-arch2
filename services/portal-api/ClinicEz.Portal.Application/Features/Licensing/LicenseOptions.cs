namespace ClinicEz.Portal.Application.Features.Licensing;

/// <summary>Facility license lifetime (<c>Licensing</c> section). Licenses are short and renewable; the portal re-mints them before they lapse.</summary>
public sealed class LicenseOptions
{
    public const string SectionName = "Licensing";
    public const int MinTtlDays = 30;
    public const int MaxTtlDays = 90;

    public int TtlDays { get; set; } = 30;

    /// <summary>After expiry a facility stays usable read-only for this many days.</summary>
    public int GraceDays { get; set; } = 14;

    /// <summary>The renewal job re-mints licenses that expire within this many days.</summary>
    public int RenewBeforeDays { get; set; } = 10;

    public int EffectiveTtlDays => Math.Clamp(TtlDays, MinTtlDays, MaxTtlDays);
}
