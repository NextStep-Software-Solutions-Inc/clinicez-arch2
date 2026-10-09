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
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interoperability;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Laboratory.Application.Features.Reports.Commands;

public record VerifyAndSignReportCommand(
    Guid RequisitionId,
    string PathologistName,
    string PathologistPrcLicense,
    string MedicalTechnologistName,
    string MedicalTechnologistPrcLicense,
    string? PathologistImpression = null,
    string? SignedPdfBase64 = null
) : IRequest<LabRequisitionDto>;

public class VerifyAndSignReportCommandHandler : IRequestHandler<VerifyAndSignReportCommand, LabRequisitionDto>
{
    private readonly IRepository<LabRequisition> _requisitionRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IDiagnosticReportPublisher _reportPublisher;
    private readonly IDiagnosticReportPdfGenerator _pdfGenerator;
    private readonly ILabPrintoutConfigProvider _printoutConfig;
    private readonly ILabOrderLifecycle _lifecycle;

    public VerifyAndSignReportCommandHandler(
        IRepository<LabRequisition> requisitionRepository,
        IUnitOfWork unitOfWork,
        IDiagnosticReportPublisher reportPublisher,
        IDiagnosticReportPdfGenerator pdfGenerator,
        ILabPrintoutConfigProvider printoutConfig,
        ILabOrderLifecycle lifecycle)
    {
        _requisitionRepository = requisitionRepository;
        _unitOfWork = unitOfWork;
        _reportPublisher = reportPublisher;
        _pdfGenerator = pdfGenerator;
        _printoutConfig = printoutConfig;
        _lifecycle = lifecycle;
    }

    public async Task<LabRequisitionDto> Handle(VerifyAndSignReportCommand request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.PathologistName) || string.IsNullOrWhiteSpace(request.PathologistPrcLicense) ||
            string.IsNullOrWhiteSpace(request.MedicalTechnologistName) || string.IsNullOrWhiteSpace(request.MedicalTechnologistPrcLicense))
        {
            throw new BadRequestException("The pathologist and the medical technologist must each be named with their PRC license number to release a report.");
        }

        var requisition = await _requisitionRepository.Query()
            .Include(r => r.Specimens)
            .Include(r => r.AnalyteResults)
            .Include(r => r.DiagnosticReport)
            .FirstOrDefaultAsync(r => r.Id == request.RequisitionId, cancellationToken);

        if (requisition == null)
        {
            throw new KeyNotFoundException($"Requisition with ID {request.RequisitionId} not found.");
        }

        // A prepaid order cannot be released until the cashier has confirmed payment.
        OrderWorkGate.EnsureCanWork(requisition);

        var releaseTime = DateTime.UtcNow;
        var isCritical = requisition.AnalyteResults.Any(a => a.Flag == AnalyteFlag.Critical);

        if (requisition.DiagnosticReport == null)
        {
            requisition.DiagnosticReport = new DiagnosticReport
            {
                LabRequisitionId = requisition.Id,
                ReportNumber = $"RPT-{requisition.AccessionNumber}",
                ReleasedAt = releaseTime,
                PathologistName = request.PathologistName,
                PathologistPrcLicense = request.PathologistPrcLicense,
                MedicalTechnologistName = request.MedicalTechnologistName,
                MedicalTechnologistPrcLicense = request.MedicalTechnologistPrcLicense,
                PathologistImpression = request.PathologistImpression,
                IsCriticalResult = isCritical,
                SignedPdfBase64 = request.SignedPdfBase64
            };
        }
        else
        {
            requisition.DiagnosticReport.ReleasedAt = releaseTime;
            requisition.DiagnosticReport.PathologistName = request.PathologistName;
            requisition.DiagnosticReport.PathologistPrcLicense = request.PathologistPrcLicense;
            requisition.DiagnosticReport.MedicalTechnologistName = request.MedicalTechnologistName;
            requisition.DiagnosticReport.MedicalTechnologistPrcLicense = request.MedicalTechnologistPrcLicense;
            requisition.DiagnosticReport.PathologistImpression = request.PathologistImpression;
            requisition.DiagnosticReport.IsCriticalResult = isCritical;
            if (!string.IsNullOrWhiteSpace(request.SignedPdfBase64))
            {
                requisition.DiagnosticReport.SignedPdfBase64 = request.SignedPdfBase64;
            }
        }

        // Auto-generate standard PDF if not provided
        if (string.IsNullOrWhiteSpace(requisition.DiagnosticReport.SignedPdfBase64))
        {
            var letterhead = await _printoutConfig.GetAsync(requisition, cancellationToken);
            var pdfBytes = _pdfGenerator.GeneratePdf(requisition, letterhead);
            requisition.DiagnosticReport.SignedPdfBase64 = Convert.ToBase64String(pdfBytes);
        }

        requisition.Status = RequisitionStatus.Verified;
        _requisitionRepository.Update(requisition);

        // Finalized report for the ordering clinic EMR & patient app. Queued in the outbox BEFORE the save so the
        // status change and the message commit atomically (the report id exists once the report is tracked).
        var reportEvent = new DiagnosticReportFinalizedEvent
        {
            ReportId = requisition.DiagnosticReport.Id,
            RequisitionId = requisition.CorrelationId ?? requisition.ExternalRequisitionId ?? requisition.Id,
            AccessionNumber = requisition.AccessionNumber,
            LaboratoryFacilityId = requisition.LaboratoryId.ToString(),
            LaboratoryTenantId = requisition.TenantId,
            LaboratoryName = await _lifecycle.GetLaboratoryNameAsync(requisition, cancellationToken),
            OrderingTenantId = requisition.OrderingTenantId,
            OrderingFacilityId = requisition.OrderingFacilityId,
            PatientId = requisition.HasClinicEzPatient ? requisition.PatientId : null,
            PathologistName = request.PathologistName,
            PathologistPrcLicense = request.PathologistPrcLicense,
            MedicalTechnologistName = request.MedicalTechnologistName,
            MedicalTechnologistPrcLicense = request.MedicalTechnologistPrcLicense,
            ReleasedAt = releaseTime,
            PathologistImpression = request.PathologistImpression,
            IsCriticalResult = isCritical,
            SignedPdfBase64 = requisition.DiagnosticReport.SignedPdfBase64,
            Observations = requisition.AnalyteResults.Select(a => new AnalyteObservationDto
            {
                PanelName = a.PanelName,
                AnalyteCode = a.AnalyteCode,
                AnalyteName = a.AnalyteName,
                Value = a.Value,
                Unit = a.Unit,
                ReferenceInterval = a.ReferenceInterval,
                Flag = a.Flag.ToString(),
                Interpretation = a.Interpretation
            }).ToList()
        };

        _reportPublisher.EnqueueReportFinalized(reportEvent);
        await _lifecycle.TransitionAsync(requisition, RequisitionStage.ResultFinalized, null, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Requisitions.Queries.GetWorklistQueryHandler.MapToDto(requisition);
    }
}
