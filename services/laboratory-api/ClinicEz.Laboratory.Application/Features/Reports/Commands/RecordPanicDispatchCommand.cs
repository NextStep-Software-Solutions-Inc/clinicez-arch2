using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Common.Interfaces;
using ClinicEz.Laboratory.Application.Features.Requisitions.DTOs;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Shared.Interoperability;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Laboratory.Application.Features.Reports.Commands;

public record RecordPanicDispatchCommand(
    Guid RequisitionId,
    string DispatchedByMedTechName,
    string NotifiedDoctorName,
    string NotificationMethod = "Telephone",
    bool ReadbackConfirmed = true,
    string? ReadbackNotes = null
) : IRequest<CriticalPanicDispatchLogDto>;

public class RecordPanicDispatchCommandHandler : IRequestHandler<RecordPanicDispatchCommand, CriticalPanicDispatchLogDto>
{
    private readonly IRepository<LabRequisition> _requisitionRepository;
    private readonly IRepository<CriticalPanicDispatchLog> _panicLogRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IPanicAlertPublisher _panicPublisher;

    public RecordPanicDispatchCommandHandler(
        IRepository<LabRequisition> requisitionRepository,
        IRepository<CriticalPanicDispatchLog> panicLogRepository,
        IUnitOfWork unitOfWork,
        IPanicAlertPublisher panicPublisher)
    {
        _requisitionRepository = requisitionRepository;
        _panicLogRepository = panicLogRepository;
        _unitOfWork = unitOfWork;
        _panicPublisher = panicPublisher;
    }

    public async Task<CriticalPanicDispatchLogDto> Handle(RecordPanicDispatchCommand request, CancellationToken cancellationToken)
    {
        var requisition = await _requisitionRepository.Query()
            .Include(r => r.AnalyteResults)
            .FirstOrDefaultAsync(r => r.Id == request.RequisitionId, cancellationToken);

        if (requisition == null)
        {
            throw new KeyNotFoundException($"Requisition with ID {request.RequisitionId} not found.");
        }

        var criticalFindings = requisition.AnalyteResults
            .Where(a => a.Flag == AnalyteFlag.Critical)
            .Select(a => $"{a.AnalyteName} ({a.AnalyteCode}) = {a.Value} {a.Unit} [Ref: {a.ReferenceInterval}]")
            .ToList();

        var findingsSummary = criticalFindings.Count > 0
            ? string.Join(" | ", criticalFindings)
            : "Critical threshold alert flagged by clinical evaluation.";

        Enum.TryParse<NotificationMethod>(request.NotificationMethod, true, out var method);

        var log = new CriticalPanicDispatchLog
        {
            TenantId = requisition.TenantId,
            RequisitionId = requisition.Id,
            AccessionNumber = requisition.AccessionNumber,
            PatientId = requisition.PatientId,
            PatientName = requisition.PatientName,
            OrderingDoctorName = requisition.OrderingDoctorName,
            OrderingFacilityName = requisition.OrderingFacilityName,
            CriticalFindings = findingsSummary,
            DispatchedAt = DateTime.UtcNow,
            DispatchedByMedTechName = request.DispatchedByMedTechName,
            NotifiedDoctorName = request.NotifiedDoctorName,
            NotificationMethod = method != 0 ? method : NotificationMethod.Telephone,
            ReadbackConfirmed = request.ReadbackConfirmed,
            ReadbackNotes = request.ReadbackNotes,
            AcknowledgedAt = request.ReadbackConfirmed ? DateTime.UtcNow : null
        };

        await _panicLogRepository.AddAsync(log, cancellationToken);

        // STAT panic alert for the ordering clinic EMR. Queued in the outbox BEFORE the save so the dispatch log and
        // the message commit atomically (the log id exists once the log is tracked).
        var panicEvent = new LabPanicResultAlertEvent
        {
            AlertId = log.Id,
            RequisitionId = requisition.CorrelationId ?? requisition.ExternalRequisitionId ?? requisition.Id,
            LaboratoryTenantId = requisition.TenantId,
            LaboratoryFacilityId = requisition.LaboratoryId.ToString(),
            AccessionNumber = requisition.AccessionNumber,
            PatientId = requisition.PatientId,
            PatientName = requisition.PatientName,
            OrderingTenantId = requisition.OrderingTenantId,
            OrderingFacilityId = requisition.OrderingFacilityId,
            OrderingFacilityName = requisition.OrderingFacilityName,
            OrderingDoctorName = requisition.OrderingDoctorName,
            OrderingDoctorPrc = requisition.OrderingDoctorPrc,
            Urgency = "STAT",
            TriggeredAt = log.DispatchedAt,
            CriticalFindings = requisition.AnalyteResults
                .Where(a => a.Flag == AnalyteFlag.Critical)
                .Select(a => new CriticalFindingDto
                {
                    AnalyteCode = a.AnalyteCode,
                    AnalyteName = a.AnalyteName,
                    ObservedValue = a.Value,
                    Unit = a.Unit,
                    ReferenceInterval = a.ReferenceInterval,
                    AlertDescription = a.Interpretation ?? "Critical Panic Threshold Breach"
                }).ToList()
        };

        _panicPublisher.EnqueuePanicAlert(panicEvent);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return new CriticalPanicDispatchLogDto
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
        };
    }
}
