using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class RecordAttachment : ClinicScopedEntity
{
    public Guid PatientId { get; set; }
    public Patient? Patient { get; set; }
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

    /// <summary>
    /// Verification status: Verified, PendingVerification, Rejected
    /// </summary>
    public string VerificationStatus { get; set; } = "Verified";
    public string? RejectionReason { get; set; }
    public DateTime? VerifiedAt { get; set; }
    public Guid? VerifiedByStaffId { get; set; }
    public string? VerifiedByStaffName { get; set; }

    /// <summary>
    /// Encryption metadata (at-rest envelope encryption with Clinic Master Key)
    /// </summary>
    public string EncryptionAlgorithm { get; set; } = "AES-256-GCM";
    public string? EncryptionKeyId { get; set; }
    public string? EncryptionIvBase64 { get; set; }
    public string? EncryptionTagBase64 { get; set; }
    public long? EncryptedSizeBytes { get; set; }
    public string? EncryptedHash { get; set; }
    public string? WrappedKeyJson { get; set; }
}
