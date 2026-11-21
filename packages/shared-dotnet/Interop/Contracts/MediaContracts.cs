using System;
using System.Collections.Generic;

namespace ClinicEz.Shared.Interop.Contracts;

/// <summary>Payload for <c>media.room.requested</c>: facility requests video room tokens from media-broker.</summary>
public sealed record MediaRoomRequestedPayload(
    string TenantId,
    Guid CallId,
    string RoomName,
    IReadOnlyList<string> ParticipantIdentities);

/// <summary>Payload for <c>media.room.responded</c>: media-broker returns room tokens or rejection.</summary>
public sealed record MediaRoomRespondedPayload(
    Guid CallId,
    string RoomName,
    string RelayUrl,
    IReadOnlyDictionary<string, string> ParticipantTokens,
    bool Success,
    string? ErrorMessage);

/// <summary>Payload for <c>media.entitlement.updated</c>: portal updates monthly call minute ceiling.</summary>
public sealed record MediaEntitlementUpdatedPayload(
    string TenantId,
    int CallMinutesMonthly,
    bool IsActive,
    int Version,
    DateTime UpdatedAtUtc,
    bool AllowOverdraft = true,
    string BillingMode = "Postpaid",
    decimal RatePerMinutePhp = 0m);

/// <summary>Payload for <c>media.room.ended</c>: facility notifies media-broker that a room call session ended.</summary>
public sealed record MediaRoomEndedPayload(
    Guid CallId,
    string TenantId,
    string RoomName,
    DateTime EndedAtUtc);

/// <summary>Payload for <c>media.usage.recorded</c>: media-broker reports duration used to portal without patient PHI.</summary>
public sealed record MediaUsageRecordedPayload(
    Guid CallId,
    string TenantId,
    int DurationMinutes,
    DateTime CallStartedAtUtc,
    DateTime CallEndedAtUtc);
