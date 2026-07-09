using CLINICEZ.Shared.Exceptions;
using MediatR;
using PatientApp.Application.Common.DTOs;
using PatientApp.Domain.Interfaces;

namespace PatientApp.Application.Features.Notifications.Queries.GetNotificationPreferences;

public sealed record GetNotificationPreferencesQuery(Guid PatientId)
    : IRequest<IReadOnlyList<NotificationPreferenceDto>>;

public sealed class GetNotificationPreferencesQueryHandler
    : IRequestHandler<GetNotificationPreferencesQuery, IReadOnlyList<NotificationPreferenceDto>>
{
    private readonly IPatientRepository _patientRepo;
    private readonly INotificationPreferencesRepository _prefRepo;

    public GetNotificationPreferencesQueryHandler(
        IPatientRepository patientRepo, INotificationPreferencesRepository prefRepo)
    { _patientRepo = patientRepo; _prefRepo = prefRepo; }

    public async Task<IReadOnlyList<NotificationPreferenceDto>> Handle(
        GetNotificationPreferencesQuery request, CancellationToken cancellationToken)
    {
        _ = await _patientRepo.GetByIdAsync(request.PatientId, cancellationToken)
            ?? throw new NotFoundException($"Patient '{request.PatientId}' was not found.");

        var prefs = await _prefRepo.GetByPatientAsync(request.PatientId, cancellationToken);
        return prefs.Select(p => new NotificationPreferenceDto(
            p.Id, p.Category.ToString(), p.PushEnabled, p.InAppEnabled))
            .ToList().AsReadOnly();
    }
}
