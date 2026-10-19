using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Notifications.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Notifications.Queries;

public sealed record GetStaffNotificationsQuery(
    bool? UnreadOnly = null,
    StaffNotificationCategory? Category = null,
    NotificationUrgency? Urgency = null,
    int Limit = 50) : IRequest<StaffNotificationListDto>;

public sealed class GetStaffNotificationsQueryHandler : IRequestHandler<GetStaffNotificationsQuery, StaffNotificationListDto>
{
    private readonly IRepository<ClinicStaffNotification> _notificationRepo;
    private readonly IClinicContext _clinicContext;

    public GetStaffNotificationsQueryHandler(
        IRepository<ClinicStaffNotification> notificationRepo,
        IClinicContext clinicContext)
    {
        _notificationRepo = notificationRepo;
        _clinicContext = clinicContext;
    }

    public async Task<StaffNotificationListDto> Handle(GetStaffNotificationsQuery request, CancellationToken ct)
    {
        var staffId = _clinicContext.StaffId;

        var query = _notificationRepo.Query(n =>
            n.ClinicId == _clinicContext.ClinicId &&
            !n.IsDeleted &&
            (n.RecipientStaffId == null || n.RecipientStaffId == staffId));

        var unreadCount = await query.CountAsync(n => !n.IsRead, ct);
        var hasStatAlert = await query.AnyAsync(n => !n.IsRead && n.Urgency == NotificationUrgency.Stat, ct);

        if (request.UnreadOnly == true)
        {
            query = query.Where(n => !n.IsRead);
        }

        if (request.Category.HasValue)
        {
            query = query.Where(n => n.Category == request.Category.Value);
        }

        if (request.Urgency.HasValue)
        {
            query = query.Where(n => n.Urgency == request.Urgency.Value);
        }

        var limit = Math.Clamp(request.Limit, 1, 100);

        var items = await query
            .OrderByDescending(n => n.Urgency == NotificationUrgency.Stat && !n.IsRead)
            .ThenByDescending(n => n.CreatedAt)
            .Take(limit)
            .Select(n => new ClinicStaffNotificationDto(
                n.Id,
                n.ClinicId,
                n.RecipientStaffId,
                n.RecipientRole,
                n.Title,
                n.Body,
                n.Category,
                n.Urgency,
                n.ActionRoute,
                n.ActionParamsJson,
                n.SourceType,
                n.SourceId,
                n.IsRead,
                n.ReadAt,
                n.CreatedAt))
            .ToListAsync(ct);

        return new StaffNotificationListDto(items, unreadCount, hasStatAlert);
    }
}
