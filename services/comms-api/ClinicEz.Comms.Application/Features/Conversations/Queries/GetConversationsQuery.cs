using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Application.Models;
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

        if (!request.IncludeUnassignedTriage)
        {
            query = query.Where(c => c.Status != RequestStatus.WithTriage || (request.StaffId != null && c.AssignedStaffId == request.StaffId));
        }

        var list = await query
            .OrderByDescending(c => c.LastMessageAtUtc ?? c.CreatedAtUtc)
            .Take(100)
            .ToListAsync(ct);

        return list.Select(c => new ConversationDto(
            c.Id,
            c.TenantId,
            c.FacilityId,
            c.BranchId,
            c.Scope,
            c.Kind,
            c.Title,
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
            c.SupervisorAlertedAtUtc
        )).ToList();
    }
}

public sealed record GetConversationByIdQuery(
    Guid ConversationId,
    string TenantId) : IRequest<ConversationDto?>;

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

        return new ConversationDto(
            c.Id,
            c.TenantId,
            c.FacilityId,
            c.BranchId,
            c.Scope,
            c.Kind,
            c.Title,
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
            c.SupervisorAlertedAtUtc);
    }
}
