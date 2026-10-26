using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Comms.Application.Features.Messages.Commands;

public sealed record AcknowledgeMessageCommand(
    Guid MessageId,
    Guid AccountId,
    string AccountName) : IRequest<bool>;

public sealed class AcknowledgeMessageCommandHandler : IRequestHandler<AcknowledgeMessageCommand, bool>
{
    private readonly ICommsDbContext _db;
    private readonly ICommsRealtimeNotifier _notifier;

    public AcknowledgeMessageCommandHandler(ICommsDbContext db, ICommsRealtimeNotifier notifier)
    {
        _db = db;
        _notifier = notifier;
    }

    public async Task<bool> Handle(AcknowledgeMessageCommand request, CancellationToken ct)
    {
        var message = await _db.Messages
            .FirstOrDefaultAsync(m => m.Id == request.MessageId, ct)
            ?? throw new NotFoundException($"Message '{request.MessageId}' not found.");

        if (!message.RequiresAcknowledgement)
        {
            throw new ValidationException("Message does not require acknowledgment.");
        }

        if (message.IsAcknowledged)
        {
            return true; // Idempotent
        }

        var ackTime = DateTime.UtcNow;
        message.IsAcknowledged = true;
        message.AcknowledgedAtUtc = ackTime;
        message.AcknowledgedByAccountId = request.AccountId;
        message.AcknowledgedByName = request.AccountName;
        message.UpdatedAtUtc = ackTime;

        await _db.SaveChangesAsync(ct);

        await _notifier.NotifyMessageAcknowledgedAsync(
            message.ConversationId,
            message.Id,
            request.AccountId,
            request.AccountName,
            ackTime,
            ct);

        return true;
    }
}
