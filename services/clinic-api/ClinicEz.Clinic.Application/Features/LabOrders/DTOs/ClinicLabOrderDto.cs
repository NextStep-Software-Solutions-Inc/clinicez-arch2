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
    List<ClinicLabOrderItemDto> Items,
    string? PublicUploadToken = null,
    string? PublicUploadUrl = null,
    string? ExternalLabName = null,
    string? ExternalReportUrl = null,
    string? ExternalReportFileBase64 = null,
    string? ExternalReportType = null,
    string? UploadedBy = null,
    string? ObservationsJson = null,
    string? PathologistImpression = null,
    string? VerifiedByPathologist = null,
    string? PathologistPrcLicense = null,
    DateTime? ReportReleasedAt = null
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
    List<CreateLabOrderItemRequest> Items,
    string? TargetFacilityId = null,
    string? TargetTenantId = null
);

public record AttachExternalLabResultRequest(
    string? ExternalLabName,
    string DocumentType, // Photo, PDF
    string? DocumentUrl,
    string? FileBase64,
    string? Notes,
    string UploadedBy = "ClinicStaff",
    string? ContactNumber = null,
    string? PathologistName = null,
    string? PathologistPrcLicense = null
);

public record PublicLabUploadInfoResponse(
    string OrderNumber,
    string PatientInitials,
    int PatientAge,
    string PatientGender,
    string OrderingDoctorName,
    string OrderingFacilityName,
    string? ClinicalDiagnosis,
    List<string> RequestedTests,
    DateTime OrderDate,
    string? DoctorPrcLicense = null,
    DateTime? ExpiresAt = null,
    bool IsExpired = false,
    string? Status = null
);
