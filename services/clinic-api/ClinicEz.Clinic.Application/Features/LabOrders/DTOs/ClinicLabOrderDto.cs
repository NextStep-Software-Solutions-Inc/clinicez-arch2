using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Clinic.Application.Features.LabOrders.DTOs;

public record ClinicLabOrderItemDto(
    Guid Id,
    string TestName,
    string Category,
    string? Instructions,
    LabOrderStatus Status
);

public record ClinicLabResultSummaryDto(
    Guid Id,
    ResultSource Source,
    VerificationState VerificationState
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
    string? PublicUploadUrl = null,
    string? ExternalLabName = null,
    string? ExternalReportUrl = null,
    string? ExternalReportType = null,
    string? UploadedBy = null,
    string? ObservationsJson = null,
    string? PathologistImpression = null,
    string? VerifiedByPathologist = null,
    string? PathologistPrcLicense = null,
    DateTime? ReportReleasedAt = null,
    bool HasCriticalPanicAlert = false,
    string? CriticalFindingsJson = null,
    DateTime? PanicAlertTriggeredAt = null,
    DateTime? PanicAcknowledgedAt = null,
    string? PanicAcknowledgedBy = null,
    LabOrderStage Stage = LabOrderStage.Issued,
    string? StageReason = null,
    decimal? QuotedAmount = null,
    string? QuotedCurrency = null,
    bool PaymentRequired = false,
    string? LaboratoryName = null,
    string? ClaimToken = null,
    List<ClinicLabResultSummaryDto>? Results = null
);

public record AcknowledgePanicAlertRequest(
    string AcknowledgedByDoctorName,
    string? Notes = null
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
    string? FileBase64,
    string? Notes,
    string? ContactNumber = null,
    string? PathologistName = null,
    string? PathologistPrcLicense = null,
    string? ContentType = null,
    string? FileName = null
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

/// <summary>What an anonymous uploader gets back: a receipt, never the order or any patient data.</summary>
public record PublicLabUploadReceipt(Guid ResultId, string OrderNumber, DateTime ReceivedAtUtc);
