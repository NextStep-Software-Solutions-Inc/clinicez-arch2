using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Application.Features.LabOrders.DTOs;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Application.Features.Triage.DTOs;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Application.Features.HealthScreenings.DTOs;

public sealed record YakapFpeReadinessDto(
    bool IsReady,
    bool HasValidPin,
    bool HasActiveEnlistment,
    bool HasAtcOrWalkIn,
    bool HasVitals,
    bool HasPhysicalExam,
    bool HasNcdAssessment,
    bool AlreadyCompletedThisYear,
    string? ExistingProfilingTransNo,
    DateOnly? ExistingProfilingDate,
    List<string> MissingRequirements,
    List<string> Warnings,
    bool HasIdentityVerification = false,
    string? VerificationMode = null,
    string? SelectionStatus = null,
    string? YesReferenceNo = null,
    string? SubmissionStatus = null,
    string? UploadTransactionNo = null
)
{
    public bool HasNcdRiskAssessment => HasNcdAssessment;
    public bool HasNcdRisk => HasNcdAssessment;
}

public sealed record HealthScreeningDto(
    Guid Id,
    Guid PatientId,
    Guid QueueItemId,
    Guid? ConsultationEncounterId,
    Guid? YakapEnlistmentId,
    Guid? PatientVitalsId,
    Guid? PatientPhysicalExamId,
    Guid? NcdRiskAssessmentId,
    Guid? ServiceItemId,
    string? ServiceItemCode,
    string? ServiceItemName,
    decimal? ServiceItemPrice,
    HealthScreeningType ScreeningType,
    VisitWorkflowMode WorkflowMode,
    HealthScreeningStatus Status,
    HealthScreeningDisposition? Disposition,
    DateTime ScreeningDateUtc,
    Guid? ScreenedByNurseId,
    string? ScreenedByNurseName,
    DateTime? NurseCompletedAtUtc,
    Guid? ExaminedByDoctorId,
    string? ExaminedByDoctorName,
    DateTime? CompletedAtUtc,
    string? NurseScreeningNotes,
    string? ClinicalImpression,
    string? PreventiveCounselingNotes,
    DateOnly? RecommendedFollowUpDate,
    string? PhilHealthAtc,
    bool IsWalkedIn,
    YakapServiceDeliveryMethod ServiceDeliveryMethod,
    string? FpeClassificationType,
    string? ProfilingTransNo,
    string? QueueNumber = null,
    QueueStatus? QueueStatus = null,
    string? AdultsRoutineScreeningCode = null,
    string? PediatricRoutineScreeningCode = null,
    string? PrenatalScreeningServicesCode = null,
    string? BreastCancerScreeningCode = null,
    string? CervicalCancerScreeningCode = null,
    string? ColorectalCancerScreeningCode = null,
    string? ProstateCancerScreeningCode = null,
    Guid? PatientIdentityVerificationId = null,
    Guid? YakapSubmissionId = null,
    string? YakapSubmissionStatus = null,
    string? YakapUploadTransactionNo = null,
    string? YesReferenceNo = null
)
{
    public string? AdultRoutineScreeningCode => AdultsRoutineScreeningCode;
}

public sealed record HealthScreeningDetailDto(
    Guid Id,
    Guid PatientId,
    Guid QueueItemId,
    Guid? ConsultationEncounterId,
    Guid? YakapEnlistmentId,
    Guid? PatientVitalsId,
    Guid? PatientPhysicalExamId,
    Guid? NcdRiskAssessmentId,
    Guid? ServiceItemId,
    string? ServiceItemCode,
    string? ServiceItemName,
    decimal? ServiceItemPrice,
    HealthScreeningType ScreeningType,
    VisitWorkflowMode WorkflowMode,
    HealthScreeningStatus Status,
    HealthScreeningDisposition? Disposition,
    DateTime ScreeningDateUtc,
    Guid? ScreenedByNurseId,
    string? ScreenedByNurseName,
    DateTime? NurseCompletedAtUtc,
    Guid? ExaminedByDoctorId,
    string? ExaminedByDoctorName,
    DateTime? CompletedAtUtc,
    string? NurseScreeningNotes,
    string? ClinicalImpression,
    string? PreventiveCounselingNotes,
    DateOnly? RecommendedFollowUpDate,
    string? PhilHealthAtc,
    bool IsWalkedIn,
    YakapServiceDeliveryMethod ServiceDeliveryMethod,
    string? FpeClassificationType,
    string? ProfilingTransNo,
    string? QueueNumber,
    QueueStatus? QueueStatus,
    string? AdultsRoutineScreeningCode,
    string? PediatricRoutineScreeningCode,
    string? PrenatalScreeningServicesCode,
    string? BreastCancerScreeningCode,
    string? CervicalCancerScreeningCode,
    string? ColorectalCancerScreeningCode,
    string? ProstateCancerScreeningCode,
    TriageVitalsDto? Vitals,
    PatientPhysicalExamProfileDto? PhysicalExam,
    NcdRiskAssessmentDto? NcdRiskAssessment,
    List<ClinicLabOrderDto> LabOrders,
    YakapFpeReadinessDto? YakapReadiness,
    bool RequiresPhysicianSignOff,
    bool AllowNurseMidwifeYakapFpeFacilitator,
    Guid? PatientIdentityVerificationId = null,
    Guid? YakapSubmissionId = null,
    string? YakapSubmissionStatus = null,
    string? YakapUploadTransactionNo = null,
    string? YesReferenceNo = null
)
{
    public string? AdultRoutineScreeningCode => AdultsRoutineScreeningCode;
    public List<ClinicLabOrderDto> OrderedLabs => LabOrders;
    public YakapFpeReadinessDto? YakapFpeReadiness => YakapReadiness;
}
