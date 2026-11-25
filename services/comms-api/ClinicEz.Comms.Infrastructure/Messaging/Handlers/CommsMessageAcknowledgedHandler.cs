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
/// Ingests <c>comms.message.acknowledged</c> ("Understood" patient receipt) envelopes from <c>patient-api</c>.
/// </summary>
public sealed class CommsMessageAcknowledgedHandler : IInteropHandler<CommsMessageAcknowledgedPayload>
{
    private readonly CommsDbContext _db;
    private readonly ICommsRealtimeNotifier _notifier;
    private readonly ILogger<CommsMessageAcknowledgedHandler> _logger;

    public CommsMessageAcknowledgedHandler(
        CommsDbContext db,
        ICommsRealtimeNotifier notifier,
        ILogger<CommsMessageAcknowledgedHandler> logger)
    {
        _db = db;
        _notifier = notifier;
        _logger = logger;
    }

    public async Task HandleAsync(CommsMessageAcknowledgedPayload message, InteropMessageContext context, CancellationToken ct)
    {
        var entity = await _db.Messages
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(m => m.Id == message.MessageId && m.ConversationId == message.ConversationId, ct);

        if (entity == null)
        {
            _logger.LogInformation(
                "[CommsMessageAcknowledgedHandler] Message {MessageId} in conversation {ConversationId} not found; skipping.",
                message.MessageId, message.ConversationId);
            return;
        }

        if (!entity.RequiresAcknowledgement || entity.IsAcknowledged)
        {
            return;
        }

        var ackTime = message.AcknowledgedAtUtc == default ? DateTime.UtcNow : message.AcknowledgedAtUtc;
        entity.IsAcknowledged = true;
        entity.AcknowledgedAtUtc = ackTime;
        entity.AcknowledgedByAccountId = message.AcknowledgedByAccountId;
        entity.AcknowledgedByName = string.IsNullOrWhiteSpace(message.AcknowledgedByName)
            ? "Patient"
            : message.AcknowledgedByName;
        entity.UpdatedAtUtc = ackTime;

        await _db.SaveChangesAsync(ct);

        await _notifier.NotifyMessageAcknowledgedAsync(
            entity.ConversationId,
            entity.Id,
            message.AcknowledgedByAccountId,
            entity.AcknowledgedByName,
            ackTime,
            ct);
    }
}
