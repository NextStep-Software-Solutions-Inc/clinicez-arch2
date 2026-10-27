using System;
using System.Collections.Generic;
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

namespace ClinicEz.Comms.Application.Features.Messages.Commands;

public sealed record SendMessageCommand(
    Guid ConversationId,
    string TenantId,
    string FacilityId,
    string SenderType,
    string? SenderId,
    string SenderDisplayName,
    string ContentText,
    MessageVisibility Visibility,
    bool RequiresAcknowledgement,
    IReadOnlyList<CommsAttachmentReference>? Attachments = null,
    Guid? ClientMessageId = null) : IRequest<MessageDto>;

public sealed class SendMessageCommandHandler : IRequestHandler<SendMessageCommand, MessageDto>
{
    private readonly ICommsDbContext _db;
    private readonly ICommsRealtimeNotifier _notifier;
    private readonly IInteropPublisher? _publisher;

    public SendMessageCommandHandler(
        ICommsDbContext db,
        ICommsRealtimeNotifier notifier,
        IInteropPublisher? publisher = null)
    {
        _db = db;
        _notifier = notifier;
        _publisher = publisher;
    }

    public async Task<MessageDto> Handle(SendMessageCommand request, CancellationToken ct)
    {
        var conversation = await _db.Conversations
            .Include(c => c.Participants)
            .FirstOrDefaultAsync(c => c.Id == request.ConversationId && c.TenantId == request.TenantId, ct)
            ?? throw new NotFoundException($"Conversation '{request.ConversationId}' not found.");

        if (conversation.ClosedAtUtc.HasValue)
        {
            throw new ValidationException("Conversation thread is closed. New messages cannot be sent.");
        }

        if (string.Equals(request.SenderType, "Patient", StringComparison.OrdinalIgnoreCase) && conversation.Status == RequestStatus.WithTriage)
        {
            throw new ValidationException("Inquiry is currently with triage. Patient messages are blocked until disposition or routing.");
        }

        // Idempotency check: if client supplied ClientMessageId and it exists in DB, return it
        if (request.ClientMessageId.HasValue)
        {
            var existing = await _db.Messages
                .Include(m => m.Attachments)
                .FirstOrDefaultAsync(m => m.ConversationId == conversation.Id && m.ClientMessageId == request.ClientMessageId.Value, ct);

            if (existing != null)
            {
                var existingRefs = existing.Attachments
                    .Select(a => new CommsAttachmentReference(a.StoragePath, a.SafeFileName, a.ContentType, a.SanitizedSizeBytes, a.SHA256Checksum))
                    .ToList();

                return new MessageDto(
                    existing.Id,
                    existing.ConversationId,
                    existing.Seq,
                    existing.ClientMessageId,
                    existing.SenderType,
                    existing.SenderId,
                    existing.SenderDisplayName,
                    existing.ContentText,
                    existing.Visibility,
                    existing.RequiresAcknowledgement,
                    existing.IsAcknowledged,
                    existing.AcknowledgedAtUtc,
                    existing.AcknowledgedByAccountId,
                    existing.AcknowledgedByName,
                    existingRefs,
                    existing.State,
                    existing.ClientSentAtUtc,
                    existing.RetentionDeadlineUtc);
            }
        }

        // Single writer monotonic sequence
        conversation.LastSeq++;
        var seq = conversation.LastSeq;
        var now = DateTime.UtcNow;
        var retentionDeadline = now.AddDays(7);

        var message = new Message
        {
            Id = Guid.NewGuid(),
            ConversationId = conversation.Id,
            TenantId = request.TenantId,
            FacilityId = request.FacilityId,
            Seq = seq,
            SenderType = request.SenderType,
            SenderId = request.SenderId,
            SenderDisplayName = request.SenderDisplayName,
            ContentText = request.ContentText,
            Visibility = request.Visibility,
            State = DeliveryState.Waiting,
            RequiresAcknowledgement = request.RequiresAcknowledgement,
            ClientSentAtUtc = now,
            ServerReceivedAtUtc = now,
            RetentionDeadlineUtc = retentionDeadline,
            ClientMessageId = request.ClientMessageId
        };

        // Attach attachments if any
        var attachmentRefs = new List<CommsAttachmentReference>();
        if (request.Attachments != null && request.Attachments.Count > 0)
        {
            foreach (var attRef in request.Attachments)
            {
                attachmentRefs.Add(attRef);
                var attEntity = await _db.MessageAttachments
                    .FirstOrDefaultAsync(a => a.StoragePath == attRef.FileKey || a.Id.ToString() == attRef.FileKey, ct);
                if (attEntity != null)
                {
                    attEntity.MessageId = message.Id;
                }
            }
        }

        _db.Messages.Add(message);

        // Update conversation summary
        conversation.LastMessageAtUtc = now;
        conversation.LastMessageSnippet = request.ContentText.Length > 100 ? request.ContentText[..100] : request.ContentText;
        conversation.MessageCount++;

        // Transactional outbox replication if not site-local and publisher is present
        if (!conversation.IsLocalOnly && _publisher != null)
        {
            var replicatePayload = new CommsMessageReplicatePayload(
                message.Id,
                message.ConversationId,
                message.Seq,
                message.TenantId,
                message.FacilityId,
                message.SenderType,
                message.SenderId != null && Guid.TryParse(message.SenderId, out var pSenderGuid) ? pSenderGuid : null,
                message.SenderDisplayName,
                message.ContentText,
                message.Visibility,
                message.RequiresAcknowledgement,
                attachmentRefs,
                message.ClientSentAtUtc,
                message.RetentionDeadlineUtc,
                message.State);

            var fromParty = Party.ForFacility(request.TenantId, request.FacilityId, FacilityType.Clinic);
            var toParty = Party.ForFacility(request.TenantId, request.FacilityId, FacilityType.Clinic);

            _publisher.Enqueue(
                type: InteropTypes.CommsMessageReplicate,
                from: fromParty,
                to: toParty,
                correlationId: message.ConversationId,
                payload: replicatePayload,
                schemaVersion: 1,
                ttl: TimeSpan.FromDays(7));
        }

        await _db.SaveChangesAsync(ct);

        var dto = new MessageDto(
            message.Id,
            message.ConversationId,
            message.Seq,
            message.ClientMessageId,
            message.SenderType,
            message.SenderId,
            message.SenderDisplayName,
            message.ContentText,
            message.Visibility,
            message.RequiresAcknowledgement,
            message.IsAcknowledged,
            message.AcknowledgedAtUtc,
            message.AcknowledgedByAccountId,
            message.AcknowledgedByName,
            attachmentRefs,
            message.State,
            message.ClientSentAtUtc,
            message.RetentionDeadlineUtc);

        // Realtime notification broadcast
        await _notifier.NotifyMessageReceivedAsync(conversation.Id, dto, ct);

        return dto;
    }
}
