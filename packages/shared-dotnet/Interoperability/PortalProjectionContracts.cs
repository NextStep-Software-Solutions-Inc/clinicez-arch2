using System;
using System.Collections.Generic;

namespace ClinicEz.Shared.Interoperability;

/// <summary>
/// Clinic -> portal, type <c>facility.join-settings.updated</c> (<c>InteropTypes.FacilityJoinSettingsUpdated</c>).
/// Emitted by clinic-api when clinic join link settings, operating hours, or address are created or modified.
/// Synchronizes public join validation metadata into portal-api's Facilities projection.
/// </summary>
public sealed record FacilityJoinSettingsUpdatedPayload
{
    public string TenantId { get; init; } = string.Empty;
    public Guid FacilityId { get; init; }
    public bool IsJoinEnabled { get; init; } = true;
    public string? JoinCode { get; init; }
    public DateTime? JoinCodeExpiresAtUtc { get; init; }
    public string? FacilityAddress { get; init; }
    public string? OperatingHours { get; init; }
    public DateTime UpdatedAtUtc { get; init; } = DateTime.UtcNow;
}

/// <summary>
/// Clinic / Laboratory -> portal, type <c>document.attestation.published</c> (<c>InteropTypes.DocumentAttestationPublished</c>).
/// Emitted when a verified clinical document (medical-certificate, referral, rx, lab-order, receipt, lab-report)
/// is signed, issued, or transitioned.
/// Strictly zero PHI: contains only cryptographic verification digest, prescriber/issuer metadata, and lifecycle status.
/// </summary>
public sealed record DocumentAttestationPublishedPayload
{
    public Guid SourceDocumentId { get; init; }
    public string TenantId { get; init; } = string.Empty;
    public Guid FacilityId { get; init; }

    /// <summary>
    /// Document kind discriminator: "medical-certificate", "referral", "rx", "lab-order", "receipt", "lab-report".
    /// </summary>
    public string DocumentKind { get; init; } = string.Empty;

    /// <summary>
    /// Sequential human-readable document number (e.g. "MC-20261025-0001", "RX-20261025-0042", "ACC-20261025-0012").
    /// </summary>
    public string DocumentNumber { get; init; } = string.Empty;

    /// <summary>
    /// Full cryptographic document digest (e.g. "SEC-SHA256-4A5B6C7D8E9F1011").
    /// </summary>
    public string SecurityDigest { get; init; } = string.Empty;

    /// <summary>
    /// Hex-encoded SHA-256 hash of the public verification token for prescriptions ({clinicId:N}.{secret} or legacy rxv_...).
    /// Null for non-prescription documents.
    /// </summary>
    public string? VerificationTokenHash { get; init; }

    public string ClinicName { get; init; } = string.Empty;
    public string? ClinicAddress { get; init; }
    public string? ClinicContact { get; init; }
    public string? DoctorName { get; init; }
    public string? DoctorPrcLicense { get; init; }
    public string? DoctorPtr { get; init; }
    public string? DoctorS2License { get; init; }
    public DateTime IssuedAtUtc { get; init; } = DateTime.UtcNow;
    public DateTime? ExpiresAtUtc { get; init; }

    /// <summary>
    /// Document status: "VALID", "REVOKED", "DISPENSED", "EXPIRED".
    /// </summary>
    public string Status { get; init; } = "VALID";

    public bool IsAlreadyDispensed { get; init; }
    public string? DispenseStatus { get; init; } // "Pending", "Dispensed", "DispensedExternally"
    public string? DispensedPharmacyName { get; init; }
    public DateTime? DispensedAtUtc { get; init; }
    public bool HasDangerousDrug { get; init; }
    public int ItemCount { get; init; }
}

/// <summary>
/// Active ticket currently called or in consultation at a clinician room or triage station.
/// Displayed on public waiting-area TV displays without patient full name.
/// </summary>
public sealed record QueueBoardServingItemDto
{
    public Guid QueueItemId { get; init; }
    public string TicketNumber { get; init; } = string.Empty;
    public string? DoctorName { get; init; }
    public string? RoomOrStation { get; init; }
    public DateTime? CalledTime { get; init; }
    public string Status { get; init; } = "InConsultation";
}

/// <summary>
/// Upcoming ticket in queue waiting for service.
/// Strictly ZERO PHI: <see cref="DisplayName"/> is always null on the public projection.
/// </summary>
public sealed record QueueBoardUpcomingItemDto
{
    public Guid QueueItemId { get; init; }
    public string TicketNumber { get; init; } = string.Empty;

    /// <summary>
    /// Always null for zero-PHI public waiting-area projection.
    /// </summary>
    public string? DisplayName { get; init; } = null;

    public string Priority { get; init; } = "Routine"; // "Routine", "Urgent", "Emergency"
    public string Status { get; init; } = "Waiting";
    public int SequenceNumber { get; init; }
    public DateTime? CheckInTime { get; init; }
}

/// <summary>
/// Clinic -> portal, type <c>facility.queue-board.updated</c> (<c>InteropTypes.QueueBoardUpdated</c>).
/// Emitted by clinic-api whenever an OPD queue ticket is added, called, on hold, completed, or cancelled.
/// Contains the complete zero-PHI waiting-area TV snapshot for the Manila queue date.
/// </summary>
public sealed record QueueBoardUpdatedPayload
{
    public string TenantId { get; init; } = string.Empty;
    public Guid FacilityId { get; init; }

    /// <summary>
    /// Active queue date in Asia/Manila (YYYY-MM-DD). Tickets automatically clear when QueueDate &lt; todayManila.
    /// </summary>
    public DateOnly QueueDate { get; init; }

    public DateTime GeneratedAtUtc { get; init; } = DateTime.UtcNow;
    public bool IsAcceptingWalkIns { get; init; } = true;
    public int PatientsWaitingCount { get; init; }
    public IReadOnlyList<QueueBoardServingItemDto> NowServing { get; init; } = Array.Empty<QueueBoardServingItemDto>();
    public IReadOnlyList<QueueBoardUpcomingItemDto> UpNext { get; init; } = Array.Empty<QueueBoardUpcomingItemDto>();
}
