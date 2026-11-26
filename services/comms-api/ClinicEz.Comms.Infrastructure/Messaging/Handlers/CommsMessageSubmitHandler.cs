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
/// Ingests <c>comms.message.submit</c> envelopes from <c>patient-api</c>, enforces idempotency on
/// <see cref="CommsMessageSubmitPayload.ClientMessageId"/>, persists the message, sends a truthful
/// <c>comms.message.received</c> ACK, and notifies connected facility staff via SignalR.
/// </summary>
public sealed class CommsMessageSubmitHandler : IInteropHandler<CommsMessageSubmitPayload>
{
    private readonly CommsDbContext _db;
    private readonly ICommsRealtimeNotifier _notifier;
    private readonly IInteropPublisher _publisher;
    private readonly ILogger<CommsMessageSubmitHandler> _logger;
    private readonly ICommsStorageService? _storage;
    private readonly IAttachmentCryptoService? _crypto;

    public CommsMessageSubmitHandler(
        CommsDbContext db,
        ICommsRealtimeNotifier notifier,
        IInteropPublisher publisher,
        ILogger<CommsMessageSubmitHandler> logger,
        ICommsStorageService? storage = null,
        IAttachmentCryptoService? crypto = null)
    {
        _db = db;
        _notifier = notifier;
        _publisher = publisher;
        _logger = logger;
        _storage = storage;
        _crypto = crypto;
    }

    public async Task HandleAsync(CommsMessageSubmitPayload message, InteropMessageContext context, CancellationToken ct)
    {
        if (context.To.Kind != PartyKind.Facility)
        {
            _logger.LogWarning(
                "[CommsMessageSubmitHandler] Dropping {MessageId}: target {To} is not a Facility.",
                context.MessageId, context.To.Address);
            return;
        }

        var duplicate = await _db.Messages
            .IgnoreQueryFilters()
            .AnyAsync(m => m.ConversationId == message.ConversationId && m.ClientMessageId == message.ClientMessageId, ct);

        if (duplicate)
        {
            _logger.LogInformation(
                "[CommsMessageSubmitHandler] Message {ClientMessageId} already ingested for conversation {ConversationId}. Skipping.",
                message.ClientMessageId, message.ConversationId);
            return;
        }

        var conversation = await _db.Conversations
            .IgnoreQueryFilters()
            .Include(c => c.Participants)
            .FirstOrDefaultAsync(c => c.Id == message.ConversationId && c.TenantId == message.TenantId, ct);

        if (conversation == null)
        {
            _logger.LogWarning(
                "[CommsMessageSubmitHandler] Conversation {ConversationId} not found in tenant {TenantId}. Dropping {ClientMessageId}.",
                message.ConversationId, message.TenantId, message.ClientMessageId);
            return;
        }

        var isPatientSender = string.Equals(message.SenderType, "Patient", StringComparison.OrdinalIgnoreCase);
        if (conversation.ClosedAtUtc.HasValue || conversation.Status == RequestStatus.Closed || conversation.Status == RequestStatus.Declined)
        {
            _logger.LogWarning(
                "[CommsMessageSubmitHandler] Conversation {ConversationId} is closed/declined. Dropping {ClientMessageId}.",
                conversation.Id, message.ClientMessageId);
            return;
        }

        var now = DateTime.UtcNow;
        var sentAt = message.ClientSentAtUtc == default ? now : message.ClientSentAtUtc;
        var retention = message.RetentionDeadlineUtc == default ? now.AddDays(7) : message.RetentionDeadlineUtc;

        conversation.LastSeq++;
        conversation.MessageCount++;
        conversation.LastMessageAtUtc = now;
        conversation.LastMessageSnippet = message.ContentText.Length > 100
            ? message.ContentText[..100]
            : message.ContentText;

        var entity = new Message
        {
            Id = Guid.NewGuid(),
            ConversationId = conversation.Id,
            TenantId = conversation.TenantId,
            FacilityId = conversation.FacilityId,
            Seq = conversation.LastSeq,
            SenderType = isPatientSender ? "Patient" : message.SenderType,
            SenderId = message.SenderId?.ToString() ?? conversation.PatientId?.ToString(),
            SenderDisplayName = string.IsNullOrWhiteSpace(message.SenderDisplayName) ? "Patient" : message.SenderDisplayName,
            ContentText = message.ContentText,
            Visibility = isPatientSender ? MessageVisibility.Public : message.Visibility,
            State = DeliveryState.Received,
            RequiresAcknowledgement = message.RequiresAcknowledgement,
            ClientSentAtUtc = sentAt,
            ServerReceivedAtUtc = now,
            RetentionDeadlineUtc = retention,
            ClientMessageId = message.ClientMessageId
        };

        var attachmentRefs = new List<CommsAttachmentReference>();
        if (message.Attachments != null && message.Attachments.Count > 0)
        {
            foreach (var att in message.Attachments)
            {
                var attEntity = new MessageAttachment
                {
                    Id = Guid.NewGuid(),
                    TenantId = conversation.TenantId,
                    FacilityId = conversation.FacilityId,
                    MessageId = entity.Id,
                    OriginalFileName = att.FileName,
                    SafeFileName = att.FileName,
                    ContentType = att.ContentType,
                    OriginalSizeBytes = att.SizeBytes,
                    SanitizedSizeBytes = att.SizeBytes,
                    StoragePath = att.FileKey,
                    SHA256Checksum = att.HashSha256 ?? string.Empty,
                    Status = AttachmentStatus.Clean,
                    CreatedAtUtc = now
                };

                await CommsAttachmentTransferHelper.TryMaterializeFromStagedChunksAsync(
                    attEntity,
                    att.FileKey,
                    maxProbeChunks: 8,
                    _storage,
                    _crypto,
                    ct);

                entity.Attachments.Add(attEntity);
                attachmentRefs.Add(att with { FileKey = attEntity.StoragePath, AttachmentId = attEntity.Id });
            }
        }

        _db.Messages.Add(entity);

        if (conversation.PatientId is { } patientId && patientId != Guid.Empty)
        {
            var fType = CommsPatientReplicationHelper.ResolveFacilityType(null);
            var from = Party.ForFacility(conversation.TenantId, conversation.FacilityId, fType, service: InteropServices.Comms);
            var toPatient = Party.ForPatient(patientId.ToString());

            _publisher.Enqueue(
                InteropTypes.CommsMessageReceived,
                from,
                toPatient,
                correlationId: conversation.Id,
                new CommsMessageReceivedPayload(
                    MessageId: message.ClientMessageId,
                    ConversationId: conversation.Id,
                    RecipientPartyAddress: context.To.Address,
                    ReceivedAtUtc: now,
                    AssignedSeq: entity.Seq));
        }

        await _db.SaveChangesAsync(ct);

        var dto = new MessageDto(
            entity.Id,
            entity.ConversationId,
            entity.Seq,
            entity.ClientMessageId,
            entity.SenderType,
            entity.SenderId,
            entity.SenderDisplayName,
            entity.ContentText,
            entity.Visibility,
            entity.RequiresAcknowledgement,
            entity.IsAcknowledged,
            entity.AcknowledgedAtUtc,
            entity.AcknowledgedByAccountId,
            entity.AcknowledgedByName,
            attachmentRefs,
            entity.State,
            entity.ClientSentAtUtc,
            entity.RetentionDeadlineUtc);

        await _notifier.NotifyMessageReceivedAsync(conversation.Id, dto, ct);
        await _notifier.NotifyConversationUpdatedAsync(CommsAttachmentTransferHelper.MapConversationDto(conversation), ct);
    }
}
