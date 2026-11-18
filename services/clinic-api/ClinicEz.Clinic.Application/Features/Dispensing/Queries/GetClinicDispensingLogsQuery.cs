using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Dispensing.DTOs;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Dispensing.Queries;

public sealed record GetClinicDispensingLogsQuery(
    DateTime? StartDate = null,
    DateTime? EndDate = null,
    string? Source = null,
    bool? UnreviewedOnly = null,
    Guid? PatientId = null,
    Guid? QueueItemId = null,
    string? RosCategory = null,
    string? Search = null) : IRequest<IReadOnlyList<ClinicDispensingLogDto>>;

public sealed class GetClinicDispensingLogsQueryHandler : IRequestHandler<GetClinicDispensingLogsQuery, IReadOnlyList<ClinicDispensingLogDto>>
{
    private readonly IRepository<ClinicDispensingLog> _dispensingRepository;
    private readonly IClinicContext _clinicContext;
    private readonly IRepository<QueueItem>? _queueRepository;
    private readonly IRepository<PatientVitals>? _vitalsRepository;
    private readonly IRepository<ConsultationEncounter>? _consultationRepository;

    public GetClinicDispensingLogsQueryHandler(
        IRepository<ClinicDispensingLog> dispensingRepository,
        IClinicContext clinicContext,
        IRepository<QueueItem>? queueRepository = null,
        IRepository<PatientVitals>? vitalsRepository = null,
        IRepository<ConsultationEncounter>? consultationRepository = null)
    {
        _dispensingRepository = dispensingRepository;
        _clinicContext = clinicContext;
        _queueRepository = queueRepository;
        _vitalsRepository = vitalsRepository;
        _consultationRepository = consultationRepository;
    }

    public async Task<IReadOnlyList<ClinicDispensingLogDto>> Handle(GetClinicDispensingLogsQuery request, CancellationToken cancellationToken)
    {
        var query = _dispensingRepository
            .Query(d => d.ClinicId == _clinicContext.ClinicId && d.IsConsultationValidated)
            .AsNoTracking();

        if (request.StartDate.HasValue)
        {
            var start = request.StartDate.Value.ToStartOfDayUtc();
            query = query.Where(d => d.DispensedAt >= start);
        }

        if (request.EndDate.HasValue)
        {
            var end = request.EndDate.Value.ToEndOfDayExclusiveUtc();
            query = query.Where(d => d.DispensedAt < end);
        }

        if (!string.IsNullOrWhiteSpace(request.Source) &&
            Enum.TryParse<ClinicDispenseSource>(request.Source.Trim(), true, out var parsedSource))
        {
            query = query.Where(d => d.Source == parsedSource);
        }

        if (request.UnreviewedOnly == true)
        {
            query = query.Where(d => d.RequiresDoctorReview && d.ReviewedAt == null);
        }

        if (request.PatientId.HasValue)
        {
            query = query.Where(d => d.PatientId == request.PatientId.Value);
        }

        if (request.QueueItemId.HasValue)
        {
            query = query.Where(d => d.QueueItemId == request.QueueItemId.Value);
        }

        var parsedRos = RosCategoryHelper.ParseNullable(request.RosCategory);
        if (parsedRos.HasValue)
        {
            query = query.Where(d => d.RosCategory == parsedRos.Value);
        }

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var search = request.Search.Trim().ToLowerInvariant();
            query = query.Where(d =>
                d.PatientName.ToLower().Contains(search) ||
                d.ItemName.ToLower().Contains(search) ||
                d.DispensedByStaffName.ToLower().Contains(search));
        }

        var logs = await query
            .OrderByDescending(d => d.DispensedAt)
            .ToListAsync(cancellationToken);

        if (logs.Count == 0)
        {
            return Array.Empty<ClinicDispensingLogDto>();
        }

        if (_consultationRepository != null)
        {
            var consultationIds = logs
                .Where(d => d.ConsultationEncounterId.HasValue)
                .Select(d => d.ConsultationEncounterId!.Value)
                .Distinct()
                .ToList();

            if (consultationIds.Count > 0)
            {
                var signedIds = (await _consultationRepository
                    .Query(c => consultationIds.Contains(c.Id) && c.IsSigned)
                    .Select(c => c.Id)
                    .ToListAsync(cancellationToken))
                    .ToHashSet();

                logs = logs
                    .Where(d => !d.ConsultationEncounterId.HasValue || signedIds.Contains(d.ConsultationEncounterId.Value))
                    .ToList();
            }
        }

        var queueIds = logs.Select(d => d.QueueItemId).Distinct().ToList();
        var queueMap = new Dictionary<Guid, QueueItem>();
        var vitalsByQueueMap = new Dictionary<Guid, PatientVitals>();
        var vitalsByIdMap = new Dictionary<Guid, PatientVitals>();

        if (_queueRepository != null && queueIds.Count > 0)
        {
            var queueItems = await _queueRepository
                .Query(q => queueIds.Contains(q.Id))
                .AsNoTracking()
                .ToListAsync(cancellationToken);
            queueMap = queueItems.ToDictionary(q => q.Id);
        }

        if (_vitalsRepository != null && queueIds.Count > 0)
        {
            var vitalsIds = logs.Where(d => d.PatientVitalsId.HasValue).Select(d => d.PatientVitalsId!.Value).Distinct().ToList();
            var vitalsList = await _vitalsRepository
                .Query(v => (v.QueueItemId.HasValue && queueIds.Contains(v.QueueItemId.Value)) || vitalsIds.Contains(v.Id))
                .AsNoTracking()
                .ToListAsync(cancellationToken);

            foreach (var v in vitalsList)
            {
                vitalsByIdMap[v.Id] = v;
                if (v.QueueItemId.HasValue)
                {
                    vitalsByQueueMap[v.QueueItemId.Value] = v;
                }
            }
        }

        return logs.Select(log =>
        {
            queueMap.TryGetValue(log.QueueItemId, out var q);
            PatientVitals? v = null;
            if (log.PatientVitalsId.HasValue)
            {
                vitalsByIdMap.TryGetValue(log.PatientVitalsId.Value, out v);
            }
            if (v == null)
            {
                vitalsByQueueMap.TryGetValue(log.QueueItemId, out v);
            }

            return ClinicDispensingLogMapper.ToDto(log, q, v);
        }).ToList().AsReadOnly();
    }
}
