using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Features.Requisitions.DTOs;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Laboratory.Domain.Services;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Laboratory.Application.Features.QualityControl.Commands;

public record RecordQcRunCommand(
    Guid QcLotId,
    double MeasuredValue,
    string MedTechName,
    DateTime? RunAt = null,
    double? PeerLevelZScore = null,
    string? Notes = null
) : IRequest<QcRunDto>;

public class RecordQcRunCommandHandler : IRequestHandler<RecordQcRunCommand, QcRunDto>
{
    private readonly IRepository<QcLot> _lotRepository;
    private readonly IRepository<QcRun> _runRepository;
    private readonly IUnitOfWork _unitOfWork;

    public RecordQcRunCommandHandler(
        IRepository<QcLot> lotRepository,
        IRepository<QcRun> runRepository,
        IUnitOfWork unitOfWork)
    {
        _lotRepository = lotRepository;
        _runRepository = runRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task<QcRunDto> Handle(RecordQcRunCommand request, CancellationToken cancellationToken)
    {
        var lot = await _lotRepository.Query()
            .Include(l => l.Runs)
            .FirstOrDefaultAsync(l => l.Id == request.QcLotId, cancellationToken);

        if (lot == null)
        {
            throw new KeyNotFoundException($"QC Lot with ID {request.QcLotId} not found.");
        }

        // Get past historical Z-scores sorted most recent first
        var recentZScores = lot.Runs
            .OrderByDescending(r => r.RunAt)
            .Take(10)
            .Select(r => r.ZScore)
            .ToList();

        // Evaluate Westgard rules
        var evaluation = WestgardRuleEvaluator.Evaluate(
            request.MeasuredValue,
            lot.TargetMean,
            lot.TargetStandardDeviation,
            recentZScores,
            request.PeerLevelZScore
        );

        var run = new QcRun
        {
            TenantId = lot.TenantId,
            QcLotId = lot.Id,
            AnalyteCode = lot.AnalyteCode,
            MeasuredValue = request.MeasuredValue,
            ZScore = Math.Round(evaluation.ZScore, 2),
            RunAt = request.RunAt ?? DateTime.UtcNow,
            RunByMedTechName = request.MedTechName,
            Status = evaluation.Status,
            ViolationRules = string.Join(", ", evaluation.ViolatedRules),
            CorrectiveAction = evaluation.RecommendedAction,
            Notes = request.Notes
        };

        await _runRepository.AddAsync(run, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return new QcRunDto
        {
            Id = run.Id,
            QcLotId = run.QcLotId,
            AnalyteCode = run.AnalyteCode,
            MeasuredValue = run.MeasuredValue,
            ZScore = run.ZScore,
            RunAt = run.RunAt,
            RunByMedTechName = run.RunByMedTechName,
            Status = run.Status.ToString(),
            ViolationRules = run.ViolationRules,
            CorrectiveAction = run.CorrectiveAction,
            Notes = run.Notes
        };
    }
}
