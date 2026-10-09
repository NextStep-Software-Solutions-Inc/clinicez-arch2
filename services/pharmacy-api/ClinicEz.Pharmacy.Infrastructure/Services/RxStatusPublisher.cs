using ClinicEz.Pharmacy.Application.Common.Interfaces;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Pharmacy.Infrastructure.Services;

public sealed class RxStatusPublisher : IRxStatusPublisher
{
    private readonly IInteropPublisher _publisher;
    private readonly ILogger<RxStatusPublisher> _logger;

    public RxStatusPublisher(IInteropPublisher publisher, ILogger<RxStatusPublisher> logger)
    {
        _publisher = publisher;
        _logger = logger;
    }

    public void EnqueueStatusChanged(PrescriptionOrder order, RxStage stage, string? reason = null)
    {
        var clinic = OrderAddressing.OrderingClinic(order);
        var from = OrderAddressing.Pharmacy(order);
        var correlationId = OrderAddressing.Correlation(order);

        var payload = new RxStatusChangedPayload
        {
            PrescriptionId = order.ExternalPrescriptionId != Guid.Empty ? order.ExternalPrescriptionId : correlationId,
            OrderingTenantId = order.OrderingTenantId,
            OrderingFacilityId = order.OrderingFacilityId,
            PatientId = OrderAddressing.PatientId(order),
            PharmacyTenantId = order.TenantId,
            PharmacyFacilityId = order.PharmacyId,
            PharmacyName = order.PharmacyName,
            Stage = stage,
            QuotedAmount = order.QuotedAmount,
            Reason = reason
        };

        _logger.LogInformation(
            "[RxStatusPublisher] Queueing rx.status.changed ({Stage}) for Prescription {PrescriptionNo} to {Recipient}",
            stage, order.PrescriptionNumber, clinic.Address);

        _publisher.Enqueue(InteropTypes.RxStatusChanged, from, clinic, correlationId, payload);

        if (OrderAddressing.Patient(order) is { } patient)
        {
            _publisher.Enqueue(InteropTypes.RxStatusChanged, from, patient, correlationId, payload);
        }
    }
}
