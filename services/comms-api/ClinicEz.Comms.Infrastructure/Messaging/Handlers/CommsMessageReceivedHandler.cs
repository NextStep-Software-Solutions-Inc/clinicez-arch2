using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Infrastructure.Persistence;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Comms.Infrastructure.Messaging.Handlers;

/// <summary>
/// Ingests <c>comms.message.received</c> ACKs from <c>patient-api</c>, transitioning staff messages
/// from <see cref="DeliveryState.Waiting"/> (or late <see cref="DeliveryState.NotReceived"/>) to <see cref="DeliveryState.Received"/>.
/// </summary>
public sealed class CommsMessageReceivedHandler : IInteropHandler<CommsMessageReceivedPayload>
{
    private readonly CommsDbContext _db;
    private readonly ICommsRealtimeNotifier _notifier;
    private readonly ILogger<CommsMessageReceivedHandler> _logger;

    public CommsMessageReceivedHandler(
        CommsDbContext db,
        ICommsRealtimeNotifier notifier,
        ILogger<CommsMessageReceivedHandler> logger)
    {
        _db = db;
        _notifier = notifier;
        _logger = logger;
    }

    public async Task HandleAsync(CommsMessageReceivedPayload message, InteropMessageContext context, CancellationToken ct)
    {
        var entity = await _db.Messages
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(m => m.Id == message.MessageId, ct);

        if (entity == null)
        {
            _logger.LogInformation(
                "[CommsMessageReceivedHandler] Message {MessageId} not found; skipping.",
                message.MessageId);
            return;
        }

        if (entity.State == DeliveryState.Received)
        {
            return;
        }

        var receiveTime = message.ReceivedAtUtc == default ? DateTime.UtcNow : message.ReceivedAtUtc;
        entity.State = DeliveryState.Received;
        entity.UpdatedAtUtc = receiveTime;

        await _db.SaveChangesAsync(ct);

        await _notifier.NotifyMessageStateChangedAsync(
            entity.ConversationId,
            entity.Id,
            DeliveryState.Received,
            receiveTime,
            ct);
    }
}
