using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class ReferralLetter : ClinicScopedEntity
{
    /// <summary>
    /// Sequential Referral Number, e.g. REF-20260929-0001
    /// </summary>
    public required string ReferralNumber { get; set; }

    public Guid PatientId { get; set; }
    public Patient? Patient { get; set; }
    public required string PatientName { get; set; }
    public Guid? ConsultationId { get; set; }

    public Guid ReferringDoctorId { get; set; }
    public required string ReferringDoctorName { get; set; }

    public string? ReferredToDoctor { get; set; }
    public required string ReferredToFacility { get; set; }
    public required string ReferredDepartment { get; set; } // Cardiology, Surgery, ER, etc.

    public DateOnly ReferralDate { get; set; }

    /// <summary>
    /// Routine, Urgent, Emergency
    /// </summary>
    public string Urgency { get; set; } = "Routine";

    public required string ReasonForReferral { get; set; }
    public required string ProvisionalDiagnosis { get; set; }
    public required string ClinicalSummary { get; set; }

    public string? CurrentMedications { get; set; }
    public string? AttachedDiagnostics { get; set; }

    public bool IsSigned { get; set; }
    public DateTime? SignedAt { get; set; }
    public string? SecurityDigest { get; set; }

    public string? ReferringDoctorPrcNumber { get; set; }

    // PhilHealth Statutory Tracking (PCAPI referral Service 07)
    public string? PhilHealthReferralTransNo { get; set; }
    public string? ReferralTypeCodes { get; set; }
    public string? PrimaryCareServiceCodes { get; set; }
    public string? FacilityServiceCodes { get; set; }
    public string? SpecialistType { get; set; }
    public string? SpecialistOtherSpecify { get; set; }
    public string? OthersSpecify { get; set; }
    public string? ReceivingFacilityAccreditationNo { get; set; }
    public string? ReferringDoctorDesignation { get; set; }
    public string? ReferringDoctorPhilHealthPan { get; set; }
    public string? TransportMode { get; set; }
    public string? VitalSignsSummary { get; set; }
    public string? TreatmentGiven { get; set; }
}
