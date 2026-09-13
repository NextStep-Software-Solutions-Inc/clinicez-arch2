using ClinicEz.Patient.Domain.Common;

namespace ClinicEz.Patient.Domain.Entities;

public sealed class PatientMentalHealthProfile : BaseEntity, ISyncable
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public bool HasDiagnosis { get; set; }
    public string? DiagnosisName { get; set; }
    public bool IsOnMedication { get; set; }
    public string? MedicationName { get; set; }
    public string? TherapistName { get; set; }
    public string? TherapyType { get; set; }
    public string? SessionFrequency { get; set; }
    public string? Notes { get; set; }
}
