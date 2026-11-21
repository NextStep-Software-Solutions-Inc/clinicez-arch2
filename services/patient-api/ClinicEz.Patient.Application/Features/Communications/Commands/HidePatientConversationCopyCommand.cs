using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;

namespace ClinicEz.Patient.Application.Features.Communications.Commands;

public sealed record HidePatientConversationCopyCommand(
    Guid ConversationId,
    string ClerkUserId) : IRequest<bool>;

public sealed class HidePatientConversationCopyCommandHandler : IRequestHandler<HidePatientConversationCopyCommand, bool>
{
    private readonly IPatientRepository _patientRepo;
    private readonly IPatientCommunicationsRepository _commsRepo;
    private readonly IUnitOfWork _uow;

    public HidePatientConversationCopyCommandHandler(
        IPatientRepository patientRepo,
        IPatientCommunicationsRepository commsRepo,
        IUnitOfWork uow)
    {
        _patientRepo = patientRepo;
        _commsRepo = commsRepo;
        _uow = uow;
    }

    public async Task<bool> Handle(
        HidePatientConversationCopyCommand request,
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

        // Local privacy flag flip only - zero outbound hub messages emitted
        conversation.IsHiddenByPatient = true;
        conversation.HiddenAtUtc = DateTime.UtcNow;
        _commsRepo.UpdateConversation(conversation);

        await _uow.SaveChangesAsync(ct);
        return true;
    }
}
