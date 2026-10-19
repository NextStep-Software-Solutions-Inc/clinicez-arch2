using ClinicEz.Shared.Exceptions;
using MediatR;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;

namespace ClinicEz.Patient.Application.Features.Notifications.Commands.UpsertNotificationPreference;

public sealed record UpsertNotificationPreferenceCommand(
    Guid PatientId, string Category, bool PushEnabled, bool InAppEnabled) : IRequest<NotificationPreferenceDto>;

public sealed class UpsertNotificationPreferenceCommandHandler
    : IRequestHandler<UpsertNotificationPreferenceCommand, NotificationPreferenceDto>
{
    private readonly IPatientRepository _patientRepo;
    private readonly INotificationPreferencesRepository _prefRepo;
    private readonly IUnitOfWork _uow;

    public UpsertNotificationPreferenceCommandHandler(
        IPatientRepository patientRepo, INotificationPreferencesRepository prefRepo, IUnitOfWork uow)
    { _patientRepo = patientRepo; _prefRepo = prefRepo; _uow = uow; }

    public async Task<NotificationPreferenceDto> Handle(
        UpsertNotificationPreferenceCommand request, CancellationToken cancellationToken)
    {
        _ = await _patientRepo.GetByIdAsync(request.PatientId, cancellationToken)
            ?? throw new NotFoundException($"Patient '{request.PatientId}' was not found.");

        if (!Enum.TryParse<NotificationCategory>(request.Category, true, out var category))
            throw new ClinicEz.Shared.Exceptions.BadRequestException($"Unknown notification category: '{request.Category}'.");

        var pref = await _prefRepo.GetByPatientAndCategoryAsync(request.PatientId, category, cancellationToken);

        if (pref is null)
        {
            pref = new Domain.Entities.NotificationPreferences
            {
                ClientId = Guid.NewGuid(),
                PatientId = request.PatientId,
                Category = category,
                PushEnabled = request.PushEnabled,
                InAppEnabled = request.InAppEnabled,
            };
            await _prefRepo.AddAsync(pref, cancellationToken);
        }
        else
        {
            pref.PushEnabled = request.PushEnabled;
            pref.InAppEnabled = request.InAppEnabled;
            _prefRepo.Update(pref);
        }

        await _uow.SaveChangesAsync(cancellationToken);
        return new NotificationPreferenceDto(pref.Id, pref.Category.ToString(), pref.PushEnabled, pref.InAppEnabled);
    }
}
