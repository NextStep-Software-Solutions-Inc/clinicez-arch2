using PatientAppBE.Domain.Common;

namespace PatientAppBE.Domain.Entities;

public sealed class PatientPregnancy : BaseEntity, ISyncable
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public int? Year { get; set; }
    public string? Outcome { get; set; }
    public int? GestationalAgeWeeks { get; set; }
    public string? DeliveryType { get; set; }
    public decimal? BirthWeightKg { get; set; }
    public string? Complications { get; set; }
    public string? Facility { get; set; }
}
