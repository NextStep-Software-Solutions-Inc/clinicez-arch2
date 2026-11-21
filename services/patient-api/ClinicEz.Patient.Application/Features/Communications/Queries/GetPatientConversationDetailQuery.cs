using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Features.Communications.DTOs;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;

namespace ClinicEz.Patient.Application.Features.Communications.Queries;

public sealed record GetPatientConversationDetailQuery(
    Guid ConversationId,
    string ClerkUserId) : IRequest<PatientConversationDetailDto>;

public sealed class GetPatientConversationDetailQueryHandler : IRequestHandler<GetPatientConversationDetailQuery, PatientConversationDetailDto>
{
    private readonly IPatientRepository _patientRepo;
    private readonly IPatientCommunicationsRepository _commsRepo;
    private readonly IUnitOfWork _uow;

    public GetPatientConversationDetailQueryHandler(
        IPatientRepository patientRepo,
        IPatientCommunicationsRepository commsRepo,
        IUnitOfWork uow)
    {
        _patientRepo = patientRepo;
        _commsRepo = commsRepo;
        _uow = uow;
    }

    public async Task<PatientConversationDetailDto> Handle(
        GetPatientConversationDetailQuery request,
        CancellationToken ct)
    {
        var conversation = await _commsRepo.GetConversationWithMessagesAsync(request.ConversationId, ct);
        if (conversation == null)
        {
            throw new NotFoundException($"Conversation '{request.ConversationId}' was not found.");
        }

        var isOwned = await _patientRepo.IsOwnedByAsync(conversation.PatientId, request.ClerkUserId, ct);
        if (!isOwned)
        {
            throw new ForbiddenException("You do not have access to this conversation.");
        }

        // Reset unread counter on view
        if (conversation.UnreadCount > 0)
        {
            conversation.UnreadCount = 0;
            _commsRepo.UpdateConversation(conversation);
            await _uow.SaveChangesAsync(ct);
        }

        var messages = conversation.Messages
            .OrderBy(m => m.Seq)
            .Select(m => new PatientMessageDto(
                m.Id,
                m.ConversationId,
                m.Seq,
                m.ClientMessageId,
                m.SenderType,
                m.SenderId,
                m.SenderName,
                m.ContentText,
                m.RequiresAcknowledgement,
                m.IsAcknowledged,
                m.AcknowledgedAtUtc,
                m.AcknowledgedByAccountId,
                m.AcknowledgedByName,
                m.DeliveryState,
                m.CreatedAtUtc,
                m.ReceivedAtUtc,
                m.RetentionDeadlineUtc,
                m.Attachments.Select(a => new PatientMessageAttachmentDto(
                    a.Id,
                    a.MessageId,
                    a.StorageKey,
                    a.FileName,
                    a.ContentType,
                    a.FileSizeBytes,
                    a.HashSha256,
                    a.ScanStatus
                )).ToList()
            )).ToList();

        return new PatientConversationDetailDto(
            conversation.Id,
            conversation.PatientId,
            conversation.HomeTenantId,
            conversation.HomeFacilityId,
            conversation.HomeFacilityType,
            conversation.FacilityName,
            conversation.Category,
            conversation.Subject,
            conversation.Status,
            conversation.TriageDisposition,
            conversation.DeclineReasonCode,
            conversation.AssignedStaffDisplayName,
            conversation.IsHiddenByPatient,
            conversation.OpenedAtUtc,
            conversation.ClosedAtUtc,
            messages
        );
    }
}
