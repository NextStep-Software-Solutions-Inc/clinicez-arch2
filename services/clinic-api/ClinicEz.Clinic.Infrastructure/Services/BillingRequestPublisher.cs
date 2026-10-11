using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Clinic.Infrastructure.Services;

public sealed class BillingRequestPublisher : IBillingRequestPublisher
{
    private readonly IClinicIdentityProvider _clinicIdentity;
    private readonly IInteropPublisher _publisher;

    public BillingRequestPublisher(IClinicIdentityProvider clinicIdentity, IInteropPublisher publisher)
    {
        _clinicIdentity = clinicIdentity;
        _publisher = publisher;
    }

    public async Task<bool> PublishInvoiceRequestedAsync(BillingInvoiceRequestedPayload request, CancellationToken ct)
    {
        var clinic = await _clinicIdentity.GetAsync(ct);
        if (clinic == null) return false;

        var facilityId = clinic.ClinicId.ToString();
        var payload = request with
        {
            TenantId = clinic.TenantId,
            FacilityId = facilityId,
            FacilityType = FacilityType.Clinic
        };

        _publisher.Enqueue(
            InteropTypes.BillingInvoiceRequested,
            ClinicParties.Clinic(clinic.TenantId, facilityId),
            Party.ForFacility(clinic.TenantId, facilityId, FacilityType.Clinic, InteropServices.Billing),
            payload.InvoiceRequestId,
            payload);
        return true;
    }
}
