using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using MediatR;

namespace ClinicEz.Patient.Application.Features.Communications.Commands;

public sealed record AcknowledgePatientMessageCommand(
    Guid ConversationId,
    Guid MessageId,
    string ClerkUserId) : IRequest<bool>;

public sealed class AcknowledgePatientMessageCommandHandler : IRequestHandler<AcknowledgePatientMessageCommand, bool>
{
    private readonly IPatientRepository _patientRepo;
    private readonly IPatientCommunicationsRepository _commsRepo;
    private readonly IUnitOfWork _uow;
    private readonly IInteropPublisher _publisher;

    public AcknowledgePatientMessageCommandHandler(
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

    public async Task<bool> Handle(
        AcknowledgePatientMessageCommand request,
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

        if (!message.RequiresAcknowledgement)
        {
            throw new ValidationException("This message does not require acknowledgement.");
        }

        // Idempotent: If already acknowledged, return true
        if (message.IsAcknowledged)
        {
            return true;
        }

        var callerPatient = await _patientRepo.GetByClerkUserIdWithDetailsAsync(request.ClerkUserId, ct);
        var ackName = callerPatient != null
            ? $"{callerPatient.FirstName} {callerPatient.LastName}".Trim()
            : "Patient";
        var ackId = callerPatient?.Id ?? Guid.Empty;
        var now = DateTime.UtcNow;

        message.IsAcknowledged = true;
        message.AcknowledgedAtUtc = now;
        message.AcknowledgedByAccountId = ackId;
        message.AcknowledgedByName = ackName;
        _commsRepo.UpdateMessage(message);

        // Enqueue comms.message.acknowledged to facility
        var payload = new CommsMessageAcknowledgedPayload(
            MessageId: message.Id,
            ConversationId: conversation.Id,
            AcknowledgedByAccountId: ackId,
            AcknowledgedByName: ackName,
            AcknowledgedAtUtc: now
        );

        _publisher.Enqueue(
            InteropTypes.CommsMessageAcknowledged,
            Party.ForPatient(conversation.PatientId.ToString()),
            Party.ForFacility(conversation.HomeTenantId, conversation.HomeFacilityId, FacilityType.Clinic, InteropServices.Comms),
            conversation.Id,
            payload
        );

        await _uow.SaveChangesAsync(ct);
        return true;
    }
}
