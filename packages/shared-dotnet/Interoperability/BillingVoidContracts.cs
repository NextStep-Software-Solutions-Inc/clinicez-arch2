using System.Text.Json.Serialization;
using System;
using ClinicEz.Shared.Common;

namespace ClinicEz.Shared.Interoperability;

// ---------------------------------------------------------------------------------------------
// Billing corrections (per-cell cashiering). Sent by billing-api when an invoice is voided (nothing paid)
// or refunded (payment reversed), as `billing.invoice.voided`.
//   billing -> facility that requested the invoice: To = Party.ForFacility(tenantId, facilityId, facilityType),
//     From = the same facility party with Service=billing, CorrelationId = InvoiceRequestId (only for invoices
//     that came from a `billing.invoice.requested` message; walk-in invoices have no requesting service).
//   billing -> portal (finance rollup, NO PHI): To = Party.Portal, same payload, CorrelationId = InvoiceId.
// ---------------------------------------------------------------------------------------------

[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum BillingCorrectionKind { Void, Refund }

public record BillingInvoiceVoidedPayload
{
    public string TenantId { get; init; } = string.Empty;
    public string FacilityId { get; init; } = string.Empty;
    public FacilityType FacilityType { get; init; }
    public string? BranchId { get; init; }
    public Guid InvoiceId { get; init; }
    public Guid? InvoiceRequestId { get; init; }
    public string SourceType { get; init; } = string.Empty;
    public Guid SourceId { get; init; }
    public BillingCorrectionKind Kind { get; init; }
    /// <summary>Invoice total at the time of the correction.</summary>
    public decimal Total { get; init; }
    /// <summary>Money given back: 0 for a void of an unpaid invoice, the amount paid for a refund. Subtract it from the rollup.</summary>
    public decimal AmountReversed { get; init; }
    /// <summary>True when the invoice had been fully paid (and therefore had been reported with <c>billing.invoice.paid</c>).</summary>
    public bool WasFullyPaid { get; init; }
    public string Currency { get; init; } = "PHP";
    public DateTime CorrectedAtUtc { get; init; } = DateTime.UtcNow;
}
