using PatientApp.Domain.Common;
using PatientApp.Domain.Enums;

namespace PatientApp.Domain.Entities;

public sealed class PatientSocialHistory : BaseEntity, ISyncable
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public SmokingStatus? SmokingStatus { get; set; }
    public decimal? PacksPerDay { get; set; }
    public int? SmokingYears { get; set; }

    public AlcoholUse? AlcoholUse { get; set; }
    public string? AlcoholFrequency { get; set; }

    public bool UsesSubstances { get; set; }
    public string? SubstanceTypes { get; set; }

    public ActivityLevel? ActivityLevel { get; set; }
    public string? DietNotes { get; set; }
    public string? OccupationalHazards { get; set; }
}
