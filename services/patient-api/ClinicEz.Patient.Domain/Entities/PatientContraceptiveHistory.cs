using ClinicEz.Patient.Domain.Common;

namespace ClinicEz.Patient.Domain.Entities;

public sealed class PatientContraceptiveHistory : BaseEntity, ISyncable
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public string Method { get; set; } = string.Empty;
    public bool IsCurrent { get; set; }
    public DateOnly? DateStarted { get; set; }
    public string? ReasonForStopping { get; set; }
}
