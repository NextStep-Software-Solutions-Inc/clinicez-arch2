using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Dispensing.DTOs;
using ClinicEz.Clinic.Application.Features.Triage.Commands;
using ClinicEz.Clinic.Application.Features.Triage.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Triage.Queries;

public sealed record GetTriageVitalsQuery(Guid QueueItemId) : IRequest<TriageVitalsDto?>;

public sealed class GetTriageVitalsQueryHandler : IRequestHandler<GetTriageVitalsQuery, TriageVitalsDto?>
{
    private readonly IRepository<PatientVitals> _vitalsRepository;
    private readonly IClinicContext _clinicContext;
    private readonly IRepository<QueueItem>? _queueRepository;
    private readonly IRepository<ClinicDispensingLog>? _dispensingLogRepository;

    public GetTriageVitalsQueryHandler(
        IRepository<PatientVitals> vitalsRepository,
        IClinicContext clinicContext,
        IRepository<QueueItem>? queueRepository = null,
        IRepository<ClinicDispensingLog>? dispensingLogRepository = null)
    {
        _vitalsRepository = vitalsRepository;
        _clinicContext = clinicContext;
        _queueRepository = queueRepository;
        _dispensingLogRepository = dispensingLogRepository;
    }

    public async Task<TriageVitalsDto?> Handle(GetTriageVitalsQuery request, CancellationToken cancellationToken)
    {
        var vitals = await _vitalsRepository.Query(v => 
            v.QueueItemId == request.QueueItemId && 
            v.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        if (vitals == null) return null;

        QueueItem? queueItem = null;
        if (_queueRepository != null)
        {
            queueItem = await _queueRepository
                .Query(q => q.Id == request.QueueItemId && q.ClinicId == _clinicContext.ClinicId)
                .AsNoTracking()
                .FirstOrDefaultAsync(cancellationToken);
        }

        IReadOnlyList<ClinicDispensingLogDto>? dispensedItems = null;
        if (_dispensingLogRepository != null)
        {
            var logs = await _dispensingLogRepository
                .Query(d => d.ClinicId == _clinicContext.ClinicId &&
                            d.QueueItemId == request.QueueItemId &&
                            d.Source == ClinicDispenseSource.NurseVitalsCheck)
                .OrderBy(d => d.DispensedAt)
                .AsNoTracking()
                .ToListAsync(cancellationToken);

            dispensedItems = logs
                .Select(l => ClinicDispensingLogMapper.ToDto(l, queueItem, vitals))
                .ToList()
                .AsReadOnly();
        }

        return RecordTriageVitalsCommandHandler.MapToDto(vitals, queueItem, dispensedItems);
    }
}
