using System;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Clinic.Infrastructure.Services;

public class LabRequisitionPublisher : ILabRequisitionPublisher
{
    private readonly IInteropPublisher _publisher;

    public LabRequisitionPublisher(IInteropPublisher publisher) => _publisher = publisher;

    public void PublishRequisitionIssued(LabRequisitionIssuedEvent requisitionEvent)
    {
        var to = ClinicParties.Target(
            requisitionEvent.TargetTenantId, requisitionEvent.TargetFacilityId, FacilityType.Laboratory, "laboratory");

        _publisher.Enqueue(
            InteropTypes.LabOrderIssued,
            ClinicParties.Clinic(requisitionEvent.TenantId, requisitionEvent.OrderingFacilityId),
            to,
            requisitionEvent.RequisitionId,
            requisitionEvent);
    }
}
