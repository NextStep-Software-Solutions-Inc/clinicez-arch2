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

public sealed record ReactivateQueueItemCommand(Guid Id) : IRequest<QueueItemDto>;

public sealed class ReactivateQueueItemCommandHandler : IRequestHandler<ReactivateQueueItemCommand, QueueItemDto>
{
    private readonly IRepository<QueueItem> _queueRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public ReactivateQueueItemCommandHandler(
        IRepository<QueueItem> queueRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _queueRepository = queueRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<QueueItemDto> Handle(ReactivateQueueItemCommand request, CancellationToken cancellationToken)
    {
        var item = await _queueRepository.Query(q => q.Id == request.Id && q.ClinicId == _clinicContext.ClinicId)
            .Include(q => q.TriageVitals)
            .FirstOrDefaultAsync(cancellationToken);

        if (item == null)
        {
            throw new NotFoundException($"Queue item '{request.Id}' was not found in this clinic.");
        }

        if (item.Status != QueueStatus.OnHold && item.Status != QueueStatus.NoShow)
        {
            throw new BadRequestException($"Queue item '{request.Id}' cannot be reactivated from status '{item.Status}'. Only 'OnHold' or 'NoShow' items can be reactivated.");
        }

        // Determine min waiting sequence number today so reactivated ticket is at the top of the waiting line
        var minWaitingSeq = await _queueRepository.Query(q =>
            q.ClinicId == _clinicContext.ClinicId &&
            q.QueueDate == item.QueueDate &&
            q.Status == QueueStatus.Waiting)
            .MinAsync(q => (int?)q.SequenceNumber, cancellationToken);

        item.SequenceNumber = minWaitingSeq.HasValue ? minWaitingSeq.Value - 1 : 1;
        item.Status = QueueStatus.Waiting;
        item.CompletedTime = null;
        item.UpdatedAt = DateTime.UtcNow;
        item.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "Staff";

        _queueRepository.Update(item);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        string? vitalsSummary = item.TriageVitals != null
            ? $"BP: {item.TriageVitals.SystolicBp}/{item.TriageVitals.DiastolicBp} • HR: {item.TriageVitals.HeartRateBpm}"
            : null;

        return new QueueItemDto(
            item.Id,
            item.TenantId,
            item.ClinicId,
            item.QueueNumber,
            item.SequenceNumber,
            item.QueueDate,
            item.PatientId,
            item.PatientName,
            item.AppointmentId,
            item.DoctorId,
            item.DoctorName,
            item.Priority,
            item.Status,
            item.CheckInTime,
            item.CalledTime,
            item.CompletedTime,
            item.ChiefComplaint,
            item.TriageVitals != null,
            vitalsSummary,
            item.RoomOrStation);
    }
}
