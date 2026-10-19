using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class PrescriptionItem : BaseEntity
{
    public Guid ConsultationEncounterId { get; set; }
    public ConsultationEncounter? ConsultationEncounter { get; set; }

    public required string GenericName { get; set; }
    public string? BrandName { get; set; }
    public required string Dosage { get; set; }
    public required string Form { get; set; } // Tablet, Capsule, Syrup, Susp, etc.
    public required string Sig { get; set; }  // Instructions / Directions
    public int Quantity { get; set; }
    public int? DurationDays { get; set; }
    public int Refills { get; set; } = 0;
    public bool IsDangerousDrug { get; set; } = false; // Requires S2 license
    public string? Remarks { get; set; }
    public string? PhilHealthDrugCode { get; set; }
}
