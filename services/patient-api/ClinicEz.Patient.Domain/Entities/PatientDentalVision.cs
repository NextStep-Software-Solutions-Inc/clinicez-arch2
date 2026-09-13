using ClinicEz.Patient.Domain.Common;
using ClinicEz.Patient.Domain.Enums;

namespace ClinicEz.Patient.Domain.Entities;

public sealed class PatientDentalVision : BaseEntity, ISyncable
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    // Dental
    public string? DentistName { get; set; }
    public string? DentistClinic { get; set; }
    public string? OrthodonticDevice { get; set; }

    // Vision
    public string? EyeDoctorName { get; set; }
    public CorrectiveLenses? CorrectiveLenses { get; set; }
}
