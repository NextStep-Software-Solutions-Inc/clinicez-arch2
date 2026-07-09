using PatientApp.Domain.Common;

namespace PatientApp.Domain.Entities;

public sealed class PatientChronicCondition : BaseEntity, ISyncable
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public string ConditionName { get; set; } = string.Empty;
    public DateOnly? DiagnosedAt { get; set; }
    public bool IsControlled { get; set; }
    public string? TreatmentNotes { get; set; }
    public string? CurrentMedications { get; set; }
}
