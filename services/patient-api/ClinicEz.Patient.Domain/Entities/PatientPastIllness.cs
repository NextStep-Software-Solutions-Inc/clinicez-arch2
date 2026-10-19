using ClinicEz.Patient.Domain.Common;

namespace ClinicEz.Patient.Domain.Entities;

public sealed class PatientPastIllness : BaseEntity, ISyncable
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public string IllnessName { get; set; } = string.Empty;
    public DateOnly? DiagnosedAt { get; set; }
    public DateOnly? ResolvedAt { get; set; }
    public string? TreatmentReceived { get; set; }
    public string? Notes { get; set; }
}
