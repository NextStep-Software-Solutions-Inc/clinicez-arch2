using System.Text.Json;
using ClinicEz.Pharmacy.Application.Common.Interfaces;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
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

        if (order.PatientId != Guid.Empty)
        {
            var grantId = CommsGrantIdGenerator.Create(order.TenantId, order.PharmacyId.ToString(), "Prescription", order.Id.ToString());
            var commsTo = Party.ForFacility(order.TenantId, order.PharmacyId.ToString(), FacilityType.Pharmacy, service: InteropServices.Comms);
            var grantPayload = new CommsEligibilityGrantedPayload(
                GrantId: grantId,
                TenantId: order.TenantId,
                FacilityId: order.PharmacyId.ToString(),
                FacilityType: "Pharmacy",
                PatientId: order.PatientId,
                ContextType: "Prescription",
                ContextId: order.Id.ToString(),
                WindowStartUtc: DateTime.UtcNow,
                WindowEndUtc: DateTime.UtcNow.AddDays(14),
                Version: 1);
            _publisher.Enqueue(InteropTypes.CommsEligibilityGranted, from, commsTo, correlationId: grantId, grantPayload);
        }
    }
}
