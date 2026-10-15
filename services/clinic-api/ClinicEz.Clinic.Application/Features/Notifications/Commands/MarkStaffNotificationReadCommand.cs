using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Notifications.Commands;

public sealed record MarkStaffNotificationReadCommand(Guid NotificationId) : IRequest<bool>;

public sealed class MarkStaffNotificationReadCommandHandler : IRequestHandler<MarkStaffNotificationReadCommand, bool>
{
    private readonly IRepository<ClinicStaffNotification> _notificationRepo;
    private readonly IClinicContext _clinicContext;
    private readonly IUnitOfWork _unitOfWork;

    public MarkStaffNotificationReadCommandHandler(
        IRepository<ClinicStaffNotification> notificationRepo,
        IClinicContext clinicContext,
        IUnitOfWork unitOfWork)
    {
        _notificationRepo = notificationRepo;
        _clinicContext = clinicContext;
        _unitOfWork = unitOfWork;
    }

    public async Task<bool> Handle(MarkStaffNotificationReadCommand request, CancellationToken ct)
    {
        var staffId = _clinicContext.StaffId;
        var notification = await _notificationRepo.Query(n =>
            n.Id == request.NotificationId &&
            n.ClinicId == _clinicContext.ClinicId &&
            !n.IsDeleted &&
            (n.RecipientStaffId == null || n.RecipientStaffId == staffId))
            .FirstOrDefaultAsync(ct);

        if (notification == null) return false;

        if (!notification.IsRead)
        {
            notification.IsRead = true;
            notification.ReadAt = DateTime.UtcNow;
            notification.UpdatedAt = DateTime.UtcNow;
            _notificationRepo.Update(notification);
            await _unitOfWork.SaveChangesAsync(ct);
        }

        return true;
    }
}
