using ClinicEz.Patient.Domain.Common;

namespace ClinicEz.Patient.Domain.Entities;

public sealed class PatientMedicationLog : BaseEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public Guid PatientMedicationId { get; set; }
    public PatientMedication PatientMedication { get; set; } = null!;

    public DateOnly LogDate { get; set; }
    public string? ScheduledTimeLabel { get; set; }
    public DateTime TakenAt { get; set; }
    public string? Notes { get; set; }
}
