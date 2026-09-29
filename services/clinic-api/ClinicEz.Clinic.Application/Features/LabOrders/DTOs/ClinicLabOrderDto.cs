using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Application.Features.LabOrders.DTOs;

public record ClinicLabOrderItemDto(
    Guid Id,
    string TestName,
    string Category,
    string? Instructions,
    LabOrderStatus Status
);

public record ClinicLabOrderDto(
    Guid Id,
    string TenantId,
    Guid ClinicId,
    string OrderNumber,
    Guid PatientId,
    string PatientName,
    Guid? ConsultationId,
    Guid? OrderedByDoctorId,
    string? OrderedByDoctorName,
    DateTime OrderDate,
    LabOrderStatus Status,
    string? ClinicalDiagnosis,
    string? Notes,
    List<ClinicLabOrderItemDto> Items
);

public record CreateLabOrderItemRequest(
    string TestName,
    string Category,
    string? Instructions
);

public record CreateClinicLabOrderRequest(
    Guid PatientId,
    string PatientName,
    Guid? ConsultationId,
    Guid? OrderedByDoctorId,
    string? OrderedByDoctorName,
    string? ClinicalDiagnosis,
    string? Notes,
    List<CreateLabOrderItemRequest> Items
);
