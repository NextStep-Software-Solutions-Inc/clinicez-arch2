using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Queue.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Queue.Commands;

public sealed record CancelQueueTicketCommand(Guid Id, string? Reason = null) : IRequest<QueueItemDto>;

public sealed class CancelQueueTicketCommandHandler : IRequestHandler<CancelQueueTicketCommand, QueueItemDto>
{
    private readonly IRepository<QueueItem> _queueRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly Features.Queue.Services.IQueueNotificationDispatcher? _notificationDispatcher;

    public CancelQueueTicketCommandHandler(
        IRepository<QueueItem> queueRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        Features.Queue.Services.IQueueNotificationDispatcher? notificationDispatcher = null)
    {
        _queueRepository = queueRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _notificationDispatcher = notificationDispatcher;
    }

    public async Task<QueueItemDto> Handle(CancelQueueTicketCommand request, CancellationToken cancellationToken)
    {
        var item = await _queueRepository.Query(q => q.Id == request.Id && q.ClinicId == _clinicContext.ClinicId)
            .Include(q => q.PatientVitals)
            .FirstOrDefaultAsync(cancellationToken);

        if (item == null)
        {
            throw new NotFoundException($"Queue item '{request.Id}' was not found in this clinic.");
        }

        item.Status = QueueStatus.Cancelled;
        item.CompletedTime = DateTime.UtcNow;
        item.UpdatedAt = DateTime.UtcNow;
        item.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "Staff";

        if (_notificationDispatcher != null)
        {
            await _notificationDispatcher.EvaluateAndDispatchApproachingAlertsAsync(item.ClinicId, item.QueueDate, cancellationToken);
        }

        _queueRepository.Update(item);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return item.ToDto();
    }
}
