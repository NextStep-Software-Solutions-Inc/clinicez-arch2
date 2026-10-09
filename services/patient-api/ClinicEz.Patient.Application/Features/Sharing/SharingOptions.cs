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
}