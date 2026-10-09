using ClinicEz.Pharmacy.Application.Common.Interfaces;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Enums;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Pharmacy.Infrastructure.Services;

public sealed class PharmacyBillingPublisher : IPharmacyBillingPublisher
{
    private const string SourceType = "Prescription";

    private readonly IInteropPublisher _publisher;
    private readonly ILogger<PharmacyBillingPublisher> _logger;

    public PharmacyBillingPublisher(IInteropPublisher publisher, ILogger<PharmacyBillingPublisher> logger)
    {
        _publisher = publisher;
        _logger = logger;
    }

    public void EnqueueInvoiceRequest(PrescriptionOrder order)
    {
        var lines = order.Items
            .Where(i => i.Status != ItemDispenseStatus.Rejected)
            .Select(i => new BillingLineDto
            {
                Code = (i.InventoryItemId ?? i.Id).ToString(),
                Description = string.Join(' ', new[] { i.GenericName, i.Dosage, i.Form }.Where(s => !string.IsNullOrWhiteSpace(s))),
                Quantity = i.QuantityPrescribed,
                UnitPrice = i.UnitPrice
            })
            .ToList();

        var payload = new BillingInvoiceRequestedPayload
        {
            InvoiceRequestId = order.Id,
            TenantId = order.TenantId,
            FacilityId = order.PharmacyId,
            FacilityType = FacilityType.Pharmacy,
            BranchId = order.BranchId,
            PatientId = OrderAddressing.PatientId(order),
            PatientName = order.PatientName,
            VisitKey = order.VisitKey,
            SourceType = SourceType,
            SourceId = order.Id,
            Lines = lines
        };

        var to = OrderAddressing.PharmacyBilling(order);
        _logger.LogInformation(
            "[PharmacyBillingPublisher] Queueing billing.invoice.requested for Prescription {PrescriptionNo} ({LineCount} line(s)) to {Recipient}",
            order.PrescriptionNumber, lines.Count, to.Address);

        _publisher.Enqueue(InteropTypes.BillingInvoiceRequested, OrderAddressing.Pharmacy(order), to, order.Id, payload);
    }
}
