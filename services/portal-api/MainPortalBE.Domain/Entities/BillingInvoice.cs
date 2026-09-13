using System;
using MainPortalBE.Domain.Common;

namespace MainPortalBE.Domain.Entities;

public class BillingInvoice : BaseEntity
{
    public Guid TenantId { get; set; }
    public Tenant? Tenant { get; set; }

    public string XenditInvoiceId { get; set; } = string.Empty;
    public string InvoiceNumber { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "PHP";
    public string Status { get; set; } = "Pending"; // Pending, Paid, Failed
    public string PlanSlug { get; set; } = string.Empty;
    public bool IsAnnual { get; set; }
}
