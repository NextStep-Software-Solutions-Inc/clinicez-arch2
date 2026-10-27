using System;
using System.Collections.Generic;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Comms.Domain.Enums;
using ClinicEz.Shared.Interop.Contracts;

namespace ClinicEz.Comms.MigrationTool.Models;

public sealed class ConversationRecord
{
    public Guid Id { get; set; }
    public string TenantId { get; set; } = string.Empty;
    public string FacilityId { get; set; } = string.Empty;
    public string? BranchId { get; set; }
    public ConversationScope Scope { get; set; }
    public ConversationKind Kind { get; set; }
    public Guid? PatientId { get; set; }
    public Guid? SubmittingAccountId { get; set; }
    public string? Relationship { get; set; }
    public Guid? GrantId { get; set; }
    public DateTime? GrantWindowEndUtc { get; set; }
    public string? ContextType { get; set; }
    public string? ContextId { get; set; }
    public string Title { get; set; } = string.Empty;
    public MessageCategory? Category { get; set; }
    public RequestStatus Status { get; set; }
    public TriageDisposition? TriageDisposition { get; set; }
    public string? DeclineReasonCode { get; set; }
    public string? AssignedStaffId { get; set; }
    public string? AssignedStaffName { get; set; }
    public string? Priority { get; set; }
    public bool IsEmergencyConfirmed { get; set; }
    public bool IsLocalOnly { get; set; }
    public int ReopenCount { get; set; }
    public bool IsOffHoursSubmission { get; set; }
    public DateTime? TriageDueAtUtc { get; set; }
    public DateTime? TriagedAtUtc { get; set; }
    public string? TriagedByStaffId { get; set; }
    public string? TriagedByStaffName { get; set; }
    public DateTime? IdleDeadlineUtc { get; set; }
    public bool SlaBreached { get; set; }
    public DateTime? SupervisorAlertedAtUtc { get; set; }
    public string HomeCellId { get; set; } = "cloud";
    public DateTime? LastMessageAtUtc { get; set; }
    public string? LastMessageSnippet { get; set; }
    public int MessageCount { get; set; }
    public long LastSeq { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public string CreatedBy { get; set; } = string.Empty;
    public DateTime? ClosedAtUtc { get; set; }
    public string? ClosedBy { get; set; }
    public int Version { get; set; } = 1;
}

public sealed class ParticipantRecord
{
    public Guid Id { get; set; }
    public Guid ConversationId { get; set; }
    public string TenantId { get; set; } = string.Empty;
    public string ParticipantType { get; set; } = "Staff";
    public string ParticipantId { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Role { get; set; } = "Member";
    public DateTime JoinedAtUtc { get; set; }
    public DateTime? LeftAtUtc { get; set; }
    public Guid? LastReadMessageId { get; set; }
    public DateTime? LastReadAtUtc { get; set; }
    public bool IsMuted { get; set; }
    public int Version { get; set; } = 1;
}

public sealed class MessageRecord
{
    public Guid Id { get; set; }
    public Guid ConversationId { get; set; }
    public string TenantId { get; set; } = string.Empty;
    public string FacilityId { get; set; } = string.Empty;
    public long Seq { get; set; }
    public string SenderType { get; set; } = "Staff";
    public string? SenderId { get; set; }
    public string SenderDisplayName { get; set; } = string.Empty;
    public string ContentText { get; set; } = string.Empty;
    public MessageVisibility Visibility { get; set; }
    public DeliveryState State { get; set; }
    public bool RequiresAcknowledgement { get; set; }
    public bool IsAcknowledged { get; set; }
    public DateTime? AcknowledgedAtUtc { get; set; }
    public Guid? AcknowledgedByAccountId { get; set; }
    public string? AcknowledgedByName { get; set; }
    public DateTime ClientSentAtUtc { get; set; }
    public DateTime ServerReceivedAtUtc { get; set; }
    public DateTime RetentionDeadlineUtc { get; set; }
    public Guid? ClientMessageId { get; set; }
    public bool IsArchivedToChart { get; set; }
    public DateTime? ChartFilingDateUtc { get; set; }
    public string? ChartFiledByStaffId { get; set; }
    public DateTime? UpdatedAtUtc { get; set; }
    public int Version { get; set; } = 1;
}

public sealed class MessageReactionRecord
{
    public Guid MessageId { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string? UserDisplayName { get; set; }
    public string Reaction { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; }
}

public sealed class EligibilityGrantRecord
{
    public Guid Id { get; set; }
    public string TenantId { get; set; } = string.Empty;
    public string FacilityId { get; set; } = string.Empty;
    public string FacilityType { get; set; } = string.Empty;
    public Guid PatientId { get; set; }
    public string ContextType { get; set; } = string.Empty;
    public string ContextId { get; set; } = string.Empty;
    public DateTime WindowStartUtc { get; set; }
    public DateTime WindowEndUtc { get; set; }
    public bool IsActive { get; set; }
    public DateTime? RevokedAtUtc { get; set; }
    public string? RevokeReason { get; set; }
    public int Version { get; set; } = 1;
    public DateTime CreatedAtUtc { get; set; }
}

public sealed class GuestInviteRecord
{
    public Guid Id { get; set; }
    public string TenantId { get; set; } = string.Empty;
    public string FacilityId { get; set; } = string.Empty;
    public Guid CallId { get; set; }
    public Guid? AppointmentId { get; set; }
    public string InviteTokenHash { get; set; } = string.Empty;
    public string ExpectedDobHash { get; set; } = string.Empty;
    public string OtpHash { get; set; } = string.Empty;
    public int AttemptCount { get; set; }
    public bool IsLockedOut { get; set; }
    public GuestInviteStatus Status { get; set; }
    public DateTime ExpiresAtUtc { get; set; }
    public DateTime? VerifiedAtUtc { get; set; }
    public DateTime? ConsumedAtUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public string? CreatedByStaffId { get; set; }
    public string? MaskedRecipientPhone { get; set; }
}

public sealed class MessageAttachmentRecord
{
    public Guid Id { get; set; }
    public string TenantId { get; set; } = string.Empty;
    public string FacilityId { get; set; } = string.Empty;
    public Guid? MessageId { get; set; }
    public string OriginalFileName { get; set; } = string.Empty;
    public string SafeFileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long OriginalSizeBytes { get; set; }
    public long SanitizedSizeBytes { get; set; }
    public string StoragePath { get; set; } = string.Empty;
    public string SHA256Checksum { get; set; } = string.Empty;
    public AttachmentStatus Status { get; set; }
    public string? QuarantineReason { get; set; }
    public bool StrippedExif { get; set; }
    public string? ConvertedFromOriginal { get; set; }
    public string EncryptionAlgorithm { get; set; } = "AES-256-GCM";
    public string EncryptionKeyId { get; set; } = "cmk-v1";
    public string EncryptionIvBase64 { get; set; } = string.Empty;
    public string EncryptionTagBase64 { get; set; } = string.Empty;
    public string WrappedKeyJson { get; set; } = string.Empty;
    public bool IsFiledToChart { get; set; }
    public DateTime? FiledAtUtc { get; set; }
    public string? FiledByStaffId { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? ScannedAtUtc { get; set; }

    // Bundle attachment metadata
    public string BundleCiphertextFileName { get; set; } = string.Empty;
    public string BundleIvBase64 { get; set; } = string.Empty;
    public string BundleTagBase64 { get; set; } = string.Empty;
    public long BundleCiphertextSizeBytes { get; set; }
}

public sealed class InteropOutboxRecord
{
    public Guid MessageId { get; set; }
    public Guid CorrelationId { get; set; }
    public string Type { get; set; } = string.Empty;
    public string EnvelopeJson { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; }
    public int AttemptCount { get; set; }
    public DateTime NextAttemptAtUtc { get; set; }
    public DateTime? DispatchedAtUtc { get; set; }
    public DateTime? DeadLetteredAtUtc { get; set; }
    public string? LastError { get; set; }
}
