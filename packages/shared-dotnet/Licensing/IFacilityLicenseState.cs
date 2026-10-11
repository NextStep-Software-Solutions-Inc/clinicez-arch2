using ClinicEz.Shared.Interop.Facility;
using Microsoft.AspNetCore.Http;

namespace ClinicEz.Shared.Licensing;

/// <summary>
/// The license state of the facility a request is for. Implemented once per service (see
/// <see cref="FacilityLicenseStateBase"/>); <see cref="ReadOnlyGraceMiddleware"/> enforces it.
/// </summary>
public interface IFacilityLicenseState
{
    /// <summary>
    /// The validated license of the request's facility, or null when the request is not for a known facility (anonymous or
    /// unscoped calls): such requests are not subject to license enforcement here.
    /// </summary>
    Task<LicenseValidationResult?> GetAsync(HttpContext context, CancellationToken ct);
}

/// <summary>
/// Standard <see cref="IFacilityLicenseState"/>: finds the request's facility, reads the held license from the service's
/// <see cref="IFacilityLicenseStore"/> and verifies it. A service only says which facility a request belongs to.
/// </summary>
public abstract class FacilityLicenseStateBase : IFacilityLicenseState
{
    private readonly IFacilityLicenseStore _store;
    private readonly IFacilityLicenseValidator _validator;

    protected FacilityLicenseStateBase(IFacilityLicenseStore store, IFacilityLicenseValidator validator)
    {
        _store = store;
        _validator = validator;
    }

    /// <summary>The authenticated facility of the request, or null when there is none. Take it from the verified session, never from a header.</summary>
    protected abstract (string TenantId, Guid FacilityId)? ResolveFacility(HttpContext context);

    public async Task<LicenseValidationResult?> GetAsync(HttpContext context, CancellationToken ct)
    {
        if (ResolveFacility(context) is not { } facility
            || string.IsNullOrWhiteSpace(facility.TenantId)
            || facility.FacilityId == Guid.Empty)
        {
            return null;
        }

        var held = await _store.GetAsync(facility.TenantId, facility.FacilityId, ct);
        return held is null ? null : _validator.Validate(held.LicenseToken, facility.FacilityId, facility.TenantId);
    }
}
