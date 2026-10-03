using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Features.Requisitions.DTOs;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Laboratory.Application.Features.Reports.Queries;

public record GetPanicAlertsQuery(int Take = 50) : IRequest<List<CriticalPanicDispatchLogDto>>;

public class GetPanicAlertsQueryHandler : IRequestHandler<GetPanicAlertsQuery, List<CriticalPanicDispatchLogDto>>
{
    private readonly IRepository<CriticalPanicDispatchLog> _panicLogRepository;

    public GetPanicAlertsQueryHandler(IRepository<CriticalPanicDispatchLog> panicLogRepository)
    {
        _panicLogRepository = panicLogRepository;
    }

    public async Task<List<CriticalPanicDispatchLogDto>> Handle(GetPanicAlertsQuery request, CancellationToken cancellationToken)
    {
        var logs = await _panicLogRepository.Query()
            .OrderByDescending(l => l.DispatchedAt)
            .Take(request.Take)
            .AsNoTracking()
            .ToListAsync(cancellationToken);

        return logs.Select(log => new CriticalPanicDispatchLogDto
        {
            Id = log.Id,
            RequisitionId = log.RequisitionId,
            AccessionNumber = log.AccessionNumber,
            PatientId = log.PatientId,
            PatientName = log.PatientName,
            OrderingDoctorName = log.OrderingDoctorName,
            OrderingFacilityName = log.OrderingFacilityName,
            CriticalFindings = log.CriticalFindings,
            DispatchedAt = log.DispatchedAt,
            DispatchedByMedTechName = log.DispatchedByMedTechName,
            NotifiedDoctorName = log.NotifiedDoctorName,
            NotificationMethod = log.NotificationMethod.ToString(),
            ReadbackConfirmed = log.ReadbackConfirmed,
            ReadbackNotes = log.ReadbackNotes,
            AcknowledgedAt = log.AcknowledgedAt
        }).ToList();
    }
}
