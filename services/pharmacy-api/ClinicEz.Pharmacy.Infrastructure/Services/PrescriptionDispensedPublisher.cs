using System.Text.Json;
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
        var to = OrderAddressing.OrderingClinic(order);
        var from = OrderAddressing.Pharmacy(order);
        var correlationId = OrderAddressing.Correlation(order);

        _logger.LogInformation(
            "[PrescriptionDispensedPublisher] Queueing rx.dispensed for Prescription {PrescriptionNo} (Pharmacist {PharmacistName}) to {Recipient}",
            dispensedEvent.PrescriptionNumber, dispensedEvent.DispensingPharmacistName, to.Address);

        var payload = dispensedEvent with
        {
            OrderingTenantId = order.OrderingTenantId,
            OrderingFacilityId = order.OrderingFacilityId,
            PatientId = OrderAddressing.PatientId(order)
        };

        _publisher.Enqueue(InteropTypes.RxDispensed, from, to, correlationId, payload);

        if (OrderAddressing.Patient(order) is { } patient)
        {
            _publisher.Enqueue(
                InteropTypes.PatientDocumentIssued,
                from,
                patient,
                correlationId,
                new PatientDocumentIssuedPayload
                {
                    DocumentId = payload.DispenseId,
                    Kind = PatientDocumentKind.DispenseReceipt,
                    PatientId = order.PatientId,
                    IssuerTenantId = order.TenantId,
                    IssuerFacilityId = order.PharmacyId,
                    IssuerFacilityType = FacilityType.Pharmacy,
                    IssuerName = order.PharmacyName,
                    Title = $"Dispensed prescription {order.PrescriptionNumber}",
                    IssuedAtUtc = payload.DispensedAt,
                    Status = "Dispensed",
                    Body = JsonSerializer.SerializeToElement(payload, InteropJson.Options)
                });
        }
    }
}
