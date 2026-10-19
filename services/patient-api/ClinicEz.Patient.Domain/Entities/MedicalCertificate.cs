using ClinicEz.Patient.Domain.Common;

namespace ClinicEz.Patient.Domain.Entities;

/// <summary>The patient's copy of a medical certificate issued by a facility.</summary>
public sealed class MedicalCertificate : BaseEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    /// <summary>Id of the certificate at the issuer; the idempotency key for upserts.</summary>
    public Guid CertificateId { get; set; }
    public string CertificateNumber { get; set; } = string.Empty;

    public string IssuerTenantId { get; set; } = string.Empty;
    public string IssuerFacilityId { get; set; } = string.Empty;
    public string IssuerName { get; set; } = string.Empty;
    public string DoctorName { get; set; } = string.Empty;
    public string DoctorPrcLicense { get; set; } = string.Empty;
    public string? DoctorPtrNumber { get; set; }

    public string Purpose { get; set; } = string.Empty;
    public string? Diagnosis { get; set; }
    public string? Remarks { get; set; }
    public int? RestDays { get; set; }
    public DateTime? ValidFrom { get; set; }
    public DateTime? ValidTo { get; set; }
    public DateTime IssuedAt { get; set; }

    public string? VerificationToken { get; set; }
    public string? VerificationUrl { get; set; }
}