using System;

namespace ClinicEz.Shared.Common;

public record ClinicRecordVerifiedEvent
{
    public Guid EventId { get; init; } = Guid.NewGuid();
    public Guid AttachmentId { get; init; }
    public string TenantId { get; init; } = string.Empty;
    public Guid ClinicId { get; init; }
    public Guid PatientId { get; init; }
    public string RecordType { get; init; } = "LabResult";
    public string Title { get; init; } = string.Empty;
    public string FileName { get; init; } = string.Empty;
    public string ContentType { get; init; } = "application/pdf";
    public long FileSizeBytes { get; init; }
    public string VerificationStatus { get; init; } = "Verified";
    public string? RejectionReason { get; init; }
    public DateTime VerifiedAt { get; init; } = DateTime.UtcNow;
    public string? VerifiedByStaffName { get; init; }
}
