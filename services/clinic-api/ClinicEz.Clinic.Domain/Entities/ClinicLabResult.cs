using System;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Clinic.Domain.Entities;

/// <summary>
/// One result delivered for a clinic lab order: the ClinicEZ lab's finalized report, an external lab's upload or a
/// patient's own upload. <see cref="Source"/> is derived by the server from the channel the result arrived on and
/// decides the starting <see cref="Verification"/>; it is never supplied by a caller. The file itself lives encrypted in
/// clinic storage (<see cref="StorageKey"/>), never in a row.
/// </summary>
public sealed class ClinicLabResult : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }

    public Guid LabOrderId { get; set; }

    /// <summary>Report id assigned by the performing lab (finalized reports only), so a redelivery is recognised.</summary>
    public Guid? ReportId { get; set; }

    public ResultSource Source { get; set; }
    public VerificationState Verification { get; set; }

    public string? ExternalLabName { get; set; }
    public string? Notes { get; set; }

    public string? FileName { get; set; }
    public string? ContentType { get; set; }
    public long FileSizeBytes { get; set; }
    public string? StorageKey { get; set; }
    public string? EncryptionIvBase64 { get; set; }
    public string? EncryptionTagBase64 { get; set; }
    public string? WrappedKeyJson { get; set; }
    public string? EncryptedHash { get; set; }

    /// <summary>The patient-api patient who uploaded it, when <see cref="Source"/> is <see cref="ResultSource.PatientUploaded"/>.</summary>
    public Guid? UploadedByPatientId { get; set; }

    public DateTime SubmittedAt { get; set; } = DateTime.UtcNow;

    public Guid? VerifiedByStaffId { get; set; }
    public string? VerifiedByName { get; set; }
    public string? VerifiedByPrc { get; set; }
    public DateTime? VerifiedAt { get; set; }
    public string? ReviewRemarks { get; set; }
}
