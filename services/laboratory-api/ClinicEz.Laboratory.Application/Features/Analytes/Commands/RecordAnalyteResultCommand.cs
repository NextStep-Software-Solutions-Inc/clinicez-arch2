using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Common;
using ClinicEz.Laboratory.Application.Common.Interfaces;
using ClinicEz.Laboratory.Application.Features.Requisitions.DTOs;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Laboratory.Domain.Services;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Laboratory.Application.Features.Analytes.Commands;

public record AnalyteResultInput
{
    public string PanelName { get; init; } = "Clinical Chemistry";
    public required string AnalyteCode { get; init; }
    public string? AnalyteName { get; init; }
    public required string Value { get; init; }
    public string? Unit { get; init; }
    public string? Interpretation { get; init; }
}

public record RecordAnalyteResultCommand(
    Guid RequisitionId,
    string MedTechName,
    List<AnalyteResultInput> Results
) : IRequest<LabRequisitionDto>;

public class RecordAnalyteResultCommandHandler : IRequestHandler<RecordAnalyteResultCommand, LabRequisitionDto>
{
    private readonly IRepository<LabRequisition> _requisitionRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILabOrderLifecycle _lifecycle;

    public RecordAnalyteResultCommandHandler(
        IRepository<LabRequisition> requisitionRepository,
        IUnitOfWork unitOfWork,
        ILabOrderLifecycle lifecycle)
    {
        _requisitionRepository = requisitionRepository;
        _unitOfWork = unitOfWork;
        _lifecycle = lifecycle;
    }

    public async Task<LabRequisitionDto> Handle(RecordAnalyteResultCommand request, CancellationToken cancellationToken)
    {
        var requisition = await _requisitionRepository.Query()
            .Include(r => r.Specimens)
            .Include(r => r.AnalyteResults)
            .Include(r => r.DiagnosticReport)
            .FirstOrDefaultAsync(r => r.Id == request.RequisitionId, cancellationToken);

        if (requisition == null)
        {
            throw new KeyNotFoundException($"Requisition with ID {request.RequisitionId} not found.");
        }

        // A prepaid order cannot be processed until the cashier has confirmed payment.
        OrderWorkGate.EnsureCanWork(requisition);

        var entryTime = DateTime.UtcNow;

        // Fetch patient's previous analyte results for Delta Check evaluation
        var previousRequisitions = await _requisitionRepository.Query()
            .Where(r => r.PatientId == requisition.PatientId && r.Id != requisition.Id)
            .OrderByDescending(r => r.CreatedAt)
            .Include(r => r.AnalyteResults)
            .Take(5)
            .AsNoTracking()
            .ToListAsync(cancellationToken);

        var previousResultsMap = previousRequisitions
            .SelectMany(r => r.AnalyteResults)
            .GroupBy(a => a.AnalyteCode.ToUpperInvariant())
            .ToDictionary(
                g => g.Key,
                g => g.OrderByDescending(x => x.EnteredAt).First()
            );

        foreach (var item in request.Results)
        {
            var code = item.AnalyteCode.Trim().ToUpperInvariant();
            var spec = Array.Find(ReferenceRangeEvaluator.Catalog, c => string.Equals(c.AnalyteCode, code, StringComparison.OrdinalIgnoreCase));

            var panelName = !string.IsNullOrWhiteSpace(item.PanelName) ? item.PanelName : (spec?.PanelName ?? "General");
            var analyteName = !string.IsNullOrWhiteSpace(item.AnalyteName) ? item.AnalyteName : (spec?.AnalyteName ?? code);
            var unit = !string.IsNullOrWhiteSpace(item.Unit) ? item.Unit : (spec?.Unit ?? string.Empty);
            var refInterval = spec?.ReferenceInterval ?? string.Empty;

            var (flag, alertNote) = ReferenceRangeEvaluator.Evaluate(code, item.Value, requisition.PatientGender, requisition.PatientAge);
            var finalInterpretation = !string.IsNullOrWhiteSpace(item.Interpretation) ? item.Interpretation : alertNote;

            // Delta Check Evaluation against historical patient encounter
            if (previousResultsMap.TryGetValue(code, out var priorResult))
            {
                var delta = DeltaCheckEvaluator.Evaluate(code, item.Value, priorResult.Value, priorResult.EnteredAt, entryTime);
                if (delta != null && delta.IsAlert)
                {
                    finalInterpretation = string.IsNullOrWhiteSpace(finalInterpretation)
                        ? delta.AlertMessage
                        : $"{finalInterpretation} | {delta.AlertMessage}";
                }
            }

            var existing = requisition.AnalyteResults.FirstOrDefault(a => string.Equals(a.AnalyteCode, code, StringComparison.OrdinalIgnoreCase));
            if (existing != null)
            {
                existing.Value = item.Value;
                existing.Unit = unit;
                existing.ReferenceInterval = refInterval;
                existing.Flag = flag;
                existing.Interpretation = finalInterpretation;
                existing.EnteredByMedTechName = request.MedTechName;
                existing.EnteredAt = entryTime;
            }
            else
            {
                requisition.AnalyteResults.Add(new AnalyteResult
                {
                    LabRequisitionId = requisition.Id,
                    PanelName = panelName,
                    AnalyteCode = code,
                    AnalyteName = analyteName,
                    Value = item.Value,
                    Unit = unit,
                    ReferenceInterval = refInterval,
                    Flag = flag,
                    Interpretation = finalInterpretation,
                    EnteredByMedTechName = request.MedTechName,
                    EnteredAt = entryTime
                });
            }
        }

        if (requisition.Status == RequisitionStatus.PendingAccession || requisition.Status == RequisitionStatus.SpecimenCollected)
        {
            requisition.Status = RequisitionStatus.InTesting;
        }

        _requisitionRepository.Update(requisition);
        await _lifecycle.TransitionAsync(requisition, RequisitionStage.InProcess, null, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Requisitions.Queries.GetWorklistQueryHandler.MapToDto(requisition);
    }
}
