using ClinicEz.Billing.Domain.Enums;
using ClinicEz.Shared.Common;

namespace ClinicEz.Billing.Domain.Entities;

/// <summary>
/// Money taken at a counter. One payment may be allocated over several invoices of the same visit (different
/// facilities), and always produces exactly one official receipt numbered per counter facility.
/// </summary>
public class Payment
{
    public Guid Id { get; set; }
    public string TenantId { get; set; } = string.Empty;
    /// <summary>The counter (facility) where the payment was taken and whose receipt book it belongs to.</summary>
    public string FacilityId { get; set; } = string.Empty;
    public string? BranchId { get; set; }
    public string PatientName { get; set; } = string.Empty;
    public PaymentMethod Method { get; set; }
    public InsurerKind? InsurerKind { get; set; }
    /// <summary>Insurance (PhilHealth / HMO) is settled outside the counter: it clears invoices but never touches the cash drawer.</summary>
    public bool IsExternal { get; set; }
    public string Currency { get; set; } = Money.DefaultCurrency;
    /// <summary>Amount applied to invoices.</summary>
    public decimal Amount { get; set; }
    /// <summary>Cash handed over by the customer (cash only); <see cref="Change"/> is <c>Tendered - Amount</c>.</summary>
    public decimal? Tendered { get; set; }
    public decimal Change { get; set; }
    public string? Reference { get; set; }
    public Guid CashierUserId { get; set; }
    public string CashierName { get; set; } = string.Empty;
    public Guid ShiftId { get; set; }
    public DateTime PaidAtUtc { get; set; }
    public string IdempotencyKey { get; set; } = string.Empty;
    /// <summary>Hash of the request that created the payment, so a reused key with a different request is rejected.</summary>
    public string RequestHash { get; set; } = string.Empty;
    public Guid ReceiptId { get; set; }

    public List<PaymentAllocation> Allocations { get; set; } = new();
}

public class PaymentAllocation
{
    public Guid Id { get; set; }
    public string TenantId { get; set; } = string.Empty;
    public Guid PaymentId { get; set; }
    public Guid InvoiceId { get; set; }
    /// <summary>Facility that issued the invoice (may differ from the counter facility).</summary>
    public string InvoiceFacilityId { get; set; } = string.Empty;
    public FacilityType InvoiceFacilityType { get; set; }
    public string? BranchId { get; set; }
    public decimal Amount { get; set; }
}

/// <summary>Official receipt. The number is sequential per counter facility (<c>OR-000001</c>); printable data is built from the payment.</summary>
public class Receipt
{
    public Guid Id { get; set; }
    public string TenantId { get; set; } = string.Empty;
    public string FacilityId { get; set; } = string.Empty;
    public int Sequence { get; set; }
    public string Number { get; set; } = string.Empty;
    public Guid PaymentId { get; set; }
    public DateTime IssuedAtUtc { get; set; }
}

/// <summary>A full refund of what was paid on one invoice, approved by a supervisor.</summary>
public class Refund
{
    public Guid Id { get; set; }
    public string TenantId { get; set; } = string.Empty;
    public string FacilityId { get; set; } = string.Empty;
    public Guid InvoiceId { get; set; }
    public string? BranchId { get; set; }
    public string Currency { get; set; } = Money.DefaultCurrency;
    public decimal Amount { get; set; }
    public PaymentMethod Method { get; set; }
    public string Reason { get; set; } = string.Empty;
    public Guid ApprovedByUserId { get; set; }
    public string ApprovedByName { get; set; } = string.Empty;
    public Guid? ShiftId { get; set; }
    /// <summary>Facility that issued the refunded invoice (may differ from the counter facility).</summary>
    public string InvoiceFacilityId { get; set; } = string.Empty;
    public DateTime RefundedAtUtc { get; set; }
}
