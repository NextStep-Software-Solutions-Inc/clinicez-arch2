using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class ReferralLetter : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }

    /// <summary>
    /// Sequential Referral Number, e.g. REF-20260929-0001
    /// </summary>
    public required string ReferralNumber { get; set; }

    public Guid PatientId { get; set; }
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
}
