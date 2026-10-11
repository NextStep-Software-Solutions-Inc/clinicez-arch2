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

public sealed record GetQueueQuery(
    DateOnly? Date = null,
    QueueStatus? Status = null,
    Guid? DoctorId = null,
    string? RoomOrStation = null,
    string? View = null // "All", "MyRoom", "WaitingForDoctor", "Triage", "PendingProcedure"
) : IRequest<IReadOnlyList<QueueItemDto>>;

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

        // Specific Doctor Filter
        if (request.DoctorId.HasValue)
        {
            query = query.Where(q => q.DoctorId == request.DoctorId.Value);
        }

        // Specific Room/Station Filter
        if (!string.IsNullOrWhiteSpace(request.RoomOrStation))
        {
            var room = request.RoomOrStation.Trim();
            query = query.Where(q => q.RoomOrStation == room);
        }

        // Explicit Status or View Filter
        if (request.Status.HasValue)
        {
            query = query.Where(q => q.Status == request.Status.Value);
        }
        else if (!string.IsNullOrWhiteSpace(request.View))
        {
            var view = request.View.Trim();
            if (view.Equals("MyRoom", StringComparison.OrdinalIgnoreCase))
            {
                // Items assigned to the clinician or room that are actively in workflow
                query = query.Where(q => q.Status != QueueStatus.Cancelled && q.Status != QueueStatus.NoShow);
            }
            else if (view.Equals("WaitingForDoctor", StringComparison.OrdinalIgnoreCase))
            {
                // Triaged patients ready for first consult OR patients returned from procedures for re-evaluation
                query = query.Where(q => q.Status == QueueStatus.Triaged || q.Status == QueueStatus.ReEvaluation);
            }
            else if (view.Equals("Triage", StringComparison.OrdinalIgnoreCase))
            {
                // Patients waiting for initial triage
                query = query.Where(q => q.Status == QueueStatus.Waiting);
            }
            else if (view.Equals("PendingProcedure", StringComparison.OrdinalIgnoreCase))
            {
                // Patients ordered for in-clinic procedures
                query = query.Where(q => q.Status == QueueStatus.PendingProcedure);
            }
            else if (view.Equals("All", StringComparison.OrdinalIgnoreCase))
            {
                // All items including completed
            }
        }
        else
        {
            // Default: show active queue (not cancelled or no-show)
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
                vitalsSummary,
                item.RoomOrStation);
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

        var inQueue = items.Count(q => q.Status == QueueStatus.Waiting || 
                                       q.Status == QueueStatus.Triaged || 
                                       q.Status == QueueStatus.InConsultation ||
                                       q.Status == QueueStatus.PendingProcedure ||
                                       q.Status == QueueStatus.ReEvaluation);
        var urgentTriage = items.Count(q => (q.Priority == QueuePriority.Urgent || q.Priority == QueuePriority.Emergency) && q.Status == QueueStatus.Waiting);
        var completedToday = items.Count(q => q.Status == QueueStatus.Completed);
        var total = items.Count;

        return new QueueMetricsDto(inQueue, urgentTriage, completedToday, total);
    }
}
