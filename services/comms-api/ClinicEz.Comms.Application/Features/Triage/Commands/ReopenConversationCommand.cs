using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Application.Models;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Comms.Application.Features.Triage.Commands;

public sealed record ReopenConversationCommand(
    Guid ConversationId,
    string TenantId,
    Guid PatientId,
    bool? IsEmergencyConfirmed,
    string Reason) : IRequest<ConversationDto>;

public sealed class ReopenConversationCommandHandler : IRequestHandler<ReopenConversationCommand, ConversationDto>
{
    private readonly ICommsDbContext _db;
    private readonly ICommsRealtimeNotifier _notifier;
    private readonly IInteropPublisher? _publisher;

    public ReopenConversationCommandHandler(
        ICommsDbContext db,
        ICommsRealtimeNotifier notifier,
        IInteropPublisher? publisher = null)
    {
        _db = db;
        _notifier = notifier;
        _publisher = publisher;
    }

    public async Task<ConversationDto> Handle(ReopenConversationCommand request, CancellationToken ct)
    {
        var now = DateTime.UtcNow;

        var conversation = await _db.Conversations
            .Include(c => c.Participants)
            .Include(c => c.Messages)
            .FirstOrDefaultAsync(c => c.Id == request.ConversationId && c.TenantId == request.TenantId, ct)
            ?? throw new NotFoundException($"Conversation '{request.ConversationId}' not found.");

        if (!conversation.ClosedAtUtc.HasValue
            && conversation.Status != RequestStatus.Closed
            && conversation.Status != RequestStatus.Declined
            && conversation.Status != RequestStatus.Answered
            && conversation.Status != RequestStatus.NeedsVisit
            && conversation.Status != RequestStatus.Resolved)
        {
            throw new ValidationException("Only closed or terminal conversations can be reopened.");
        }

        // 1. Reopen Guard: At most 1 reopen allowed per conversation lifecycle
        if (conversation.ReopenCount >= 1)
        {
            throw new ValidationException("REOPEN_LIMIT_EXCEEDED: A conversation inquiry can only be reopened once.");
        }

        // 2. Emergency Screening Gate
        if (!request.IsEmergencyConfirmed.HasValue)
        {
            throw new ValidationException("EMERGENCY_CONFIRMATION_REQUIRED: Emergency screening confirmation is required before reopening an inquiry.");
        }

        if (request.IsEmergencyConfirmed.Value)
        {
            throw new ValidationException("EMERGENCY_REDIRECT: Medical emergencies cannot be addressed via message reopening. Please call 911 or proceed to the nearest emergency department.");
        }

        // 3. Live Eligibility Grant Verification
        var activeGrant = await _db.EligibilityGrants
            .Where(g => g.TenantId == request.TenantId
                     && g.FacilityId == conversation.FacilityId
                     && g.PatientId == request.PatientId
                     && g.IsActive
                     && g.WindowStartUtc <= now
                     && g.WindowEndUtc >= now)
            .OrderByDescending(g => g.WindowEndUtc)
            .FirstOrDefaultAsync(ct);

        if (activeGrant == null)
        {
            throw new ForbiddenException("INELIGIBLE: Active eligibility grant has expired or was revoked. Inquiry cannot be reopened.");
        }

        // 4. Reset Conversation to WithTriage
        conversation.ReopenCount++;
        conversation.Status = RequestStatus.WithTriage;
        conversation.ClosedAtUtc = null;
        conversation.ClosedBy = null;
        conversation.TriageDisposition = null;
        conversation.DeclineReasonCode = null;
        conversation.AssignedStaffId = null;
        conversation.AssignedStaffName = null;
        conversation.GrantId = activeGrant.Id;
        conversation.GrantWindowEndUtc = activeGrant.WindowEndUtc;
        conversation.Version++;

        // Calculate SLA (PHT UTC+8)
        var phtTime = now.AddHours(8);
        var phtHour = phtTime.Hour;
        var phtDay = phtTime.DayOfWeek;
        var isOffHours = phtHour < 8 || phtHour >= 17 || phtDay == DayOfWeek.Saturday || phtDay == DayOfWeek.Sunday;

        if (isOffHours)
        {
            var nextDay = phtTime.Date;
            do
            {
                nextDay = nextDay.AddDays(1);
            } while (nextDay.DayOfWeek == DayOfWeek.Saturday || nextDay.DayOfWeek == DayOfWeek.Sunday);

            conversation.IsOffHoursSubmission = true;
            conversation.TriageDueAtUtc = nextDay.AddHours(10).AddHours(-8);
        }
        else
        {
            conversation.IsOffHoursSubmission = false;
            conversation.TriageDueAtUtc = now.AddHours(2);
        }

        // 5. Add Reopen Notification Message
        conversation.LastSeq++;
        conversation.MessageCount++;
        var reopenMsg = new Message
        {
            Id = Guid.NewGuid(),
            ConversationId = conversation.Id,
            TenantId = conversation.TenantId,
            FacilityId = conversation.FacilityId,
            Seq = conversation.LastSeq,
            SenderType = "Patient",
            SenderId = request.PatientId.ToString(),
            SenderDisplayName = "Patient",
            ContentText = $"Inquiry reopened by patient: {request.Reason.Trim()}",
            Visibility = MessageVisibility.Public,
            State = DeliveryState.Received,
            ClientSentAtUtc = now,
            ServerReceivedAtUtc = now,
            RetentionDeadlineUtc = now.AddYears(10)
        };
        conversation.Messages.Add(reopenMsg);
        _db.Messages.Add(reopenMsg);
        conversation.LastMessageAtUtc = now;
        conversation.LastMessageSnippet = reopenMsg.ContentText;

        // 6. Outbox Notification: Thread State Changed
        if (_publisher != null)
        {
            var from = Party.ForFacility(conversation.TenantId, conversation.FacilityId, FacilityType.Clinic, service: InteropServices.Comms);
            var toFacility = Party.ForFacility(conversation.TenantId, conversation.FacilityId, FacilityType.Clinic);

            var stateChangedPayload = new CommsThreadStateChangedPayload(
                ConversationId: conversation.Id,
                TenantId: conversation.TenantId,
                FacilityId: conversation.FacilityId,
                NewStatus: conversation.Status,
                Disposition: null,
                DeclineReasonCode: null,
                AssignedStaffId: conversation.AssignedStaffId,
                AssignedStaffName: conversation.AssignedStaffName,
                Version: conversation.Version,
                ChangedAtUtc: now);

            _publisher.Enqueue(
                InteropTypes.CommsThreadStateChanged,
                from,
                toFacility,
                correlationId: conversation.Id,
                stateChangedPayload);
        }

        await _db.SaveChangesAsync(ct);

        var dto = new ConversationDto(
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

        return dto;
    }
}
