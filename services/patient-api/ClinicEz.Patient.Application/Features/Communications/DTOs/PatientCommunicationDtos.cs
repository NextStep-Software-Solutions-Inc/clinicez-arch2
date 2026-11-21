using System;
using System.Collections.Generic;
using ClinicEz.Shared.Interop.Contracts;

namespace ClinicEz.Patient.Application.Features.Communications.DTOs;

public sealed record PatientConversationDto(
    Guid Id,
    Guid PatientId,
    string HomeTenantId,
    string HomeFacilityId,
    string HomeFacilityType,
    string FacilityName,
    MessageCategory Category,
    string Subject,
    RequestStatus Status,
    TriageDisposition? TriageDisposition,
    string? DeclineReasonCode,
    string? AssignedStaffDisplayName,
    bool IsHiddenByPatient,
    DateTime OpenedAtUtc,
    DateTime? ClosedAtUtc,
    DateTime LastMessageAtUtc,
    string LastMessagePreview,
    int UnreadCount,
    Guid? SubmittingAccountId,
    string? SubmittingAccountName,
    string? RelationshipToPatient);

public sealed record PatientConversationDetailDto(
    Guid Id,
    Guid PatientId,
    string HomeTenantId,
    string HomeFacilityId,
    string HomeFacilityType,
    string FacilityName,
    MessageCategory Category,
    string Subject,
    RequestStatus Status,
    TriageDisposition? TriageDisposition,
    string? DeclineReasonCode,
    string? AssignedStaffDisplayName,
    bool IsHiddenByPatient,
    DateTime OpenedAtUtc,
    DateTime? ClosedAtUtc,
    IReadOnlyList<PatientMessageDto> Messages);

public sealed record PatientMessageDto(
    Guid Id,
    Guid ConversationId,
    long Seq,
    Guid ClientMessageId,
    string SenderType,
    Guid? SenderId,
    string SenderName,
    string ContentText,
    bool RequiresAcknowledgement,
    bool IsAcknowledged,
    DateTime? AcknowledgedAtUtc,
    Guid? AcknowledgedByAccountId,
    string? AcknowledgedByName,
    DeliveryState DeliveryState,
    DateTime CreatedAtUtc,
    DateTime? ReceivedAtUtc,
    DateTime RetentionDeadlineUtc,
    IReadOnlyList<PatientMessageAttachmentDto> Attachments);

public sealed record PatientMessageAttachmentDto(
    Guid Id,
    Guid MessageId,
    string StorageKey,
    string FileName,
    string ContentType,
    long FileSizeBytes,
    string? HashSha256,
    string ScanStatus);

public sealed record PatientEligibilityGrantDto(
    Guid GrantId,
    Guid PatientId,
    string TenantId,
    string FacilityId,
    string FacilityType,
    string FacilityName,
    string ContextType,
    string ContextId,
    bool IsActive,
    DateTime? WindowStartUtc,
    DateTime? WindowEndUtc);

public sealed record SubmitPatientInquiryRequest(
    Guid? PatientId,
    string TenantId,
    string FacilityId,
    string FacilityType,
    string FacilityName,
    MessageCategory Category,
    string ContentText,
    bool? IsEmergencyConfirmed,
    IReadOnlyList<CommsAttachmentReference>? Attachments = null);

public sealed record SubmitPatientInquiryResponse(
    bool IsEmergencyRedirect,
    string? RedirectMessage,
    Guid? ConversationId);

public sealed record SubmitMessageRequest(
    string ContentText,
    Guid? ClientMessageId = null,
    IReadOnlyList<CommsAttachmentReference>? Attachments = null);
