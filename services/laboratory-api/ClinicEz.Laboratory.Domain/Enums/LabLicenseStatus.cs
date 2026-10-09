namespace ClinicEz.Laboratory.Domain.Enums;

/// <summary>Where a laboratory stands with its facility license.</summary>
public enum LabLicenseStatus
{
    /// <summary>A valid license is applied.</summary>
    Active,

    /// <summary>No license has been applied yet; the laboratory cannot sign in.</summary>
    ActivationRequired,

    /// <summary>The license ran out; the laboratory works read-only during the grace period.</summary>
    Expired,

    /// <summary>The license failed signature verification.</summary>
    Tampered
}
