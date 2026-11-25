using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Helpers;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Application.Models;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Comms.Domain.Enums;
using ClinicEz.Comms.Infrastructure.Persistence;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Comms.Infrastructure.Messaging.Handlers;

/// <summary>
/// Ingests <c>comms.request.submit</c> envelopes from <c>patient-api</c>, validates active eligibility grants
/// and triage rate limits, persists the <see cref="Conversation"/> with <c>Id = message.RequestId</c>,
/// broadcasts to facility triage staff, and returns truthful receipt/state feedback to the patient mailbox.
/// </summary>
public sealed class CommsRequestSubmitHandler : IInteropHandler<CommsRequestSubmitPayload>
{
    private readonly CommsDbContext _db;
    private readonly ICommsRealtimeNotifier _notifier;
    private readonly IInteropPublisher _publisher;
    private readonly ILogger<CommsRequestSubmitHandler> _logger;

    public CommsRequestSubmitHandler(
        CommsDbContext db,
        ICommsRealtimeNotifier notifier,
        IInteropPublisher publisher,
        ILogger<CommsRequestSubmitHandler> logger)
    {
        _db = db;
        _notifier = notifier;
        _publisher = publisher;
        _logger = logger;
    }

    public async Task HandleAsync(CommsRequestSubmitPayload message, InteropMessageContext context, CancellationToken ct)
    {
        if (context.From.Kind != PartyKind.Patient || context.To.Kind != PartyKind.Facility)
        {
            _logger.LogWarning(
                "[CommsRequestSubmitHandler] Dropping {MessageId}: unexpected sender {From} or target {To}.",
                context.MessageId, context.From.Address, context.To.Address);
            return;
        }

        if (message.PatientId == Guid.Empty || message.RequestId == Guid.Empty || message.IsEmergencyConfirmed)
        {
            _logger.LogWarning(
                "[CommsRequestSubmitHandler] Dropping {MessageId}: invalid RequestId/PatientId or emergency redirect flag.",
                context.MessageId);
            return;
        }

        var alreadyExists = await _db.Conversations
            .IgnoreQueryFilters()
            .AnyAsync(c => c.Id == message.RequestId, ct);

        if (alreadyExists)
        {
            _logger.LogInformation(
                "[CommsRequestSubmitHandler] Request {RequestId} already ingested. Skipping.",
                message.RequestId);
            return;
        }

        var now = message.SubmittedAtUtc == default ? DateTime.UtcNow : message.SubmittedAtUtc;

        var activeGrant = await _db.EligibilityGrants
            .IgnoreQueryFilters()
            .Where(g => g.TenantId == message.TenantId
                     && g.FacilityId == message.FacilityId
                     && g.PatientId == message.PatientId
                     && g.IsActive
                     && g.WindowStartUtc <= now
                     && g.WindowEndUtc >= now)
            .OrderByDescending(g => g.WindowEndUtc)
            .FirstOrDefaultAsync(ct);

        if (activeGrant == null)
        {
            _logger.LogWarning(
                "[CommsRequestSubmitHandler] No active EligibilityGrant for Patient {PatientId} at {TenantId}/{FacilityId}. Declining request {RequestId}.",
                message.PatientId, message.TenantId, message.FacilityId, message.RequestId);
            await PublishRejectionStateAsync(message, "DECLINE-02", now, ct);
            return;
        }

        var declineCutoff = now.AddHours(-24);
        var recentDeclineExists = await _db.Conversations
            .IgnoreQueryFilters()
            .AnyAsync(c => c.TenantId == message.TenantId
                        && c.FacilityId == message.FacilityId
                        && c.PatientId == message.PatientId
                        && c.Category == message.Category
                        && c.Status == RequestStatus.Declined
                        && (c.ClosedAtUtc ?? c.CreatedAtUtc) >= declineCutoff, ct);

        if (recentDeclineExists)
        {
            _logger.LogWarning(
                "[CommsRequestSubmitHandler] 24h decline cooldown active for Patient {PatientId} category {Category}. Declining {RequestId}.",
                message.PatientId, message.Category, message.RequestId);
            await PublishRejectionStateAsync(message, "DECLINE-02", now, ct);
            return;
        }

        var openConversations = await _db.Conversations
            .IgnoreQueryFilters()
            .Where(c => c.TenantId == message.TenantId
                     && c.PatientId == message.PatientId
                     && c.Status != RequestStatus.Closed
                     && c.Status != RequestStatus.Declined
                     && c.Status != RequestStatus.Resolved)
            .Select(c => new { c.Category, c.FacilityId })
            .ToListAsync(ct);

        if (openConversations.Any(c => c.Category == message.Category) ||
            openConversations.Count(c => c.FacilityId == message.FacilityId) >= 2)
        {
            _logger.LogWarning(
                "[CommsRequestSubmitHandler] Open inquiry cap exceeded for Patient {PatientId}. Declining {RequestId}.",
                message.PatientId, message.RequestId);
            await PublishRejectionStateAsync(message, "DECLINE-02", now, ct);
            return;
        }

        var oneHourCutoff = now.AddHours(-1);
        var submissionsLastHour = await _db.Conversations
            .IgnoreQueryFilters()
            .CountAsync(c => c.TenantId == message.TenantId
                          && c.PatientId == message.PatientId
                          && c.CreatedAtUtc >= oneHourCutoff, ct);

        if (submissionsLastHour >= 5)
        {
            _logger.LogWarning(
                "[CommsRequestSubmitHandler] Hourly rate limit exceeded for Patient {PatientId}. Declining {RequestId}.",
                message.PatientId, message.RequestId);
            await PublishRejectionStateAsync(message, "DECLINE-02", now, ct);
            return;
        }

        var (isOffHours, triageDueUtc) = ComputeTriageSla(now);

        var resolvedPatientDisplayName = CommsInquiryDisplayHelper.ResolvePatientDisplayName(message.PatientDisplayName);
        var resolvedTitle = CommsInquiryDisplayHelper.ResolveInitialConversationTitle(message.PatientDisplayName, message.Category);

        var conversation = new Conversation
        {
            Id = message.RequestId,
            TenantId = message.TenantId,
            FacilityId = message.FacilityId,
            Scope = ConversationScope.PatientFacility,
            Kind = ConversationKind.PatientTriage,
            PatientId = message.PatientId,
            SubmittingAccountId = message.SubmittingAccountId,
            Relationship = message.Relationship,
            GrantId = activeGrant.Id,
            GrantWindowEndUtc = activeGrant.WindowEndUtc,
            ContextType = activeGrant.ContextType,
            ContextId = activeGrant.ContextId,
            Category = message.Category,
            Title = resolvedTitle,
            Status = RequestStatus.WithTriage,
            IsEmergencyConfirmed = false,
            IsOffHoursSubmission = isOffHours,
            TriageDueAtUtc = triageDueUtc,
            CreatedAtUtc = now,
            CreatedBy = message.PatientId.ToString(),
            HomeCellId = "cloud",
            MessageCount = 1,
            LastSeq = 1,
            LastMessageAtUtc = now,
            LastMessageSnippet = message.ContentText.Length > 250 ? message.ContentText[..250] + "..." : message.ContentText,
            Version = 2
        };

        var participant = new Participant
        {
            Id = Guid.NewGuid(),
            ConversationId = conversation.Id,
            TenantId = message.TenantId,
            ParticipantType = "Patient",
            ParticipantId = message.PatientId.ToString(),
            DisplayName = resolvedPatientDisplayName,
            Role = "Patient",
            JoinedAtUtc = now
        };
        conversation.Participants.Add(participant);

        var initialMessage = new Message
        {
            Id = message.RequestId,
            ConversationId = conversation.Id,
            TenantId = message.TenantId,
            FacilityId = message.FacilityId,
            Seq = 1,
            SenderType = "Patient",
            SenderId = message.PatientId.ToString(),
            SenderDisplayName = resolvedPatientDisplayName,
            ContentText = message.ContentText,
            Visibility = MessageVisibility.Public,
            State = DeliveryState.Received,
            ClientSentAtUtc = now,
            ServerReceivedAtUtc = now,
            RetentionDeadlineUtc = now.AddYears(10),
            ClientMessageId = message.RequestId
        };

        if (message.Attachments != null && message.Attachments.Count > 0)
        {
            foreach (var att in message.Attachments)
            {
                initialMessage.Attachments.Add(new MessageAttachment
                {
                    Id = Guid.NewGuid(),
                    TenantId = message.TenantId,
                    FacilityId = message.FacilityId,
                    MessageId = initialMessage.Id,
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

        conversation.Messages.Add(initialMessage);
        _db.Conversations.Add(conversation);

        var fType = CommsPatientReplicationHelper.ResolveFacilityType(message.FacilityType);
        var from = Party.ForFacility(message.TenantId, message.FacilityId, fType, service: InteropServices.Comms);
        var toPatient = Party.ForPatient(message.PatientId.ToString());

        _publisher.Enqueue(
            InteropTypes.CommsMessageReceived,
            from,
            toPatient,
            correlationId: conversation.Id,
            new CommsMessageReceivedPayload(
                MessageId: initialMessage.Id,
                ConversationId: conversation.Id,
                RecipientPartyAddress: context.To.Address,
                ReceivedAtUtc: now));

        _publisher.Enqueue(
            InteropTypes.CommsThreadStateChanged,
            from,
            toPatient,
            correlationId: conversation.Id,
            new CommsThreadStateChangedPayload(
                ConversationId: conversation.Id,
                TenantId: conversation.TenantId,
                FacilityId: conversation.FacilityId,
                NewStatus: conversation.Status,
                Disposition: conversation.TriageDisposition,
                DeclineReasonCode: conversation.DeclineReasonCode,
                AssignedStaffId: conversation.AssignedStaffId,
                AssignedStaffName: conversation.AssignedStaffName,
                Version: conversation.Version,
                ChangedAtUtc: now));

        await _db.SaveChangesAsync(ct);

        var dto = MapConversationDto(conversation);
        await _notifier.NotifyConversationCreatedAsync(dto, ct);

        _logger.LogInformation(
            "[CommsRequestSubmitHandler] Created triage conversation {ConversationId} for Patient {PatientId} at {TenantId}/{FacilityId}.",
            conversation.Id, message.PatientId, message.TenantId, message.FacilityId);
    }

    private async Task PublishRejectionStateAsync(
        CommsRequestSubmitPayload message,
        string declineReasonCode,
        DateTime now,
        CancellationToken ct)
    {
        var fType = CommsPatientReplicationHelper.ResolveFacilityType(message.FacilityType);
        var from = Party.ForFacility(message.TenantId, message.FacilityId, fType, service: InteropServices.Comms);
        var toPatient = Party.ForPatient(message.PatientId.ToString());

        _publisher.Enqueue(
            InteropTypes.CommsThreadStateChanged,
            from,
            toPatient,
            correlationId: message.RequestId,
            new CommsThreadStateChangedPayload(
                ConversationId: message.RequestId,
                TenantId: message.TenantId,
                FacilityId: message.FacilityId,
                NewStatus: RequestStatus.Declined,
                Disposition: TriageDisposition.Declined,
                DeclineReasonCode: declineReasonCode,
                AssignedStaffId: null,
                AssignedStaffName: null,
                Version: 2,
                ChangedAtUtc: now));

        await _db.SaveChangesAsync(ct);
    }

    private static (bool IsOffHours, DateTime TriageDueUtc) ComputeTriageSla(DateTime nowUtc)
    {
        var phtTime = nowUtc.AddHours(8);
        var phtHour = phtTime.Hour;
        var phtDay = phtTime.DayOfWeek;
        var isOffHours = phtHour < 8 || phtHour >= 17 || phtDay is DayOfWeek.Saturday or DayOfWeek.Sunday;

        if (!isOffHours)
        {
            return (false, nowUtc.AddHours(2));
        }

        var nextDay = phtTime.Date;
        do
        {
            nextDay = nextDay.AddDays(1);
        } while (nextDay.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday);

        return (true, nextDay.AddHours(10).AddHours(-8));
    }

    private static ConversationDto MapConversationDto(Conversation c) => new(
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
