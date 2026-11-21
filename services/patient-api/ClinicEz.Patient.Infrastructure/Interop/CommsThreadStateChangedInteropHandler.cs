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
/// Handles <c>comms.thread.state.changed</c>: updates the patient conversation replica status,
/// triage disposition, decline reason code, and assigned staff name.
/// </summary>
public sealed class CommsThreadStateChangedInteropHandler : IInteropHandler<CommsThreadStateChangedPayload>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ISyncNotificationService _syncNotificationService;
    private readonly ILogger<CommsThreadStateChangedInteropHandler> _logger;

    public CommsThreadStateChangedInteropHandler(
        ApplicationDbContext dbContext,
        ISyncNotificationService syncNotificationService,
        ILogger<CommsThreadStateChangedInteropHandler> logger)
    {
        _dbContext = dbContext;
        _syncNotificationService = syncNotificationService;
        _logger = logger;
    }

    public async Task HandleAsync(CommsThreadStateChangedPayload message, InteropMessageContext context, CancellationToken ct)
    {
        var conversation = await _dbContext.PatientConversations
            .FirstOrDefaultAsync(c => c.Id == message.ConversationId, ct);

        if (conversation == null)
        {
            _logger.LogInformation("ThreadStateChanged: conversation {ConversationId} not found in patient DB replica.", message.ConversationId);
            return;
        }

        // Out-of-order state transition protection
        if (message.Version <= conversation.Version)
        {
            _logger.LogInformation(
                "ThreadStateChanged: Dropping out-of-order state update for conversation {ConversationId} (version {MsgVersion} <= current {CurVersion}).",
                conversation.Id, message.Version, conversation.Version);
            return;
        }

        conversation.Status = message.NewStatus;
        conversation.TriageDisposition = message.Disposition;
        conversation.DeclineReasonCode = message.DeclineReasonCode;
        conversation.AssignedStaffDisplayName = message.AssignedStaffName;
        conversation.Version = message.Version;
        conversation.UpdatedAtUtc = message.ChangedAtUtc;

        if (message.NewStatus == RequestStatus.Closed)
        {
            conversation.ClosedAtUtc = message.ChangedAtUtc;
        }

        await _dbContext.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Conversation {ConversationId} transitioned to {Status} (Disposition: {Disposition}) Version {Version}.",
            conversation.Id, message.NewStatus, message.Disposition, message.Version);

        try
        {
            await _syncNotificationService.NotifyCommsEventAsync(
                conversation.PatientId,
                "ThreadStateChanged",
                new
                {
                    conversationId = conversation.Id,
                    status = conversation.Status,
                    disposition = conversation.TriageDisposition,
                    declineReasonCode = conversation.DeclineReasonCode,
                    assignedStaffName = conversation.AssignedStaffDisplayName,
                    version = conversation.Version
                },
                ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to broadcast thread state change for conversation {ConversationId}.", conversation.Id);
        }
    }
}
