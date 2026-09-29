using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
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

    public RecordAnalyteResultCommandHandler(
        IRepository<LabRequisition> requisitionRepository,
        IUnitOfWork unitOfWork)
    {
        _requisitionRepository = requisitionRepository;
        _unitOfWork = unitOfWork;
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

        var entryTime = DateTime.UtcNow;

        foreach (var item in request.Results)
        {
            var code = item.AnalyteCode.Trim().ToUpperInvariant();
            var spec = Array.Find(ReferenceRangeEvaluator.Catalog, c => string.Equals(c.AnalyteCode, code, StringComparison.OrdinalIgnoreCase));

            var panelName = !string.IsNullOrWhiteSpace(item.PanelName) ? item.PanelName : (spec?.PanelName ?? "General");
            var analyteName = !string.IsNullOrWhiteSpace(item.AnalyteName) ? item.AnalyteName : (spec?.AnalyteName ?? code);
            var unit = !string.IsNullOrWhiteSpace(item.Unit) ? item.Unit : (spec?.Unit ?? string.Empty);
            var refInterval = spec?.ReferenceInterval ?? string.Empty;

            var (flag, alertNote) = ReferenceRangeEvaluator.Evaluate(code, item.Value, requisition.PatientGender);
            var finalInterpretation = !string.IsNullOrWhiteSpace(item.Interpretation) ? item.Interpretation : alertNote;

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
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Requisitions.Queries.GetWorklistQueryHandler.MapToDto(requisition);
    }
}
