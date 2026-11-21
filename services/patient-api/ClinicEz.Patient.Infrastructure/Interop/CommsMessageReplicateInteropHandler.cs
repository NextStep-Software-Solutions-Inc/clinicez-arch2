using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Patient.Infrastructure.Interop;

/// <summary>
/// Handles <c>comms.message.replicate</c>: replicates public messages from facility home comms
/// into the patient's personal unified inbox replica.
/// CRITICAL SECURITY INVARIANT: Strictly drops any message with Visibility == MessageVisibility.Internal.
/// Internal notes and staff reactions are NEVER stored or pushed to patients!
/// Confirms receipt by publishing <c>comms.message.received</c> back to sender facility.
/// </summary>
public sealed class CommsMessageReplicateInteropHandler : IInteropHandler<CommsMessageReplicatePayload>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly IInteropPublisher _publisher;
    private readonly IDeviceSessionRepository _deviceSessionRepository;
    private readonly IPushNotificationService _pushNotificationService;
    private readonly ISyncNotificationService _syncNotificationService;
    private readonly ILogger<CommsMessageReplicateInteropHandler> _logger;

    public CommsMessageReplicateInteropHandler(
        ApplicationDbContext dbContext,
        IInteropPublisher publisher,
        IDeviceSessionRepository deviceSessionRepository,
        IPushNotificationService pushNotificationService,
        ISyncNotificationService syncNotificationService,
        ILogger<CommsMessageReplicateInteropHandler> logger)
    {
        _dbContext = dbContext;
        _publisher = publisher;
        _deviceSessionRepository = deviceSessionRepository;
        _pushNotificationService = pushNotificationService;
        _syncNotificationService = syncNotificationService;
        _logger = logger;
    }

    public async Task HandleAsync(CommsMessageReplicatePayload message, InteropMessageContext context, CancellationToken ct)
    {
        // 1. Envelope authorization check: recipient must be a Patient
        if (context.To.Kind != PartyKind.Patient || string.IsNullOrWhiteSpace(context.To.PatientId))
        {
            _logger.LogWarning("Ignoring comms.message.replicate {MessageId}: recipient is not a Patient.", message.MessageId);
            return;
        }

        if (!Guid.TryParse(context.To.PatientId, out var targetPatientId))
        {
            _logger.LogWarning("Ignoring comms.message.replicate {MessageId}: invalid patient GUID '{RecipientId}'.",
                message.MessageId, context.To.PatientId);
            return;
        }

        // 2. CRITICAL SECURITY INVARIANT: Strictly drop internal notes and staff reactions!
        if (message.Visibility == MessageVisibility.Internal)
        {
            _logger.LogWarning("Security invariant: Dropping internal message {MessageId} destined for patient {PatientId}.",
                message.MessageId, targetPatientId);
            return; // Never store, never acknowledge, never push!
        }

        // 3. Find or create stub conversation replica
        var conversation = await _dbContext.PatientConversations
            .Include(c => c.Messages)
            .FirstOrDefaultAsync(c => c.Id == message.ConversationId, ct);

        if (conversation == null)
        {
            var facilityName = "Facility";
            if (Guid.TryParse(message.FacilityId, out var fId))
            {
                var clinic = await _dbContext.Clinics.FirstOrDefaultAsync(c => c.Id == fId, ct);
                if (clinic != null && !string.IsNullOrWhiteSpace(clinic.Name))
                {
                    facilityName = clinic.Name;
                }
            }

            conversation = new PatientConversation
            {
                Id = message.ConversationId,
                PatientId = targetPatientId,
                HomeTenantId = message.TenantId,
                HomeFacilityId = message.FacilityId,
                HomeFacilityType = "Clinic",
                FacilityName = facilityName,
                Scope = ConversationScope.PatientFacility,
                Kind = ConversationKind.General,
                Subject = message.ContentText.Length > 60 ? message.ContentText[..60] + "..." : message.ContentText,
                Category = MessageCategory.Other,
                Status = RequestStatus.Routed,
                IsHiddenByPatient = false,
                LastMessagePreview = message.ContentText.Length > 100 ? message.ContentText[..100] : message.ContentText,
                LastMessageAtUtc = message.SentAtUtc,
                UnreadCount = message.SenderType != "Patient" ? 1 : 0,
                CreatedAtUtc = message.SentAtUtc,
                OpenedAtUtc = message.SentAtUtc
            };

            await _dbContext.PatientConversations.AddAsync(conversation, ct);
        }
        else
        {
            conversation.LastMessageAtUtc = message.SentAtUtc;
            conversation.LastMessagePreview = message.ContentText.Length > 100 ? message.ContentText[..100] : message.ContentText;
            if (message.SenderType != "Patient")
            {
                conversation.UnreadCount++;
            }
        }

        // 4. Insert or update patient message replica
        var existingMsg = await _dbContext.PatientMessages
            .FirstOrDefaultAsync(m => m.Id == message.MessageId, ct);

        if (existingMsg == null)
        {
            var newMsg = new PatientMessage
            {
                Id = message.MessageId,
                ConversationId = message.ConversationId,
                Seq = message.Seq,
                ClientMessageId = message.MessageId,
                SenderType = message.SenderType,
                SenderName = message.SenderDisplayName,
                SenderId = message.SenderId,
                ContentText = message.ContentText,
                RequiresAcknowledgement = message.RequiresAcknowledgement,
                IsAcknowledged = false,
                DeliveryState = DeliveryState.Received,
                RetentionDeadlineUtc = message.RetentionDeadlineUtc,
                ReceivedAtUtc = DateTime.UtcNow,
                CreatedAtUtc = message.SentAtUtc
            };

            if (message.Attachments != null && message.Attachments.Count > 0)
            {
                foreach (var att in message.Attachments)
                {
                    newMsg.Attachments.Add(new PatientMessageAttachment
                    {
                        Id = Guid.NewGuid(),
                        MessageId = message.MessageId,
                        FileName = att.FileName,
                        ContentType = att.ContentType,
                        FileSizeBytes = att.SizeBytes,
                        StorageKey = att.FileKey,
                        IsClean = true,
                        ScanStatus = "Clean",
                        HashSha256 = att.HashSha256
                    });
                }
            }

            await _dbContext.PatientMessages.AddAsync(newMsg, ct);
        }
        else
        {
            existingMsg.DeliveryState = DeliveryState.Received;
            existingMsg.ReceivedAtUtc = DateTime.UtcNow;
        }

        // 5. Truthful Delivery: Confirm persistence by enqueuing comms.message.received back to sender facility
        var receivedAck = new CommsMessageReceivedPayload(
            MessageId: message.MessageId,
            ConversationId: message.ConversationId,
            RecipientPartyAddress: context.To.Address,
            ReceivedAtUtc: DateTime.UtcNow
        );

        _publisher.Enqueue(
            InteropTypes.CommsMessageReceived,
            from: Party.ForPatient(targetPatientId.ToString()),
            to: Party.ForFacility(message.TenantId, message.FacilityId, FacilityType.Clinic, InteropServices.Comms),
            correlationId: message.ConversationId,
            payload: receivedAck
        );

        // Commit transaction
        await _dbContext.SaveChangesAsync(ct);

        // 6. SignalR live client notification
        try
        {
            await _syncNotificationService.NotifyCommsEventAsync(
                targetPatientId,
                "PatientMessageReceived",
                new { message.ConversationId, message.MessageId, message.Seq },
                ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Realtime SignalR broadcast failed for patient {PatientId}.", targetPatientId);
        }

        // 7. Zero-PHI Push Notification: Strictly generic, zero clinical text, zero diagnosis, zero health details
        try
        {
            var facilityName = !string.IsNullOrWhiteSpace(conversation.FacilityName) ? conversation.FacilityName : "your clinic";
            var pushTitle = "New Message";
            var pushBody = $"You have a new message from {facilityName}.";

            var sessions = await _deviceSessionRepository.GetActiveByPatientIdAsync(targetPatientId, ct);
            var pushTokens = sessions
                .Select(s => s.PushToken)
                .Where(t => !string.IsNullOrWhiteSpace(t))
                .Distinct()
                .ToList();

            foreach (var token in pushTokens)
            {
                try
                {
                    await _pushNotificationService.SendPushNotificationAsync(token!, pushTitle, pushBody, "messages", ct);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Push notification dispatch failed for token on patient {PatientId}.", targetPatientId);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Push notification delivery failed for patient {PatientId}.", targetPatientId);
        }
    }
}
