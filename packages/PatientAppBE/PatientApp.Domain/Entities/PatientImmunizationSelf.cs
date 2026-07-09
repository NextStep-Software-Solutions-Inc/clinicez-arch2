using PatientApp.Domain.Common;
using PatientApp.Domain.Enums;

namespace PatientApp.Domain.Entities;

public sealed class PatientImmunizationSelf : BaseEntity, ISyncable
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public ImmunizationCategory? ImmunizationCategory { get; set; }
    public string VaccineName { get; set; } = string.Empty;
    public string? DoseNumber { get; set; }
    public string? LotNumber { get; set; }
    public DateOnly? Date { get; set; }
    public string? AdministeredBy { get; set; }
}
