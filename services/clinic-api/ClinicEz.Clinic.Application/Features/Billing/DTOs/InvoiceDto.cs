using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Application.Features.Billing.DTOs;

[method: JsonConstructor]
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
    public InvoiceLineItemDto()
        : this(Guid.Empty, null, null, null, null, string.Empty, string.Empty, 0m, 1, 0m)
    {
    }

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

[method: JsonConstructor]
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
    public CreateInvoiceLineItemRequest()
        : this(null, null, null, null, string.Empty, string.Empty, 0m, 1)
    {
    }

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

[method: JsonConstructor]
public record CreateInvoiceRequest(
    Guid? PatientId = null,
    string? PatientName = null,
    Guid? QueueItemId = null,
    Guid? AppointmentId = null,
    Guid? ConsultationId = null,
    Guid? AttendingDoctorId = null,
    DiscountType DiscountType = DiscountType.None,
    string? DiscountIdNumber = null,
    decimal? CustomDiscountPercentage = null,
    string? Notes = null,
    List<CreateInvoiceLineItemRequest>? LineItems = null,
    bool AllowDuplicate = false,
    bool IsWalkInRetail = false,
    string? WalkInCustomerName = null,
    VisitType? VisitType = null
)
{
    public CreateInvoiceRequest(
        Guid patientId,
        string patientName,
        Guid? queueItemId,
        Guid? appointmentId,
        Guid? consultationId,
        Guid? attendingDoctorId,
        DiscountType discountType,
        string? discountIdNumber,
        decimal? customDiscountPercentage,
        string? notes,
        List<CreateInvoiceLineItemRequest> lineItems,
        bool allowDuplicate = false)
        : this(
            patientId,
            patientName,
            queueItemId,
            appointmentId,
            consultationId,
            attendingDoctorId,
            discountType,
            discountIdNumber,
            customDiscountPercentage,
            notes,
            lineItems,
            allowDuplicate,
            false,
            null,
            null)
    {
    }
}

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
