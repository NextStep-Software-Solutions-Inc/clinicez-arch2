using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Shared.Interop.Facility;
using ClinicEz.Shared.Licensing;

namespace ClinicEz.Laboratory.Api.Middlewares;

/// <summary>
/// The license state of the laboratory a request belongs to. Tenant and laboratory come from the request scope (signed staff
/// token, or the internal-service headers it resolved), never from a raw client header. Requests with no laboratory
/// (anonymous sign-in, license activation) are not subject to enforcement.
/// </summary>
public sealed class LabLicenseState : FacilityLicenseStateBase
{
    public LabLicenseState(IFacilityLicenseStore store, IFacilityLicenseValidator validator) : base(store, validator)
    {
    }

    protected override (string TenantId, Guid FacilityId)? ResolveFacility(HttpContext context)
    {
        var scope = context.RequestServices.GetRequiredService<ILabContext>();
        return (scope.TenantId ?? string.Empty, scope.LaboratoryId ?? Guid.Empty);
    }
}
