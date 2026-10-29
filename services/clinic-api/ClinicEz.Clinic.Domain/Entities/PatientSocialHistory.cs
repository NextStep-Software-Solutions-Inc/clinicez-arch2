using System;
using System.ComponentModel.DataAnnotations.Schema;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class PatientSocialHistory : ClinicScopedEntity
{
    public Guid PatientId { get; set; }
    public Patient? Patient { get; set; }

    // Tobacco smoking history
    public bool IsSmoker { get; set; }
    public decimal? PacksPerDay { get; set; }
    public int? CigarettesPerDay { get; set; }
    public int? YearsSmoking { get; set; }
    public decimal? SmokingPackYears { get; set; }
    public DateOnly? SmokingStoppedDate { get; set; }
    public string? TobaccoType { get; set; } // Cigarettes, E-Cigarette/Vape, Cigars, Smokeless

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
    public int? ExerciseMinutesPerWeek { get; set; }
    public int? SleepHoursPerNight { get; set; }
    public string? DietaryHabits { get; set; }

    // Social Determinants of Health (SDOH)
    public string? Occupation { get; set; }
    public string? Industry { get; set; }
    public string? EducationLevel { get; set; }
    public string? LivingArrangement { get; set; }

    public string? Remarks { get; set; }

    // Annex A sochist 28 Statutory Fields
    public string? EducationAttainmentCode { get; set; }
    public string? EmploymentStatusCode { get; set; }
    public string? SecondhandSmokeExposureCode { get; set; }
    public int? SmokingStartYear { get; set; }
    public int? SmokingQuitYear { get; set; }
    public bool? IsCurrentVapeUser { get; set; }
    public int? CurrentVapeYears { get; set; }
    public bool? IsFormerVapeUser { get; set; }
    public int? FormerVapeYears { get; set; }
    public string? VapeDeviceCode { get; set; }
    public decimal? NicotineConcentrationMg { get; set; }
    public string? AlcoholDrinkerSubtypeCode { get; set; }
    public string? AlcoholTypeCodes { get; set; }
    public int? AlcoholGlassesPerOccasion { get; set; }
    public int? AlcoholIntakeYears { get; set; }
    public int? AlcoholStartYear { get; set; }
    public int? AlcoholQuitYear { get; set; }
    public string? CurrentSubstanceSpec { get; set; }
    public string? FormerSubstanceSpec { get; set; }
    public string? FamilySubstanceAbuseHistory { get; set; }
    public string? DietaryIntakeCode { get; set; }
    public string? BreastfeedingStatusCode { get; set; }
    public bool IsPhysicallyActive { get; set; } = false;
    public int? ModerateActivityMinutesPerWeek { get; set; }
    public int? VigorousActivityMinutesPerWeek { get; set; }
    public decimal? CaffeineCupsPerDay { get; set; }
    public string? StressRating { get; set; }
    public string? StressCauses { get; set; }
    public bool UsesFluorideToothpaste { get; set; } = true;
    public string? DentalCheckupStatusCode { get; set; }
    public int? LastDentalCheckupYear { get; set; }
    public string? NeighborhoodCommunicableDisease { get; set; }
    public string? MentalHealthEventCode { get; set; }
    public string? OtherMentalHealthEvent { get; set; }
    public string? DietCodes { get; set; }
    public string? ImmunizationSummaryCode { get; set; }
    public string? SmokingFreqCode { get; set; }
    public string? AlcoholFreqCode { get; set; }
    public string? IllicitDrugUseCode { get; set; }
    public string? SexuallyActiveCode { get; set; }
    public string? PartnersGenderCode { get; set; }
    public string? PhysicalActivityCode { get; set; }
    public string? WaterSourceCode { get; set; }
    public string? ToiletFacilityCode { get; set; }

    private string? _smokingStatus;
    public string? SmokingStatus
    {
        get => _smokingStatus ?? (IsSmoker ? "current" : (SmokingStoppedDate.HasValue ? "quit" : "never"));
        set => _smokingStatus = value;
    }

    private string? _alcoholStatus;
    public string? AlcoholStatus
    {
        get => _alcoholStatus ?? (IsAlcoholDrinker ? "current" : (string.Equals(AlcoholFrequency, "Quit", StringComparison.OrdinalIgnoreCase) || string.Equals(AlcoholFrequency, "Former", StringComparison.OrdinalIgnoreCase) ? "quit" : "never"));
        set => _alcoholStatus = value;
    }
}
