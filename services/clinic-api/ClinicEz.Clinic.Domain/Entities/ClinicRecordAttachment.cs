using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class ClinicRecordAttachment : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }

    public Guid PatientId { get; set; }
    public Guid? ConsultationId { get; set; }

    /// <summary>
    /// LabResult, ImagingReport, ECGStrip, ExternalReferral, DischargeSummary, ConsentForm, Other
    /// </summary>
    public string RecordType { get; set; } = "LabResult";

    public required string Title { get; set; }
    public required string FileName { get; set; }
    public string ContentType { get; set; } = "application/pdf";
    public long FileSizeBytes { get; set; }

    /// <summary>
    /// File storage URI, key, or base64 data string
    /// </summary>
    public required string StorageUri { get; set; }

    public DateOnly DocumentDate { get; set; }
    public string? Notes { get; set; }

    public Guid? UploadedByStaffId { get; set; }
    public string? UploadedByStaffName { get; set; }
}
