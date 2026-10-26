using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop.Contracts;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Comms.Application.Features.Reactions.Commands;

public sealed record SendReactionCommand(
    Guid MessageId,
    string UserId,
    string? UserDisplayName,
    string Reaction) : IRequest<bool>;

public sealed class SendReactionCommandHandler : IRequestHandler<SendReactionCommand, bool>
{
    private readonly ICommsDbContext _db;
    private readonly ICommsRealtimeNotifier _notifier;

    public SendReactionCommandHandler(ICommsDbContext db, ICommsRealtimeNotifier notifier)
    {
        _db = db;
        _notifier = notifier;
    }

    public async Task<bool> Handle(SendReactionCommand request, CancellationToken ct)
    {
        if (!AllowedReactions.IsValid(request.Reaction))
        {
            throw new ValidationException("Invalid reaction emoji. Only standard 6 reactions permitted.");
        }

        var message = await _db.Messages
            .Include(m => m.Conversation)
            .FirstOrDefaultAsync(m => m.Id == request.MessageId, ct)
            ?? throw new NotFoundException($"Message '{request.MessageId}' not found.");

        if (message.Conversation?.Scope == ConversationScope.PatientFacility)
        {
            throw new ValidationException("Reactions are forbidden on patient-facing conversations.");
        }

        var existingReaction = await _db.MessageReactions
            .FirstOrDefaultAsync(r => r.MessageId == request.MessageId && r.UserId == request.UserId && r.Reaction == request.Reaction, ct);

        bool isAdded;
        if (existingReaction != null)
        {
            _db.MessageReactions.Remove(existingReaction);
            isAdded = false;
        }
        else
        {
            var newReaction = new MessageReaction
            {
                MessageId = request.MessageId,
                UserId = request.UserId,
                UserDisplayName = request.UserDisplayName,
                Reaction = request.Reaction,
                CreatedAtUtc = DateTime.UtcNow
            };
            _db.MessageReactions.Add(newReaction);
            isAdded = true;
        }

        await _db.SaveChangesAsync(ct);

        var totalCount = await _db.MessageReactions
            .CountAsync(r => r.MessageId == request.MessageId && r.Reaction == request.Reaction, ct);

        await _notifier.NotifyReactionUpdatedAsync(
            message.ConversationId,
            message.Id,
            request.Reaction,
            request.UserId,
            request.UserDisplayName,
            isAdded,
            totalCount,
            ct);

        return isAdded;
    }
}
