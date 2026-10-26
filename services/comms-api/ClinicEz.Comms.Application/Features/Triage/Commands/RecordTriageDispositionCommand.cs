using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Application.Models;
using ClinicEz.Comms.Domain.Constants;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Comms.Domain.Enums;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Comms.Application.Features.Triage.Commands;

public sealed record RecordTriageDispositionCommand(
    Guid ConversationId,
    string TenantId,
    string StaffId,
    string StaffName,
    IReadOnlyList<string> StaffPermissions,
    TriageDisposition Disposition,
    string? DeclineReasonCode = null,
    string? AssignedStaffId = null,
    string? AssignedStaffName = null,
    string? Priority = null,
    string? InternalNote = null,
    string? PublicResponseText = null) : IRequest<ConversationDto>;

public sealed class RecordTriageDispositionCommandHandler : IRequestHandler<RecordTriageDispositionCommand, ConversationDto>
{
    private readonly ICommsDbContext _db;
    private readonly ICommsRealtimeNotifier _notifier;
    private readonly ITranscriptSerializer _transcriptSerializer;
    private readonly IInteropPublisher? _publisher;

    public RecordTriageDispositionCommandHandler(
        ICommsDbContext db,
        ICommsRealtimeNotifier notifier,
        ITranscriptSerializer transcriptSerializer,
        IInteropPublisher? publisher = null)
    {
        _db = db;
        _notifier = notifier;
        _transcriptSerializer = transcriptSerializer;
        _publisher = publisher;
    }

    public async Task<ConversationDto> Handle(RecordTriageDispositionCommand request, CancellationToken ct)
    {
        // 1. Mandatory Permissions Gate
        var hasPermission = request.StaffPermissions.Any(p =>
            string.Equals(p, "messaging:triage", StringComparison.OrdinalIgnoreCase)
            || string.Equals(p, "admin", StringComparison.OrdinalIgnoreCase)
            || string.Equals(p, "messaging:manage", StringComparison.OrdinalIgnoreCase));

        if (!hasPermission)
        {
            throw new ForbiddenException("Staff member does not have the 'messaging:triage' permission required to disposition inquiries.");
        }

        var conversation = await _db.Conversations
            .Include(c => c.Participants)
            .Include(c => c.Messages)
                .ThenInclude(m => m.Attachments)
            .FirstOrDefaultAsync(c => c.Id == request.ConversationId && c.TenantId == request.TenantId, ct)
            ?? throw new NotFoundException($"Conversation '{request.ConversationId}' not found.");

        if (conversation.Status != RequestStatus.WithTriage && conversation.Status != RequestStatus.Submitted)
        {
            throw new ValidationException($"Inquiry cannot be dispositioned because its status is '{conversation.Status}'.");
        }

        var now = DateTime.UtcNow;

        // 2. Validate Disposition Rules
        conversation.TriageDisposition = request.Disposition;
        conversation.TriagedAtUtc = now;
        conversation.TriagedByStaffId = request.StaffId;
        conversation.TriagedByStaffName = request.StaffName;
        conversation.Version++;

        if (conversation.TriageDueAtUtc.HasValue && now > conversation.TriageDueAtUtc.Value)
        {
            conversation.SlaBreached = true;
        }

        bool isClosing = false;

        switch (request.Disposition)
        {
            case TriageDisposition.Declined:
                if (string.IsNullOrWhiteSpace(request.DeclineReasonCode) || !DeclineReasonCodes.IsValid(request.DeclineReasonCode))
                {
                    throw new ValidationException($"A valid DeclineReasonCode is mandatory when declining an inquiry. Valid codes: {string.Join(", ", DeclineReasonCodes.All)}.");
                }
                conversation.DeclineReasonCode = request.DeclineReasonCode.Trim().ToUpperInvariant();
                conversation.Status = RequestStatus.Declined;
                conversation.ClosedAtUtc = now;
                conversation.ClosedBy = request.StaffName;
                isClosing = true;
                break;

            case TriageDisposition.Answered:
                if (string.IsNullOrWhiteSpace(request.PublicResponseText))
                {
                    throw new ValidationException("PublicResponseText is mandatory when dispositioning an inquiry as Answered.");
                }
                conversation.Status = RequestStatus.Answered;
                conversation.ClosedAtUtc = now;
                conversation.ClosedBy = request.StaffName;
                isClosing = true;
                break;

            case TriageDisposition.NeedsVisit:
                if (string.IsNullOrWhiteSpace(request.PublicResponseText))
                {
                    throw new ValidationException("Visit instructions (PublicResponseText) are mandatory when dispositioning an inquiry as NeedsVisit.");
                }
                conversation.Status = RequestStatus.NeedsVisit;
                conversation.ClosedAtUtc = now;
                conversation.ClosedBy = request.StaffName;
                isClosing = true;
                break;

            case TriageDisposition.Routed:
                if (string.IsNullOrWhiteSpace(request.AssignedStaffId))
                {
                    throw new ValidationException("AssignedStaffId is mandatory when routing an inquiry to clinical staff.");
                }

                var normalizedPriority = request.Priority?.Trim();
                if (!string.Equals(normalizedPriority, "Routine", StringComparison.OrdinalIgnoreCase)
                    && !string.Equals(normalizedPriority, "Urgent", StringComparison.OrdinalIgnoreCase))
                {
                    throw new ValidationException("Priority must be strictly 'Routine' or 'Urgent' when routing an inquiry.");
                }

                conversation.AssignedStaffId = request.AssignedStaffId;
                conversation.AssignedStaffName = request.AssignedStaffName ?? request.AssignedStaffId;
                conversation.Priority = string.Equals(normalizedPriority, "Urgent", StringComparison.OrdinalIgnoreCase) ? "Urgent" : "Routine";
                conversation.Status = RequestStatus.Routed;

                // Ensure assigned staff is added as a participant
                if (!conversation.Participants.Any(p => p.ParticipantId == request.AssignedStaffId))
                {
                    var staffParticipant = new Participant
                    {
                        Id = Guid.NewGuid(),
                        ConversationId = conversation.Id,
                        TenantId = conversation.TenantId,
                        ParticipantType = "Staff",
                        ParticipantId = request.AssignedStaffId,
                        DisplayName = request.AssignedStaffName ?? "Assigned Staff",
                        Role = "Staff",
                        JoinedAtUtc = now
                    };
                    conversation.Participants.Add(staffParticipant);
                    _db.Participants.Add(staffParticipant);
                }
                break;

            default:
                throw new ValidationException($"Unsupported triage disposition '{request.Disposition}'.");
        }

        // 3. Append Internal Staff Note if provided (STRICTLY MessageVisibility.Internal)
        if (!string.IsNullOrWhiteSpace(request.InternalNote))
        {
            conversation.LastSeq++;
            conversation.MessageCount++;
            var internalMsg = new Message
            {
                Id = Guid.NewGuid(),
                ConversationId = conversation.Id,
                TenantId = conversation.TenantId,
                FacilityId = conversation.FacilityId,
                Seq = conversation.LastSeq,
                SenderType = "Staff",
                SenderId = request.StaffId,
                SenderDisplayName = request.StaffName,
                ContentText = request.InternalNote.Trim(),
                Visibility = MessageVisibility.Internal, // NEVER EXPORTED TO PATIENT OR EXTERNAL CHARTS
                State = DeliveryState.Received,
                ClientSentAtUtc = now,
                ServerReceivedAtUtc = now,
                RetentionDeadlineUtc = now.AddYears(10)
            };
            conversation.Messages.Add(internalMsg);
            _db.Messages.Add(internalMsg);
        }

        // 4. Append Public Response if provided
        if (!string.IsNullOrWhiteSpace(request.PublicResponseText))
        {
            conversation.LastSeq++;
            conversation.MessageCount++;
            var publicMsg = new Message
            {
                Id = Guid.NewGuid(),
                ConversationId = conversation.Id,
                TenantId = conversation.TenantId,
                FacilityId = conversation.FacilityId,
                Seq = conversation.LastSeq,
                SenderType = "Staff",
                SenderId = request.StaffId,
                SenderDisplayName = request.StaffName,
                ContentText = request.PublicResponseText.Trim(),
                Visibility = MessageVisibility.Public,
                State = DeliveryState.Received,
                ClientSentAtUtc = now,
                ServerReceivedAtUtc = now,
                RetentionDeadlineUtc = now.AddYears(10)
            };
            conversation.Messages.Add(publicMsg);
            _db.Messages.Add(publicMsg);
            conversation.LastMessageAtUtc = now;
            conversation.LastMessageSnippet = publicMsg.ContentText.Length > 250 ? publicMsg.ContentText[..250] + "..." : publicMsg.ContentText;
        }

        // 5. Outbox Publishing: Thread State Changed
        if (_publisher != null)
        {
            var from = Party.ForFacility(conversation.TenantId, conversation.FacilityId, FacilityType.Clinic, service: InteropServices.Comms);
            var toFacility = Party.ForFacility(conversation.TenantId, conversation.FacilityId, FacilityType.Clinic);

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

            // 6. If conversation is closed, serialize transcript (public only) and archive to chart
            if (isClosing)
            {
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
                    ClosedAtUtc: conversation.ClosedAtUtc ?? now,
                    ClosedByStaffId: request.StaffId,
                    ClosedByStaffName: request.StaffName,
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
            }
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
