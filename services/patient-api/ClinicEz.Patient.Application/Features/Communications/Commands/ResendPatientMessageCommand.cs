using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Features.Communications.DTOs;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using MediatR;

namespace ClinicEz.Patient.Application.Features.Communications.Commands;

public sealed record ResendPatientMessageCommand(
    Guid ConversationId,
    Guid MessageId,
    string ClerkUserId) : IRequest<PatientMessageDto>;

public sealed class ResendPatientMessageCommandHandler : IRequestHandler<ResendPatientMessageCommand, PatientMessageDto>
{
    private readonly IPatientRepository _patientRepo;
    private readonly IPatientCommunicationsRepository _commsRepo;
    private readonly IUnitOfWork _uow;
    private readonly IInteropPublisher _publisher;

    public ResendPatientMessageCommandHandler(
        IPatientRepository patientRepo,
        IPatientCommunicationsRepository commsRepo,
        IUnitOfWork uow,
        IInteropPublisher publisher)
    {
        _patientRepo = patientRepo;
        _commsRepo = commsRepo;
        _uow = uow;
        _publisher = publisher;
    }

    public async Task<PatientMessageDto> Handle(
        ResendPatientMessageCommand request,
        CancellationToken ct)
    {
        var message = await _commsRepo.GetMessageByIdAsync(request.MessageId, ct);
        if (message == null || message.ConversationId != request.ConversationId)
        {
            throw new NotFoundException($"Message '{request.MessageId}' was not found in conversation '{request.ConversationId}'.");
        }

        var conversation = message.Conversation;
        var isOwned = await _patientRepo.IsOwnedByAsync(conversation.PatientId, request.ClerkUserId, ct);
        if (!isOwned)
        {
            throw new ForbiddenException("You do not have access to this conversation.");
        }

        if (message.DeliveryState == DeliveryState.Received)
        {
            throw new ValidationException("Message has already been delivered successfully.");
        }

        var now = DateTime.UtcNow;
        var retentionDeadline = now.AddDays(7);

        // Reset to Waiting with renewed retention deadline
        message.DeliveryState = DeliveryState.Waiting;
        message.CreatedAtUtc = now;
        message.RetentionDeadlineUtc = retentionDeadline;
        message.HasExpiredBannerShown = false;
        _commsRepo.UpdateMessage(message);

        conversation.LastMessageAtUtc = now;
        _commsRepo.UpdateConversation(conversation);

        var attachmentRefs = message.Attachments.Select(a => new CommsAttachmentReference(
            FileKey: a.StorageKey,
            FileName: a.FileName,
            ContentType: a.ContentType,
            SizeBytes: a.FileSizeBytes,
            HashSha256: a.HashSha256
        )).ToList();

        // Re-enqueue with the exact same ClientMessageId for idempotency
        var payload = new CommsMessageSubmitPayload(
            ClientMessageId: message.ClientMessageId,
            ConversationId: conversation.Id,
            TenantId: conversation.HomeTenantId,
            FacilityId: conversation.HomeFacilityId,
            SenderType: message.SenderType,
            SenderId: message.SenderId,
            SenderDisplayName: message.SenderName,
            ContentText: message.ContentText,
            Visibility: MessageVisibility.Public,
            RequiresAcknowledgement: message.RequiresAcknowledgement,
            Attachments: attachmentRefs.Count > 0 ? attachmentRefs : null,
            ClientSentAtUtc: now,
            RetentionDeadlineUtc: retentionDeadline
        );

        _publisher.Enqueue(
            InteropTypes.CommsMessageSubmit,
            Party.ForPatient(conversation.PatientId.ToString()),
            Party.ForFacility(conversation.HomeTenantId, conversation.HomeFacilityId, FacilityType.Clinic, InteropServices.Comms),
            conversation.Id,
            payload
        );

        await _uow.SaveChangesAsync(ct);

        var attachmentDtos = message.Attachments.Select(a => new PatientMessageAttachmentDto(
            a.Id,
            a.MessageId,
            a.StorageKey,
            a.FileName,
            a.ContentType,
            a.FileSizeBytes,
            a.HashSha256,
            a.ScanStatus
        )).ToList();

        return new PatientMessageDto(
            message.Id,
            message.ConversationId,
            message.Seq,
            message.ClientMessageId,
            message.SenderType,
            message.SenderId,
            message.SenderName,
            message.ContentText,
            message.RequiresAcknowledgement,
            message.IsAcknowledged,
            message.AcknowledgedAtUtc,
            message.AcknowledgedByAccountId,
            message.AcknowledgedByName,
            message.DeliveryState,
            message.CreatedAtUtc,
            message.ReceivedAtUtc,
            message.RetentionDeadlineUtc,
            attachmentDtos
        );
    }
}
