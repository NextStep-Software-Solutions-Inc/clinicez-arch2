using System;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Application.Models;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop.Contracts;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Comms.Application.Features.Conversations.Queries;

public sealed record GetConversationsQuery(
    string TenantId,
    string? FacilityId = null,
    string? ParticipantId = null,
    ConversationScope? Scope = null,
    bool IncludeUnassignedTriage = true,
    string? StaffId = null) : IRequest<IReadOnlyList<ConversationDto>>;

public sealed class GetConversationsQueryHandler : IRequestHandler<GetConversationsQuery, IReadOnlyList<ConversationDto>>
{
    private readonly ICommsDbContext _db;

    public GetConversationsQueryHandler(ICommsDbContext db)
    {
        _db = db;
    }

    public async Task<IReadOnlyList<ConversationDto>> Handle(GetConversationsQuery request, CancellationToken ct)
    {
        var query = _db.Conversations
            .Include(c => c.Participants)
            .Where(c => c.TenantId == request.TenantId);

        if (!string.IsNullOrWhiteSpace(request.FacilityId))
        {
            query = query.Where(c => c.FacilityId == request.FacilityId || c.Scope == ConversationScope.Workspace);
        }

        if (request.Scope.HasValue)
        {
            query = query.Where(c => c.Scope == request.Scope.Value);
        }

        if (!string.IsNullOrWhiteSpace(request.ParticipantId))
        {
            query = query.Where(c => c.Participants.Any(p => p.ParticipantId == request.ParticipantId && p.LeftAtUtc == null));
        }

        // Audience privacy enforcement:
        // Direct messages (1-on-1 private chats) MUST ONLY be visible to active participants in that chat.
        // Even system administrators or supervisors cannot see or query private direct messages between other users.
        if (!string.IsNullOrWhiteSpace(request.StaffId))
        {
            query = query.Where(c =>
                c.Scope != ConversationScope.Direct ||
                c.Participants.Any(p => p.ParticipantId == request.StaffId && p.LeftAtUtc == null));
        }

        if (!request.IncludeUnassignedTriage)
        {
            query = query.Where(c => c.Status != RequestStatus.WithTriage || (request.StaffId != null && c.AssignedStaffId == request.StaffId));
        }

        var list = await query
            .OrderByDescending(c => c.LastMessageAtUtc ?? c.CreatedAtUtc)
            .Take(100)
            .ToListAsync(ct);

        var unreadCounts = await ComputeUnreadCountsAsync(_db, list, request.StaffId, ct);

        return list
            .Select(c => ToDto(c, request.StaffId, unreadCounts.GetValueOrDefault(c.Id, 0)))
            .ToList();
    }

    internal static async Task<IReadOnlyDictionary<Guid, int>> ComputeUnreadCountsAsync(
        ICommsDbContext db,
        IReadOnlyList<Conversation> conversations,
        string? staffId,
        CancellationToken ct)
    {
        var result = new Dictionary<Guid, int>();
        if (conversations.Count == 0 || string.IsNullOrWhiteSpace(staffId))
        {
            return result;
        }

        var openConversations = conversations
            .Where(c => c.Status != RequestStatus.Closed)
            .ToList();

        if (openConversations.Count == 0)
        {
            return result;
        }

        var matchingParticipants = new Dictionary<Guid, Participant?>();

        foreach (var conv in openConversations)
        {
            var staffMatches = conv.Participants
                .Where(p => string.Equals(p.ParticipantId, staffId, StringComparison.OrdinalIgnoreCase))
                .ToList();

            var active = staffMatches
                .FirstOrDefault(p => p.LeftAtUtc == null && string.Equals(p.ParticipantType, "Staff", StringComparison.OrdinalIgnoreCase))
                ?? staffMatches.FirstOrDefault(p => p.LeftAtUtc == null);

            if (active != null)
            {
                matchingParticipants[conv.Id] = active;
            }
            else if (staffMatches.Count == 0 && conv.Scope != ConversationScope.Direct)
            {
                // Open non-Direct facility/context threads where the staff user has no explicit Participant row yet
                matchingParticipants[conv.Id] = null;
            }
        }

        if (matchingParticipants.Count == 0)
        {
            return result;
        }

        var lastReadMessageIds = matchingParticipants.Values
            .Where(p => p?.LastReadMessageId != null)
            .Select(p => p!.LastReadMessageId!.Value)
            .Distinct()
            .ToList();

        var resolvedSeqByConvAndMsgId = new Dictionary<(Guid ConversationId, Guid MessageId), long>();
        if (lastReadMessageIds.Count > 0)
        {
            var resolved = await db.Messages
                .Where(m => lastReadMessageIds.Contains(m.Id))
                .Select(m => new { m.Id, m.ConversationId, m.Seq })
                .ToListAsync(ct);

            foreach (var item in resolved)
            {
                resolvedSeqByConvAndMsgId[(item.ConversationId, item.Id)] = item.Seq;
            }
        }

        var noWatermarkConvIds = new List<Guid>();
        var seqWatermarks = new List<(Guid ConversationId, long LastReadSeq)>();
        var timeWatermarks = new List<(Guid ConversationId, DateTime LastReadAtUtc)>();

        foreach (var (convId, participant) in matchingParticipants)
        {
            if (participant == null)
            {
                noWatermarkConvIds.Add(convId);
                continue;
            }

            if (participant.LastReadMessageId.HasValue &&
                resolvedSeqByConvAndMsgId.TryGetValue((convId, participant.LastReadMessageId.Value), out var lastReadSeq))
            {
                seqWatermarks.Add((convId, lastReadSeq));
            }
            else if (participant.LastReadAtUtc.HasValue)
            {
                var utc = EnsureUtc(participant.LastReadAtUtc.Value);
                timeWatermarks.Add((convId, utc));
            }
            else
            {
                noWatermarkConvIds.Add(convId);
            }
        }

        var clauses = new List<Expression<Func<Message, bool>>>();

        if (noWatermarkConvIds.Count > 0)
        {
            clauses.Add(m => noWatermarkConvIds.Contains(m.ConversationId));
        }

        foreach (var (convId, lastReadSeq) in seqWatermarks)
        {
            var cid = convId;
            var seq = lastReadSeq;
            clauses.Add(m => m.ConversationId == cid && m.Seq > seq);
        }

        foreach (var (convId, lastReadAtUtc) in timeWatermarks)
        {
            var cid = convId;
            var dt = lastReadAtUtc;
            clauses.Add(m => m.ConversationId == cid && m.ServerReceivedAtUtc > dt);
        }

        if (clauses.Count == 0)
        {
            return result;
        }

        var combinedPredicate = CombineOr(clauses);

        var counts = await db.Messages
            .Where(m => m.SenderId == null || m.SenderId != staffId)
            .Where(combinedPredicate)
            .GroupBy(m => m.ConversationId)
            .Select(g => new { ConversationId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.ConversationId, x => x.Count, ct);

        foreach (var kvp in counts)
        {
            result[kvp.Key] = kvp.Value;
        }

        return result;
    }

    internal static ConversationDto ToDto(Conversation c, string? staffId, int unreadCount)
    {
        return new ConversationDto(
            c.Id,
            c.TenantId,
            c.FacilityId,
            c.BranchId,
            c.Scope,
            c.Kind,
            ResolveDisplayTitle(c, staffId),
            c.ContextType,
            c.ContextId,
            c.Category,
            c.Status,
            c.TriageDisposition,
            c.DeclineReasonCode,
            c.AssignedStaffId,
            c.AssignedStaffName,
            c.Priority,
            c.IsEmergencyConfirmed,
            c.IsLocalOnly,
            c.ReopenCount,
            c.HomeCellId,
            c.LastMessageAtUtc,
            c.LastMessageSnippet,
            c.MessageCount,
            c.LastSeq,
            c.CreatedAtUtc,
            c.CreatedBy,
            c.ClosedAtUtc,
            c.ClosedBy,
            c.Participants.Select(p => new ParticipantDto(
                p.Id, p.ConversationId, p.TenantId, p.ParticipantType, p.ParticipantId,
                p.DisplayName, p.Role, p.JoinedAtUtc, p.LeftAtUtc, p.LastReadMessageId,
                p.LastReadAtUtc, p.IsMuted)).ToList(),
            c.PatientId,
            c.SubmittingAccountId,
            c.Relationship,
            c.GrantId,
            c.GrantWindowEndUtc,
            c.IsOffHoursSubmission,
            c.TriageDueAtUtc,
            c.TriagedAtUtc,
            c.TriagedByStaffId,
            c.TriagedByStaffName,
            c.IdleDeadlineUtc,
            c.SlaBreached,
            c.SupervisorAlertedAtUtc,
            unreadCount);
    }

    private static DateTime EnsureUtc(DateTime value) => value.Kind switch
    {
        DateTimeKind.Utc => value,
        DateTimeKind.Local => value.ToUniversalTime(),
        _ => DateTime.SpecifyKind(value, DateTimeKind.Utc)
    };

    private static Expression<Func<Message, bool>> CombineOr(IReadOnlyList<Expression<Func<Message, bool>>> predicates)
    {
        if (predicates.Count == 1)
        {
            return predicates[0];
        }

        var param = Expression.Parameter(typeof(Message), "m");
        var bodies = new List<Expression>(predicates.Count);
        foreach (var pred in predicates)
        {
            bodies.Add(new ParameterReplacer(pred.Parameters[0], param).Visit(pred.Body)!);
        }

        // Balanced binary tree reduction keeps expression depth O(log N)
        while (bodies.Count > 1)
        {
            var next = new List<Expression>((bodies.Count + 1) / 2);
            for (int i = 0; i < bodies.Count; i += 2)
            {
                next.Add(i + 1 < bodies.Count
                    ? Expression.OrElse(bodies[i], bodies[i + 1])
                    : bodies[i]);
            }
            bodies = next;
        }

        return Expression.Lambda<Func<Message, bool>>(bodies[0], param);
    }

    private sealed class ParameterReplacer(ParameterExpression source, ParameterExpression target) : ExpressionVisitor
    {
        protected override Expression VisitParameter(ParameterExpression node) =>
            ReferenceEquals(node, source) ? target : base.VisitParameter(node);
    }

    public static string? ResolveDisplayTitle(Conversation c, string? currentStaffId)
    {
        if (!string.IsNullOrWhiteSpace(c.Title))
        {
            return c.Title;
        }

        if (c.Scope != ConversationScope.Direct)
        {
            return null;
        }

        var otherParticipants = c.Participants
            .Where(p => (currentStaffId == null || !string.Equals(p.ParticipantId, currentStaffId, StringComparison.OrdinalIgnoreCase)) && p.LeftAtUtc == null)
            .ToList();

        if (otherParticipants.Count == 1)
        {
            return otherParticipants[0].DisplayName;
        }
        if (otherParticipants.Count == 2)
        {
            return $"{otherParticipants[0].DisplayName}, {otherParticipants[1].DisplayName}";
        }
        if (otherParticipants.Count > 2)
        {
            return $"{otherParticipants[0].DisplayName}, {otherParticipants[1].DisplayName} +{otherParticipants.Count - 2}";
        }

        return null;
    }
}

public sealed record GetConversationByIdQuery(
    Guid ConversationId,
    string TenantId,
    string? StaffId = null) : IRequest<ConversationDto?>;

public sealed class GetConversationByIdQueryHandler : IRequestHandler<GetConversationByIdQuery, ConversationDto?>
{
    private readonly ICommsDbContext _db;

    public GetConversationByIdQueryHandler(ICommsDbContext db)
    {
        _db = db;
    }

    public async Task<ConversationDto?> Handle(GetConversationByIdQuery request, CancellationToken ct)
    {
        var c = await _db.Conversations
            .Include(x => x.Participants)
            .FirstOrDefaultAsync(x => x.Id == request.ConversationId && x.TenantId == request.TenantId, ct);

        if (c == null) return null;

        // Privacy enforcement: Direct conversations cannot be viewed by non-participants
        if (c.Scope == ConversationScope.Direct && !string.IsNullOrWhiteSpace(request.StaffId))
        {
            var isParticipant = c.Participants.Any(p => p.ParticipantId == request.StaffId && p.LeftAtUtc == null);
            if (!isParticipant)
            {
                return null;
            }
        }

        var unreadCounts = await GetConversationsQueryHandler.ComputeUnreadCountsAsync(_db, new[] { c }, request.StaffId, ct);
        return GetConversationsQueryHandler.ToDto(c, request.StaffId, unreadCounts.GetValueOrDefault(c.Id, 0));
    }
}
