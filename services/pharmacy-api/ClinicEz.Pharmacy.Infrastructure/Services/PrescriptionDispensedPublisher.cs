using ClinicEz.Pharmacy.Application.Common.Interfaces;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Pharmacy.Infrastructure.Services;

public class PrescriptionDispensedPublisher : IPrescriptionDispensedPublisher
{
    private readonly IInteropPublisher _publisher;
    private readonly ILogger<PrescriptionDispensedPublisher> _logger;

    public PrescriptionDispensedPublisher(IInteropPublisher publisher, ILogger<PrescriptionDispensedPublisher> logger)
    {
        _publisher = publisher;
        _logger = logger;
    }

    public void Enqueue(PrescriptionOrder order, PrescriptionDispensedEvent dispensedEvent)
    {
        if (string.IsNullOrWhiteSpace(order.OrderingTenantId) || string.IsNullOrWhiteSpace(order.OrderingFacilityId))
        {
            throw new InvalidOperationException(
                $"Prescription '{order.PrescriptionNumber}' has no ordering clinic recorded, so its dispense cannot be addressed.");
        }

        var from = Party.ForFacility(order.TenantId, order.PharmacyId, FacilityType.Pharmacy);
        var to = Party.ForFacility(order.OrderingTenantId, order.OrderingFacilityId, FacilityType.Clinic);
        var correlationId = order.CorrelationId != Guid.Empty ? order.CorrelationId : order.ExternalPrescriptionId;

        _logger.LogInformation(
            "[PrescriptionDispensedPublisher] Queueing rx.dispensed for Prescription {PrescriptionNo} (Pharmacist {PharmacistName}) to {Recipient}",
            dispensedEvent.PrescriptionNumber, dispensedEvent.DispensingPharmacistName, to.Address);

        _publisher.Enqueue(
            InteropTypes.RxDispensed,
            from,
            to,
            correlationId,
            dispensedEvent with
            {
                OrderingTenantId = order.OrderingTenantId,
                OrderingFacilityId = order.OrderingFacilityId,
                PatientId = order.PatientId
            });
    }
}
