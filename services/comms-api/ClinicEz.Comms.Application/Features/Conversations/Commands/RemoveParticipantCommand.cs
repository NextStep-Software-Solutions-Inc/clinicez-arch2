using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Application.Features.Conversations.Queries;
using ClinicEz.Comms.Application.Models;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Comms.Application.Features.Conversations.Commands;

public sealed record RemoveParticipantCommand(
    Guid ConversationId,
    string TenantId,
    string ParticipantId) : IRequest<bool>;

public sealed class RemoveParticipantCommandHandler : IRequestHandler<RemoveParticipantCommand, bool>
{
    private readonly ICommsDbContext _db;
    private readonly ICommsRealtimeNotifier _notifier;

    public RemoveParticipantCommandHandler(ICommsDbContext db, ICommsRealtimeNotifier notifier)
    {
        _db = db;
        _notifier = notifier;
    }

    public async Task<bool> Handle(RemoveParticipantCommand request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.ParticipantId))
            throw new ValidationException("ParticipantId is required.");

        var query = _db.Conversations
            .Include(c => c.Participants)
            .Where(c => c.Id == request.ConversationId);

        if (!string.IsNullOrWhiteSpace(request.TenantId))
        {
            query = query.Where(c => c.TenantId == request.TenantId);
        }

        var conversation = await query.FirstOrDefaultAsync(ct)
            ?? throw new NotFoundException($"Conversation '{request.ConversationId}' not found.");

        var participant = conversation.Participants.FirstOrDefault(p =>
            string.Equals(p.ParticipantId, request.ParticipantId, StringComparison.OrdinalIgnoreCase) &&
            p.LeftAtUtc == null);

        if (participant != null)
        {
            participant.LeftAtUtc = DateTime.UtcNow;
            conversation.Version++;
            await _db.SaveChangesAsync(ct);

            await _notifier.NotifyParticipantLeftAsync(
                conversation.Id,
                participant.ParticipantId,
                participant.DisplayName,
                ct);

            var dto = new ConversationDto(
                conversation.Id,
                conversation.TenantId,
                conversation.FacilityId,
                conversation.BranchId,
                conversation.Scope,
                conversation.Kind,
                GetConversationsQueryHandler.ResolveDisplayTitle(conversation, null),
                conversation.ContextType,
                conversation.ContextId,
                conversation.Category,
                conversation.Status,
                conversation.TriageDisposition,
                conversation.DeclineReasonCode,
                conversation.AssignedStaffId,
                conversation.AssignedStaffName,
                conversation.Priority,
                conversation.IsEmergencyConfirmed,
                conversation.IsLocalOnly,
                conversation.ReopenCount,
                conversation.HomeCellId,
                conversation.LastMessageAtUtc,
                conversation.LastMessageSnippet,
                conversation.MessageCount,
                conversation.LastSeq,
                conversation.CreatedAtUtc,
                conversation.CreatedBy,
                conversation.ClosedAtUtc,
                conversation.ClosedBy,
                conversation.Participants.Select(p => new ParticipantDto(
                    p.Id, p.ConversationId, p.TenantId, p.ParticipantType, p.ParticipantId,
                    p.DisplayName, p.Role, p.JoinedAtUtc, p.LeftAtUtc, p.LastReadMessageId,
                    p.LastReadAtUtc, p.IsMuted)).ToList(),
                conversation.PatientId,
                conversation.SubmittingAccountId,
                conversation.Relationship,
                conversation.GrantId,
                conversation.GrantWindowEndUtc,
                conversation.IsOffHoursSubmission,
                conversation.TriageDueAtUtc,
                conversation.TriagedAtUtc,
                conversation.TriagedByStaffId,
                conversation.TriagedByStaffName,
                conversation.IdleDeadlineUtc,
                conversation.SlaBreached,
                conversation.SupervisorAlertedAtUtc);

            await _notifier.NotifyConversationUpdatedAsync(dto, ct);
            return true;
        }

        return false;
    }
}
