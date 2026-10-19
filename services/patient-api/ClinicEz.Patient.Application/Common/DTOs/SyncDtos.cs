using ClinicEz.Patient.Domain.Enums;

namespace ClinicEz.Patient.Application.Common.DTOs;

public sealed record SyncItemRequest(
    Guid IdempotencyKey,
    string EntityType,
    SyncOperation Operation,
    DateTime ClientTimestamp,
    string? PayloadJson,
    Guid? EntityId = null);

public sealed record PushSyncAckDto(
    int Accepted,
    int AlreadyProcessed,
    DateTime AcknowledgedAt);

public sealed record SyncItemResultDto(
    Guid IdempotencyKey,
    string EntityType,
    string Operation,
    Guid? ClientId,
    Guid? ServerId,
    string Status,
    string? ConflictDetail);

public sealed record PushSyncResultDto(
    int Accepted,
    int Applied,
    int Conflicts,
    int Rejected,
    int AlreadyProcessed,
    DateTime AcknowledgedAt,
    IReadOnlyList<SyncItemResultDto> Items);

public sealed record SyncStatusItemDto(
    Guid IdempotencyKey,
    string EntityType,
    string Operation,
    string Status,
    DateTime ClientTimestamp,
    DateTime ServerTimestamp,
    string? ConflictDetail);

public sealed record SyncStatusDto(
    int PendingCount,
    int AppliedCount,
    int RejectedCount,
    IReadOnlyList<SyncStatusItemDto> RecentItems);
