using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Patient.Infrastructure.Interop;

/// <summary>
/// Handles <c>comms.message.received</c>: facility stored the patient's message.
/// Flips <see cref="PatientMessage.DeliveryState"/> from Waiting or NotReceived to Received,
/// setting the truthful ReceivedAtUtc timestamp (late truth principle).
/// </summary>
public sealed class CommsMessageReceivedInteropHandler : IInteropHandler<CommsMessageReceivedPayload>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ISyncNotificationService _syncNotificationService;
    private readonly ILogger<CommsMessageReceivedInteropHandler> _logger;

    public CommsMessageReceivedInteropHandler(
        ApplicationDbContext dbContext,
        ISyncNotificationService syncNotificationService,
        ILogger<CommsMessageReceivedInteropHandler> logger)
    {
        _dbContext = dbContext;
        _syncNotificationService = syncNotificationService;
        _logger = logger;
    }

    public async Task HandleAsync(CommsMessageReceivedPayload message, InteropMessageContext context, CancellationToken ct)
    {
        var msg = await _dbContext.PatientMessages
            .Include(m => m.Conversation)
            .FirstOrDefaultAsync(m => m.Id == message.MessageId, ct);

        if (msg == null)
        {
            _logger.LogInformation("CommsMessageReceived: message {MessageId} not found in patient DB replica.", message.MessageId);
            return;
        }

        // Late truth: even if message was marked NotReceived by retention sweeper,
        // a late confirmation proves it was genuinely received!
        msg.DeliveryState = DeliveryState.Received;
        msg.ReceivedAtUtc = message.ReceivedAtUtc;
        msg.HasExpiredBannerShown = false;
        msg.UpdatedAtUtc = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Truthful Delivery: Message {MessageId} transitioned to Received at {ReceivedAtUtc}.",
            msg.Id, message.ReceivedAtUtc);

        try
        {
            await _syncNotificationService.NotifyCommsEventAsync(
                msg.Conversation.PatientId,
                "MessageDeliveryStateChanged",
                new
                {
                    messageId = msg.Id,
                    conversationId = msg.ConversationId,
                    deliveryState = DeliveryState.Received,
                    receivedAtUtc = message.ReceivedAtUtc
                },
                ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to broadcast delivery state change for message {MessageId}.", msg.Id);
        }
    }
}
