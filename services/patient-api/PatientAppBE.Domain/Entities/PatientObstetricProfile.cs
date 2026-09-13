using PatientAppBE.Domain.Common;

namespace PatientAppBE.Domain.Entities;

public sealed class PatientObstetricProfile : BaseEntity, ISyncable
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public int? Gravida { get; set; }
    public int? Para { get; set; }
    public int? AbortusCount { get; set; }
    public int? LivingChildren { get; set; }
    public DateOnly? LastMenstrualPeriod { get; set; }
    public DateOnly? Menarche { get; set; }
    public bool IsPregnant { get; set; }
    public int? MenstrualCycleLengthDays { get; set; }
    public bool HasDysmenorrhea { get; set; }
    public string? Notes { get; set; }
}
