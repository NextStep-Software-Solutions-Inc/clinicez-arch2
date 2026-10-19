using System;

namespace ClinicEz.Shared.Licensing;

public record LicenseValidationResult
{
    public bool IsValid { get; init; }
    public FacilityLicensePayload? Payload { get; init; }
    public string? ErrorMessage { get; init; }
    public bool IsExpired { get; init; }
    public bool IsTampered { get; init; }
    public bool IsMissing { get; init; }

    /// <summary>The license has expired but the facility is still inside its read-only grace window (it may read, not write).</summary>
    public bool IsReadOnlyGrace { get; init; }
    public DateTime? ReadOnlyGraceUntilUtc { get; init; }

    public static LicenseValidationResult Success(FacilityLicensePayload payload) =>
        new() { IsValid = true, Payload = payload };

    public static LicenseValidationResult Tampered(string message) =>
        new() { IsValid = false, IsTampered = true, ErrorMessage = message };

    public static LicenseValidationResult Expired(
        FacilityLicensePayload payload,
        string message,
        bool isReadOnlyGrace = false,
        DateTime? readOnlyGraceUntilUtc = null) =>
        new()
        {
            IsValid = false,
            IsExpired = true,
            Payload = payload,
            ErrorMessage = message,
            IsReadOnlyGrace = isReadOnlyGrace,
            ReadOnlyGraceUntilUtc = readOnlyGraceUntilUtc
        };

    public static LicenseValidationResult Missing(string message = "Facility license is missing or unactivated.") =>
        new() { IsValid = false, IsMissing = true, ErrorMessage = message };
}
