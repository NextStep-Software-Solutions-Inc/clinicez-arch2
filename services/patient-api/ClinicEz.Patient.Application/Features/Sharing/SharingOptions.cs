namespace ClinicEz.Patient.Application.Features.Sharing;

/// <summary>Configuration for patient-controlled sharing (section <c>Sharing</c>).</summary>
public sealed class SharingOptions
{
    public const string SectionName = "Sharing";
    public const int MinimumSigningKeyLength = 32;

    /// <summary>Secret that signs share tokens. Required: the service refuses to start without it.</summary>
    public string SigningKey { get; set; } = string.Empty;

    /// <summary>How long a freshly minted share token (the QR) stays redeemable.</summary>
    public int ShareTokenTtlSeconds { get; set; } = 120;

    /// <summary>How long a facility keeps the grant created by redeeming a QR.</summary>
    public int QrGrantHours { get; set; } = 24;

    /// <summary>How long a clinic keeps the grant created by an online booking.</summary>
    public int BookingGrantDays { get; set; } = 30;

    /// <summary>Largest number of times a patient may allow one QR to be redeemed.</summary>
    public int MaxShareRedemptions { get; set; } = 10;

    /// <summary>How long a manually shared one-time code stays redeemable.</summary>
    public int ShareCodeTtlMinutes { get; set; } = 10;

    /// <summary>How many unredeemed, unexpired codes a patient may hold at once.</summary>
    public int MaxLiveShareCodes { get; set; } = 5;

    /// <summary>Window over which wrong code attempts are counted.</summary>
    public int ShareCodeFailureWindowMinutes { get; set; } = 10;

    /// <summary>Wrong code attempts one facility may make within the window before it is refused.</summary>
    public int MaxShareCodeFailuresPerFacility { get; set; } = 5;

    /// <summary>Wrong code attempts against one patient, from any facility, within the window before further attempts are refused.</summary>
    public int MaxShareCodeFailuresPerPatient { get; set; } = 15;
}