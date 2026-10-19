namespace ClinicEz.Shared.Licensing;

public interface IFacilityLicenseSigner
{
    /// <summary>
    /// Digitally signs a facility license payload using the authority's private key,
    /// producing a tamper-proof signed license key token.
    /// </summary>
    string SignLicense(FacilityLicensePayload payload);
}
