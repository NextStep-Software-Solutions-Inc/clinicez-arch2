using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Shared.Interop.Facility;
using ClinicEz.Shared.Licensing;

namespace ClinicEz.Pharmacy.Api.Middleware;

/// <summary>
/// The license state of the pharmacy a request belongs to. The pharmacy comes from the request scope that
/// <c>PharmacyScopeMiddleware</c> established (signed staff token, or the internal-service headers it resolved), never from a
/// raw client header. Requests with no pharmacy (anonymous sign-in, license activation) are not subject to enforcement.
/// </summary>
public sealed class PharmacyLicenseState : FacilityLicenseStateBase
{
    public PharmacyLicenseState(IFacilityLicenseStore store, IFacilityLicenseValidator validator) : base(store, validator)
    {
    }

    protected override (string TenantId, Guid FacilityId)? ResolveFacility(HttpContext context)
    {
        var scope = context.RequestServices.GetRequiredService<IPharmacyContext>();
        return (scope.TenantId, scope.PharmacyId);
    }
}
