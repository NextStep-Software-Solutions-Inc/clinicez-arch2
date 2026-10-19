using MediatR;
using ClinicEz.Patient.Application.Common.DTOs;

namespace ClinicEz.Patient.Application.Features.Notifications.Queries.GetNotifications;

public sealed record GetNotificationsQuery(
    Guid PatientId,
    bool UnreadOnly = false,
    int Skip = 0,
    int Take = 30) : IRequest<NotificationListDto>;
