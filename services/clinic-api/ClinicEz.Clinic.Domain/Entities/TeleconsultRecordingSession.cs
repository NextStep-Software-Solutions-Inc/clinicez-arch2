using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class TeleconsultRecordingSession : ClinicScopedEntity
{
    public Guid? BranchId { get; set; }

    /// <summary>Unique media call identifier correlated across comms-api and media-broker.</summary>
    public Guid CallId { get; set; }

    public Guid? AppointmentId { get; set; }
    public Appointment? Appointment { get; set; }

    public Guid? ConsultationId { get; set; }
    public ConsultationEncounter? Consultation { get; set; }

    public Guid PatientId { get; set; }
    public Patient? Patient { get; set; }
    public required string PatientName { get; set; }

    public Guid DoctorId { get; set; }
    public required string DoctorName { get; set; }

    /// <summary>
    /// Dual Consent Status: NotRequested, ConsentPending, Consented, Rejected, Revoked, Expired.
    /// </summary>
    public string ConsentStatus { get; set; } = "NotRequested";
    public DateTime? ClinicianConsentAtUtc { get; set; }
    public DateTime? PatientConsentAtUtc { get; set; }
    public string? PatientConsentIpAddress { get; set; }
    public string? PatientConsentUserAgent { get; set; }
    public string? RejectionReason { get; set; }

    /// <summary>
    /// Recording Lifecycle State: PendingConsent, ReadyToRecord, Recording, Paused, Completed, Blocked, Aborted, Purged.
    /// </summary>
    public string RecordingState { get; set; } = "PendingConsent";

    /// <summary>
    /// Storage destination policy snapshot at initiation: WorkspaceVaultOnly, Both, LocalDeviceOnly.
    /// </summary>
    public string StoragePolicy { get; set; } = "WorkspaceVaultOnly";

    public DateTime? StartedAtUtc { get; set; }
    public DateTime? StoppedAtUtc { get; set; }
    public int TotalDurationSeconds { get; set; } = 0;
    public int SegmentCount { get; set; } = 0;
    public long TotalSizeBytes { get; set; } = 0;
    public string ContainerFormat { get; set; } = "video/webm; codecs=vp8,opus";

    /// <summary>Storage URI to the encrypted manifest JSON describing all segment chunks.</summary>
    public string? ManifestStorageKey { get; set; }
    public string EncryptionAlgorithm { get; set; } = "AES-256-GCM";
    public string EncryptionKeyId { get; set; } = "cmk-v1";
    public bool HasGaps { get; set; } = false;

    // ── Retention & Medico-Legal Hold ─────────────────────────────────────────
    public int RetentionPolicyDays { get; set; } = 90;
    public DateTime? ExpiresAtUtc { get; set; }

    /// <summary>
    /// Medico-legal hold flag. When true, automated retention sweeps CANNOT purge this recording.
    /// </summary>
    public bool IsLegalHold { get; set; } = false;
    public string? LegalHoldReason { get; set; }
    public DateTime? LegalHoldPlacedAtUtc { get; set; }
    public Guid? LegalHoldPlacedByStaffId { get; set; }
    public string? LegalHoldPlacedByStaffName { get; set; }

    // ── Automated Purge Tracking ─────────────────────────────────────────────
    public bool IsPurged { get; set; } = false;
    public DateTime? PurgedAtUtc { get; set; }
    public string? PurgedBy { get; set; }

    // ── Navigation ───────────────────────────────────────────────────────────
    public ICollection<TeleconsultRecordingSegment> Segments { get; set; } = new List<TeleconsultRecordingSegment>();
}
