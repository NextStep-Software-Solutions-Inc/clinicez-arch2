using ClinicEz.Billing.Application.Abstractions;
using ClinicEz.Shared.Interop.Facility;
using ClinicEz.Shared.Licensing;

namespace ClinicEz.Billing.Api.Middlewares;

public sealed class BillingLicenseState : FacilityLicenseStateBase
{
    public BillingLicenseState(IFacilityLicenseStore store, IFacilityLicenseValidator validator) : base(store, validator)
    {
    }

    protected override (string TenantId, Guid FacilityId)? ResolveFacility(HttpContext context)
    {
        var billing = context.RequestServices.GetRequiredService<IBillingContext>();
        if (billing.TryGetStaff() is { } caller && Guid.TryParse(caller.FacilityId, out var facilityGuid))
        {
            return (caller.TenantId, facilityGuid);
        }
        return null;
    }
}
