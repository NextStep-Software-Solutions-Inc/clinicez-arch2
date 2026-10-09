using System;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Clinic.Infrastructure.Services;

public class PrescriptionPublisher : IPrescriptionPublisher
{
    private readonly IInteropPublisher _publisher;

    public PrescriptionPublisher(IInteropPublisher publisher) => _publisher = publisher;

    public void PublishPrescriptionIssued(PrescriptionIssuedEvent prescriptionEvent)
    {
        var to = ClinicParties.Target(
            prescriptionEvent.TargetPharmacyTenantId, prescriptionEvent.TargetPharmacyFacilityId, FacilityType.Pharmacy, "pharmacy");

        _publisher.Enqueue(
            InteropTypes.RxIssued,
            ClinicParties.Clinic(prescriptionEvent.TenantId, prescriptionEvent.OrderingFacilityId),
            to,
            prescriptionEvent.PrescriptionId,
            prescriptionEvent);
    }
}
