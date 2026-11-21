using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Comms.Application.Features.Conversations.Commands;

public sealed record MarkConversationReadResult(
    Guid ConversationId,
    int UnreadCount,
    DateTime LastReadAtUtc,
    Guid? LastReadMessageId);

public sealed record MarkConversationReadCommand(
    Guid ConversationId,
    string TenantId,
    string StaffId,
    string StaffDisplayName,
    Guid? LastReadMessageId = null) : IRequest<MarkConversationReadResult>;

public sealed class MarkConversationReadCommandHandler
    : IRequestHandler<MarkConversationReadCommand, MarkConversationReadResult>
{
    private readonly ICommsDbContext _db;

    public MarkConversationReadCommandHandler(ICommsDbContext db)
    {
        _db = db;
    }

    public async Task<MarkConversationReadResult> Handle(MarkConversationReadCommand request, CancellationToken ct)
    {
        var (conversation, participant) = await ConversationParticipantResolver.ResolveOrCreateStaffParticipantAsync(
            _db,
            request.ConversationId,
            request.TenantId,
            request.StaffId,
            request.StaffDisplayName,
            ct);

        if (request.LastReadMessageId.HasValue)
        {
            var existsInConversation = await _db.Messages
                .AnyAsync(m => m.Id == request.LastReadMessageId.Value && m.ConversationId == conversation.Id, ct);

            participant.LastReadMessageId = existsInConversation
                ? request.LastReadMessageId.Value
                : await ResolveLatestMessageIdAsync(conversation.Id, ct);
        }
        else
        {
            participant.LastReadMessageId = await ResolveLatestMessageIdAsync(conversation.Id, ct);
        }

        var now = DateTime.UtcNow;
        participant.LastReadAtUtc = now;

        await _db.SaveChangesAsync(ct);

        return new MarkConversationReadResult(
            conversation.Id,
            UnreadCount: 0,
            now,
            participant.LastReadMessageId);
    }

    private async Task<Guid?> ResolveLatestMessageIdAsync(Guid conversationId, CancellationToken ct)
    {
        return await _db.Messages
            .Where(m => m.ConversationId == conversationId)
            .OrderByDescending(m => m.Seq)
            .ThenByDescending(m => m.ServerReceivedAtUtc)
            .Select(m => (Guid?)m.Id)
            .FirstOrDefaultAsync(ct);
    }
}
