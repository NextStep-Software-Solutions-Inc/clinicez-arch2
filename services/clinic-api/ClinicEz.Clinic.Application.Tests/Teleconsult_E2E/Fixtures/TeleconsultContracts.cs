using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Shared.Interop.Contracts;

namespace ClinicEz.Clinic.Application.Tests.Teleconsult_E2E.Fixtures;

/// <summary>
/// Domain contracts, DTOs, events, and constants for Teleconsultation E2E Testing (Features F1 through F13)
/// conforming to ORIGINAL_REQUEST.md, PROJECT.md, and TEST_INFRA.md.
/// </summary>
public static class TeleconsultContracts
{
    // =========================================================================
    // Feature 1: AppointmentBookedEvent.AppointmentType
    // =========================================================================
    public record ModalityBookingEventDto(
        Guid Id,
        Guid DraftId,
        Guid PatientId,
        Guid ClinicId,
        string TenantId,
        string? AppointmentType,
        string? ServiceType,
        DateOnly? PreferredDate,
        string? PreferredTime,
        DateTime CreatedAt);

    // =========================================================================
    // Feature 2: Facility Teleconsult Settings
    // =========================================================================
    public record FacilityTeleconsultSettingsDto(
        Guid ClinicId,
        string TenantId,
        string TeleconsultRecordingPolicy = "Disabled",
        int TeleconsultRecordingRetentionDays = 90,
        bool TeleconsultRecordingConsentRequired = true,
        string TeleconsultPaymentPolicy = "Prepaid",
        decimal? TeleconsultDefaultFee = 400.00m);

    public record UpdateFacilityTeleconsultSettingsCommand(
        string? TeleconsultRecordingPolicy,
        int? TeleconsultRecordingRetentionDays,
        bool? TeleconsultRecordingConsentRequired,
        string? TeleconsultPaymentPolicy,
        decimal? TeleconsultDefaultFee);

    public static class RecordingPolicies
    {
        public const string Disabled = "Disabled";
        public const string WorkspaceVaultOnly = "WorkspaceVaultOnly";
        public const string Both = "Both";

        public static readonly HashSet<string> ValidPolicies = new(StringComparer.OrdinalIgnoreCase)
        {
            Disabled, WorkspaceVaultOnly, Both
        };
    }

    public static class PaymentPolicies
    {
        public const string Prepaid = "Prepaid";
        public const string Postpaid = "Postpaid";
        public const string Exempt = "Exempt";

        public static readonly HashSet<string> ValidPolicies = new(StringComparer.OrdinalIgnoreCase)
        {
            Prepaid, Postpaid, Exempt
        };
    }

    // =========================================================================
    // Feature 3: Teleconsult Appointment Creation & Billing
    // =========================================================================
    public record CreateTeleconsultAppointmentDto(
        Guid ClinicId,
        string TenantId,
        Guid PatientId,
        string PatientName,
        DateTime ScheduledAt,
        int DurationMinutes = 30,
        string? ServiceType = null,
        string? AppointmentType = null,
        string? PaymentPolicy = null,
        string? CashierMode = "CashierCounter",
        Guid? DoctorId = null,
        string? DoctorName = null);

    public record TeleconsultCreationResultDto(
        Guid AppointmentId,
        Guid CallId,
        string AppointmentType,
        bool IsTeleconsult,
        TeleconsultPaymentPolicy PaymentPolicy,
        TeleconsultPaymentStatus PaymentStatus,
        Guid? InvoiceId,
        Guid? InvoiceRequestId,
        decimal? BilledAmount,
        bool BillingEventEnqueued);

    // =========================================================================
    // Feature 4: AppointmentDto Teleconsult Metadata
    // =========================================================================
    public record AppointmentDtoTeleconsultProjection(
        Guid Id,
        string PatientName,
        DateTime ScheduledAt,
        string AppointmentType,
        bool IsTeleconsult,
        string PaymentPolicy,
        string PaymentStatus,
        Guid? InvoiceId,
        decimal? PaidAmount,
        Guid? CallId,
        DateTime? AdmittedAtUtc,
        bool IsEmergencyOverride,
        string? EmergencyOverrideReasonCode);

    // =========================================================================
    // Feature 5: Cashier Payment Clearance
    // =========================================================================
    public record CashierPaymentCommandDto(
        Guid InvoiceId,
        Guid AppointmentId,
        decimal Amount,
        string PaymentMethod,
        string ReceiptNumber,
        Guid CashierStaffId,
        DateTime PaidAtUtc);

    public record CashierPaymentClearanceResultDto(
        Guid AppointmentId,
        Guid InvoiceId,
        TeleconsultPaymentStatus PaymentStatus,
        decimal? PaidAmount,
        DateTime? PaidAt,
        string? ReceiptNumber,
        string? PaymentMethod,
        bool CommsPaymentClearedEnqueued,
        Guid? CallId);

    // =========================================================================
    // Feature 6: Non-Mutating YAKAP Status
    // =========================================================================
    public record YakapStatusEvaluationDto(
        Guid PatientId,
        bool HasActiveYakapEnlistment,
        int? EffectiveYear,
        bool PolicyWasMutated,
        TeleconsultPaymentPolicy CurrentPolicy,
        TeleconsultPaymentStatus CurrentStatus);

    // =========================================================================
    // Feature 7: Plain-Note Admission Override
    // =========================================================================
    public record PlainNoteAdmissionOverrideRequest(
        Guid AppointmentId,
        string ReasonNote,
        string? ReasonCode = null);

    public record AdmissionOverrideResultDto(
        Guid AppointmentId,
        Guid CallId,
        string RoomName,
        DateTime AdmittedAtUtc,
        TeleconsultPaymentStatus PaymentStatus,
        bool IsEmergencyOverride,
        string ReasonCode,
        string ReasonNote,
        Guid AuthorizedByStaffId,
        string AuthorizedByName,
        bool WormAuditLogged,
        bool CommsPaymentClearedEnqueued);

    // =========================================================================
    // Feature 8: Update Teleconsult Payment Policy
    // =========================================================================
    public record UpdateTeleconsultPaymentPolicyRequest(
        string NewPolicy,
        string? Reason = null);

    public record UpdatePaymentPolicyResultDto(
        Guid AppointmentId,
        TeleconsultPaymentPolicy PreviousPolicy,
        TeleconsultPaymentPolicy NewPolicy,
        TeleconsultPaymentStatus UpdatedStatus,
        Guid? InvoiceId,
        DateTime UpdatedAtUtc);

    // =========================================================================
    // Feature 9: Media Signaling Join/End Call
    // =========================================================================
    public record JoinTeleconsultCallRequest(
        Guid AppointmentId,
        Guid ParticipantId,
        string ParticipantRole, // "staff" or "patient"
        string? DisplayName = null);

    public record TeleconsultCallJoinDto(
        Guid AppointmentId,
        Guid CallId,
        string RoomName,
        string ParticipantIdentity,
        string AccessToken,
        string LiveKitServerUrl,
        DateTime ExpiresAtUtc,
        bool IsFallbackToken);

    public record EndTeleconsultCallRequest(
        Guid AppointmentId,
        Guid InitiatorStaffId,
        string? EndReason = null);

    public record TeleconsultCallEndResultDto(
        Guid AppointmentId,
        Guid CallId,
        string RoomName,
        DateTime EndedAtUtc,
        string Status,
        bool RecordingFinalized,
        bool WormAuditLogged,
        bool CommsCallStateChangedEnqueued);

    // =========================================================================
    // Feature 10: CMK AES-256-GCM Vault Encryption
    // =========================================================================
    public record EncryptedSegmentUploadResult(
        Guid SessionId,
        Guid SegmentId,
        int SegmentIndex,
        string StorageKey,
        string SidecarKeyPath,
        byte[] Ciphertext,
        byte[] EncryptedDek,
        byte[] Iv,
        byte[] AuthTag,
        long FileSizeBytes);

    public record PlaybackTicketDto(
        string Ticket,
        Guid SessionId,
        DateTime IssuedAtUtc,
        DateTime ExpiresAtUtc,
        int DurationMinutes = 15);

    // =========================================================================
    // Feature 11: Recording Sweeper Sidecar Cleanup
    // =========================================================================
    public record SweeperCleanupResultDto(
        Guid SessionId,
        int SegmentsPurged,
        int SidecarKeysPurged,
        bool ManifestPurged,
        bool ManifestSidecarPurged,
        bool IsLegalHoldProtected,
        DateTime PurgedAtUtc);

    // =========================================================================
    // Feature 12: Consultation Encounter Linkage
    // =========================================================================
    public record ConsultationLinkageDto(
        Guid ConsultationId,
        Guid AppointmentId,
        Guid? SessionId,
        bool LinkageSuccessful,
        DateTime LinkedAtUtc);

    // =========================================================================
    // Feature 13: Interop Handlers & Registration
    // =========================================================================
    public record MediaRoomRespondedPayloadDto(
        Guid CallId,
        string RoomName,
        string Status,
        string? RoomSid,
        DateTime RespondedAtUtc);

    public record CommsRecordingConsentLoggedPayloadDto(
        Guid CallId,
        Guid ParticipantId,
        string ParticipantRole,
        bool ConsentGranted,
        DateTime ConsentedAtUtc);
}
