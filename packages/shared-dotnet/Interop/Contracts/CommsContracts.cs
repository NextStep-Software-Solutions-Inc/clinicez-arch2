using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;
using ClinicEz.Shared.Common;

namespace ClinicEz.Shared.Interop.Contracts;

/// <summary>Defines the access and visibility boundary of a conversation.</summary>
[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum ConversationScope
{
    /// <summary>Accessible to staff across all facilities of the tenant workspace.</summary>
    Workspace,
    /// <summary>Scoped strictly to staff of a specific facility.</summary>
    Facility,
    /// <summary>Scoped to staff across facilities within a physical branch.</summary>
    Branch,
    /// <summary>One-to-one direct message between two staff members of the same tenant.</summary>
    Direct,
    /// <summary>Contextual discussion attached to a clinical encounter, prescription, lab order, or invoice.</summary>
    StaffContext,
    /// <summary>Triaged patient-to-facility thread.</summary>
    PatientFacility
}

/// <summary>The functional classification of a conversation.</summary>
[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum ConversationKind
{
    General,
    RecordLinked,
    Direct,
    PatientTriage
}

/// <summary>Categorization for patient-to-facility inquiries.</summary>
[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum MessageCategory
{
    Scheduling,
    PrescriptionRefill,
    LabResultQuestion,
    PostVisitFollowUp,
    Billing,
    OrderStatus,
    MedicineQuestion,
    CollectionAndAppointment,
    ReportCopy,
    Other
}

/// <summary>Mandatory triage disposition outcome recorded by triage staff.</summary>
[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum TriageDisposition
{
    /// <summary>Answered directly by front desk / triage staff.</summary>
    Answered,
    /// <summary>Patient needs an appointment or in-person visit.</summary>
    NeedsVisit,
    /// <summary>Inquiry declined with mandatory reason code.</summary>
    Declined,
    /// <summary>Routed to clinical staff or care team with priority.</summary>
    Routed
}

/// <summary>Lifecycle states of a patient request from submission to closure.</summary>
[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum RequestStatus
{
    Submitted,
    WithTriage,
    Routed,
    Answered,
    NeedsVisit,
    Declined,
    Resolved,
    Closed
}

/// <summary>Visibility level of a message within a patient-to-facility conversation.</summary>
[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum MessageVisibility
{
    /// <summary>Visible to both staff and patient.</summary>
    Public,
    /// <summary>Internal staff note; NEVER delivered, replicated, or visible to patients.</summary>
    Internal
}

/// <summary>Truthful message delivery lifecycle tracking state.</summary>
[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum DeliveryState
{
    /// <summary>Not yet accepted by server or outbox.</summary>
    Sending,
    /// <summary>Accepted by home server/hub but NOT yet confirmed stored by recipient.</summary>
    Waiting,
    /// <summary>Confirmed stored in recipient's database/account.</summary>
    Received,
    /// <summary>Retention deadline passed without delivery confirmation.</summary>
    NotReceived
}

/// <summary>Classification of video call sessions.</summary>
[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum CallKind
{
    General,
    Teleconsult
}

/// <summary>Payment enforcement policy for clinical teleconsultations.</summary>
[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum TeleconsultPaymentPolicy
{
    Prepaid,
    Postpaid,
    Exempt
}

/// <summary>Storage and vault destination policy for teleconsult recordings.</summary>
[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum RecordingStoragePolicy
{
    Disabled,
    WorkspaceVaultOnly,
    LocalDeviceOnly,
    Both
}

/// <summary>Metadata reference for a verified file attachment.</summary>
public sealed record CommsAttachmentReference(
    string FileKey,
    string FileName,
    string ContentType,
    long SizeBytes,
    string? HashSha256);

/// <summary>Payload for <c>comms.eligibility.granted</c>.</summary>
public sealed record CommsEligibilityGrantedPayload(
    Guid GrantId,
    string TenantId,
    string FacilityId,
    string FacilityType,
    Guid PatientId,
    string ContextType,
    string ContextId,
    DateTime WindowStartUtc,
    DateTime WindowEndUtc,
    int Version);

/// <summary>Payload for <c>comms.eligibility.revoked</c>.</summary>
public sealed record CommsEligibilityRevokedPayload(
    Guid GrantId,
    string TenantId,
    string FacilityId,
    Guid PatientId,
    string? Reason,
    DateTime RevokedAtUtc,
    int Version);

/// <summary>Payload for <c>comms.eligibility.synced</c>.</summary>
public sealed record CommsEligibilitySyncedPayload(
    Guid GrantId,
    string TenantId,
    string FacilityId,
    string FacilityType,
    Guid PatientId,
    string ContextType,
    string ContextId,
    bool IsActive,
    DateTime? WindowEndUtc,
    int Version);

/// <summary>Payload for <c>comms.request.submit</c>.</summary>
public sealed record CommsRequestSubmitPayload(
    Guid RequestId,
    string TenantId,
    string FacilityId,
    string FacilityType,
    Guid PatientId,
    Guid? SubmittingAccountId,
    string? Relationship,
    MessageCategory Category,
    string ContentText,
    bool IsEmergencyConfirmed,
    IReadOnlyList<CommsAttachmentReference>? Attachments,
    DateTime SubmittedAtUtc);

/// <summary>Payload for <c>comms.message.submit</c>.</summary>
public sealed record CommsMessageSubmitPayload(
    Guid ClientMessageId,
    Guid ConversationId,
    string TenantId,
    string FacilityId,
    string SenderType,
    Guid? SenderId,
    string SenderDisplayName,
    string ContentText,
    MessageVisibility Visibility,
    bool RequiresAcknowledgement,
    IReadOnlyList<CommsAttachmentReference>? Attachments,
    DateTime ClientSentAtUtc,
    DateTime RetentionDeadlineUtc);

/// <summary>Payload for <c>comms.message.replicate</c>.</summary>
public sealed record CommsMessageReplicatePayload(
    Guid MessageId,
    Guid ConversationId,
    long Seq,
    string TenantId,
    string FacilityId,
    string SenderType,
    Guid? SenderId,
    string SenderDisplayName,
    string ContentText,
    MessageVisibility Visibility,
    bool RequiresAcknowledgement,
    IReadOnlyList<CommsAttachmentReference>? Attachments,
    DateTime SentAtUtc,
    DateTime RetentionDeadlineUtc,
    DeliveryState State);

/// <summary>Payload for <c>comms.message.received</c>.</summary>
public sealed record CommsMessageReceivedPayload(
    Guid MessageId,
    Guid ConversationId,
    string RecipientPartyAddress,
    DateTime ReceivedAtUtc);

/// <summary>Payload for <c>comms.message.acknowledged</c>.</summary>
public sealed record CommsMessageAcknowledgedPayload(
    Guid MessageId,
    Guid ConversationId,
    Guid AcknowledgedByAccountId,
    string AcknowledgedByName,
    DateTime AcknowledgedAtUtc);

/// <summary>Payload for <c>comms.thread.state.changed</c>.</summary>
public sealed record CommsThreadStateChangedPayload(
    Guid ConversationId,
    string TenantId,
    string FacilityId,
    RequestStatus NewStatus,
    TriageDisposition? Disposition,
    string? DeclineReasonCode,
    string? AssignedStaffId,
    string? AssignedStaffName,
    int Version,
    DateTime ChangedAtUtc);

/// <summary>Payload for <c>comms.call.state.changed</c>.</summary>
public sealed record CommsCallStateChangedPayload(
    Guid CallId,
    Guid? ConversationId,
    string TenantId,
    string FacilityId,
    CallKind Kind,
    string Status,
    string? RoomName,
    string? JoinToken,
    int StateVersion,
    DateTime ChangedAtUtc);

/// <summary>Payload for <c>comms.call.event</c>.</summary>
public sealed record CommsCallEventPayload(
    Guid ClientEventId,
    Guid CallId,
    string EventType,
    string ParticipantIdentity,
    string? PayloadJson,
    DateTime EventAtUtc);

/// <summary>Payload for <c>comms.call.payment.cleared</c>.</summary>
public sealed record CommsCallPaymentClearedPayload(
    Guid CallId,
    string TenantId,
    string FacilityId,
    Guid? InvoiceId,
    string PaymentMethod,
    DateTime ClearedAtUtc,
    bool IsEmergencyOverride,
    string? OverrideReason);

/// <summary>Payload for <c>comms.recording.consent.logged</c>.</summary>
public sealed record CommsRecordingConsentLoggedPayload(
    Guid ConsentId,
    Guid CallId,
    string TenantId,
    string FacilityId,
    Guid PatientId,
    string TargetPolicy,
    string Decision,
    int Version,
    DateTime LoggedAtUtc);

/// <summary>Payload for <c>comms.conversation.archived</c>.</summary>
public sealed record CommsConversationArchivedPayload(
    Guid ConversationId,
    string TenantId,
    string FacilityId,
    string ContextType,
    string ContextId,
    string TranscriptText,
    int Version,
    DateTime ArchivedAtUtc);

/// <summary>Payload for <c>comms.guest.call.join.requested</c>.</summary>
public sealed record GuestCallJoinRequestedPayload(
    Guid CallId,
    Guid InviteId,
    string Otp,
    string DateOfBirth,
    DateTime RequestedAtUtc);

/// <summary>Payload for <c>comms.transcript.archived</c>.</summary>
public sealed record CommsTranscriptArchivedPayload(
    Guid ConversationId,
    string TenantId,
    string FacilityId,
    string FacilityType,
    Guid PatientId,
    string? ContextType,
    string? ContextId,
    MessageCategory? Category,
    string Title,
    DateTime OpenedAtUtc,
    DateTime ClosedAtUtc,
    string? ClosedByStaffId,
    string? ClosedByStaffName,
    TriageDisposition? TriageDisposition,
    string? DeclineReasonCode,
    int TotalMessageCount,
    int PublicMessageCount,
    string TranscriptJson,
    string TranscriptMarkdown,
    string TranscriptSha256,
    IReadOnlyList<CommsAttachmentReference> Attachments,
    int Version,
    DateTime ArchivedAtUtc);

/// <summary>Payload for <c>comms.attachment.filed</c>.</summary>
public sealed record CommsAttachmentFiledPayload(
    Guid AttachmentId,
    Guid? MessageId,
    Guid ConversationId,
    string TenantId,
    string FacilityId,
    Guid PatientId,
    Guid? ConsultationId,
    string RecordType,
    string Title,
    string OriginalFileName,
    string SafeFileName,
    string ContentType,
    long FileSizeBytes,
    string SHA256Checksum,
    string StoragePath,
    string FiledByStaffId,
    string FiledByStaffName,
    DateTime FiledAtUtc,
    string? Notes,
    int Version);

/// <summary>Canonical document structure for public conversation transcript export.</summary>
public sealed record PatientCommunicationTranscriptDocument(
    Guid ConversationId,
    string TenantId,
    string FacilityId,
    string FacilityType,
    Guid PatientId,
    string? ContextType,
    string? ContextId,
    string Category,
    string Title,
    DateTime CreatedAtUtc,
    DateTime ClosedAtUtc,
    string? ClosedByStaffId,
    string? ClosedByStaffName,
    string? TriageDisposition,
    string? DeclineReasonCode,
    IReadOnlyList<TranscriptParticipantDto> Participants,
    IReadOnlyList<TranscriptMessageDto> Messages,
    string TranscriptSha256,
    DateTime ExportedAtUtc);

public sealed record TranscriptParticipantDto(
    Guid ParticipantId,
    string Identity,
    string Role,
    string DisplayName,
    DateTime JoinedAtUtc);

public sealed record TranscriptMessageDto(
    Guid MessageId,
    long Seq,
    string SenderType,
    string SenderDisplayName,
    DateTime ServerReceivedAtUtc,
    string ContentText,
    bool RequiresAcknowledgement,
    bool IsAcknowledged,
    DateTime? AcknowledgedAtUtc,
    string? AcknowledgedByName,
    IReadOnlyList<TranscriptAttachmentDto> Attachments);

public sealed record TranscriptAttachmentDto(
    Guid AttachmentId,
    string SafeFileName,
    string ContentType,
    long FileSizeBytes,
    string SHA256Checksum);

/// <summary>Deterministic GUID generator for eligibility grants.</summary>
public static class CommsGrantIdGenerator
{
    public static Guid Create(string tenantId, string facilityId, string contextType, string contextId)
    {
        var input = $"{tenantId}:{facilityId}:{contextType}:{contextId}";
        var hash = System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(input));
        return new Guid(hash.AsSpan(0, 16));
    }
}

