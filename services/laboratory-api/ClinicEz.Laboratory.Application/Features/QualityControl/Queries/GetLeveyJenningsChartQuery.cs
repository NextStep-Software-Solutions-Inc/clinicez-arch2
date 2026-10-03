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

public record GetLeveyJenningsChartQuery(Guid? LotId = null, string? AnalyteCode = null, string? Level = null) : IRequest<LeveyJenningsChartDto?>;

public class GetLeveyJenningsChartQueryHandler : IRequestHandler<GetLeveyJenningsChartQuery, LeveyJenningsChartDto?>
{
    private readonly IRepository<QcLot> _lotRepository;

    public GetLeveyJenningsChartQueryHandler(IRepository<QcLot> lotRepository)
    {
        _lotRepository = lotRepository;
    }

    public async Task<LeveyJenningsChartDto?> Handle(GetLeveyJenningsChartQuery request, CancellationToken cancellationToken)
    {
        var query = _lotRepository.Query().Include(l => l.Runs).AsNoTracking();

        QcLot? lot = null;
        if (request.LotId.HasValue)
        {
            lot = await query.FirstOrDefaultAsync(l => l.Id == request.LotId.Value, cancellationToken);
        }
        else if (!string.IsNullOrWhiteSpace(request.AnalyteCode))
        {
            var code = request.AnalyteCode.Trim().ToUpperInvariant();
            query = query.Where(l => l.AnalyteCode == code);

            if (!string.IsNullOrWhiteSpace(request.Level) && Enum.TryParse<Domain.Enums.ControlLevel>(request.Level, true, out var lvl))
            {
                query = query.Where(l => l.Level == lvl);
            }

            lot = await query.OrderByDescending(l => l.CreatedAt).FirstOrDefaultAsync(cancellationToken);
        }

        if (lot == null)
            return null;

        var mean = lot.TargetMean;
        var sd = lot.TargetStandardDeviation;

        var points = lot.Runs
            .OrderBy(r => r.RunAt)
            .Take(30)
            .Select(r => new LeveyJenningsPointDto
            {
                RunId = r.Id,
                RunAt = r.RunAt,
                MeasuredValue = r.MeasuredValue,
                ZScore = r.ZScore,
                Status = r.Status.ToString(),
                ViolationRules = r.ViolationRules
            })
            .ToList();

        return new LeveyJenningsChartDto
        {
            LotId = lot.Id,
            LotNumber = lot.LotNumber,
            ControlName = lot.ControlName,
            Level = lot.Level.ToString(),
            AnalyteCode = lot.AnalyteCode,
            TargetMean = mean,
            TargetSD = sd,
            Plus1SD = Math.Round(mean + sd, 2),
            Plus2SD = Math.Round(mean + (2 * sd), 2),
            Plus3SD = Math.Round(mean + (3 * sd), 2),
            Minus1SD = Math.Round(mean - sd, 2),
            Minus2SD = Math.Round(mean - (2 * sd), 2),
            Minus3SD = Math.Round(mean - (3 * sd), 2),
            Points = points
        };
    }
}
