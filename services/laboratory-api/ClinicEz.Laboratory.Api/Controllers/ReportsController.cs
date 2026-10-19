using System;
using ClinicEz.Laboratory.Api.Authorization;
using ClinicEz.Laboratory.Domain.Constants;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Common.Interfaces;
using ClinicEz.Laboratory.Application.Features.Reports.Commands;
using ClinicEz.Laboratory.Application.Features.Reports.Queries;
using ClinicEz.Laboratory.Application.Features.Requisitions.DTOs;
using ClinicEz.Laboratory.Application.Features.Requisitions.Queries;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Laboratory.Api.Controllers;

[ApiController]
[Route("api/v1/reports")]
public sealed class ReportsController : ControllerBase
{
    private readonly ISender _sender;
    private readonly IDiagnosticReportPdfGenerator _pdfGenerator;
    private readonly ILabPrintoutConfigProvider _printoutConfig;
    private readonly IRepository<LabRequisition> _requisitionRepository;

    public ReportsController(
        ISender sender,
        IDiagnosticReportPdfGenerator pdfGenerator,
        ILabPrintoutConfigProvider printoutConfig,
        IRepository<LabRequisition> requisitionRepository)
    {
        _sender = sender;
        _pdfGenerator = pdfGenerator;
        _printoutConfig = printoutConfig;
        _requisitionRepository = requisitionRepository;
    }

    [HttpGet("{requisitionId:guid}")]
    [HasPermission(LabPermissions.ReportsRead)]
    public async Task<ActionResult<ApiResponse<DiagnosticReportDto>>> GetReport(
        [FromRoute] Guid requisitionId,
        CancellationToken ct = default)
    {
        var requisition = await _sender.Send(new GetRequisitionByIdQuery(Id: requisitionId), ct);
        if (requisition?.DiagnosticReport == null)
            return NotFound(ApiResponse<DiagnosticReportDto>.Fail($"Diagnostic report not found for requisition {requisitionId}."));

        return Ok(ApiResponse<DiagnosticReportDto>.Success(requisition.DiagnosticReport));
    }

    [HttpPost("{requisitionId:guid}/verify")]
    [HasPermission(LabPermissions.ReportsVerify)]
    public async Task<ActionResult<ApiResponse<LabRequisitionDto>>> VerifyAndSignReport(
        [FromRoute] Guid requisitionId,
        [FromBody] VerifyReportRequest request,
        CancellationToken ct = default)
    {
        var command = new VerifyAndSignReportCommand(
            requisitionId,
            request.PathologistName,
            request.PathologistPrcLicense,
            request.MedicalTechnologistName,
            request.MedicalTechnologistPrcLicense,
            request.PathologistImpression,
            request.SignedPdfBase64);

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<LabRequisitionDto>.Success(result));
    }

    [HttpGet("{requisitionId:guid}/pdf")]
    [HasPermission(LabPermissions.ReportsRead)]
    public async Task<IActionResult> DownloadReportPdf(
        [FromRoute] Guid requisitionId,
        CancellationToken ct = default)
    {
        var requisition = await _requisitionRepository.Query()
            .Include(r => r.Specimens)
            .Include(r => r.AnalyteResults)
            .Include(r => r.DiagnosticReport)
            .FirstOrDefaultAsync(r => r.Id == requisitionId, ct);

        if (requisition == null)
            return NotFound($"Requisition {requisitionId} not found.");

        var pdfBytes = _pdfGenerator.GeneratePdf(requisition, await _printoutConfig.GetAsync(requisition, ct));
        var filename = $"ClinicEz-LabReport-{requisition.AccessionNumber}.pdf";

        return File(pdfBytes, "application/pdf", filename);
    }

    [HttpGet("{requisitionId:guid}/preview-html")]
    [HasPermission(LabPermissions.ReportsRead)]
    public async Task<IActionResult> GetReportHtmlPreview(
        [FromRoute] Guid requisitionId,
        CancellationToken ct = default)
    {
        var requisition = await _requisitionRepository.Query()
            .Include(r => r.Specimens)
            .Include(r => r.AnalyteResults)
            .Include(r => r.DiagnosticReport)
            .FirstOrDefaultAsync(r => r.Id == requisitionId, ct);

        if (requisition == null)
            return NotFound($"Requisition {requisitionId} not found.");

        var html = _pdfGenerator.GenerateHtml(requisition, await _printoutConfig.GetAsync(requisition, ct));
        return Content(html, "text/html");
    }

    [HttpPost("{requisitionId:guid}/panic-dispatch")]
    [HasPermission(LabPermissions.ReportsPanicDispatch)]
    public async Task<ActionResult<ApiResponse<CriticalPanicDispatchLogDto>>> RecordPanicDispatch(
        [FromRoute] Guid requisitionId,
        [FromBody] PanicDispatchRequest request,
        CancellationToken ct = default)
    {
        var command = new RecordPanicDispatchCommand(
            RequisitionId: requisitionId,
            DispatchedByMedTechName: request.DispatchedByMedTechName,
            NotifiedDoctorName: request.NotifiedDoctorName,
            NotificationMethod: request.NotificationMethod ?? NotificationMethod.Telephone,
            ReadbackConfirmed: request.ReadbackConfirmed,
            ReadbackNotes: request.ReadbackNotes
        );

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<CriticalPanicDispatchLogDto>.Success(result));
    }

    [HttpGet("panic-alerts")]
    [HasPermission(LabPermissions.ReportsRead)]
    public async Task<ActionResult<ApiResponse<List<CriticalPanicDispatchLogDto>>>> GetPanicAlerts(
        [FromQuery] int limit = 50,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new GetPanicAlertsQuery(limit), ct);
        return Ok(ApiResponse<List<CriticalPanicDispatchLogDto>>.Success(result));
    }
}

public record VerifyReportRequest
{
    public required string PathologistName { get; init; }
    public required string PathologistPrcLicense { get; init; }
    public required string MedicalTechnologistName { get; init; }
    public required string MedicalTechnologistPrcLicense { get; init; }
    public string? PathologistImpression { get; init; }
    public string? SignedPdfBase64 { get; init; }
}

public record PanicDispatchRequest
{
    public required string DispatchedByMedTechName { get; init; }
    public required string NotifiedDoctorName { get; init; }
    public NotificationMethod? NotificationMethod { get; init; } = Domain.Enums.NotificationMethod.Telephone;
    public bool ReadbackConfirmed { get; init; } = true;
    public string? ReadbackNotes { get; init; }
}
