using PatientApp.Domain.Common;
using PatientApp.Domain.Enums;

namespace PatientApp.Domain.Entities;

public sealed class PatientOccupation : BaseEntity, ISyncable
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public string? Occupation { get; set; }
    public string? Employer { get; set; }
    public string? Industry { get; set; }
    public WorkEnvironment? WorkEnvironment { get; set; }
    public int? YearsInOccupation { get; set; }
    public string? HazardExposure { get; set; }
}
