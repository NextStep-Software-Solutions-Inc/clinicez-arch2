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

public sealed record SubmitPatientMessageCommand(
    Guid ConversationId,
    string ClerkUserId,
    string ContentText,
    Guid? ClientMessageId = null,
    IReadOnlyList<CommsAttachmentReference>? Attachments = null) : IRequest<PatientMessageDto>;

public sealed class SubmitPatientMessageCommandHandler : IRequestHandler<SubmitPatientMessageCommand, PatientMessageDto>
{
    private readonly IPatientRepository _patientRepo;
    private readonly IPatientCommunicationsRepository _commsRepo;
    private readonly IUnitOfWork _uow;
    private readonly IInteropPublisher _publisher;

    public SubmitPatientMessageCommandHandler(
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
        SubmitPatientMessageCommand request,
        CancellationToken ct)
    {
        var conversation = await _commsRepo.GetConversationByIdAsync(request.ConversationId, ct);
        if (conversation == null)
        {
            throw new NotFoundException($"Conversation '{request.ConversationId}' was not found.");
        }

        var isOwned = await _patientRepo.IsOwnedByAsync(conversation.PatientId, request.ClerkUserId, ct);
        if (!isOwned)
        {
            throw new ForbiddenException("You do not have access to this conversation.");
        }

        if (conversation.Status == RequestStatus.Closed)
        {
            throw new ValidationException("Cannot send a message to a closed conversation.");
        }

        var callerPatient = await _patientRepo.GetByClerkUserIdWithDetailsAsync(request.ClerkUserId, ct);
        var senderName = callerPatient != null
            ? $"{callerPatient.FirstName} {callerPatient.LastName}".Trim()
            : "Patient";

        var now = DateTime.UtcNow;
        var clientMsgId = request.ClientMessageId ?? Guid.NewGuid();
        var nextSeq = await _commsRepo.GetNextSequenceForConversationAsync(conversation.Id, ct);
        var retentionDeadline = now.AddDays(7);

        var message = new PatientMessage
        {
            Id = Guid.NewGuid(),
            ConversationId = conversation.Id,
            Seq = nextSeq,
            ClientMessageId = clientMsgId,
            SenderType = "Patient",
            SenderId = callerPatient?.Id,
            SenderName = senderName,
            ContentText = request.ContentText,
            DeliveryState = DeliveryState.Waiting,
            CreatedAtUtc = now,
            RetentionDeadlineUtc = retentionDeadline
        };

        var attachmentDtos = new List<PatientMessageAttachmentDto>();
        if (request.Attachments != null && request.Attachments.Count > 0)
        {
            foreach (var att in request.Attachments)
            {
                var attachment = new PatientMessageAttachment
                {
                    Id = Guid.NewGuid(),
                    MessageId = message.Id,
                    StorageKey = att.FileKey,
                    FileName = att.FileName,
                    ContentType = att.ContentType,
                    FileSizeBytes = att.SizeBytes,
                    HashSha256 = att.HashSha256,
                    IsClean = true,
                    ScanStatus = "Clean"
                };
                message.Attachments.Add(attachment);

                attachmentDtos.Add(new PatientMessageAttachmentDto(
                    attachment.Id,
                    attachment.MessageId,
                    attachment.StorageKey,
                    attachment.FileName,
                    attachment.ContentType,
                    attachment.FileSizeBytes,
                    attachment.HashSha256,
                    attachment.ScanStatus));
            }
        }

        await _commsRepo.AddMessageAsync(message, ct);

        // Update conversation last message preview & timestamp
        conversation.LastMessageAtUtc = now;
        conversation.LastMessagePreview = request.ContentText.Length > 100
            ? request.ContentText[..100]
            : request.ContentText;
        _commsRepo.UpdateConversation(conversation);

        // Enqueue comms.message.submit
        var payload = new CommsMessageSubmitPayload(
            ClientMessageId: clientMsgId,
            ConversationId: conversation.Id,
            TenantId: conversation.HomeTenantId,
            FacilityId: conversation.HomeFacilityId,
            SenderType: "Patient",
            SenderId: callerPatient?.Id,
            SenderDisplayName: senderName,
            ContentText: request.ContentText,
            Visibility: MessageVisibility.Public,
            RequiresAcknowledgement: false,
            Attachments: request.Attachments,
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
