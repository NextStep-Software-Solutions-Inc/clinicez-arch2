using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Application.Models;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Comms.Domain.Enums;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop.Contracts;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Comms.Application.Features.Triage.Commands;

public sealed record SubmitPatientRequestCommand(
    string TenantId,
    string FacilityId,
    string FacilityType,
    Guid PatientId,
    Guid? SubmittingAccountId,
    string? Relationship,
    MessageCategory Category,
    string ContentText,
    bool? IsEmergencyConfirmed,
    IReadOnlyList<CommsAttachmentReference>? Attachments = null,
    DateTime? SubmittedAtUtc = null) : IRequest<SubmitPatientRequestResult>;

public sealed record SubmitPatientRequestResult(
    bool IsEmergencyRedirect,
    string? RedirectMessage,
    ConversationDto? Conversation);

public sealed class SubmitPatientRequestCommandHandler : IRequestHandler<SubmitPatientRequestCommand, SubmitPatientRequestResult>
{
    private readonly ICommsDbContext _db;
    private readonly ICommsRealtimeNotifier _notifier;

    public SubmitPatientRequestCommandHandler(ICommsDbContext db, ICommsRealtimeNotifier notifier)
    {
        _db = db;
        _notifier = notifier;
    }

    public async Task<SubmitPatientRequestResult> Handle(SubmitPatientRequestCommand request, CancellationToken ct)
    {
        var now = request.SubmittedAtUtc ?? DateTime.UtcNow;

        // 1. Mandatory Emergency Screening Gate
        if (!request.IsEmergencyConfirmed.HasValue)
        {
            throw new ValidationException("EMERGENCY_CONFIRMATION_REQUIRED: Patient must confirm or deny emergency symptoms prior to submitting an inquiry.");
        }

        if (request.IsEmergencyConfirmed.Value)
        {
            // EMERGENCY_REDIRECT: Zero messages or conversations stored. Immediate instruction to seek emergency care.
            return new SubmitPatientRequestResult(
                IsEmergencyRedirect: true,
                RedirectMessage: "EMERGENCY_REDIRECT: If you are experiencing a life-threatening medical emergency, please call 911 immediately or proceed to the nearest emergency department.",
                Conversation: null);
        }

        // 2. Live Eligibility Grant Verification
        var activeGrant = await _db.EligibilityGrants
            .Where(g => g.TenantId == request.TenantId
                     && g.FacilityId == request.FacilityId
                     && g.PatientId == request.PatientId
                     && g.IsActive
                     && g.WindowStartUtc <= now
                     && g.WindowEndUtc >= now)
            .OrderByDescending(g => g.WindowEndUtc)
            .FirstOrDefaultAsync(ct);

        if (activeGrant == null)
        {
            throw new ForbiddenException("INELIGIBLE: Patient does not have an active eligibility grant for this facility.");
        }

        // 3. 24-Hour Cooldown on Declined Inquiries
        var declineCutoff = now.AddHours(-24);
        var recentDeclineExists = await _db.Conversations
            .AnyAsync(c => c.TenantId == request.TenantId
                        && c.FacilityId == request.FacilityId
                        && c.PatientId == request.PatientId
                        && c.Category == request.Category
                        && c.Status == RequestStatus.Declined
                        && (c.ClosedAtUtc ?? c.CreatedAtUtc) >= declineCutoff, ct);

        if (recentDeclineExists)
        {
            throw new ValidationException("COOLDOWN_ACTIVE: Inquiries in this category were recently declined. A 24-hour cooldown is required before submitting a new inquiry.");
        }

        // 4. Volume Caps & Rate Limiting
        var openConversations = await _db.Conversations
            .Where(c => c.TenantId == request.TenantId
                     && c.PatientId == request.PatientId
                     && c.Status != RequestStatus.Closed
                     && c.Status != RequestStatus.Declined
                     && c.Status != RequestStatus.Resolved)
            .ToListAsync(ct);

        if (openConversations.Any(c => c.Category == request.Category))
        {
            throw new ValidationException("CAP_EXCEEDED: Only 1 active open inquiry is allowed per category.");
        }

        if (openConversations.Count(c => c.FacilityId == request.FacilityId) >= 2)
        {
            throw new ValidationException("CAP_EXCEEDED: Maximum 2 active open inquiries are allowed per facility.");
        }

        var oneHourCutoff = now.AddHours(-1);
        var submissionsLastHour = await _db.Conversations
            .CountAsync(c => c.TenantId == request.TenantId
                          && c.PatientId == request.PatientId
                          && c.CreatedAtUtc >= oneHourCutoff, ct);

        if (submissionsLastHour >= 5)
        {
            throw new ValidationException("RATE_LIMIT_EXCEEDED: Maximum 5 inquiry submissions per hour allowed.");
        }

        // 5. Off-Hours Detection & Triage SLA Calculation (PHT = UTC+8)
        var phtTime = now.AddHours(8);
        var phtHour = phtTime.Hour;
        var phtDay = phtTime.DayOfWeek;
        var isOffHours = phtHour < 8 || phtHour >= 17 || phtDay == DayOfWeek.Saturday || phtDay == DayOfWeek.Sunday;

        DateTime triageDueUtc;
        if (isOffHours)
        {
            var nextDay = phtTime.Date;
            do
            {
                nextDay = nextDay.AddDays(1);
            } while (nextDay.DayOfWeek == DayOfWeek.Saturday || nextDay.DayOfWeek == DayOfWeek.Sunday);

            var phtDue = nextDay.AddHours(10); // 10:00 AM PHT
            triageDueUtc = phtDue.AddHours(-8); // Back to UTC
        }
        else
        {
            triageDueUtc = now.AddHours(2); // Standard 2-hour SLA during operating hours
        }

        var conversation = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = request.TenantId,
            FacilityId = request.FacilityId,
            Scope = ConversationScope.PatientFacility,
            Kind = ConversationKind.PatientTriage,
            PatientId = request.PatientId,
            SubmittingAccountId = request.SubmittingAccountId,
            Relationship = request.Relationship,
            GrantId = activeGrant.Id,
            GrantWindowEndUtc = activeGrant.WindowEndUtc,
            ContextType = activeGrant.ContextType,
            ContextId = activeGrant.ContextId,
            Category = request.Category,
            Title = $"{request.Category} Inquiry",
            Status = RequestStatus.WithTriage,
            IsEmergencyConfirmed = false,
            IsOffHoursSubmission = isOffHours,
            TriageDueAtUtc = triageDueUtc,
            CreatedAtUtc = now,
            CreatedBy = request.PatientId.ToString(),
            HomeCellId = "cloud",
            MessageCount = 1,
            LastSeq = 1,
            LastMessageAtUtc = now,
            LastMessageSnippet = request.ContentText.Length > 250 ? request.ContentText[..250] + "..." : request.ContentText
        };

        var participant = new Participant
        {
            Id = Guid.NewGuid(),
            ConversationId = conversation.Id,
            TenantId = request.TenantId,
            ParticipantType = "Patient",
            ParticipantId = request.PatientId.ToString(),
            DisplayName = "Patient",
            Role = "Patient",
            JoinedAtUtc = now
        };
        conversation.Participants.Add(participant);

        var message = new Message
        {
            Id = Guid.NewGuid(),
            ConversationId = conversation.Id,
            TenantId = request.TenantId,
            FacilityId = request.FacilityId,
            Seq = 1,
            SenderType = "Patient",
            SenderId = request.PatientId.ToString(),
            SenderDisplayName = "Patient",
            ContentText = request.ContentText,
            Visibility = MessageVisibility.Public,
            State = DeliveryState.Received,
            ClientSentAtUtc = now,
            ServerReceivedAtUtc = now,
            RetentionDeadlineUtc = now.AddYears(10)
        };

        if (request.Attachments != null && request.Attachments.Count > 0)
        {
            foreach (var att in request.Attachments)
            {
                message.Attachments.Add(new MessageAttachment
                {
                    Id = Guid.NewGuid(),
                    TenantId = request.TenantId,
                    FacilityId = request.FacilityId,
                    MessageId = message.Id,
                    OriginalFileName = att.FileName,
                    SafeFileName = att.FileName,
                    ContentType = att.ContentType,
                    OriginalSizeBytes = att.SizeBytes,
                    SanitizedSizeBytes = att.SizeBytes,
                    StoragePath = att.FileKey,
                    SHA256Checksum = att.HashSha256 ?? string.Empty,
                    Status = AttachmentStatus.Clean,
                    CreatedAtUtc = now
                });
            }
        }

        conversation.Messages.Add(message);
        _db.Conversations.Add(conversation);
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

        await _notifier.NotifyConversationCreatedAsync(dto, ct);

        return new SubmitPatientRequestResult(
            IsEmergencyRedirect: false,
            RedirectMessage: null,
            Conversation: dto);
    }
}
