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

public record IngestAnalyzerFeedResultDto
{
    public required string Protocol { get; init; }
    public required string AnalyzerId { get; init; }
    public required string AccessionNumber { get; init; }
    public int IngestedCount { get; init; }
    public bool HasDeltaCheckAlerts { get; init; }
    public bool HasCriticalFlags { get; init; }
    public LabRequisitionDto? Requisition { get; init; }
}

public record IngestAnalyzerFeedCommand(
    string RawPayload,
    string? ProtocolHint = null,
    string? MedTechName = null
) : IRequest<IngestAnalyzerFeedResultDto>;

public class IngestAnalyzerFeedCommandHandler : IRequestHandler<IngestAnalyzerFeedCommand, IngestAnalyzerFeedResultDto>
{
    private readonly IRepository<LabRequisition> _requisitionRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IAnalyzerFeedService _feedService;
    private readonly ILabOrderLifecycle _lifecycle;

    public IngestAnalyzerFeedCommandHandler(
        IRepository<LabRequisition> requisitionRepository,
        IUnitOfWork unitOfWork,
        IAnalyzerFeedService feedService,
        ILabOrderLifecycle lifecycle)
    {
        _requisitionRepository = requisitionRepository;
        _unitOfWork = unitOfWork;
        _feedService = feedService;
        _lifecycle = lifecycle;
    }

    public async Task<IngestAnalyzerFeedResultDto> Handle(IngestAnalyzerFeedCommand request, CancellationToken cancellationToken)
    {
        var packet = _feedService.ParseFeed(request.RawPayload, request.ProtocolHint);

        if (string.IsNullOrWhiteSpace(packet.AccessionNumber))
        {
            throw new InvalidOperationException("Parsed analyzer packet does not contain a valid Accession Number or Barcode.");
        }

        var requisition = await _requisitionRepository.Query()
            .Include(r => r.Specimens)
            .Include(r => r.AnalyteResults)
            .Include(r => r.DiagnosticReport)
            .FirstOrDefaultAsync(r =>
                r.AccessionNumber == packet.AccessionNumber ||
                r.Specimens.Any(s => s.Barcode == packet.AccessionNumber),
                cancellationToken);

        if (requisition == null)
        {
            throw new KeyNotFoundException($"Requisition with Accession/Barcode '{packet.AccessionNumber}' not found for analyzer ingestion.");
        }

        // A prepaid order cannot be processed until the cashier has confirmed payment.
        OrderWorkGate.EnsureCanWork(requisition);

        var entryTime = DateTime.UtcNow;
        var medTech = !string.IsNullOrWhiteSpace(request.MedTechName) ? request.MedTechName : $"Analyzer Automated Feed ({packet.AnalyzerId})";
        bool hasDeltaAlert = false;
        bool hasCritical = false;

        // Fetch patient history for Delta Checks
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
            .ToDictionary(g => g.Key, g => g.OrderByDescending(x => x.EnteredAt).First());

        foreach (var obs in packet.Observations)
        {
            var code = obs.AnalyteCode.Trim().ToUpperInvariant();
            var spec = Array.Find(ReferenceRangeEvaluator.Catalog, c => string.Equals(c.AnalyteCode, code, StringComparison.OrdinalIgnoreCase));

            var panelName = spec?.PanelName ?? "Automated Analyzer";
            var analyteName = !string.IsNullOrWhiteSpace(obs.AnalyteName) ? obs.AnalyteName : (spec?.AnalyteName ?? code);
            var unit = !string.IsNullOrWhiteSpace(obs.Unit) ? obs.Unit : (spec?.Unit ?? string.Empty);
            var refInterval = spec?.ReferenceInterval ?? string.Empty;

            var (flag, alertNote) = ReferenceRangeEvaluator.Evaluate(code, obs.Value, requisition.PatientGender, requisition.PatientAge);
            if (flag == AnalyteFlag.Critical) hasCritical = true;

            var interpretation = alertNote;

            // Delta check validation
            if (previousResultsMap.TryGetValue(code, out var priorResult))
            {
                var delta = DeltaCheckEvaluator.Evaluate(code, obs.Value, priorResult.Value, priorResult.EnteredAt, entryTime);
                if (delta != null && delta.IsAlert)
                {
                    hasDeltaAlert = true;
                    interpretation = string.IsNullOrWhiteSpace(interpretation)
                        ? delta.AlertMessage
                        : $"{interpretation} | {delta.AlertMessage}";
                }
            }

            var existing = requisition.AnalyteResults.FirstOrDefault(a => string.Equals(a.AnalyteCode, code, StringComparison.OrdinalIgnoreCase));
            if (existing != null)
            {
                existing.Value = obs.Value;
                existing.Unit = unit;
                existing.ReferenceInterval = refInterval;
                existing.Flag = flag;
                existing.Interpretation = interpretation;
                existing.EnteredByMedTechName = medTech;
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
                    Value = obs.Value,
                    Unit = unit,
                    ReferenceInterval = refInterval,
                    Flag = flag,
                    Interpretation = interpretation,
                    EnteredByMedTechName = medTech,
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

        return new IngestAnalyzerFeedResultDto
        {
            Protocol = packet.Protocol,
            AnalyzerId = packet.AnalyzerId,
            AccessionNumber = packet.AccessionNumber,
            IngestedCount = packet.Observations.Count,
            HasDeltaCheckAlerts = hasDeltaAlert,
            HasCriticalFlags = hasCritical,
            Requisition = Requisitions.Queries.GetWorklistQueryHandler.MapToDto(requisition)
        };
    }
}
