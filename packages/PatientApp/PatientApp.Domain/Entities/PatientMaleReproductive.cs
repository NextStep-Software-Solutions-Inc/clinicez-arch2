using PatientApp.Domain.Common;

namespace PatientApp.Domain.Entities;

public sealed class PatientMaleReproductive : BaseEntity, ISyncable
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public bool HasVasectomy { get; set; }
    public DateOnly? VasectomyDate { get; set; }
    public string? Conditions { get; set; }
}
