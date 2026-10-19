using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Application.Tests.OpdSuite_E2E.Fixtures;

/// <summary>
/// Domain contracts, DTOs, and representations for the 24 OPD Queue, Display, Notification & Intake features (F1.1 to F4.4)
/// as specified in PROJECT.md and TEST_INFRA.md.
/// </summary>
public static class OpdSuiteContracts
{
    // =========================================================================
    // Milestone 1: F1.1 - F1.6 (EOD Reconciliation & Force EOD)
    // =========================================================================
    public record ClinicEodSettingsDto(
        Guid ClinicId,
        string TenantId,
        string EodReconciliationTime,
        bool AutoEodEnabled,
        bool TvDisplayMaskPatientNames = true,
        bool EnableQueuePushNotifications = true,
        int QueuePushNotificationThreshold = 2);

    public record ReconcileEodRequest(
        DateOnly? TargetDate = null,
        string TriggerType = "Manual",
        string? OperatorName = null,
        Guid? OperatorStaffId = null,
        string? Notes = null);

    public record ReconcileEodResultDto(
        int ProcessedCount,
        int ReconciledCount,
        string TriggerType,
        DateTime ReconciledAt,
        IReadOnlyList<string> AffectedTicketNumbers);

    public record EodReconciliationAuditDto(
        Guid Id,
        string TenantId,
        Guid ClinicId,
        DateOnly ReconciliationDate,
        DateTime ReconciledAt,
        string TriggerType,
        string ReconciledBy,
        Guid? StaffId,
        int TotalTicketsProcessed,
        string AffectedTicketNumbersJson,
        string? Notes);

    public class E2EQueueTicket
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public required string TenantId { get; set; }
        public Guid ClinicId { get; set; }
        public required string QueueNumber { get; set; }
        public int SequenceNumber { get; set; }
        public DateOnly QueueDate { get; set; }
        public Guid PatientId { get; set; }
        public required string PatientName { get; set; }
        public Guid? DoctorId { get; set; }
        public string? DoctorName { get; set; }
        public string? RoomOrStation { get; set; }
        public QueuePriority Priority { get; set; } = QueuePriority.Routine;
        public QueueStatus Status { get; set; } = QueueStatus.Waiting;
        public DateTime CheckInTime { get; set; } = DateTime.UtcNow;
        public DateTime? CalledTime { get; set; }
        public DateTime? CompletedTime { get; set; }
        public string? ChiefComplaint { get; set; }
        public bool ApproachingNotificationSent { get; set; }
        public bool CalledNotificationSent { get; set; }
    }

    // =========================================================================
    // Milestone 2: F2.1 - F2.8 (Public TV Display Board)
    // =========================================================================
    public record ServingTicketDto(
        string TicketNumber,
        string? DoctorName,
        string? RoomOrStation,
        DateTime? CalledTime);

    public record UpcomingTicketDto(
        string TicketNumber,
        string DisplayName,
        string Priority = "Routine");

    public record PublicQueueDisplayDto(
        IReadOnlyList<ServingTicketDto> NowServing,
        IReadOnlyList<UpcomingTicketDto> UpNext,
        DateTime GeneratedAtUtc);

    // =========================================================================
    // Milestone 3: F3.1 - F3.6 (Patient App Push Notifications)
    // =========================================================================
    public record PatientQueueAlertPayload(
        Guid QueueTicketId,
        string TicketNumber,
        string AlertKind,
        string Message,
        string? DoctorName,
        string? RoomOrStation,
        int? AheadInLine,
        DateTime TimestampUtc);

    public record InteropAlertEnvelope(
        Guid MessageId,
        string MessageType,
        string SenderParty,
        string RecipientParty,
        PatientQueueAlertPayload Payload,
        DateTime SentAtUtc);

    // =========================================================================
    // Milestone 4: F4.1 - F4.4 (Fuzzy Duplicate Patient Detection)
    // =========================================================================
    public record DuplicateMatchDto(
        Guid PatientId,
        string PatientCode,
        string FullName,
        DateOnly DateOfBirth,
        string? ContactNumber,
        string? PhilHealthNumber,
        string MatchReason,
        double? SimilarityScore,
        string? Confidence);

    public record DuplicatePatientCheckResultDto(
        bool HasDuplicates,
        IReadOnlyList<DuplicateMatchDto> Matches);

    public record PatientIntakeDto(
        string FirstName,
        string LastName,
        DateOnly DateOfBirth,
        string? ContactNumber,
        string? PhilHealthNumber,
        string? CivilStatus,
        string? Sex);
}
