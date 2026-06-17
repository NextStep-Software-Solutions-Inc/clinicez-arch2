using PatientApp.Domain.Common;

namespace PatientApp.Domain.Entities;

public sealed class PatientMedication : BaseEntity, ISyncable
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public string MedicationName { get; set; } = string.Empty;
    public string? GenericName { get; set; }
    public string? Dosage { get; set; }
    public string? Frequency { get; set; }
    public string? Route { get; set; }
    public DateOnly? StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public bool IsCurrentlyTaking { get; set; }
    public string? PrescribedBy { get; set; }
    public string? Purpose { get; set; }
    public string? Notes { get; set; }
}
