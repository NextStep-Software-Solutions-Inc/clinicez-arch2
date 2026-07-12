using PatientAppBE.Domain.Enums;

namespace PatientAppBE.Application.Common.DTOs;

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
