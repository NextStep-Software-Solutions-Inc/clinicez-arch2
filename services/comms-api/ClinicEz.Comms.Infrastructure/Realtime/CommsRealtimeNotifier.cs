using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Application.Models;
using ClinicEz.Comms.Infrastructure.Hubs;
using ClinicEz.Shared.Interop.Contracts;
using Microsoft.AspNetCore.SignalR;

namespace ClinicEz.Comms.Infrastructure.Realtime;

public class CommsRealtimeNotifier : ICommsRealtimeNotifier
{
    private readonly IHubContext<CommsHub, ICommsClient> _hubContext;

    public CommsRealtimeNotifier(IHubContext<CommsHub, ICommsClient> hubContext)
    {
        _hubContext = hubContext;
    }

    public async Task NotifyMessageReceivedAsync(Guid conversationId, MessageDto message, CancellationToken ct = default)
    {
        await _hubContext.Clients.Group($"conv:{conversationId}").OnMessageReceived(message);
    }

    public async Task NotifyMessageStateChangedAsync(Guid conversationId, Guid messageId, DeliveryState state, DateTime timestampUtc, CancellationToken ct = default)
    {
        await _hubContext.Clients.Group($"conv:{conversationId}").OnMessageStateChanged(messageId, conversationId, state, timestampUtc);
    }

    public async Task NotifyReactionUpdatedAsync(Guid conversationId, Guid messageId, string reaction, string staffId, string? staffName, bool isAdded, int totalCount, CancellationToken ct = default)
    {
        await _hubContext.Clients.Group($"conv:{conversationId}").OnReactionUpdated(messageId, conversationId, reaction, staffId, staffName ?? string.Empty, isAdded, totalCount);
    }

    public async Task NotifyMessageAcknowledgedAsync(Guid conversationId, Guid messageId, Guid accountId, string accountName, DateTime acknowledgedAtUtc, CancellationToken ct = default)
    {
        await _hubContext.Clients.Group($"conv:{conversationId}").OnMessageAcknowledged(messageId, conversationId, accountId, accountName, acknowledgedAtUtc);
    }

    public async Task NotifyParticipantJoinedAsync(Guid conversationId, string participantId, string displayName, string role, CancellationToken ct = default)
    {
        await _hubContext.Clients.Group($"conv:{conversationId}").OnParticipantJoined(conversationId, participantId, displayName, role);
    }

    public async Task NotifyParticipantLeftAsync(Guid conversationId, string participantId, string displayName, CancellationToken ct = default)
    {
        await _hubContext.Clients.Group($"conv:{conversationId}").OnParticipantLeft(conversationId, participantId, displayName);
    }

    public async Task NotifyThreadStateChangedAsync(Guid conversationId, RequestStatus newStatus, TriageDisposition? disposition, string? assignedStaffId, string? assignedStaffName, CancellationToken ct = default)
    {
        await _hubContext.Clients.Group($"conv:{conversationId}").OnThreadStateChanged(conversationId, newStatus, disposition, assignedStaffId, assignedStaffName);
    }

    public async Task NotifyConversationCreatedAsync(ConversationDto conversation, CancellationToken ct = default)
    {
        await _hubContext.Clients.Group($"facility:{conversation.FacilityId}").OnConversationCreated(conversation);
        await _hubContext.Clients.Group($"conv:{conversation.Id}").OnConversationCreated(conversation);
    }

    public async Task NotifyConversationUpdatedAsync(ConversationDto conversation, CancellationToken ct = default)
    {
        await _hubContext.Clients.Group($"facility:{conversation.FacilityId}").OnConversationUpdated(conversation);
        await _hubContext.Clients.Group($"conv:{conversation.Id}").OnConversationUpdated(conversation);
    }
}
