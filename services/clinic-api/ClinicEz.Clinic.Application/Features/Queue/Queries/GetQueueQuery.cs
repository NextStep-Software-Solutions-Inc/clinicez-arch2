using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Queue.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Queue.Queries;

public sealed record GetQueueQuery(DateOnly? Date = null, QueueStatus? Status = null) : IRequest<IReadOnlyList<QueueItemDto>>;

public sealed class GetQueueQueryHandler : IRequestHandler<GetQueueQuery, IReadOnlyList<QueueItemDto>>
{
    private readonly IRepository<QueueItem> _queueRepository;
    private readonly IClinicContext _clinicContext;

    public GetQueueQueryHandler(
        IRepository<QueueItem> queueRepository,
        IClinicContext clinicContext)
    {
        _queueRepository = queueRepository;
        _clinicContext = clinicContext;
    }

    public async Task<IReadOnlyList<QueueItemDto>> Handle(GetQueueQuery request, CancellationToken cancellationToken)
    {
        var targetDate = request.Date ?? DateOnly.FromDateTime(DateTime.UtcNow);

        var query = _queueRepository.Query(q => 
            q.ClinicId == _clinicContext.ClinicId && 
            q.QueueDate == targetDate)
            .Include(q => q.TriageVitals)
            .AsQueryable();

        if (request.Status.HasValue)
        {
            query = query.Where(q => q.Status == request.Status.Value);
        }
        else
        {
            // Default: show active queue (not cancelled or completed, unless requested)
            query = query.Where(q => q.Status != QueueStatus.Cancelled && q.Status != QueueStatus.NoShow);
        }

        var items = await query
            .OrderByDescending(q => q.Priority) // Emergency -> Urgent -> Routine
            .ThenBy(q => q.SequenceNumber)
            .ToListAsync(cancellationToken);

        return items.Select(item =>
        {
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
                vitalsSummary);
        }).ToList();
    }
}

public sealed record GetQueueMetricsQuery(DateOnly? Date = null) : IRequest<QueueMetricsDto>;

public sealed class GetQueueMetricsQueryHandler : IRequestHandler<GetQueueMetricsQuery, QueueMetricsDto>
{
    private readonly IRepository<QueueItem> _queueRepository;
    private readonly IClinicContext _clinicContext;

    public GetQueueMetricsQueryHandler(
        IRepository<QueueItem> queueRepository,
        IClinicContext clinicContext)
    {
        _queueRepository = queueRepository;
        _clinicContext = clinicContext;
    }

    public async Task<QueueMetricsDto> Handle(GetQueueMetricsQuery request, CancellationToken cancellationToken)
    {
        var targetDate = request.Date ?? DateOnly.FromDateTime(DateTime.UtcNow);

        var items = await _queueRepository.Query(q => 
            q.ClinicId == _clinicContext.ClinicId && 
            q.QueueDate == targetDate)
            .ToListAsync(cancellationToken);

        var inQueue = items.Count(q => q.Status == QueueStatus.Waiting || q.Status == QueueStatus.Triaged || q.Status == QueueStatus.InConsultation);
        var urgentTriage = items.Count(q => (q.Priority == QueuePriority.Urgent || q.Priority == QueuePriority.Emergency) && q.Status == QueueStatus.Waiting);
        var completedToday = items.Count(q => q.Status == QueueStatus.Completed);
        var total = items.Count;

        return new QueueMetricsDto(inQueue, urgentTriage, completedToday, total);
    }
}
