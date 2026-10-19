using ClinicEz.Patient.Domain.Common;

namespace ClinicEz.Patient.Domain.Entities;

public sealed class Prescription : BaseEntity
{
    public Guid? ConsultationId { get; set; }
    public Consultation? Consultation { get; set; }
    /// <summary>The prescription this line belongs to when it was received from a facility.</summary>
    public Guid? PrescriptionDocumentId { get; set; }
    public PrescriptionDocument? PrescriptionDocument { get; set; }
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;
    public Guid ClinicId { get; set; }

    public string MedicationName { get; set; } = string.Empty;
    public string? GenericName { get; set; }
    public string? BrandName { get; set; }
    public string? Form { get; set; }
    public int SortOrder { get; set; }
    public string? Dosage { get; set; }
    public string? Frequency { get; set; }
    public string? Duration { get; set; }
    public string? Instructions { get; set; }
    public int? Quantity { get; set; }
    public DateTime IssuedAt { get; set; }
    public bool IsDispensed { get; set; }

    // PhilHealth GAMOT Benefit & UPSC Interoperability
    public bool IsPhilHealthGamot { get; set; }
    public string? PhilHealthDrugCode { get; set; }
    public string? UniquePrescriptionSecurityCode { get; set; }
    public decimal? GamotCoverageAmount { get; set; }
}
