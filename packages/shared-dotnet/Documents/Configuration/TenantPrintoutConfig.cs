using ClinicEz.Shared.Common;
using System.Text.Json.Serialization;
using System;

namespace ClinicEz.Shared.Documents.Configuration;

[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum DocumentPaperSize
{
    Letter,
    A4,
    A5
}

[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum SignatureMode
{
    ESignatureSpecimen,
    DigitalSealOnly,
    WetSignature
}

public sealed class TenantPrintoutConfig
{
    // Branding & Colors
    public string? PrimaryLogoUrl { get; set; }
    public byte[]? PrimaryLogoBytes { get; set; }
    public string? SecondaryLogoUrl { get; set; }
    public byte[]? SecondaryLogoBytes { get; set; }
    public string PrimaryColorHex { get; set; } = "#0284C7"; // Default clean clinical cyan/blue
    public string AccentColorHex { get; set; } = "#0369A1";

    // Signature Mode & Doctor Specimen
    public SignatureMode DefaultSignatureMode { get; set; } = SignatureMode.ESignatureSpecimen;
    public byte[]? DoctorSignatureBytes { get; set; }

    // Layout
    public DocumentPaperSize PaperSize { get; set; } = DocumentPaperSize.Letter;
    public float PageMarginMm { get; set; } = 14f;

    // Facility Details
    public required string FacilityName { get; set; }
    public string? FacilitySubHeader { get; set; }
    public string? PhysicalAddress { get; set; }
    public string? ContactNumbers { get; set; }
    public string? EmailAndWeb { get; set; }
    public string? DohLicenseToOperate { get; set; }
    public string? PhilHealthAccreditationNumber { get; set; }

    // Statutory Legal Footer
    public string CustomDisclaimerText { get; set; } =
        "This is an official electronic clinical document generated in compliance with Philippine Health Regulations (RA 8792 & RA 10173). Not valid for medico-legal purposes without authorized seal.";
    public bool ShowSecurityQrCode { get; set; } = true;

    /// <summary>
    /// Validates and normalizes hex color code or returns fallback.
    /// </summary>
    public string GetSafePrimaryColorHex()
    {
        if (string.IsNullOrWhiteSpace(PrimaryColorHex)) return "#0284C7";
        var trimmed = PrimaryColorHex.Trim();
        if (!trimmed.StartsWith("#")) trimmed = "#" + trimmed;
        if (trimmed.Length == 7 && System.Text.RegularExpressions.Regex.IsMatch(trimmed, "^#[0-9A-Fa-f]{6}$"))
            return trimmed;
        return "#0284C7";
    }
}
