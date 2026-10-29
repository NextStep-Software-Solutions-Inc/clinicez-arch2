using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class ConsultationEncounter : ClinicScopedEntity
{
    public Guid? BranchId { get; set; }

    public Guid? QueueItemId { get; set; }
    public QueueItem? QueueItem { get; set; }

    public Guid? AppointmentId { get; set; }
    public Appointment? Appointment { get; set; }

    public Guid PatientId { get; set; }
    public Patient? Patient { get; set; }
    public required string PatientName { get; set; }

    public Guid DoctorId { get; set; }
    public required string DoctorName { get; set; }

    public DateTime EncounterDate { get; set; } = DateTime.UtcNow;

    // Structured SOAP Documentation (Confidential / Clinician Only)
    public string Subjective { get; set; } = string.Empty;
    public string Objective { get; set; } = string.Empty;
    public string Assessment { get; set; } = string.Empty;
    public string Plan { get; set; } = string.Empty;

    // Patient-Facing Home & Discharge Instructions (Exposed to patient portal and discharge slips)
    public string? HomeInstructions { get; set; }

    // Physician credential snapshot at encounter signing
    public string? DoctorPrcLicense { get; set; }
    public string? DoctorPtr { get; set; }
    public string? DoctorS2License { get; set; }

    // Lock status
    public bool IsSigned { get; set; } = false;
    public DateTime? SignedAt { get; set; }

    public void Sign(
        string? prcLicense = null,
        string? ptr = null,
        string? s2License = null,
        string? philHealthPan = null,
        string? philHealthAtc = null)
    {
        if (prcLicense != null) DoctorPrcLicense = prcLicense;
        if (ptr != null) DoctorPtr = ptr;
        if (s2License != null) DoctorS2License = s2License;
        if (!string.IsNullOrWhiteSpace(philHealthPan)) DoctorPhilHealthPan = philHealthPan;
        if (!string.IsNullOrWhiteSpace(philHealthAtc)) PhilHealthAtc = philHealthAtc;

        IsSigned = true;
        SignedAt = DateTime.UtcNow;
        UpdatedAt = DateTime.UtcNow;
        UpdatedBy = DoctorName;

        AddDomainEvent(new ClinicEz.Clinic.Domain.Events.ConsultationSignedDomainEvent(
            Id,
            ClinicId,
            PatientId,
            DoctorId,
            DoctorName,
            SignedAt.Value));
    }

    // Dual Clinical Workflow Mode
    public VisitWorkflowMode VisitWorkflowMode { get; set; } = VisitWorkflowMode.Regular;

    // PhilHealth Konsulta / YAKAP Encounter Tracking
    public bool IsYakapEligible { get; set; } = false;
    public string? PhilHealthSignSympCode { get; set; }
    public string? PhilHealthOtherComplaint { get; set; }
    public string? PhilHealthPainSite { get; set; }
    public string? PhilHealthCaseNo { get; set; }
    public string? PhilHealthSoapTransNo { get; set; }
    public string? DoctorPhilHealthPan { get; set; }
    public string? PhilHealthAtc { get; set; }
    public bool IsWalkedIn { get; set; } = false;
    public bool HasCoPayment { get; set; } = false;
    public DateOnly? CoPaymentDate { get; set; }
    public decimal? CoPaymentAmount { get; set; }
    public decimal? CoPaymentBalance { get; set; }
    public string? PhilHealthManagementCodes { get; set; }

    public string? PhilHealthVisitType { get; set; }
    public string? SpecificDiagnosisCodes { get; set; }
    public string? CounselingCodes { get; set; }
    public string? RoutineVaccineName { get; set; }
    public DateOnly? RoutineVaccineDate { get; set; }
    public string? AdultsRoutineScreeningCode { get; set; }
    public string? PediatricRoutineScreeningCode { get; set; }
    public string? PrenatalScreeningServicesCode { get; set; }
    public string? BreastCancerScreeningCode { get; set; }
    public string? CervicalCancerScreeningCode { get; set; }
    public string? ColorectalCancerScreeningCode { get; set; }
    public string? ProstateCancerScreeningCode { get; set; }
    public string? DiagnosticServicesOption { get; set; }
    public bool HasMedicationPrescription { get; set; } = false;
    public bool HasReferral { get; set; } = false;
    public string? OtherMedicalAdviceSpec { get; set; }
    public bool HasFollowUp { get; set; } = false;
    public DateOnly? FollowUpDate { get; set; }
    public string? FollowUpScheduleText { get; set; }
    public string? FollowUpReason { get; set; }
    public string? FollowUpVaccineName { get; set; }
    public DateOnly? FollowUpVaccineNextDate { get; set; }
    public string? ClinicalDisposition { get; set; }
    public YakapServiceDeliveryMethod ServiceDeliveryMethod { get; set; } = YakapServiceDeliveryMethod.FacilityBased;
    public Guid? PatientIdentityVerificationId { get; set; }
    public PatientIdentityVerification? PatientIdentityVerification { get; set; }
    public string? DoctorDesignation { get; set; }
    public string? ConsultationReasonCode { get; set; }
    public string? ConsultationReasonDetails { get; set; }

    // E-Prescription Interoperability & External Verification
    public string? PrescriptionNumber { get; set; }
    public string? RxPublicVerificationToken { get; set; }

    /// <summary>Hub claim capability printed as the prescription QR so any ClinicEZ pharmacy can dispense it.</summary>
    public string? RxClaimToken { get; set; }
    public DateTime? RxClaimExpiresAt { get; set; }
    public ClinicEz.Clinic.Domain.Enums.PrescriptionDispenseStatus RxDispenseStatus { get; set; } = ClinicEz.Clinic.Domain.Enums.PrescriptionDispenseStatus.Issued;
    public string? RxDispensedPharmacyName { get; set; }
    public string? RxDispensedPharmacistName { get; set; }
    public string? RxDispensedPharmacistPrc { get; set; }
    public string? RxDispensedReceiptNumber { get; set; }
    public string? RxDispensedReceiptUrl { get; set; }
    public DateTime? RxDispensedAt { get; set; }
    public string? RxNotes { get; set; }

    /// <summary>Stage owned by the pharmacy; mirrored here from <c>rx.status.changed</c>.</summary>
    public ClinicEz.Shared.Interoperability.RxStage RxStage { get; set; } = ClinicEz.Shared.Interoperability.RxStage.Issued;
    public string? RxStageReason { get; set; }
    public decimal? RxQuotedAmount { get; set; }
    /// <summary>When the pharmacy said the stage changed (its clock); a status message older than this is stale and ignored.</summary>
    public DateTime? RxStageReportedAt { get; set; }
    public string? RxPharmacyTenantId { get; set; }
    public string? RxPharmacyFacilityId { get; set; }
    public string? RxPharmacyName { get; set; }

    // Navigations
    public ICollection<EncounterDiagnosis> Diagnoses { get; set; } = new List<EncounterDiagnosis>();
    public ICollection<PrescriptionItem> Prescriptions { get; set; } = new List<PrescriptionItem>();
    public ICollection<PatientPhysicalExam> PhysicalExams { get; set; } = new List<PatientPhysicalExam>();
    public ICollection<PatientVitals> Vitals { get; set; } = new List<PatientVitals>();
    public ICollection<EncounterReviewOfSystemsItem> ReviewOfSystemsItems { get; set; } = new List<EncounterReviewOfSystemsItem>();
    public EncounterObGyneExam? ObGyneExam { get; set; }
    public ICollection<EncounterPediatricMilestone> PediatricMilestones { get; set; } = new List<EncounterPediatricMilestone>();
    public EncounterAdolescentAssessment? AdolescentAssessment { get; set; }
    public ICollection<EncounterHeadsssDomainAssessment> HeadsssAssessments { get; set; } = new List<EncounterHeadsssDomainAssessment>();
    public ICollection<PatientBpMonitoringLog> BpMonitoringLogs { get; set; } = new List<PatientBpMonitoringLog>();

    public NineSystemPhysicalExamFindings? GetPhysicalExamFindings()
    {
        var exam = PhysicalExams.FirstOrDefault();
        if (exam == null) return null;

        var findings = new NineSystemPhysicalExamFindings();
        findings.Skin = new SystemExamFinding(
            exam.Findings.FirstOrDefault(f => f.System == PhysicalExamSystem.Skin)?.IsNormal ?? string.IsNullOrWhiteSpace(exam.SkinRemarks),
            exam.SkinRemarks);
        findings.Heent = new SystemExamFinding(
            exam.Findings.FirstOrDefault(f => f.System == PhysicalExamSystem.Heent)?.IsNormal ?? string.IsNullOrWhiteSpace(exam.HeentRemarks),
            exam.HeentRemarks);
        findings.Chest = new SystemExamFinding(
            exam.Findings.FirstOrDefault(f => f.System == PhysicalExamSystem.Chest)?.IsNormal ?? string.IsNullOrWhiteSpace(exam.ChestLungsRemarks),
            exam.ChestLungsRemarks);
        findings.Heart = new SystemExamFinding(
            exam.Findings.FirstOrDefault(f => f.System == PhysicalExamSystem.Heart)?.IsNormal ?? string.IsNullOrWhiteSpace(exam.HeartRemarks),
            exam.HeartRemarks);
        findings.Abdomen = new SystemExamFinding(
            exam.Findings.FirstOrDefault(f => f.System == PhysicalExamSystem.Abdomen)?.IsNormal ?? string.IsNullOrWhiteSpace(exam.AbdomenRemarks),
            exam.AbdomenRemarks);
        findings.Neuro = new SystemExamFinding(
            exam.Findings.FirstOrDefault(f => f.System == PhysicalExamSystem.Neurological)?.IsNormal ?? string.IsNullOrWhiteSpace(exam.NeurologicalRemarks),
            exam.NeurologicalRemarks);
        findings.Rectal = new SystemExamFinding(
            exam.Findings.FirstOrDefault(f => f.System == PhysicalExamSystem.Rectal)?.IsNormal ?? string.IsNullOrWhiteSpace(exam.DigitalRectalRemarks),
            exam.DigitalRectalRemarks);
        findings.Gu = new SystemExamFinding(
            exam.Findings.FirstOrDefault(f => f.System == PhysicalExamSystem.Genitourinary)?.IsNormal ?? string.IsNullOrWhiteSpace(exam.GenitourinaryRemarks),
            exam.GenitourinaryRemarks);
        findings.Musculoskeletal = new SystemExamFinding(
            exam.Findings.FirstOrDefault(f => f.System == PhysicalExamSystem.Musculoskeletal)?.IsNormal ?? string.IsNullOrWhiteSpace(exam.MusculoskeletalRemarks),
            exam.MusculoskeletalRemarks);

        return findings;
    }

    public void SetPhysicalExamFindings(NineSystemPhysicalExamFindings? findings)
    {
        if (findings == null)
        {
            PhysicalExams.Clear();
            return;
        }

        var exam = PhysicalExams.FirstOrDefault();
        if (exam == null)
        {
            exam = new PatientPhysicalExam
            {
                TenantId = TenantId,
                ClinicId = ClinicId,
                PatientId = PatientId,
                ConsultationEncounterId = Id,
                ExamDate = EncounterDate != default ? EncounterDate : DateTime.UtcNow
            };
            PhysicalExams.Add(exam);
        }

        exam.SkinRemarks = findings.Skin?.Remarks;
        exam.HeentRemarks = findings.Heent?.Remarks;
        exam.ChestLungsRemarks = findings.Chest?.Remarks;
        exam.HeartRemarks = findings.Heart?.Remarks;
        exam.AbdomenRemarks = findings.Abdomen?.Remarks;
        exam.NeurologicalRemarks = findings.Neuro?.Remarks;
        exam.DigitalRectalRemarks = findings.Rectal?.Remarks;
        exam.GenitourinaryRemarks = findings.Gu?.Remarks;
        exam.MusculoskeletalRemarks = findings.Musculoskeletal?.Remarks;

        void SyncFinding(PhysicalExamSystem sys, SystemExamFinding? f)
        {
            if (f == null) return;
            var existing = exam.Findings.FirstOrDefault(x => x.System == sys);
            if (existing == null)
            {
                exam.Findings.Add(new PatientPhysicalExamFinding
                {
                    TenantId = exam.TenantId,
                    ClinicId = exam.ClinicId,
                    PhysicalExamId = exam.Id,
                    System = sys,
                    IsNormal = f.IsNormal,
                    FindingTitle = sys.ToString(),
                    Remarks = f.Remarks
                });
            }
            else
            {
                existing.IsNormal = f.IsNormal;
                existing.Remarks = f.Remarks;
            }
        }

        SyncFinding(PhysicalExamSystem.Skin, findings.Skin);
        SyncFinding(PhysicalExamSystem.Heent, findings.Heent);
        SyncFinding(PhysicalExamSystem.Chest, findings.Chest);
        SyncFinding(PhysicalExamSystem.Heart, findings.Heart);
        SyncFinding(PhysicalExamSystem.Abdomen, findings.Abdomen);
        SyncFinding(PhysicalExamSystem.Neurological, findings.Neuro);
        SyncFinding(PhysicalExamSystem.Rectal, findings.Rectal);
        SyncFinding(PhysicalExamSystem.Genitourinary, findings.Gu);
        SyncFinding(PhysicalExamSystem.Musculoskeletal, findings.Musculoskeletal);
    }
}

public sealed class SystemExamFinding
{
    public SystemExamFinding()
    {
    }

    public SystemExamFinding(bool isNormal, string? remarks = null)
    {
        IsNormal = isNormal;
        Remarks = remarks;
    }

    public bool IsNormal { get; set; } = true;
    public string? Remarks { get; set; }
}

public sealed class NineSystemPhysicalExamFindings
{
    public bool AllEssentiallyNormal =>
        (Skin?.IsNormal ?? true) &&
        (Heent?.IsNormal ?? true) &&
        (Chest?.IsNormal ?? true) &&
        (Heart?.IsNormal ?? true) &&
        (Abdomen?.IsNormal ?? true) &&
        (Neuro?.IsNormal ?? true) &&
        (Rectal?.IsNormal ?? true) &&
        (Gu?.IsNormal ?? true) &&
        (Musculoskeletal?.IsNormal ?? true);

    public SystemExamFinding Skin { get; set; } = new();
    public SystemExamFinding Heent { get; set; } = new();
    public SystemExamFinding Chest { get; set; } = new();
    public SystemExamFinding Heart { get; set; } = new();
    public SystemExamFinding Abdomen { get; set; } = new();
    public SystemExamFinding Neuro { get; set; } = new();
    public SystemExamFinding Rectal { get; set; } = new();
    public SystemExamFinding Gu { get; set; } = new();
    public SystemExamFinding Musculoskeletal { get; set; } = new();
}
