using CLINICEZ.Shared.Exceptions;
using MediatR;
using PatientAppBE.Domain.Interfaces;

namespace PatientAppBE.Application.Features.Notifications.Commands.MarkRead;

public sealed class MarkNotificationReadCommandHandler : IRequestHandler<MarkNotificationReadCommand>
{
    private readonly INotificationRepository _repo;
    private readonly IUnitOfWork _uow;

    public MarkNotificationReadCommandHandler(INotificationRepository repo, IUnitOfWork uow)
    { _repo = repo; _uow = uow; }

    public async Task Handle(MarkNotificationReadCommand request, CancellationToken cancellationToken)
    {
        var notification = await _repo.GetByIdAsync(request.NotificationId, cancellationToken)
            ?? throw new NotFoundException($"Notification '{request.NotificationId}' was not found.");

        if (notification.PatientId != request.PatientId)
            throw new ForbiddenException("This notification does not belong to the requesting patient.");

        notification.IsRead = true;
        notification.ReadAt = DateTime.UtcNow;
        _repo.Update(notification);
        await _uow.SaveChangesAsync(cancellationToken);
    }
}

public sealed class MarkAllNotificationsReadCommandHandler : IRequestHandler<MarkAllNotificationsReadCommand>
{
    private readonly INotificationRepository _repo;
    private readonly IUnitOfWork _uow;

    public MarkAllNotificationsReadCommandHandler(INotificationRepository repo, IUnitOfWork uow)
    { _repo = repo; _uow = uow; }

    public async Task Handle(MarkAllNotificationsReadCommand request, CancellationToken cancellationToken)
    {
        await _repo.MarkAllReadAsync(request.PatientId, cancellationToken);
        await _uow.SaveChangesAsync(cancellationToken);
    }
}
