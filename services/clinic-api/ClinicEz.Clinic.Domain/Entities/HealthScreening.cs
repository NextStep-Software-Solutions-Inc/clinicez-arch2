using System;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class HealthScreening : ClinicScopedEntity
{
    // Core 1NF Foreign Keys & Navigations
    public Guid PatientId { get; set; }
    public Patient? Patient { get; set; }

    public Guid QueueItemId { get; set; }
    public QueueItem? QueueItem { get; set; }

    public Guid? ConsultationEncounterId { get; set; }
    public ConsultationEncounter? ConsultationEncounter { get; set; }

    public Guid? YakapEnlistmentId { get; set; }
    public PatientYakapEnlistment? YakapEnlistment { get; set; }

    public Guid? PatientIdentityVerificationId { get; set; }
    public PatientIdentityVerification? IdentityVerification { get; set; }

    public Guid? YakapSubmissionId { get; set; }
    public YakapSubmission? YakapSubmission { get; set; }

    public Guid? PatientVitalsId { get; set; }
    public PatientVitals? PatientVitals { get; set; }

    public Guid? PatientPhysicalExamId { get; set; }
    public PatientPhysicalExam? PatientPhysicalExam { get; set; }

    public Guid? NcdRiskAssessmentId { get; set; }
    public NcdRiskAssessment? NcdRiskAssessment { get; set; }

    public Guid? ServiceItemId { get; set; }
    public ServiceItem? ServiceItem { get; set; }

    // Program, Workflow & Lifecycle Status
    public HealthScreeningType ScreeningType { get; set; } = HealthScreeningType.RoutineWellness;
    public VisitWorkflowMode WorkflowMode { get; set; } = VisitWorkflowMode.Regular;
    public HealthScreeningStatus Status { get; set; } = HealthScreeningStatus.InProgress;
    public HealthScreeningDisposition? Disposition { get; set; }

    // Episode Dates & Clinician Attribution
    public DateTime ScreeningDateUtc { get; set; } = DateTime.UtcNow;
    public Guid? ScreenedByNurseId { get; set; }
    public string? ScreenedByNurseName { get; set; }
    public DateTime? NurseCompletedAtUtc { get; set; }

    public Guid? ExaminedByDoctorId { get; set; }
    public string? ExaminedByDoctorName { get; set; }
    public DateTime? CompletedAtUtc { get; set; }

    // Clinical Summary & Counseling
    public string? NurseScreeningNotes { get; set; }
    public string? ClinicalImpression { get; set; }
    public string? PreventiveCounselingNotes { get; set; }
    public DateOnly? RecommendedFollowUpDate { get; set; }

    // Statutory Preventive Screening Codes (matches ConsultationEncounter)
    public string? AdultsRoutineScreeningCode { get; set; }
    public string? PediatricRoutineScreeningCode { get; set; }
    public string? PrenatalScreeningServicesCode { get; set; }
    public string? BreastCancerScreeningCode { get; set; }
    public string? CervicalCancerScreeningCode { get; set; }
    public string? ColorectalCancerScreeningCode { get; set; }
    public string? ProstateCancerScreeningCode { get; set; }

    // PhilHealth YAKAP FPE Metadata
    public string? PhilHealthAtc { get; set; }
    public bool IsWalkedIn { get; set; } = false;
    public YakapServiceDeliveryMethod ServiceDeliveryMethod { get; set; } = YakapServiceDeliveryMethod.FacilityBased;
    public string? FpeClassificationType { get; set; }
    public string? ProfilingTransNo { get; set; }
}
