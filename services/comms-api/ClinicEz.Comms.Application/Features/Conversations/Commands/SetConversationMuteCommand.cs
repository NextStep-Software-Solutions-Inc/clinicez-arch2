using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Application.Models;
using MediatR;

namespace ClinicEz.Comms.Application.Features.Conversations.Commands;

public sealed record SetConversationMuteCommand(
    Guid ConversationId,
    string TenantId,
    string StaffId,
    string StaffDisplayName,
    bool IsMuted) : IRequest<ParticipantDto>;

public sealed class SetConversationMuteCommandHandler
    : IRequestHandler<SetConversationMuteCommand, ParticipantDto>
{
    private readonly ICommsDbContext _db;

    public SetConversationMuteCommandHandler(ICommsDbContext db)
    {
        _db = db;
    }

    public async Task<ParticipantDto> Handle(SetConversationMuteCommand request, CancellationToken ct)
    {
        var (_, participant) = await ConversationParticipantResolver.ResolveOrCreateStaffParticipantAsync(
            _db,
            request.ConversationId,
            request.TenantId,
            request.StaffId,
            request.StaffDisplayName,
            ct);

        participant.IsMuted = request.IsMuted;
        await _db.SaveChangesAsync(ct);

        return new ParticipantDto(
            participant.Id,
            participant.ConversationId,
            participant.TenantId,
            participant.ParticipantType,
            participant.ParticipantId,
            participant.DisplayName,
            participant.Role,
            participant.JoinedAtUtc,
            participant.LeftAtUtc,
            participant.LastReadMessageId,
            participant.LastReadAtUtc,
            participant.IsMuted);
    }
}
