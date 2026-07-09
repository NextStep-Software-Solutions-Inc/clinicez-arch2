using MediatR;
using PatientAppBE.Application.Common.DTOs;

namespace PatientAppBE.Application.Features.Notifications.Queries.GetNotifications;

public sealed record GetNotificationsQuery(
    Guid PatientId,
    bool UnreadOnly = false,
    int Skip = 0,
    int Take = 30) : IRequest<NotificationListDto>;
