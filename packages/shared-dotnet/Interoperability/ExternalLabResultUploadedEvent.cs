using System;

namespace ClinicEz.Shared.Interoperability;

public record ExternalLabResultUploadedEvent
{
    public Guid UploadId { get; init; } = Guid.NewGuid();
    public Guid RequisitionId { get; init; }
    public string AccessionNumber { get; init; } = string.Empty;
    public Guid PatientId { get; init; }
    public string UploadedBy { get; init; } = "Patient"; // Patient, ExternalLab, ClinicStaff
    public string? ExternalLabName { get; init; }
    public string DocumentType { get; init; } = "Photo"; // Photo, PDF
    public string? DocumentUrl { get; init; }
    public string? FileBase64 { get; init; }
    public string? Notes { get; init; }
    public DateTime UploadedAt { get; init; } = DateTime.UtcNow;
}
