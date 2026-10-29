using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class PrescriptionItem : ClinicScopedEntity
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

    public string Route { get; set; } = "Oral";
    public decimal DoseQuantity { get; set; } = 1m;
    public string DoseUnit { get; set; } = "TAB";
    public string Frequency { get; set; } = "Once daily";
    public decimal? UnitPrice { get; set; }
    public decimal? TotalCost { get; set; }
    public string? PhilHealthCategory { get; set; }
    public string? DrugGroupingCode { get; set; }

    // PhilHealth Statutory Tracking (PCAPI medicine Service 06)
    public string? PhilHealthMedsTransNo { get; set; }

    // 8 drug component codes from lib_medicine*
    public string? GenericCode { get; set; }
    public string? SaltCode { get; set; }
    public string? StrengthCode { get; set; }
    public string? FormCode { get; set; }
    public string? UnitCode { get; set; }
    public string? PackageCode { get; set; }
    public string? CategoryCode { get; set; }

    public string? RouteCode { get; set; }
    public string? FrequencyCode { get; set; }
    public string? InstructionDuration { get; set; }

    public DateOnly? PrescriptionDate { get; set; }
    public string? PrescribingPhysicianName { get; set; }
    public string? PrescribingPhysicianPrcNo { get; set; }
    public string? DispensingFacilityName { get; set; }
    public bool IsDispensed { get; set; } = false;
    public int? DispensedQuantity { get; set; }
    public DateOnly? DispensedDate { get; set; }
    public string? DispensingPersonnel { get; set; }

    // Preserved for pharmacy interoperability
    public bool IsGamotCovered { get; set; } = false;
    public string? UniquePrescriptionSecurityCode { get; set; }
}
