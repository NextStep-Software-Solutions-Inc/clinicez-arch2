using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Application.Models;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop.Contracts;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Comms.Application.Features.Messages.Commands;

public sealed record ResendMessageCommand(
    Guid MessageId,
    string TenantId) : IRequest<MessageDto>;

public sealed class ResendMessageCommandHandler : IRequestHandler<ResendMessageCommand, MessageDto>
{
    private readonly ICommsDbContext _db;
    private readonly ICommsRealtimeNotifier _notifier;

    public ResendMessageCommandHandler(ICommsDbContext db, ICommsRealtimeNotifier notifier)
    {
        _db = db;
        _notifier = notifier;
    }

    public async Task<MessageDto> Handle(ResendMessageCommand request, CancellationToken ct)
    {
        var message = await _db.Messages
            .Include(m => m.Attachments)
            .FirstOrDefaultAsync(m => m.Id == request.MessageId && m.TenantId == request.TenantId, ct)
            ?? throw new NotFoundException($"Message '{request.MessageId}' not found.");

        var now = DateTime.UtcNow;
        message.State = DeliveryState.Waiting;
        message.RetentionDeadlineUtc = now.AddDays(7);
        message.UpdatedAtUtc = now;

        await _db.SaveChangesAsync(ct);

        await _notifier.NotifyMessageStateChangedAsync(message.ConversationId, message.Id, DeliveryState.Waiting, now, ct);

        var attachmentRefs = message.Attachments
            .Select(a => new CommsAttachmentReference(a.StoragePath, a.SafeFileName, a.ContentType, a.SanitizedSizeBytes, a.SHA256Checksum))
            .ToList();

        return new MessageDto(
            message.Id,
            message.ConversationId,
            message.Seq,
            message.ClientMessageId,
            message.SenderType,
            message.SenderId,
            message.SenderDisplayName,
            message.ContentText,
            message.Visibility,
            message.RequiresAcknowledgement,
            message.IsAcknowledged,
            message.AcknowledgedAtUtc,
            message.AcknowledgedByAccountId,
            message.AcknowledgedByName,
            attachmentRefs,
            message.State,
            message.ClientSentAtUtc,
            message.RetentionDeadlineUtc);
    }
}
