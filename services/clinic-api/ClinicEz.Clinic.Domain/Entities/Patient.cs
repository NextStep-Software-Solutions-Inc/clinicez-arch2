using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Clinic.Domain.Entities;

public class Patient : ClinicScopedEntity
{
    /// <summary>
    /// Sequential clinic-specific code, e.g. PAT-2026-00001
    /// </summary>
    public required string PatientCode { get; set; }

    public required string FirstName { get; set; }
    public required string LastName { get; set; }
    public string? MiddleName { get; set; }
    public string? Suffix { get; set; }

    public DateOnly DateOfBirth { get; set; }

    public BiologicalSex Sex { get; set; } = BiologicalSex.Male;
    public string? GenderIdentity { get; set; }
    public CivilStatus? CivilStatus { get; set; }
    public BloodType? BloodType { get; set; }

    public required string ContactNumber { get; set; }
    public string? AlternateContactNumber { get; set; }
    public string? LandlineNumber { get; set; }
    public string? Email { get; set; }

    public string? Occupation { get; set; }

    public string? EmergencyContactName { get; set; }
    public string? EmergencyContactNumber { get; set; }
    public string? EmergencyContactRelationship { get; set; }

    // Philippine Healthcare IDs
    public string? PhilHealthNumber { get; set; }
    public string? SeniorCitizenId { get; set; }
    public string? PwdId { get; set; }

    public Guid? CloudPatientId { get; set; }

    /// <summary>Human-friendly global ClinicEZ id the patient app shows; the key a share import matches on first.</summary>
    public string? ClinicEzId { get; set; }

    /// <summary>The patient's latest consent grant to this clinic (scan-to-fetch): which scopes were shared and until when.</summary>
    public Guid? ShareGrantId { get; set; }
    public SharingScopes ShareGrantScopes { get; set; }
    public DateTime? ShareGrantExpiresAt { get; set; }

    public string? MaidenLastName { get; set; }
    public string? PreferredName { get; set; }
    public string? Nationality { get; set; }
    public string? Religion { get; set; }
    public bool IsDeceased { get; set; } = false;
    public DateTime? DeceasedAt { get; set; }

    /// <summary>
    /// Tenant-specific custom properties stored as JSON (e.g., student_id, college, year_level, employee_id).
    /// </summary>
    public Dictionary<string, object?> CustomFields { get; set; } = new();

    public bool HasActiveSafetyAlert { get; set; } = false;
    public string? SearchText { get; set; }

    /// <summary>
    /// Verification status: Verified, PendingVerification, Rejected, None
    /// </summary>
    public PatientVerificationStatus VerificationStatus { get; set; } = PatientVerificationStatus.Verified;

    public void LinkCloudAccount(Guid cloudPatientId, string? clinicEzId = null)
    {
        CloudPatientId = cloudPatientId;
        if (!string.IsNullOrWhiteSpace(clinicEzId))
        {
            ClinicEzId = clinicEzId;
        }
    }

    public PatientYakapEnlistment? GetActiveYakapEnlistment(DateTime? asOf = null)
    {
        var targetDate = DateOnly.FromDateTime(asOf ?? DateTime.UtcNow);
        var enlistments = this.GetYakapEnlistments();
        return enlistments.FirstOrDefault(e =>
            e.Status == YakapEnlistmentStatus.Active &&
            e.IsCoveringDate(targetDate));
    }

    // 1:1 and 1:N Pure 1NF Relational Navigations
    public PatientPhilHealthMembership? PhilHealthMembership { get; set; }
    public PatientSocialHistory? SocialHistory { get; set; }
    public PatientReproductiveHistory? ReproductiveHistory { get; set; }
    public PatientSexualHistory? SexualHistory { get; set; }
    public ICollection<PatientAddress> Addresses { get; set; } = new List<PatientAddress>();
    public ICollection<PatientGuardian> Guardians { get; set; } = new List<PatientGuardian>();
    public ICollection<PatientIdentityVerification> IdentityVerifications { get; set; } = new List<PatientIdentityVerification>();
    public ICollection<PatientHospitalizationHistory> HospitalizationHistories { get; set; } = new List<PatientHospitalizationHistory>();
    public ICollection<PatientInjuryHistory> InjuryHistories { get; set; } = new List<PatientInjuryHistory>();
    public ICollection<PatientHomeMedication> HomeMedications { get; set; } = new List<PatientHomeMedication>();
    public ICollection<PatientBpMonitoringLog> BpMonitoringLogs { get; set; } = new List<PatientBpMonitoringLog>();
    public ICollection<YakapSubmission> YakapSubmissions { get; set; } = new List<YakapSubmission>();
    public ICollection<PatientYakapEnlistment> YakapEnlistments { get; set; } = new List<PatientYakapEnlistment>();
    public ICollection<PatientAlert> Alerts { get; set; } = new List<PatientAlert>();
    public ICollection<PatientAllergy>? Allergies { get; set; }
    public ICollection<PatientMedicalHistory> MedicalHistories { get; set; } = new List<PatientMedicalHistory>();
    public ICollection<PatientPhysicalExam> PhysicalExams { get; set; } = new List<PatientPhysicalExam>();
    public ICollection<PatientVitals> Vitals { get; set; } = new List<PatientVitals>();
    public ICollection<PatientImmunization> Immunizations { get; set; } = new List<PatientImmunization>();
    public ICollection<PatientFamilyHistory> FamilyHistories { get; set; } = new List<PatientFamilyHistory>();
    public ICollection<PatientSurgicalHistory> SurgicalHistories { get; set; } = new List<PatientSurgicalHistory>();
    public ICollection<NcdRiskAssessment> NcdRiskAssessments { get; set; } = new List<NcdRiskAssessment>();
    public ICollection<DentalToothRecord> DentalToothRecords { get; set; } = new List<DentalToothRecord>();
}
