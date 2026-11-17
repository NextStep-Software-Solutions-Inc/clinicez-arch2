using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop.Contracts;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Comms.Application.Features.Conversations.Commands;

internal static class ConversationParticipantResolver
{
    /// <summary>
    /// Loads a tenant-scoped conversation and resolves (or enrolls for non-Direct threads)
    /// the requesting staff member's <see cref="Participant"/> record.
    /// </summary>
    public static async Task<(Conversation Conversation, Participant Participant)> ResolveOrCreateStaffParticipantAsync(
        ICommsDbContext db,
        Guid conversationId,
        string tenantId,
        string staffId,
        string? staffDisplayName,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(staffId))
        {
            throw new ValidationException("StaffId is required.");
        }

        var normalizedStaffId = staffId.Trim();

        var conversation = await db.Conversations
            .Include(c => c.Participants)
            .FirstOrDefaultAsync(c => c.Id == conversationId && c.TenantId == tenantId, ct)
            ?? throw new NotFoundException($"Conversation '{conversationId}' not found.");

        var matches = conversation.Participants
            .Where(p => string.Equals(p.ParticipantId, normalizedStaffId, StringComparison.OrdinalIgnoreCase))
            .ToList();

        var participant = matches
            .FirstOrDefault(p => string.Equals(p.ParticipantType, "Staff", StringComparison.OrdinalIgnoreCase))
            ?? matches.FirstOrDefault();

        if (conversation.Scope == ConversationScope.Direct)
        {
            if (participant == null || participant.LeftAtUtc != null)
            {
                throw new ValidationException("Unauthorized: You cannot access a direct conversation you are not a participant in.");
            }

            return (conversation, participant);
        }

        if (participant == null)
        {
            participant = new Participant
            {
                Id = Guid.NewGuid(),
                ConversationId = conversation.Id,
                TenantId = conversation.TenantId,
                ParticipantType = "Staff",
                ParticipantId = normalizedStaffId,
                DisplayName = string.IsNullOrWhiteSpace(staffDisplayName) ? "Staff Member" : staffDisplayName.Trim(),
                Role = "Member",
                JoinedAtUtc = DateTime.UtcNow
            };
            db.Participants.Add(participant);
        }

        return (conversation, participant);
    }
}
