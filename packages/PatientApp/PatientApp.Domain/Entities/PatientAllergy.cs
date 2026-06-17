using PatientApp.Domain.Common;
using PatientApp.Domain.Enums;

namespace PatientApp.Domain.Entities;

public sealed class PatientAllergy : BaseEntity, ISyncable
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public string AllergenName { get; set; } = string.Empty;
    public AllergyType AllergyType { get; set; }
    public AllergySeverity Severity { get; set; }
    public string? Reaction { get; set; }
    public DateOnly? OnsetDate { get; set; }
    public string? Notes { get; set; }
}
