using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Application.Models;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Comms.Domain.Enums;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Comms.Application.Features.Conversations.Commands;

public sealed record CloseConversationCommand(
    Guid ConversationId,
    string TenantId,
    string ClosedByStaffId,
    string ClosedByStaffName,
    string? Notes = null) : IRequest<ConversationDto>;

public sealed class CloseConversationCommandHandler : IRequestHandler<CloseConversationCommand, ConversationDto>
{
    private readonly ICommsDbContext _db;
    private readonly ITranscriptSerializer _transcriptSerializer;
    private readonly ICommsRealtimeNotifier _notifier;
    private readonly IInteropPublisher? _publisher;

    public CloseConversationCommandHandler(
        ICommsDbContext db,
        ITranscriptSerializer transcriptSerializer,
        ICommsRealtimeNotifier notifier,
        IInteropPublisher? publisher = null)
    {
        _db = db;
        _transcriptSerializer = transcriptSerializer;
        _notifier = notifier;
        _publisher = publisher;
    }

    public async Task<ConversationDto> Handle(CloseConversationCommand request, CancellationToken ct)
    {
        var conversation = await _db.Conversations
            .Include(c => c.Participants)
            .Include(c => c.Messages)
                .ThenInclude(m => m.Attachments)
            .FirstOrDefaultAsync(c => c.Id == request.ConversationId && c.TenantId == request.TenantId, ct)
            ?? throw new NotFoundException($"Conversation '{request.ConversationId}' not found.");

        if (conversation.ClosedAtUtc.HasValue || conversation.Status == RequestStatus.Closed)
        {
            throw new ValidationException("Conversation is already closed.");
        }

        var now = DateTime.UtcNow;
        conversation.Status = RequestStatus.Closed;
        conversation.ClosedAtUtc = now;
        conversation.ClosedBy = request.ClosedByStaffName;
        conversation.Version++;

        if (!string.IsNullOrWhiteSpace(request.Notes))
        {
            conversation.LastSeq++;
            conversation.MessageCount++;
            var closingNote = new Message
            {
                Id = Guid.NewGuid(),
                ConversationId = conversation.Id,
                TenantId = conversation.TenantId,
                FacilityId = conversation.FacilityId,
                Seq = conversation.LastSeq,
                SenderType = "Staff",
                SenderId = request.ClosedByStaffId,
                SenderDisplayName = request.ClosedByStaffName,
                ContentText = request.Notes.Trim(),
                Visibility = MessageVisibility.Internal, // STRICTLY INTERNAL NOTE - NEVER EXPORTED
                State = DeliveryState.Received,
                ClientSentAtUtc = now,
                ServerReceivedAtUtc = now,
                RetentionDeadlineUtc = now.AddYears(10)
            };
            conversation.Messages.Add(closingNote);
        }

        if (_publisher != null)
        {
            var from = Party.ForFacility(conversation.TenantId, conversation.FacilityId, FacilityType.Clinic, service: InteropServices.Comms);
            var toFacility = Party.ForFacility(conversation.TenantId, conversation.FacilityId, FacilityType.Clinic);

            var serialized = _transcriptSerializer.Serialize(
                conversation,
                conversation.Participants.ToList(),
                conversation.Messages.ToList());

            var allCleanAttachments = conversation.Messages
                .SelectMany(m => m.Attachments)
                .Where(a => a.Status == AttachmentStatus.Clean)
                .Select(a => new CommsAttachmentReference(
                    a.StoragePath,
                    a.SafeFileName,
                    a.ContentType,
                    a.SanitizedSizeBytes > 0 ? a.SanitizedSizeBytes : a.OriginalSizeBytes,
                    a.SHA256Checksum))
                .ToList();

            var publicMessageCount = conversation.Messages.Count(m => m.Visibility == MessageVisibility.Public);

            var transcriptPayload = new CommsTranscriptArchivedPayload(
                ConversationId: conversation.Id,
                TenantId: conversation.TenantId,
                FacilityId: conversation.FacilityId,
                FacilityType: "Clinic",
                PatientId: conversation.PatientId ?? Guid.Empty,
                ContextType: conversation.ContextType,
                ContextId: conversation.ContextId,
                Category: conversation.Category,
                Title: conversation.Title,
                OpenedAtUtc: conversation.CreatedAtUtc,
                ClosedAtUtc: now,
                ClosedByStaffId: request.ClosedByStaffId,
                ClosedByStaffName: request.ClosedByStaffName,
                TriageDisposition: conversation.TriageDisposition,
                DeclineReasonCode: conversation.DeclineReasonCode,
                TotalMessageCount: conversation.Messages.Count,
                PublicMessageCount: publicMessageCount,
                TranscriptJson: serialized.Json,
                TranscriptMarkdown: serialized.Markdown,
                TranscriptSha256: serialized.Sha256,
                Attachments: allCleanAttachments,
                Version: conversation.Version,
                ArchivedAtUtc: now);

            _publisher.Enqueue(
                InteropTypes.CommsTranscriptArchived,
                from,
                toFacility,
                correlationId: conversation.Id,
                transcriptPayload);

            var stateChangedPayload = new CommsThreadStateChangedPayload(
                ConversationId: conversation.Id,
                TenantId: conversation.TenantId,
                FacilityId: conversation.FacilityId,
                NewStatus: conversation.Status,
                Disposition: conversation.TriageDisposition,
                DeclineReasonCode: conversation.DeclineReasonCode,
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
