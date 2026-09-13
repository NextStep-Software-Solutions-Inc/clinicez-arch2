using ClinicEz.Shared.Exceptions;
using MediatR;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Interfaces;

namespace ClinicEz.Patient.Application.Features.BookingDrafts.Commands.CreateBookingDraft;

public sealed class CreateBookingDraftCommandHandler : IRequestHandler<CreateBookingDraftCommand, Guid>
{
    private readonly IPatientRepository _patientRepo;
    private readonly IBookingDraftRepository _draftRepo;
    private readonly IUnitOfWork _uow;

    public CreateBookingDraftCommandHandler(
        IPatientRepository patientRepo, IBookingDraftRepository draftRepo, IUnitOfWork uow)
    {
        _patientRepo = patientRepo; _draftRepo = draftRepo; _uow = uow;
    }

    public async Task<Guid> Handle(CreateBookingDraftCommand request, CancellationToken cancellationToken)
    {
        _ = await _patientRepo.GetByIdAsync(request.PatientId, cancellationToken)
            ?? throw new NotFoundException($"Patient '{request.PatientId}' was not found.");

        var draft = new BookingDraft
        {
            ClientId = Guid.NewGuid(),
            PatientId = request.PatientId,
            ClinicId = request.ClinicId,
            OrganizationId = request.OrganizationId,
            PreferredDate = request.PreferredDate,
            PreferredTime = request.PreferredTime,
            Reason = request.Reason,
            Notes = request.Notes,
            ShareFieldsJson = request.ShareFieldsJson,
            AttachedFileIdsJson = request.AttachedFileIdsJson,
        };

        await _draftRepo.AddAsync(draft, cancellationToken);
        await _uow.SaveChangesAsync(cancellationToken);
        return draft.Id;
    }
}
