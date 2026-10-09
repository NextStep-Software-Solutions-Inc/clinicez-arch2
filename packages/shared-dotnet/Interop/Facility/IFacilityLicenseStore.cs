using ClinicEz.Shared.Licensing;

namespace ClinicEz.Shared.Interop.Facility;

/// <summary>The license a service currently holds for one facility. <see cref="LicenseToken"/> is null before activation.</summary>
public sealed record HeldFacilityLicense(string? LicenseToken, int EntitlementVersion);

/// <summary>
/// A replacement license that has already been signature-checked and bound to the facility. <see cref="License"/> is the
/// verified payload (every value in it is signed, so a store should take plan, limits, features and expiry from it
/// rather than from the unsigned message fields).
/// </summary>
public sealed record FacilityLicenseUpdate(string LicenseToken, FacilityLicensePayload License);

/// <summary>
/// Per-service persistence of the license a facility holds. This is the ONLY thing a service implements to take part in
/// <c>entitlements.changed</c> handling and read-only grace enforcement.
/// </summary>
public interface IFacilityLicenseStore
{
    /// <summary>
    /// The license held for the facility, or null when this service does not hold that facility (wrong tenant, wrong type,
    /// not provisioned here). Must not depend on an ambient request scope: look the facility up by the two ids given.
    /// </summary>
    Task<HeldFacilityLicense?> GetAsync(string tenantId, Guid facilityId, CancellationToken ct);

    /// <summary>
    /// Replaces the stored license and the settings derived from it (plan, limits, features, expiry, entitlement version)
    /// and COMMITS the change before returning. Only called with an update that passed verification and is not older
    /// than the held license.
    /// </summary>
    Task SaveAsync(string tenantId, Guid facilityId, FacilityLicenseUpdate update, CancellationToken ct);
}
