using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.HealthScreenings.Common;
using ClinicEz.Clinic.Application.Features.HealthScreenings.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.HealthScreenings.Queries;

public sealed record GetPatientHealthScreeningsQuery(
    Guid? PatientId = null,
    Guid? QueueItemId = null) : IRequest<List<HealthScreeningDto>>;

public sealed class GetPatientHealthScreeningsQueryValidator : AbstractValidator<GetPatientHealthScreeningsQuery>
{
    public GetPatientHealthScreeningsQueryValidator()
    {
        RuleFor(x => x)
            .Must(x => (x.PatientId.HasValue && x.PatientId.Value != Guid.Empty) ||
                       (x.QueueItemId.HasValue && x.QueueItemId.Value != Guid.Empty))
            .WithMessage("Either PatientId or QueueItemId is required.");
    }
}

public sealed class GetPatientHealthScreeningsQueryHandler
    : IRequestHandler<GetPatientHealthScreeningsQuery, List<HealthScreeningDto>>
{
    private readonly IRepository<HealthScreening> _screeningRepo;
    private readonly IClinicContext _clinicContext;
    private readonly IRepository<QueueItem>? _queueRepo;
    private readonly IRepository<ServiceItem>? _serviceItemRepo;

    public GetPatientHealthScreeningsQueryHandler(
        IRepository<HealthScreening> screeningRepo,
        IClinicContext clinicContext,
        IRepository<QueueItem>? queueRepo = null,
        IRepository<ServiceItem>? serviceItemRepo = null)
    {
        _screeningRepo = screeningRepo;
        _clinicContext = clinicContext;
        _queueRepo = queueRepo;
        _serviceItemRepo = serviceItemRepo;
    }

    public async Task<List<HealthScreeningDto>> Handle(
        GetPatientHealthScreeningsQuery request,
        CancellationToken cancellationToken)
    {
        var query = _screeningRepo
            .Query(hs => hs.ClinicId == _clinicContext.ClinicId && !hs.IsDeleted)
            .AsNoTracking();

        if (request.PatientId.HasValue && request.PatientId.Value != Guid.Empty)
        {
            query = query.Where(hs => hs.PatientId == request.PatientId.Value);
        }

        if (request.QueueItemId.HasValue && request.QueueItemId.Value != Guid.Empty)
        {
            query = query.Where(hs => hs.QueueItemId == request.QueueItemId.Value);
        }

        var screenings = await query
            .OrderByDescending(hs => hs.ScreeningDateUtc)
            .ThenByDescending(hs => hs.CreatedAt)
            .ToListAsync(cancellationToken);

        if (screenings.Count == 0)
        {
            return new List<HealthScreeningDto>();
        }

        Dictionary<Guid, QueueItem> queueMap = new();
        if (_queueRepo != null)
        {
            var qIds = screenings.Select(s => s.QueueItemId).Distinct().ToList();
            var queues = await _queueRepo
                .Query(q => qIds.Contains(q.Id) && q.ClinicId == _clinicContext.ClinicId)
                .AsNoTracking()
                .ToListAsync(cancellationToken);
            queueMap = queues.ToDictionary(q => q.Id);
        }

        Dictionary<Guid, ServiceItem> serviceMap = new();
        if (_serviceItemRepo != null)
        {
            var sIds = screenings.Where(s => s.ServiceItemId.HasValue).Select(s => s.ServiceItemId!.Value).Distinct().ToList();
            if (sIds.Count > 0)
            {
                var services = await _serviceItemRepo
                    .Query(s => sIds.Contains(s.Id) && s.ClinicId == _clinicContext.ClinicId)
                    .AsNoTracking()
                    .ToListAsync(cancellationToken);
                serviceMap = services.ToDictionary(s => s.Id);
            }
        }

        return screenings.Select(s =>
        {
            queueMap.TryGetValue(s.QueueItemId, out var q);
            ServiceItem? svc = null;
            if (s.ServiceItemId.HasValue)
            {
                serviceMap.TryGetValue(s.ServiceItemId.Value, out svc);
            }
            return HealthScreeningHelper.ToDto(s, q, svc);
        }).ToList();
    }
}
