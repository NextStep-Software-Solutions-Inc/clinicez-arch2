using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Application.Features.Billing.DTOs;

public record InvoiceLineItemDto(
    Guid Id,
    Guid? ServiceItemId,
    string? ItemCode,
    string Description,
    string Category,
    decimal UnitPrice,
    int Quantity,
    decimal TotalPrice
);

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
    string? AttendingDoctorName,
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
    Guid? ServiceItemId,
    string? ItemCode,
    string Description,
    string Category,
    decimal UnitPrice,
    int Quantity
);

public record CreateInvoiceRequest(
    Guid PatientId,
    string PatientName,
    Guid? QueueItemId,
    Guid? AppointmentId,
    Guid? ConsultationId,
    Guid? AttendingDoctorId,
    string? AttendingDoctorName,
    DiscountType DiscountType,
    string? DiscountIdNumber,
    decimal? CustomDiscountPercentage,
    string? Notes,
    List<CreateInvoiceLineItemRequest> LineItems
);

public record RecordPaymentRequest(
    decimal Amount,
    PaymentMethod Method,
    string? ReferenceNumber,
    string? Notes
);
