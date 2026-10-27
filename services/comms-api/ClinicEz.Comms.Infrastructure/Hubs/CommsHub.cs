using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Application.Features.Messages.Commands;
using ClinicEz.Comms.Application.Features.Reactions.Commands;
using ClinicEz.Comms.Application.Models;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Security;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Comms.Infrastructure.Hubs;

public sealed record SendMessageRequest(
    Guid ConversationId,
    Guid ClientMessageId,
    string ContentText,
    MessageVisibility Visibility,
    bool RequiresAcknowledgement,
    IReadOnlyList<CommsAttachmentReference>? Attachments = null);

[Authorize]
public class CommsHub : Hub<ICommsClient>
{
    private readonly ICommsDbContext _db;
    private readonly IMediator _mediator;
    private readonly ILogger<CommsHub> _logger;

    public CommsHub(
        ICommsDbContext db,
        IMediator mediator,
        ILogger<CommsHub> logger)
    {
        _db = db;
        _mediator = mediator;
        _logger = logger;
    }

    public override async Task OnConnectedAsync()
    {
        var user = Context.User;
        if (user == null || !user.Identity?.IsAuthenticated == true)
        {
            Context.Abort();
            return;
        }

        var tenantId = user.FindFirstValue("tenant_id") ?? user.FindFirstValue("TenantId");
        var facilityId = user.FindFirstValue("facility_id") ?? user.FindFirstValue("FacilityId");
        var branchId = user.FindFirstValue("branch_id") ?? user.FindFirstValue("BranchId");
        var staffId = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub");

        if (string.IsNullOrWhiteSpace(tenantId) || string.IsNullOrWhiteSpace(staffId))
        {
            Context.Abort();
            return;
        }

        // Add to scoped connection groups
        await Groups.AddToGroupAsync(Context.ConnectionId, $"user:{tenantId}:{staffId}");
        if (!string.IsNullOrWhiteSpace(facilityId))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, $"facility:{tenantId}:{facilityId}");
        }
        if (!string.IsNullOrWhiteSpace(branchId))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, $"branch:{tenantId}:{branchId}");
        }
        await Groups.AddToGroupAsync(Context.ConnectionId, $"tenant:{tenantId}");

        await base.OnConnectedAsync();
    }

    public async Task JoinConversation(Guid conversationId)
    {
        var user = Context.User ?? throw new HubException("Unauthenticated connection.");
        var tenantId = user.FindFirstValue("tenant_id") ?? user.FindFirstValue("TenantId");
        var facilityId = user.FindFirstValue("facility_id") ?? user.FindFirstValue("FacilityId");
        var branchId = user.FindFirstValue("branch_id") ?? user.FindFirstValue("BranchId");
        var staffId = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub") ?? "unknown";
        var displayName = user.FindFirstValue(ClaimTypes.Name) ?? user.FindFirstValue("name") ?? "Staff Member";

        var conversation = await _db.Conversations
            .FirstOrDefaultAsync(c => c.Id == conversationId);

        if (conversation == null)
        {
            throw new HubException($"Conversation '{conversationId}' not found.");
        }

        // Scoping & cross-tenant guard
        if (!string.Equals(conversation.TenantId, tenantId, StringComparison.OrdinalIgnoreCase))
        {
            throw new HubException("Unauthorized: Cross-tenant access forbidden.");
        }

        if (conversation.Scope == ConversationScope.Facility &&
            !string.IsNullOrWhiteSpace(conversation.FacilityId) &&
            !string.Equals(conversation.FacilityId, facilityId, StringComparison.OrdinalIgnoreCase))
        {
            throw new HubException("Unauthorized: Facility mismatch.");
        }

        if (conversation.Scope == ConversationScope.Branch &&
            !string.IsNullOrWhiteSpace(conversation.BranchId) &&
            !string.Equals(conversation.BranchId, branchId, StringComparison.OrdinalIgnoreCase))
        {
            throw new HubException("Unauthorized: Branch mismatch.");
        }

        // Triage scoping guard
        if (conversation.Scope == ConversationScope.PatientFacility &&
            conversation.Status == RequestStatus.Submitted)
        {
            var hasTriagePermission = user.HasClaim("permission", CommsPermissions.MessagingTriage)
                || user.HasClaim("permissions", CommsPermissions.MessagingTriage);

            if (!hasTriagePermission)
            {
                throw new HubException("Access denied: request is pending triage routing.");
            }
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, $"conv:{conversationId}");
        await Clients.Group($"conv:{conversationId}").OnParticipantJoined(conversationId, staffId, displayName, "Member");
    }

    public async Task LeaveConversation(Guid conversationId)
    {
        var user = Context.User;
        var staffId = user?.FindFirstValue(ClaimTypes.NameIdentifier) ?? user?.FindFirstValue("sub") ?? "unknown";
        var displayName = user?.FindFirstValue(ClaimTypes.Name) ?? user?.FindFirstValue("name") ?? "Staff Member";

        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"conv:{conversationId}");
        await Clients.Group($"conv:{conversationId}").OnParticipantLeft(conversationId, staffId, displayName);
    }

    public async Task<MessageDto> SendMessage(SendMessageRequest request)
    {
        var user = Context.User ?? throw new HubException("Unauthenticated connection.");
        var tenantId = user.FindFirstValue("tenant_id") ?? user.FindFirstValue("TenantId") ?? string.Empty;
        var facilityId = user.FindFirstValue("facility_id") ?? user.FindFirstValue("FacilityId") ?? string.Empty;
        var staffId = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub") ?? string.Empty;
        var displayName = user.FindFirstValue(ClaimTypes.Name) ?? user.FindFirstValue("name") ?? "Staff Member";

        try
        {
            var command = new SendMessageCommand(
                request.ConversationId,
                tenantId,
                facilityId,
                "Staff",
                staffId,
                displayName,
                request.ContentText,
                request.Visibility,
                request.RequiresAcknowledgement,
                request.Attachments,
                request.ClientMessageId);

            return await _mediator.Send(command);
        }
        catch (ValidationException ex)
        {
            throw new HubException(ex.Message);
        }
        catch (NotFoundException ex)
        {
            throw new HubException(ex.Message);
        }
    }

    public async Task SendReaction(Guid messageId, string reaction)
    {
        var user = Context.User ?? throw new HubException("Unauthenticated connection.");
        var staffId = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub") ?? string.Empty;
        var displayName = user.FindFirstValue(ClaimTypes.Name) ?? user.FindFirstValue("name") ?? "Staff Member";

        try
        {
            var command = new SendReactionCommand(messageId, staffId, displayName, reaction);
            await _mediator.Send(command);
        }
        catch (ValidationException ex)
        {
            throw new HubException(ex.Message);
        }
        catch (NotFoundException ex)
        {
            throw new HubException(ex.Message);
        }
    }

    public async Task AcknowledgeMessage(Guid messageId)
    {
        var user = Context.User ?? throw new HubException("Unauthenticated connection.");
        var staffId = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub") ?? Guid.NewGuid().ToString();
        var displayName = user.FindFirstValue(ClaimTypes.Name) ?? user.FindFirstValue("name") ?? "Staff Member";
        var accountId = Guid.TryParse(staffId, out var g) ? g : Guid.NewGuid();

        try
        {
            var command = new AcknowledgeMessageCommand(messageId, accountId, displayName);
            await _mediator.Send(command);
        }
        catch (ValidationException ex)
        {
            throw new HubException(ex.Message);
        }
        catch (NotFoundException ex)
        {
            throw new HubException(ex.Message);
        }
    }

    public async Task ConfirmDelivery(Guid messageId)
    {
        var command = new ConfirmDeliveryCommand(messageId);
        await _mediator.Send(command);
    }

    public async Task<IReadOnlyList<MessageDto>> GetMessagesAfterSeq(Guid conversationId, long afterSeq)
    {
        var messages = await _db.Messages
            .Include(m => m.Attachments)
            .Where(m => m.ConversationId == conversationId && m.Seq > afterSeq)
            .OrderBy(m => m.Seq)
            .Take(100)
            .ToListAsync();

        return messages.Select(m => new MessageDto(
            m.Id,
            m.ConversationId,
            m.Seq,
            m.ClientMessageId,
            m.SenderType,
            m.SenderId,
            m.SenderDisplayName,
            m.ContentText,
            m.Visibility,
            m.RequiresAcknowledgement,
            m.IsAcknowledged,
            m.AcknowledgedAtUtc,
            m.AcknowledgedByAccountId,
            m.AcknowledgedByName,
            m.Attachments.Select(a => new CommsAttachmentReference(a.StoragePath, a.SafeFileName, a.ContentType, a.SanitizedSizeBytes, a.SHA256Checksum)).ToList(),
            m.State,
            m.ClientSentAtUtc,
            m.RetentionDeadlineUtc
        )).ToList();
    }
}
