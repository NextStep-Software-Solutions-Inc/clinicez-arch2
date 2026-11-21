using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Procedures.Commands;
using ClinicEz.Clinic.Application.Features.Procedures.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;
using ClinicEz.Shared.Common;

namespace ClinicEz.Clinic.Application.Features.Procedures.Queries;

public record GetProceduresQuery(
    Guid? PatientId = null,
    ProcedureStatus? Status = null,
    DateTime? Date = null
) : IRequest<List<ClinicalProcedureDto>>;

public class GetProceduresQueryHandler : IRequestHandler<GetProceduresQuery, List<ClinicalProcedureDto>>
{
    private readonly IRepository<Procedure> _procRepo;
    private readonly IClinicContext _clinicContext;

    public GetProceduresQueryHandler(
        IRepository<Procedure> procRepo,
        IClinicContext clinicContext)
    {
        _procRepo = procRepo;
        _clinicContext = clinicContext;
    }

    public async Task<List<ClinicalProcedureDto>> Handle(GetProceduresQuery request, CancellationToken cancellationToken)
    {
        var query = _procRepo.Query().AsNoTracking();

        if (request.PatientId.HasValue)
        {
            query = query.Where(p => p.PatientId == request.PatientId.Value);
        }

        if (request.Status.HasValue)
        {
            query = query.Where(p => p.Status == request.Status.Value);
        }

        if (request.Date.HasValue)
        {
            var dayStart = request.Date.Value.ToStartOfDayUtc();
            var dayEnd = request.Date.Value.ToEndOfDayExclusiveUtc();
            query = query.Where(p => p.ScheduledAt >= dayStart && p.ScheduledAt < dayEnd);
        }

        var items = await query
            .OrderByDescending(p => p.ScheduledAt)
            .ToListAsync(cancellationToken);

        return items.Select(p => OrderProcedureCommandHandler.MapToDto(p, _clinicContext.TenantId)).ToList();
    }
}
