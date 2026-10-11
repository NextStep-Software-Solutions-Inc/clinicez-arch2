using System;
using ClinicEz.Portal.Domain.Common;

namespace ClinicEz.Portal.Domain.Entities;

/// <summary>
/// Workspace finance rollup, one row per facility, day and invoice source type. Totals only: invoices carry no patient data
/// when they reach the portal. Built from <c>billing.invoice.paid</c> and corrected by <c>billing.invoice.voided</c>.
/// </summary>
public class FinanceDailySummary : BaseEntity
{
    public Guid TenantId { get; set; }
    public Guid FacilityId { get; set; }
    public Guid? BranchId { get; set; }
    public DateOnly Day { get; set; }
    public string SourceType { get; set; } = string.Empty;
    public string Currency { get; set; } = "PHP";
    public decimal TotalPaid { get; set; }
    public decimal TotalReversed { get; set; }
    public int PaidInvoiceCount { get; set; }
    public int ReversedInvoiceCount { get; set; }
}

/// <summary>Idempotency record: what the rollup already took from an invoice, so redelivered or repeated messages never double count.</summary>
public class FinanceInvoiceRecord : BaseEntity
{
    public Guid InvoiceId { get; set; }
    public Guid TenantId { get; set; }
    public Guid FacilityId { get; set; }
    public Guid? BranchId { get; set; }
    public DateOnly PaidDay { get; set; }
    public string SourceType { get; set; } = string.Empty;
    public string Currency { get; set; } = "PHP";
    public decimal PaidAmount { get; set; }
    public decimal ReversedAmount { get; set; }
    public bool Reversed { get; set; }
}
