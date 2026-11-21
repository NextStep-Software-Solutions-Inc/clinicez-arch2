using ClinicEz.Patient.Application.Features.Sharing;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;

namespace ClinicEz.Patient.Application.Features.BookingDrafts.Commands.CreateBookingDraft;

public sealed class CreateBookingDraftCommandHandler : IRequestHandler<CreateBookingDraftCommand, Guid>
{
    public const int MaxActiveDraftsPerPatient = 5;

    private readonly IPatientRepository _patientRepo;
    private readonly IBookingDraftRepository _draftRepo;
    private readonly IUnitOfWork _uow;
    private readonly IClinicRepository? _clinicRepo;

    public CreateBookingDraftCommandHandler(
        IPatientRepository patientRepo,
        IBookingDraftRepository draftRepo,
        IUnitOfWork uow,
        IClinicRepository? clinicRepo = null)
    {
        _patientRepo = patientRepo;
        _draftRepo = draftRepo;
        _uow = uow;
        _clinicRepo = clinicRepo;
    }

    public async Task<Guid> Handle(CreateBookingDraftCommand request, CancellationToken cancellationToken)
    {
        _ = await _patientRepo.GetByIdAsync(request.PatientId, cancellationToken)
            ?? throw new NotFoundException($"Patient '{request.PatientId}' was not found.");

        Clinic? clinic = null;
        if (_clinicRepo is not null)
        {
            clinic = await _clinicRepo.GetByIdAsync(request.ClinicId, cancellationToken)
                ?? throw new NotFoundException($"Clinic '{request.ClinicId}' was not found.");

            if (!clinic.SupportsAppointments)
                throw new ConflictException("Online booking is currently paused for this clinic.");
        }

        var existingDrafts = await _draftRepo.GetByPatientAsync(request.PatientId, BookingDraftStatus.Draft, cancellationToken);
        if (existingDrafts.Count >= MaxActiveDraftsPerPatient)
        {
            throw new BadRequestException("Maximum active booking drafts reached.");
        }

        var resolvedProviderId = request.ProviderId;
        var resolvedProviderName = string.IsNullOrWhiteSpace(request.ProviderName) ? null : request.ProviderName.Trim();
        if (clinic is not null && request.ProviderId is { } requestedProviderId)
        {
            var matchedProvider = clinic.HealthcareProviders.FirstOrDefault(p => p.Id == requestedProviderId)
                ?? clinic.HealthcareProviders.FirstOrDefault(p => p.PractitionerId == requestedProviderId);
            if (matchedProvider is not null)
            {
                resolvedProviderId = matchedProvider.Id;
                resolvedProviderName ??= matchedProvider.Name;
            }
        }

        var draft = new BookingDraft
        {
            ClientId = Guid.NewGuid(),
            PatientId = request.PatientId,
            ClinicId = request.ClinicId,
            ProviderId = resolvedProviderId,
            ProviderName = resolvedProviderName,
            OrganizationId = request.OrganizationId,
            PreferredDate = request.PreferredDate,
            PreferredTime = request.PreferredTime,
            Reason = request.Reason,
            Notes = request.Notes,
            ShareFieldsJson = request.ShareFieldsJson,
            ShareSections = ParseSections(request.ShareSections),
            AttachedFileIdsJson = request.AttachedFileIdsJson,
        };

        await _draftRepo.AddAsync(draft, cancellationToken);
        await _uow.SaveChangesAsync(cancellationToken);
        return draft.Id;
    }

    private static AccessScopes ParseSections(IReadOnlyList<string>? sections) =>
        sections is { Count: > 0 } && SharingScopeMap.TryParse(sections, out var scopes) ? (AccessScopes)(int)scopes : AccessScopes.None;
}
