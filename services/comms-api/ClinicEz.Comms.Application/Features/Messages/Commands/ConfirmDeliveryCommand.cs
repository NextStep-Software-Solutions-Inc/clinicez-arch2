using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Application.Models;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop.Contracts;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Comms.Application.Features.Messages.Commands;

public sealed record ConfirmDeliveryCommand(
    Guid MessageId,
    string? RecipientPartyAddress = null,
    DateTime? ReceivedAtUtc = null) : IRequest<bool>;

public sealed class ConfirmDeliveryCommandHandler : IRequestHandler<ConfirmDeliveryCommand, bool>
{
    private readonly ICommsDbContext _db;
    private readonly ICommsRealtimeNotifier _notifier;

    public ConfirmDeliveryCommandHandler(
        ICommsDbContext db,
        ICommsRealtimeNotifier notifier)
    {
        _db = db;
        _notifier = notifier;
    }

    public async Task<bool> Handle(ConfirmDeliveryCommand request, CancellationToken ct)
    {
        var message = await _db.Messages
            .FirstOrDefaultAsync(m => m.Id == request.MessageId, ct)
            ?? throw new NotFoundException($"Message '{request.MessageId}' not found.");

        // Idempotent: if already received, return true
        if (message.State == DeliveryState.Received)
        {
            return true;
        }

        var receiveTime = request.ReceivedAtUtc ?? DateTime.UtcNow;
        message.State = DeliveryState.Received;
        message.UpdatedAtUtc = receiveTime;

        await _db.SaveChangesAsync(ct);

        await _notifier.NotifyMessageStateChangedAsync(message.ConversationId, message.Id, DeliveryState.Received, receiveTime, ct);

        return true;
    }
}
