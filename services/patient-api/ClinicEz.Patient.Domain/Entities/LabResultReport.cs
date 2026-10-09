using ClinicEz.Patient.Domain.Common;
using ClinicEz.Patient.Domain.Enums;

namespace ClinicEz.Patient.Domain.Entities;

/// <summary>Header of a lab report the patient received; its analytes are <see cref="LabResult"/> rows. Carries the provenance and verification state.</summary>
public sealed class LabResultReport : BaseEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    /// <summary>Id of the report at its source (diagnostic report id, or the upload id for patient uploads); the idempotency key for upserts.</summary>
    public Guid ReportId { get; set; }
    public Guid? RequisitionId { get; set; }

    public string LaboratoryName { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string? Impression { get; set; }
    public bool IsCritical { get; set; }
    public DateTime ResultedAt { get; set; }

    public ResultProvenance Source { get; set; }
    public ResultVerification Verification { get; set; }
    public string? ReviewedByName { get; set; }
    public string? ReviewedByPrc { get; set; }
    public DateTime? ReviewedAt { get; set; }
    public string? ReviewRemarks { get; set; }

    /// <summary>Object key of the attached report file (patient uploads, signed PDFs); never inline bytes.</summary>
    public string? FileStorageKey { get; set; }
    public string? FileName { get; set; }
    public string? FileContentType { get; set; }

    public ICollection<LabResult> Observations { get; set; } = [];
}