using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Application.Models;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop.Contracts;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Comms.Application.Features.Conversations.Commands;

public sealed record ParticipantInput(
    string ParticipantType,
    string ParticipantId,
    string DisplayName,
    string Role = "Member");

public sealed record CreateConversationCommand(
    string TenantId,
    string FacilityId,
    string? BranchId,
    ConversationScope Scope,
    ConversationKind Kind,
    string Title,
    string? ContextType,
    string? ContextId,
    MessageCategory? Category,
    bool IsEmergencyConfirmed,
    bool IsLocalOnly,
    string CreatedBy,
    IReadOnlyList<ParticipantInput>? Participants) : IRequest<ConversationDto>;

public sealed class CreateConversationCommandHandler : IRequestHandler<CreateConversationCommand, ConversationDto>
{
    private readonly ICommsDbContext _db;

    public CreateConversationCommandHandler(ICommsDbContext db)
    {
        _db = db;
    }

    public async Task<ConversationDto> Handle(CreateConversationCommand request, CancellationToken ct)
    {
        if (request.Scope == ConversationScope.PatientFacility)
        {
            throw new ValidationException("PatientFacility conversations cannot be created directly. Use SubmitPatientRequestCommand via the triage intake engine.");
        }

        if (string.IsNullOrWhiteSpace(request.TenantId))
            throw new ValidationException("TenantId is required.");
        if (string.IsNullOrWhiteSpace(request.FacilityId))
            throw new ValidationException("FacilityId is required.");
        if (string.IsNullOrWhiteSpace(request.Title))
            throw new ValidationException("Title is required.");

        var conversation = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = request.TenantId,
            FacilityId = request.FacilityId,
            BranchId = request.BranchId,
            Scope = request.Scope,
            Kind = request.Kind,
            Title = request.Title.Trim(),
            ContextType = request.ContextType,
            ContextId = request.ContextId,
            Category = request.Category,
            Status = request.Scope == ConversationScope.PatientFacility ? RequestStatus.Submitted : RequestStatus.Routed,
            IsEmergencyConfirmed = request.IsEmergencyConfirmed,
            IsLocalOnly = request.IsLocalOnly,
            CreatedBy = request.CreatedBy,
            CreatedAtUtc = DateTime.UtcNow,
            HomeCellId = "cloud"
        };

        if (request.Participants != null)
        {
            foreach (var p in request.Participants)
            {
                conversation.Participants.Add(new Participant
                {
                    Id = Guid.NewGuid(),
                    ConversationId = conversation.Id,
                    TenantId = request.TenantId,
                    ParticipantType = p.ParticipantType,
                    ParticipantId = p.ParticipantId,
                    DisplayName = p.DisplayName,
                    Role = p.Role,
                    JoinedAtUtc = DateTime.UtcNow
                });
            }
        }

        _db.Conversations.Add(conversation);
        await _db.SaveChangesAsync(ct);

        var participantDtos = conversation.Participants
            .Select(p => new ParticipantDto(
                p.Id, p.ConversationId, p.TenantId, p.ParticipantType, p.ParticipantId,
                p.DisplayName, p.Role, p.JoinedAtUtc, p.LeftAtUtc, p.LastReadMessageId,
                p.LastReadAtUtc, p.IsMuted))
            .ToList();

        return new ConversationDto(
            conversation.Id,
            conversation.TenantId,
            conversation.FacilityId,
            conversation.BranchId,
            conversation.Scope,
            conversation.Kind,
            conversation.Title,
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
            participantDtos);
    }
}
