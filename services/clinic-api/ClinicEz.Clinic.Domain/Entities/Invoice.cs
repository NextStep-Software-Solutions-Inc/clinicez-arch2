using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class Invoice : BaseEntity
{
    public string? TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public required string InvoiceNumber { get; set; }
    public DateTime InvoiceDate { get; set; } = DateTime.UtcNow;

    public Guid PatientId { get; set; }
    public required string PatientName { get; set; }
    public Guid? QueueItemId { get; set; }
    public Guid? AppointmentId { get; set; }
    public Guid? ConsultationId { get; set; }
    public Guid? AttendingDoctorId { get; set; }
    public string? AttendingDoctorName { get; set; }

    public decimal GrossAmount { get; set; }
    public DiscountType DiscountType { get; set; } = DiscountType.None;
    public string? DiscountIdNumber { get; set; } // Senior OSCA ID / PWD ID
    public decimal DiscountPercentage { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal NetAmount { get; set; }
    public decimal AmountPaid { get; set; }
    public decimal BalanceDue { get; set; }

    public InvoiceStatus Status { get; set; } = InvoiceStatus.Draft;
    public string? Notes { get; set; }
    public Guid? BilledByStaffId { get; set; }
    public string? BilledByStaffName { get; set; }

    /// <summary>
    /// Set when the invoice was requested to the shared billing counter (<c>billing.invoice.requested</c>). From then on the
    /// counter owns the collection and a local cashier payment would charge the patient twice.
    /// </summary>
    public DateTime? BillingRequestedAt { get; set; }

    public List<InvoiceLineItem> LineItems { get; set; } = new();
    public List<PaymentRecord> Payments { get; set; } = new();
}

public sealed class InvoiceLineItem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid InvoiceId { get; set; }
    public Guid? ServiceItemId { get; set; }
    public string? ItemCode { get; set; }
    public required string Description { get; set; }
    public required string Category { get; set; }
    public decimal UnitPrice { get; set; }
    public int Quantity { get; set; } = 1;
    public decimal TotalPrice { get; set; }
}

public sealed class PaymentRecord : BaseEntity
{
    public Guid InvoiceId { get; set; }
    public string? TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public required string PaymentNumber { get; set; }
    public DateTime PaymentDate { get; set; } = DateTime.UtcNow;
    public decimal Amount { get; set; }
    public PaymentMethod Method { get; set; } = PaymentMethod.Cash;
    public string? ReferenceNumber { get; set; }
    public Guid? ReceivedByStaffId { get; set; }
    public string? ReceivedByStaffName { get; set; }
    public string? Notes { get; set; }
}
