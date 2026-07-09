using PatientApp.Domain.Common;

namespace PatientApp.Domain.Entities;

public sealed class Consultation : BaseEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;
    public Guid ClinicId { get; set; }
    public Guid ProviderId { get; set; }

    public DateTime ConsultedAt { get; set; }
    public string? ChiefComplaint { get; set; }
    public string? Assessment { get; set; }
    public string? Diagnosis { get; set; }
    public string? Icd10Code { get; set; }
    public string? Plan { get; set; }
    public string? Notes { get; set; }

    public ICollection<VitalSigns> VitalSigns { get; set; } = [];
    public ICollection<Prescription> Prescriptions { get; set; } = [];
    public ICollection<LabResult> LabResults { get; set; } = [];
    public ICollection<ImagingResult> ImagingResults { get; set; } = [];
}
