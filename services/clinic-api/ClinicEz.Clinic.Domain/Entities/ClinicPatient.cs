using System;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class ClinicPatient : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }

    /// <summary>
    /// Sequential clinic-specific code, e.g. PAT-2026-00001
    /// </summary>
    public required string PatientCode { get; set; }

    public required string FirstName { get; set; }
    public required string LastName { get; set; }
    public string? MiddleName { get; set; }
    public string? Suffix { get; set; }

    public DateOnly DateOfBirth { get; set; }
    public string Gender { get; set; } = "Male"; // Male, Female, Other
    public string? CivilStatus { get; set; } // Single, Married, Widowed, Separated

    public required string ContactNumber { get; set; }
    public string? Email { get; set; }

    public string? AddressLine { get; set; }
    public string? Barangay { get; set; }
    public string? City { get; set; }
    public string? Province { get; set; }

    // Emergency Contact
    public string? EmergencyContactName { get; set; }
    public string? EmergencyContactPhone { get; set; }
    public string? EmergencyContactRelationship { get; set; }

    // Philippine Healthcare IDs
    public string? PhilHealthNumber { get; set; } // e.g. 12-345678901-2
    public string? PhilHealthCaseNo { get; set; } // Active Annual Case No, e.g. C00921202600001
    public string? PhilHealthEnlistmentNo { get; set; } // Enlistment Trans No, e.g. E00921202600001
    public string? PhilHealthProfilingTransNo { get; set; } // Profiling Trans No, e.g. P00921202600001
    public string? SeniorCitizenId { get; set; }  // RA 9994
    public string? PwdId { get; set; }            // RA 10754

    // Clinical Alert Flags
    public string? BloodType { get; set; }        // A+, B+, O+, AB+, etc.
    public string? Allergies { get; set; }        // e.g. "Penicillin, Aspirin, Seafood"
    public string? ChronicConditions { get; set; } // e.g. "Hypertension, T2DM"
    public string? Alerts { get; set; }           // e.g. "Fall risk, Bleeding tendency"

    /// <summary>
    /// Optional linkage to cloud Patient App ID if patient has synchronized
    /// </summary>
    public Guid? SyncPatientId { get; set; }

    /// <summary>Human-friendly global ClinicEZ id the patient app shows; the key a share import matches on first.</summary>
    public string? ClinicEzId { get; set; }

    /// <summary>The patient's latest consent grant to this clinic (scan-to-fetch): which scopes were shared and until when.</summary>
    public Guid? ShareGrantId { get; set; }
    public SharingScopes ShareGrantScopes { get; set; }
    public DateTime? ShareGrantExpiresAt { get; set; }

    /// <summary>
    /// Tenant-specific custom properties stored as JSON (e.g., student_id, college, year_level, employee_id).
    /// </summary>
    public System.Collections.Generic.Dictionary<string, object?> CustomFields { get; set; } = new();

    /// <summary>
    /// Verification status: Verified, PendingVerification, Rejected, None
    /// </summary>
    public string VerificationStatus { get; set; } = "Verified";

    public System.Collections.Generic.ICollection<PatientSurgicalHistory> SurgicalHistories { get; set; } = new System.Collections.Generic.List<PatientSurgicalHistory>();
    public PatientSocialHistory? SocialHistory { get; set; }
    public PatientReproductiveHistory? ReproductiveHistory { get; set; }
    public PatientPhysicalExamProfile? PhysicalExamProfile { get; set; }
    public System.Collections.Generic.ICollection<NcdRiskAssessment> NcdRiskAssessments { get; set; } = new System.Collections.Generic.List<NcdRiskAssessment>();

    /// <summary>
    /// Free-text clinician notes on past medical history, disease control, and onset context.
    /// </summary>
    public string? PersonalMedicalHistoryNotes { get; set; }

    /// <summary>
    /// Free-text clinician notes on family medical history, pedigree context, and affected relatives.
    /// </summary>
    public string? FamilyMedicalHistoryNotes { get; set; }

    public System.Collections.Generic.ICollection<PatientPastMedicalHistory> PastMedicalHistories { get; set; } = new System.Collections.Generic.List<PatientPastMedicalHistory>();
    public System.Collections.Generic.ICollection<PatientFamilyHistory> FamilyHistories { get; set; } = new System.Collections.Generic.List<PatientFamilyHistory>();
}
