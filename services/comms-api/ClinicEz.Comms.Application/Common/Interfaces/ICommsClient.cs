using System;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Models;
using ClinicEz.Shared.Interop.Contracts;

namespace ClinicEz.Comms.Application.Common.Interfaces;

public interface ICommsClient
{
    Task OnMessageReceived(MessageDto message);
    Task OnMessageStateChanged(Guid messageId, Guid conversationId, DeliveryState state, DateTime timestampUtc);
    Task OnReactionUpdated(Guid messageId, Guid conversationId, string reaction, string staffId, string? staffName, bool isAdded, int totalCount);
    Task OnMessageAcknowledged(Guid messageId, Guid conversationId, Guid accountId, string accountName, DateTime acknowledgedAtUtc);
    Task OnParticipantJoined(Guid conversationId, string participantId, string displayName, string role);
    Task OnParticipantLeft(Guid conversationId, string participantId, string displayName);
    Task OnThreadStateChanged(Guid conversationId, RequestStatus newStatus, TriageDisposition? disposition, string? assignedStaffId, string? assignedStaffName);
    Task OnConversationCreated(ConversationDto conversation);
    Task OnConversationUpdated(ConversationDto conversation);
    Task OnTenantMigrationStateChanged(TenantMigrationStatusDto status);
}
