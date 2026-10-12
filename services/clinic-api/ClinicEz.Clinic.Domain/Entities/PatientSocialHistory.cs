using System;
using System.ComponentModel.DataAnnotations.Schema;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class PatientSocialHistory : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid PatientId { get; set; }
    public ClinicPatient? Patient { get; set; }

    // Tobacco smoking history
    public bool IsSmoker { get; set; }
    public decimal? PacksPerDay { get; set; }
    public int? CigarettesPerDay { get; set; }
    public int? YearsSmoking { get; set; }
    public decimal? SmokingPackYears { get; set; }
    public DateOnly? SmokingStoppedDate { get; set; }

    // Alcohol consumption history
    public bool IsAlcoholDrinker { get; set; }
    public int? AlcoholDrinksPerWeek { get; set; }
    public int? AlcoholBottlesPerDay { get; set; }
    public string? AlcoholFrequency { get; set; } // "Occasional", "Weekly", "Daily", etc.

    // Substance use history
    public bool UsesIllicitDrugs { get; set; }
    public string? SubstanceUseHistory { get; set; }
    public string? DrugTypes { get; set; }

    // Sexual activity history
    public bool IsSexuallyActive { get; set; }
    public int? CoitarcheAge { get; set; }

    // Physical Activity & Lifestyle
    public string? PhysicalActivityFrequency { get; set; }
    public string? DietaryHabits { get; set; }
    public string? Remarks { get; set; }

    [NotMapped]
    public string SmokingStatus
    {
        get => IsSmoker ? "current" : (SmokingStoppedDate.HasValue ? "quit" : "never");
    }

    [NotMapped]
    public string AlcoholStatus
    {
        get => IsAlcoholDrinker ? "current" : (string.Equals(AlcoholFrequency, "Quit", StringComparison.OrdinalIgnoreCase) || string.Equals(AlcoholFrequency, "Former", StringComparison.OrdinalIgnoreCase) ? "quit" : "never");
    }
}

