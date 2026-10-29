using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Notifications.Commands;

public sealed record MarkAllStaffNotificationsReadCommand() : IRequest<int>;

public sealed class MarkAllStaffNotificationsReadCommandHandler : IRequestHandler<MarkAllStaffNotificationsReadCommand, int>
{
    private readonly IRepository<StaffNotification> _notificationRepo;
    private readonly IClinicContext _clinicContext;
    private readonly IUnitOfWork _unitOfWork;

    public MarkAllStaffNotificationsReadCommandHandler(
        IRepository<StaffNotification> notificationRepo,
        IClinicContext clinicContext,
        IUnitOfWork unitOfWork)
    {
        _notificationRepo = notificationRepo;
        _clinicContext = clinicContext;
        _unitOfWork = unitOfWork;
    }

    public async Task<int> Handle(MarkAllStaffNotificationsReadCommand request, CancellationToken ct)
    {
        var staffId = _clinicContext.StaffId;
        var unread = await _notificationRepo.Query(n =>
            n.ClinicId == _clinicContext.ClinicId &&
            !n.IsDeleted &&
            !n.IsRead &&
            (n.RecipientStaffId == null || n.RecipientStaffId == staffId))
            .ToListAsync(ct);

        if (unread.Count == 0) return 0;

        var now = DateTime.UtcNow;
        foreach (var notification in unread)
        {
            notification.IsRead = true;
            notification.ReadAt = now;
            notification.UpdatedAt = now;
            _notificationRepo.Update(notification);
        }

        await _unitOfWork.SaveChangesAsync(ct);
        return unread.Count;
    }
}
