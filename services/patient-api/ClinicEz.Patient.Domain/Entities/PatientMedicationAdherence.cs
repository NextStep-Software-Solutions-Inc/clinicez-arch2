using ClinicEz.Patient.Domain.Common;

namespace ClinicEz.Patient.Domain.Entities;

public sealed class PatientMedicationAdherence : BaseEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public Guid PatientMedicationId { get; set; }
    public PatientMedication PatientMedication { get; set; } = null!;

    public DateTime TakenAt { get; set; }
    public bool IsTaken { get; set; } = true;
    public string? DoseSlot { get; set; }
    public string? Notes { get; set; }
}
