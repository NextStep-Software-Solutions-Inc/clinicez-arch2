using PatientApp.Domain.Common;

namespace PatientApp.Domain.Entities;

public sealed class PatientSurgicalHistory : BaseEntity, ISyncable
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public string ProcedureName { get; set; } = string.Empty;
    public string? SurgeonName { get; set; }
    public string? Hospital { get; set; }
    public DateOnly? SurgeryDate { get; set; }
    public string? AnesthesiaType { get; set; }
    public string? Complications { get; set; }
    public string? Notes { get; set; }
}
