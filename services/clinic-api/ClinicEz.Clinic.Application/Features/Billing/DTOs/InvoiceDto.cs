using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Application.Features.Billing.DTOs;

public record InvoiceLineItemDto(
    Guid Id,
    Guid? DoctorId,
    string? DoctorName,
    Guid? ServiceItemId,
    string? ItemCode,
    string Description,
    string Category,
    decimal UnitPrice,
    int Quantity,
    decimal TotalPrice
)
{
    public InvoiceLineItemDto(
        Guid id,
        Guid? serviceItemId,
        string? itemCode,
        string description,
        string category,
        decimal unitPrice,
        int quantity,
        decimal totalPrice)
        : this(id, null, null, serviceItemId, itemCode, description, category, unitPrice, quantity, totalPrice)
    {
    }
}

public record PaymentRecordDto(
    Guid Id,
    string PaymentNumber,
    DateTime PaymentDate,
    decimal Amount,
    PaymentMethod Method,
    string? ReferenceNumber,
    string? ReceivedByStaffName,
    string? Notes
);

public record InvoiceDto(
    Guid Id,
    string TenantId,
    Guid ClinicId,
    string InvoiceNumber,
    DateTime InvoiceDate,
    Guid PatientId,
    string PatientName,
    Guid? QueueItemId,
    Guid? AppointmentId,
    Guid? ConsultationId,
    Guid? AttendingDoctorId,
    decimal GrossAmount,
    DiscountType DiscountType,
    string? DiscountIdNumber,
    decimal DiscountPercentage,
    decimal DiscountAmount,
    decimal NetAmount,
    decimal AmountPaid,
    decimal BalanceDue,
    InvoiceStatus Status,
    string? Notes,
    string? BilledByStaffName,
    List<InvoiceLineItemDto> LineItems,
    List<PaymentRecordDto> Payments
);

public record CreateInvoiceLineItemRequest(
    Guid? DoctorId,
    string? DoctorName,
    Guid? ServiceItemId,
    string? ItemCode,
    string Description,
    string Category,
    decimal UnitPrice,
    int Quantity
)
{
    public CreateInvoiceLineItemRequest(
        Guid? serviceItemId,
        string? itemCode,
        string description,
        string category,
        decimal unitPrice,
        int quantity)
        : this(null, null, serviceItemId, itemCode, description, category, unitPrice, quantity)
    {
    }
}

public record CreateInvoiceRequest(
    Guid PatientId,
    string PatientName,
    Guid? QueueItemId,
    Guid? AppointmentId,
    Guid? ConsultationId,
    Guid? AttendingDoctorId,
    DiscountType DiscountType,
    string? DiscountIdNumber,
    decimal? CustomDiscountPercentage,
    string? Notes,
    List<CreateInvoiceLineItemRequest> LineItems,
    bool AllowDuplicate = false
);

public record RecordPaymentRequest(
    decimal Amount,
    PaymentMethod Method,
    string? ReferenceNumber,
    string? Notes
);

public record InvoicePreviewRequest(
    Guid? PatientId,
    string PatientName,
    string? QueueNumber,
    string? DoctorPrcLicense,
    DiscountType DiscountType,
    string? DiscountIdNumber,
    List<CreateInvoiceLineItemRequest> LineItems,
    string? Notes
);
