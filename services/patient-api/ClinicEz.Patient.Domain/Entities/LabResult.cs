using ClinicEz.Patient.Domain.Common;
using ClinicEz.Patient.Domain.Enums;

namespace ClinicEz.Patient.Domain.Entities;

public sealed class LabResult : BaseEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;
    public Guid ClinicId { get; set; }
    public Guid? ConsultationId { get; set; }
    public Consultation? Consultation { get; set; }
    /// <summary>The report this analyte belongs to when it was received from a laboratory.</summary>
    public Guid? LabResultReportId { get; set; }
    public LabResultReport? Report { get; set; }

    public string TestName { get; set; } = string.Empty;
    public LabResultCategory Category { get; set; }
    public string? Result { get; set; }
    public string? ReferenceRange { get; set; }
    public string? Unit { get; set; }
    public string? Panel { get; set; }
    /// <summary>Normal, Low, High or Critical as reported by the laboratory.</summary>
    public string? Flag { get; set; }
    public LabResultStatus Status { get; set; }
    public DateTime? CollectedAt { get; set; }
    public DateTime? ResultedAt { get; set; }
    public string? FileUrl { get; set; }
}
