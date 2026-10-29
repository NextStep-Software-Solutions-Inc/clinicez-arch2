using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Helpers;
using ClinicEz.Clinic.Application.Features.Queue.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Workspace;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Queue.Queries;

public sealed record GetQueueQuery(
    DateOnly? Date = null,
    QueueStatus? Status = null,
    Guid? DoctorId = null,
    string? RoomOrStation = null,
    string? View = null, // "All", "MyRoom", "WaitingForDoctor", "Triage", "PendingProcedure"
    Guid? RoomId = null
) : IRequest<IReadOnlyList<QueueItemDto>>;

public sealed class GetQueueQueryHandler : IRequestHandler<GetQueueQuery, IReadOnlyList<QueueItemDto>>
{
    private readonly IRepository<QueueItem> _queueRepository;
    private readonly IClinicContext _clinicContext;
    private readonly IWorkspaceProfileProvider? _workspaceProfiles;
    private readonly IRepository<FacilitySettings>? _settingsRepository;

    public GetQueueQueryHandler(
        IRepository<QueueItem> queueRepository,
        IClinicContext clinicContext,
        IWorkspaceProfileProvider? workspaceProfiles = null,
        IRepository<FacilitySettings>? settingsRepository = null)
    {
        _queueRepository = queueRepository;
        _clinicContext = clinicContext;
        _workspaceProfiles = workspaceProfiles;
        _settingsRepository = settingsRepository;
    }

    public async Task<IReadOnlyList<QueueItemDto>> Handle(GetQueueQuery request, CancellationToken cancellationToken)
    {
        var targetDate = request.Date
            ?? await ClinicTimeZoneResolver.ResolveTodayAsync(_workspaceProfiles, _clinicContext.TenantId, cancellationToken, _settingsRepository);

        var query = _queueRepository.Query(q => 
            q.ClinicId == _clinicContext.ClinicId && 
            q.QueueDate == targetDate)
            .Include(q => q.PatientVitals)
            .AsQueryable();

        // Specific Doctor Filter
        if (request.DoctorId.HasValue)
        {
            query = query.Where(q => q.DoctorId == request.DoctorId.Value);
        }

        // Specific Room/Station Filter
        if (request.RoomId.HasValue && !string.IsNullOrWhiteSpace(request.RoomOrStation))
        {
            var roomId = request.RoomId.Value;
            var room = request.RoomOrStation.Trim();
            query = query.Where(q => q.RoomId == roomId || q.RoomOrStation == room);
        }
        else if (request.RoomId.HasValue)
        {
            var roomId = request.RoomId.Value;
            query = query.Where(q => q.RoomId == roomId);
        }
        else if (!string.IsNullOrWhiteSpace(request.RoomOrStation))
        {
            var room = request.RoomOrStation.Trim();
            query = query.Where(q => q.RoomOrStation == room);
        }

        // Explicit Status or View Filter
        if (request.Status.HasValue)
        {
            if (request.Status.Value == QueueStatus.Completed)
            {
                query = query.Where(q => q.Status == QueueStatus.Completed || q.Status == QueueStatus.DischargedNonDoctor);
            }
            else
            {
                query = query.Where(q => q.Status == request.Status.Value);
            }
        }
        else if (!string.IsNullOrWhiteSpace(request.View))
        {
            var view = request.View.Trim();
            if (view.Equals("MyRoom", StringComparison.OrdinalIgnoreCase))
            {
                // Items assigned to the clinician or room that are actively in workflow (exclude cancelled, no-show, completed, discharged non-doctor, and diverted)
                query = query.Where(q => q.Status != QueueStatus.Cancelled &&
                                         q.Status != QueueStatus.NoShow &&
                                         q.Status != QueueStatus.Completed &&
                                         q.Status != QueueStatus.DischargedNonDoctor &&
                                         q.Status != QueueStatus.Diverted);
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
            else if (view.Equals("Completed", StringComparison.OrdinalIgnoreCase))
            {
                // Patients whose encounters are completed (including non-doctor discharges)
                query = query.Where(q => q.Status == QueueStatus.Completed || q.Status == QueueStatus.DischargedNonDoctor);
            }
            else if (view.Equals("All", StringComparison.OrdinalIgnoreCase))
            {
                // All items including completed
            }
        }
        else
        {
            // Default: show active queue (not cancelled, no-show, completed, discharged non-doctor, or diverted)
            query = query.Where(q => q.Status != QueueStatus.Cancelled &&
                                     q.Status != QueueStatus.NoShow &&
                                     q.Status != QueueStatus.Completed &&
                                     q.Status != QueueStatus.DischargedNonDoctor &&
                                     q.Status != QueueStatus.Diverted);
        }

        var items = await query
            .OrderByDescending(q => q.Priority) // Emergency -> Urgent -> Routine
            .ThenBy(q => q.SequenceNumber)
            .ToListAsync(cancellationToken);

        return items.Select(item => item.ToDto()).ToList();
    }
}

public sealed record QueueMetricsDto(
    int InQueue,
    int UrgentTriage,
    int CompletedToday,
    int TotalCheckedIn,
    double AverageWaitTimeMinutes = 0);

public sealed record GetQueueMetricsQuery(DateOnly? Date = null) : IRequest<QueueMetricsDto>;

public sealed class GetQueueMetricsQueryHandler : IRequestHandler<GetQueueMetricsQuery, QueueMetricsDto>
{
    private readonly IRepository<QueueItem> _queueRepository;
    private readonly IClinicContext _clinicContext;
    private readonly IWorkspaceProfileProvider? _workspaceProfiles;
    private readonly IRepository<FacilitySettings>? _settingsRepository;

    public GetQueueMetricsQueryHandler(
        IRepository<QueueItem> queueRepository,
        IClinicContext clinicContext,
        IWorkspaceProfileProvider? workspaceProfiles = null,
        IRepository<FacilitySettings>? settingsRepository = null)
    {
        _queueRepository = queueRepository;
        _clinicContext = clinicContext;
        _workspaceProfiles = workspaceProfiles;
        _settingsRepository = settingsRepository;
    }

    public async Task<QueueMetricsDto> Handle(GetQueueMetricsQuery request, CancellationToken cancellationToken)
    {
        var targetDate = request.Date
            ?? await ClinicTimeZoneResolver.ResolveTodayAsync(_workspaceProfiles, _clinicContext.TenantId, cancellationToken, _settingsRepository);

        var items = await _queueRepository.Query(q => 
            q.ClinicId == _clinicContext.ClinicId && 
            q.QueueDate == targetDate)
            .ToListAsync(cancellationToken);

        var inQueue = items.Count(q => q.Status == QueueStatus.Waiting || 
                                       q.Status == QueueStatus.Triaged || 
                                       q.Status == QueueStatus.InConsultation ||
                                       q.Status == QueueStatus.PendingProcedure ||
                                       q.Status == QueueStatus.ReEvaluation ||
                                       q.Status == QueueStatus.OnHold);
        var urgentTriage = items.Count(q => (q.Priority == QueuePriority.Urgent || q.Priority == QueuePriority.Emergency) && q.Status == QueueStatus.Waiting);
        var completedToday = items.Count(q => q.Status == QueueStatus.Completed);
        var total = items.Count;

        // Strictly exclude Cancelled and NoShow tickets from the average wait calculation
        var waitTimes = items
            .Where(q => q.Status != QueueStatus.Cancelled && 
                        q.Status != QueueStatus.NoShow && 
                        q.CalledTime.HasValue && 
                        q.CalledTime.Value >= q.CheckInTime)
            .Select(q => (q.CalledTime!.Value - q.CheckInTime).TotalMinutes)
            .ToList();

        var avgWait = waitTimes.Any() ? Math.Round(waitTimes.Average(), 1) : 0;

        return new QueueMetricsDto(inQueue, urgentTriage, completedToday, total, avgWait);
    }
}

