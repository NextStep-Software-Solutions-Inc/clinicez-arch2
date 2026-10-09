using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Interop.Facility;
using ClinicEz.Shared.LocalAuth;
using ClinicEz.Shared.Licensing;

namespace ClinicEz.Clinic.Api.Middlewares;

/// <summary>
/// The license state of the clinic a staff request belongs to. Tenant and clinic come from the clinic scope of the signed
/// staff token, never from a raw client header (<c>X-Clinic-Id</c> is only a workspace hint for anonymous callers). Requests
/// that are not a staff session (anonymous sign-in, license activation, public patient endpoints, trusted internal
/// services) are not subject to enforcement.
/// </summary>
public sealed class ClinicLicenseState : FacilityLicenseStateBase
{
    public ClinicLicenseState(IFacilityLicenseStore store, IFacilityLicenseValidator validator) : base(store, validator)
    {
    }

    protected override (string TenantId, Guid FacilityId)? ResolveFacility(HttpContext context)
    {
        var user = context.User;
        if (user.Identity?.IsAuthenticated != true || user.HasClaim(FacilityAuthSchemes.InternalClaim, "true"))
        {
            return null;
        }

        var scope = context.RequestServices.GetRequiredService<IClinicContext>();
        return (scope.TenantId, scope.ClinicId);
    }
}
