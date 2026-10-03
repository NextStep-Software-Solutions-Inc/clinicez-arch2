using System;

namespace ClinicEz.Shared.Licensing;

public interface IFacilityLicenseValidator
{
    /// <summary>
    /// Cryptographically validates the facility license token, verifying its asymmetric signature,
    /// bound facility ID, tenant ID, and expiration date.
    /// </summary>
    LicenseValidationResult Validate(string? licenseToken, Guid expectedFacilityId, string? expectedTenantId = null);
}
