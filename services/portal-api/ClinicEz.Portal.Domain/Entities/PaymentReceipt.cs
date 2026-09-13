using System;
using ClinicEz.Portal.Domain.Common;

namespace ClinicEz.Portal.Domain.Entities;

public class PaymentReceipt : BaseEntity
{
    public Guid TenantId { get; set; }
    public Tenant? Tenant { get; set; }

    public Guid InvoiceId { get; set; }
    public BillingInvoice? Invoice { get; set; }

    public string ReceiptNumber { get; set; } = string.Empty;
    public decimal AmountPaid { get; set; }
    public string Currency { get; set; } = "PHP";
    public DateTime PaidAt { get; set; }
    public DateTime ExpiryDate { get; set; }
    public string PaymentMethod { get; set; } = "E-Wallet";
}
