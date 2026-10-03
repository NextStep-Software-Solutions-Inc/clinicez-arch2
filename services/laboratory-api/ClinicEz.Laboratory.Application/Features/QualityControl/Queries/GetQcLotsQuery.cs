using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Features.Requisitions.DTOs;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Laboratory.Application.Features.QualityControl.Queries;

public record GetQcLotsQuery(string? AnalyteCode = null, bool? ActiveOnly = true) : IRequest<List<QcLotDto>>;

public class GetQcLotsQueryHandler : IRequestHandler<GetQcLotsQuery, List<QcLotDto>>
{
    private readonly IRepository<QcLot> _lotRepository;

    public GetQcLotsQueryHandler(IRepository<QcLot> lotRepository)
    {
        _lotRepository = lotRepository;
    }

    public async Task<List<QcLotDto>> Handle(GetQcLotsQuery request, CancellationToken cancellationToken)
    {
        var query = _lotRepository.Query().AsNoTracking();

        if (request.ActiveOnly == true)
        {
            query = query.Where(l => l.IsActive);
        }

        if (!string.IsNullOrWhiteSpace(request.AnalyteCode))
        {
            var code = request.AnalyteCode.Trim().ToUpperInvariant();
            query = query.Where(l => l.AnalyteCode == code);
        }

        var lots = await query.OrderBy(l => l.AnalyteCode).ThenBy(l => l.Level).ToListAsync(cancellationToken);
        var now = DateTime.UtcNow;

        return lots.Select(lot =>
        {
            var openExpiry = lot.GetOpenVialExpirationDate();
            var isExp = lot.IsExpired(now);
            int? daysRem = null;
            if (openExpiry.HasValue)
            {
                daysRem = Math.Max(0, (int)(openExpiry.Value - now).TotalDays);
            }

            return new QcLotDto
            {
                Id = lot.Id,
                TenantId = lot.TenantId,
                LotNumber = lot.LotNumber,
                ControlName = lot.ControlName,
                Level = lot.Level.ToString(),
                AnalyteCode = lot.AnalyteCode,
                InstrumentName = lot.InstrumentName,
                TargetMean = lot.TargetMean,
                TargetStandardDeviation = lot.TargetStandardDeviation,
                ManufacturerExpirationDate = lot.ManufacturerExpirationDate,
                OpenVialDate = lot.OpenVialDate,
                OpenVialStabilityDays = lot.OpenVialStabilityDays,
                OpenVialExpirationDate = openExpiry,
                IsExpired = isExp,
                DaysRemaining = daysRem,
                IsActive = lot.IsActive
            };
        }).ToList();
    }
}
