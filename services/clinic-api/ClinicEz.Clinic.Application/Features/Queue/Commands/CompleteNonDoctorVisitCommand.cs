using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Queue.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Queue.Commands;

public sealed record CompleteNonDoctorVisitCommand(
    Guid QueueItemId,
    string? DischargeRemarks = null
) : IRequest<bool>;

public sealed class CompleteNonDoctorVisitCommandValidator : AbstractValidator<CompleteNonDoctorVisitCommand>
{
    public CompleteNonDoctorVisitCommandValidator()
    {
        RuleFor(x => x.QueueItemId).NotEmpty();
        RuleFor(x => x.DischargeRemarks).MaximumLength(1000);
    }
}

public sealed class CompleteNonDoctorVisitCommandHandler : IRequestHandler<CompleteNonDoctorVisitCommand, bool>
{
    private readonly IRepository<QueueItem> _queueRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IQueueNotificationDispatcher? _notificationDispatcher;

    public CompleteNonDoctorVisitCommandHandler(
        IRepository<QueueItem> queueRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IQueueNotificationDispatcher? notificationDispatcher = null)
    {
        _queueRepository = queueRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _notificationDispatcher = notificationDispatcher;
    }

    public async Task<bool> Handle(CompleteNonDoctorVisitCommand request, CancellationToken cancellationToken)
    {
        var item = await _queueRepository.Query(q => q.Id == request.QueueItemId && q.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        if (item == null)
        {
            throw new NotFoundException($"Queue item '{request.QueueItemId}' was not found in this clinic.");
        }

        // Terminal statuses cannot be discharged again
        if (item.Status == QueueStatus.Completed ||
            item.Status == QueueStatus.Cancelled ||
            item.Status == QueueStatus.NoShow ||
            item.Status == QueueStatus.DischargedNonDoctor ||
            item.Status == QueueStatus.Diverted)
        {
            throw new ConflictException($"Queue item '{request.QueueItemId}' is already in a terminal state ({item.Status}) and cannot be discharged.");
        }

        var now = DateTime.UtcNow;
        var staffId = _clinicContext.StaffId;

        item.Status = QueueStatus.DischargedNonDoctor;
        item.CompletedTime = now;
        item.DischargedAt = now;
        item.DischargeNotes = request.DischargeRemarks;
        item.DischargedByStaffId = staffId;
        item.UpdatedAt = now;
        item.UpdatedBy = staffId?.ToString() ?? "Staff";

        if (_notificationDispatcher != null)
        {
            await _notificationDispatcher.EvaluateAndDispatchApproachingAlertsAsync(item.ClinicId, item.QueueDate, cancellationToken);
        }

        _queueRepository.Update(item);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return true;
    }
}
