using PatientApp.Domain.Common;

namespace PatientApp.Domain.Entities;

public sealed class EmergencyContact : BaseEntity, ISyncable
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public string FullName { get; set; } = string.Empty;
    public string? Relationship { get; set; }
    public string? Mobile { get; set; }
    public string? AltPhone { get; set; }
    public bool IsPrimary { get; set; }
}
