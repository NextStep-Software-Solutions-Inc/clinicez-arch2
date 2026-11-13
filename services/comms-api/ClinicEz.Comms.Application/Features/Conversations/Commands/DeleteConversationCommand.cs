using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Comms.Application.Features.Conversations.Commands;

public sealed record DeleteConversationCommand(
    Guid ConversationId,
    string TenantId,
    string StaffId) : IRequest<bool>;

public sealed class DeleteConversationCommandHandler : IRequestHandler<DeleteConversationCommand, bool>
{
    private readonly ICommsDbContext _db;

    public DeleteConversationCommandHandler(ICommsDbContext db)
    {
        _db = db;
    }

    public async Task<bool> Handle(DeleteConversationCommand request, CancellationToken ct)
    {
        var query = _db.Conversations
            .Include(c => c.Participants)
            .Include(c => c.Messages)
            .Where(c => c.Id == request.ConversationId);

        if (!string.IsNullOrWhiteSpace(request.TenantId))
        {
            query = query.Where(c => c.TenantId == request.TenantId);
        }

        var conversation = await query.FirstOrDefaultAsync(ct);
        if (conversation == null)
        {
            return false;
        }

        _db.Conversations.Remove(conversation);
        await _db.SaveChangesAsync(ct);
        return true;
    }
}
