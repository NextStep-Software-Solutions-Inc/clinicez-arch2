using ClinicEz.Shared.Exceptions;
using MediatR;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Domain.Interfaces;

namespace ClinicEz.Patient.Application.Features.Notifications.Queries.GetNotifications;

public sealed class GetNotificationsQueryHandler : IRequestHandler<GetNotificationsQuery, NotificationListDto>
{
    private readonly IPatientRepository _patientRepository;
    private readonly INotificationRepository _notificationRepository;

    public GetNotificationsQueryHandler(
        IPatientRepository patientRepository,
        INotificationRepository notificationRepository)
    {
        _patientRepository = patientRepository;
        _notificationRepository = notificationRepository;
    }

    public async Task<NotificationListDto> Handle(GetNotificationsQuery request, CancellationToken cancellationToken)
    {
        _ = await _patientRepository.GetByIdAsync(request.PatientId, cancellationToken)
            ?? throw new NotFoundException($"Patient '{request.PatientId}' was not found.");

        var notifications = await _notificationRepository.GetByPatientAsync(
            request.PatientId, request.UnreadOnly, request.Skip, request.Take, cancellationToken);

        var unreadCount = await _notificationRepository.GetUnreadCountAsync(request.PatientId, cancellationToken);

        var items = notifications
            .Select(n => new NotificationDto(
                n.Id, n.Type.ToString(), n.Title, n.Body,
                n.IsRead, n.ReadAt, n.Payload, n.CreatedAt))
            .ToList()
            .AsReadOnly();

        return new NotificationListDto(items, unreadCount, items.Count);
    }
}
