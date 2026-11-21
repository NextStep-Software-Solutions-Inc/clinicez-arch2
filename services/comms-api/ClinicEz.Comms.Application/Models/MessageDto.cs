using System;
using System.Collections.Generic;
using ClinicEz.Shared.Interop.Contracts;

namespace ClinicEz.Comms.Application.Models;

public sealed record MessageDto(
    Guid MessageId,
    Guid ConversationId,
    long Seq,
    Guid? ClientMessageId,
    string SenderType,
    string? SenderId,
    string SenderDisplayName,
    string ContentText,
    MessageVisibility Visibility,
    bool RequiresAcknowledgement,
    bool IsAcknowledged,
    DateTime? AcknowledgedAtUtc,
    Guid? AcknowledgedByAccountId,
    string? AcknowledgedByName,
    IReadOnlyList<CommsAttachmentReference> Attachments,
    DeliveryState DeliveryState,
    DateTime SentAtUtc,
    DateTime RetentionDeadlineUtc);
