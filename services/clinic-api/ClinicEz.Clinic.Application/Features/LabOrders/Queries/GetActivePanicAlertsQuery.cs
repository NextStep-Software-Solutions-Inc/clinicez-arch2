using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.LabOrders.Commands;
using ClinicEz.Clinic.Application.Features.LabOrders.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.LabOrders.Queries;

public record GetActivePanicAlertsQuery : IRequest<List<ClinicLabOrderDto>>;

public class GetActivePanicAlertsQueryHandler : IRequestHandler<GetActivePanicAlertsQuery, List<ClinicLabOrderDto>>
{
    private readonly IRepository<ClinicLabOrder> _orderRepo;

    public GetActivePanicAlertsQueryHandler(IRepository<ClinicLabOrder> orderRepo)
    {
        _orderRepo = orderRepo;
    }

    public async Task<List<ClinicLabOrderDto>> Handle(GetActivePanicAlertsQuery request, CancellationToken cancellationToken)
    {
        var orders = await _orderRepo.Query(o => o.HasCriticalPanicAlert && o.PanicAcknowledgedAt == null)
            .Include(o => o.Items)
            .OrderByDescending(o => o.PanicAlertTriggeredAt)
            .AsNoTracking()
            .ToListAsync(cancellationToken);

        return orders.Select(o => CreateClinicLabOrderCommandHandler.MapToDto(o)).ToList();
    }
}
