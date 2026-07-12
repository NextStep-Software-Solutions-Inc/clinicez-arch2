using PatientAppBE.Domain.Common;
using PatientAppBE.Domain.Enums;

namespace PatientAppBE.Domain.Entities;

public sealed class LabResult : BaseEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;
    public Guid ClinicId { get; set; }
    public Guid? ConsultationId { get; set; }
    public Consultation? Consultation { get; set; }

    public string TestName { get; set; } = string.Empty;
    public LabResultCategory Category { get; set; }
    public string? Result { get; set; }
    public string? ReferenceRange { get; set; }
    public string? Unit { get; set; }
    public LabResultStatus Status { get; set; }
    public DateTime? CollectedAt { get; set; }
    public DateTime? ResultedAt { get; set; }
    public string? FileUrl { get; set; }
}
