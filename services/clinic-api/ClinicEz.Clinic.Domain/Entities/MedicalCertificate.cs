using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class MedicalCertificate : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }

    /// <summary>
    /// Sequential Certificate Number, e.g. MC-20260929-0001
    /// </summary>
    public required string CertificateNumber { get; set; }

    public Guid PatientId { get; set; }
    public required string PatientName { get; set; }
    public Guid? ConsultationId { get; set; }

    public Guid DoctorId { get; set; }
    public required string DoctorName { get; set; }
    public required string PrcLicenseNumber { get; set; }
    public string? PtrNumber { get; set; }

    public DateOnly IssueDate { get; set; }

    public required string Diagnosis { get; set; }
    public string? ClinicalFindings { get; set; }

    /// <summary>
    /// Fitness status: FitToWork, UnfitToWork, FitToSchool, FitWithRestrictions, LightDuty
    /// </summary>
    public string FitnessStatus { get; set; } = "FitToWork";

    public int? RecommendedRestDays { get; set; }
    public DateOnly? RestStartDate { get; set; }
    public DateOnly? RestEndDate { get; set; }

    /// <summary>
    /// Purpose: Employment, School, Travel, Legal, General
    /// </summary>
    public string Purpose { get; set; } = "Employment";

    public string? Remarks { get; set; }

    public bool IsSigned { get; set; }
    public DateTime? SignedAt { get; set; }
    public string? SecurityDigest { get; set; }
}
