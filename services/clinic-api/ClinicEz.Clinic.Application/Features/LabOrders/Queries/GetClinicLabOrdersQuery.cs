using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.LabOrders.Commands;
using ClinicEz.Clinic.Application.Features.LabOrders.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;
using ClinicEz.Shared.Common;

namespace ClinicEz.Clinic.Application.Features.LabOrders.Queries;

public record GetClinicLabOrdersQuery(
    Guid? PatientId = null,
    LabOrderStatus? Status = null,
    DateTime? Date = null
) : IRequest<List<ClinicLabOrderDto>>;

public class GetClinicLabOrdersQueryHandler : IRequestHandler<GetClinicLabOrdersQuery, List<ClinicLabOrderDto>>
{
    private readonly IRepository<ClinicLabOrder> _orderRepo;
    private readonly IRepository<ClinicLabResult> _resultRepo;
    private readonly IClinicContext _clinicContext;

    public GetClinicLabOrdersQueryHandler(
        IRepository<ClinicLabOrder> orderRepo,
        IRepository<ClinicLabResult> resultRepo,
        IClinicContext clinicContext)
    {
        _orderRepo = orderRepo;
        _resultRepo = resultRepo;
        _clinicContext = clinicContext;
    }

    public async Task<List<ClinicLabOrderDto>> Handle(GetClinicLabOrdersQuery request, CancellationToken cancellationToken)
    {
        var query = _orderRepo.Query()
            .Include(o => o.Items)
            .AsNoTracking();

        if (request.PatientId.HasValue)
        {
            query = query.Where(o => o.PatientId == request.PatientId.Value);
        }

        if (request.Status.HasValue)
        {
            query = query.Where(o => o.Status == request.Status.Value);
        }

        if (request.Date.HasValue)
        {
            var dayStart = request.Date.Value.ToStartOfDayUtc();
            var dayEnd = request.Date.Value.ToEndOfDayExclusiveUtc();
            query = query.Where(o => o.OrderDate >= dayStart && o.OrderDate < dayEnd);
        }

        var orders = await query
            .OrderByDescending(o => o.OrderDate)
            .ToListAsync(cancellationToken);

        var orderIds = orders.Select(o => o.Id).ToList();
        var results = (await _resultRepo.Query(r => orderIds.Contains(r.LabOrderId))
                .AsNoTracking()
                .OrderBy(r => r.SubmittedAt)
                .ToListAsync(cancellationToken))
            .ToLookup(r => r.LabOrderId);

        return orders.Select(o => CreateClinicLabOrderCommandHandler.MapToDto(o, results[o.Id])).ToList();
    }
}

