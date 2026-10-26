using System;

namespace ClinicEz.Comms.Application.Models;

public sealed record MessageReactionDto(
    Guid MessageId,
    string UserId,
    string? UserDisplayName,
    string Reaction,
    DateTime CreatedAtUtc);
