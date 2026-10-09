using ClinicEz.Billing.Domain.Entities;
using ClinicEz.Billing.Domain.Enums;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Billing.Application.Interop;

/// <summary>
/// Builds and enqueues every message billing-api sends. Always call BEFORE the business <c>SaveChanges</c> so the outbox rows
/// commit atomically with the change that caused them.
/// <list type="bullet">
/// <item><c>billing.payment.confirmed</c> to the facility that requested the invoice (From = that facility's billing party,
/// To = the facility itself, CorrelationId = InvoiceRequestId). Walk-in invoices have no requesting service and send nothing.</item>
/// <item><c>billing.invoice.paid</c> (no PHI) to the portal when an invoice becomes fully paid.</item>
/// <item><c>billing.invoice.voided</c> to the requesting facility, and to the portal when a fully paid invoice is refunded.</item>
/// </list>
/// </summary>
public static class BillingMessages
{
    public static Party BillingParty(Invoice invoice) =>
        Party.ForFacility(invoice.TenantId, invoice.FacilityId, invoice.FacilityType, InteropServices.Billing);

    public static Party FacilityParty(Invoice invoice) =>
        Party.ForFacility(invoice.TenantId, invoice.FacilityId, invoice.FacilityType);

    private static bool SendsToFacility(Invoice invoice) => invoice.Origin == InvoiceOrigin.Requested && invoice.InvoiceRequestId is not null;

    public static void PaymentConfirmed(IInteropPublisher publisher, Invoice invoice, Payment? payment, string? receiptNumber, DateTime nowUtc)
    {
        if (!SendsToFacility(invoice)) return;

        publisher.Enqueue(
            InteropTypes.BillingPaymentConfirmed,
            BillingParty(invoice),
            FacilityParty(invoice),
            invoice.InvoiceRequestId!.Value,
            new BillingPaymentConfirmedPayload
            {
                InvoiceRequestId = invoice.InvoiceRequestId.Value,
                InvoiceId = invoice.Id,
                SourceType = invoice.SourceType,
                SourceId = invoice.SourceId,
                AmountDue = invoice.Total,
                AmountPaid = invoice.NetPaid,
                FullyPaid = invoice.Status == InvoiceStatus.Paid,
                PaymentMethod = payment?.Method.ToString(),
                ReceiptNumber = receiptNumber,
                PaidAtUtc = nowUtc
            });
    }

    public static void InvoicePaid(IInteropPublisher publisher, Invoice invoice, DateTime nowUtc)
    {
        if (invoice.Total <= 0m) return;

        publisher.Enqueue(
            InteropTypes.BillingInvoicePaid,
            BillingParty(invoice),
            Party.Portal,
            invoice.Id,
            new BillingInvoicePaidPayload
            {
                TenantId = invoice.TenantId,
                FacilityId = invoice.FacilityId,
                FacilityType = invoice.FacilityType,
                BranchId = invoice.BranchId,
                InvoiceId = invoice.Id,
                SourceType = invoice.SourceType,
                Total = invoice.Total,
                Currency = invoice.Currency,
                PaidAtUtc = nowUtc
            });
    }

    public static void Voided(IInteropPublisher publisher, Invoice invoice, BillingCorrectionKind kind, decimal amountReversed, bool wasFullyPaid, DateTime nowUtc)
    {
        var payload = new BillingInvoiceVoidedPayload
        {
            TenantId = invoice.TenantId,
            FacilityId = invoice.FacilityId,
            FacilityType = invoice.FacilityType,
            BranchId = invoice.BranchId,
            InvoiceId = invoice.Id,
            InvoiceRequestId = invoice.InvoiceRequestId,
            SourceType = invoice.SourceType,
            SourceId = invoice.SourceId,
            Kind = kind,
            Total = invoice.Total,
            AmountReversed = amountReversed,
            WasFullyPaid = wasFullyPaid,
            Currency = invoice.Currency,
            CorrectedAtUtc = nowUtc
        };

        if (SendsToFacility(invoice))
        {
            publisher.Enqueue(InteropTypes.BillingInvoiceVoided, BillingParty(invoice), FacilityParty(invoice), invoice.InvoiceRequestId!.Value, payload);
        }

        // The rollup only ever heard about fully paid invoices, so only those need correcting there.
        if (wasFullyPaid)
        {
            publisher.Enqueue(InteropTypes.BillingInvoiceVoided, BillingParty(invoice), Party.Portal, invoice.Id, payload);
        }
    }
}
