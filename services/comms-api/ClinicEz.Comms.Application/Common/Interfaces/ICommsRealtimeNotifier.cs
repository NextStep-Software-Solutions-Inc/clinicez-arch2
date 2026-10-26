using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Models;
using ClinicEz.Shared.Interop.Contracts;

namespace ClinicEz.Comms.Application.Common.Interfaces;

public interface ICommsRealtimeNotifier
{
    Task NotifyMessageReceivedAsync(Guid conversationId, MessageDto message, CancellationToken ct = default);
    Task NotifyMessageStateChangedAsync(Guid conversationId, Guid messageId, DeliveryState state, DateTime timestampUtc, CancellationToken ct = default);
    Task NotifyReactionUpdatedAsync(Guid conversationId, Guid messageId, string reaction, string staffId, string? staffName, bool isAdded, int totalCount, CancellationToken ct = default);
    Task NotifyMessageAcknowledgedAsync(Guid conversationId, Guid messageId, Guid accountId, string accountName, DateTime acknowledgedAtUtc, CancellationToken ct = default);
    Task NotifyParticipantJoinedAsync(Guid conversationId, string participantId, string displayName, string role, CancellationToken ct = default);
    Task NotifyParticipantLeftAsync(Guid conversationId, string participantId, string displayName, CancellationToken ct = default);
    Task NotifyThreadStateChangedAsync(Guid conversationId, RequestStatus newStatus, TriageDisposition? disposition, string? assignedStaffId, string? assignedStaffName, CancellationToken ct = default);
    Task NotifyConversationCreatedAsync(ConversationDto conversation, CancellationToken ct = default);
    Task NotifyConversationUpdatedAsync(ConversationDto conversation, CancellationToken ct = default);
}
