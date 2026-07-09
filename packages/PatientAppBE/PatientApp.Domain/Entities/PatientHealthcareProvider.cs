using PatientApp.Domain.Common;
using PatientApp.Domain.Enums;

namespace PatientApp.Domain.Entities;

public sealed class PatientHealthcareProvider : BaseEntity, ISyncable
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public HealthcareProviderType ProviderType { get; set; }
    public string? Name { get; set; }
    public string? Specialty { get; set; }
    public string? ClinicHospital { get; set; }
    public string? Phone { get; set; }
}
