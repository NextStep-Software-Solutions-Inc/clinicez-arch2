using System;

namespace ClinicEz.Comms.Application.Models;

public sealed record ParticipantDto(
    Guid Id,
    Guid ConversationId,
    string TenantId,
    string ParticipantType,
    string ParticipantId,
    string DisplayName,
    string Role,
    DateTime JoinedAtUtc,
    DateTime? LeftAtUtc,
    Guid? LastReadMessageId,
    DateTime? LastReadAtUtc,
    bool IsMuted);
