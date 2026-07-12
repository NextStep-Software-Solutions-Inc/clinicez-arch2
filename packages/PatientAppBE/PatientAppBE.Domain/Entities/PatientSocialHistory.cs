using PatientAppBE.Domain.Common;
using PatientAppBE.Domain.Enums;

namespace PatientAppBE.Domain.Entities;

public sealed class PatientSocialHistory : BaseEntity, ISyncable
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    // Tobacco
    public SmokingStatus? SmokingStatus { get; set; }
    public int? CigsPerDay { get; set; }
    public decimal? PackYears { get; set; }
    public DateOnly? QuitDate { get; set; }
    public string? OtherTobaccoProducts { get; set; }

    // Alcohol
    public AlcoholUse? AlcoholUse { get; set; }
    public string? AlcoholType { get; set; }
    public int? AlcoholFrequencyDaysPerWeek { get; set; }
    public int? AlcoholQuantityPerOccasion { get; set; }

    // Substance use
    public bool UsesSubstances { get; set; }
    public string? SubstanceName { get; set; }
    public string? SubstanceRoute { get; set; }
    public string? SubstanceFrequency { get; set; }

    // Physical activity
    public ActivityLevel? ActivityLevel { get; set; }
    public string? ExerciseType { get; set; }
    public int? ExerciseFrequencyDaysPerWeek { get; set; }

    // Diet
    public string? DietPattern { get; set; }
    public string? FoodRestrictions { get; set; }

    // Sleep
    public decimal? SleepAvgHours { get; set; }
    public SleepQuality? SleepQuality { get; set; }

    // Sexual health
    public bool? IsSexuallyActive { get; set; }

    // Other
    public string? WaterIntake { get; set; }
    public string? OccupationalHazards { get; set; }
}
