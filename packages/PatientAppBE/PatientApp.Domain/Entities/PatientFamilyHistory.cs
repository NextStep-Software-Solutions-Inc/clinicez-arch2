using PatientApp.Domain.Common;
using PatientApp.Domain.Enums;

namespace PatientApp.Domain.Entities;

public sealed class PatientFamilyHistory : BaseEntity, ISyncable
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public FamilyRelation Relation { get; set; }
    public string ConditionName { get; set; } = string.Empty;
    public int? AgeOfOnset { get; set; }
    public bool IsDeceased { get; set; }
    public string? Notes { get; set; }
}
