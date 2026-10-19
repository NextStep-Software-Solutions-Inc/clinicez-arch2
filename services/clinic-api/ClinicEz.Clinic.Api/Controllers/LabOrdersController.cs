using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Features.LabOrders.Commands;
using ClinicEz.Clinic.Application.Features.LabOrders.DTOs;
using ClinicEz.Clinic.Application.Features.LabOrders.Queries;
using ClinicEz.Clinic.Application.Features.LabResults.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/lab-orders")]
public sealed class LabOrdersController : ControllerBase
{
    private readonly ISender _sender;
    private readonly IClinicDocumentPdfService _pdfService;
    private readonly IRepository<ClinicSettings> _settingsRepo;

    public LabOrdersController(
        ISender sender,
        IClinicDocumentPdfService pdfService,
        IRepository<ClinicSettings> settingsRepo)
    {
        _sender = sender;
        _pdfService = pdfService;
        _settingsRepo = settingsRepo;
    }

    [HttpGet]
    [HasPermission(ClinicPermissions.LabOrdersRead)]
    public async Task<ActionResult<ApiResponse<List<ClinicLabOrderDto>>>> GetLabOrders(
        [FromQuery] Guid? patientId,
        [FromQuery] LabOrderStatus? status,
        [FromQuery] DateTime? date,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetClinicLabOrdersQuery(patientId, status, date), ct);
        return Ok(ApiResponse<List<ClinicLabOrderDto>>.Success(result));
    }

    [HttpGet("{id}/slip")]
    [HasPermission(ClinicPermissions.LabOrdersRead)]
    public async Task<ActionResult<ApiResponse<LabOrderSlipDto>>> GetLabOrderSlip(
        [FromRoute] Guid id,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetClinicLabOrderSlipQuery(id), ct);
        return Ok(ApiResponse<LabOrderSlipDto>.Success(result));
    }

    [HttpGet("{id}/slip-pdf")]
    [HasPermission(ClinicPermissions.LabOrdersRead)]
    public async Task<IActionResult> DownloadLabOrderSlipPdf(
        [FromRoute] Guid id,
        CancellationToken ct)
    {
        var slip = await _sender.Send(new GetClinicLabOrderSlipQuery(id), ct);
        var settings = await _settingsRepo.Query().FirstOrDefaultAsync(ct) ?? new ClinicSettings
        {
            TenantId = "default",
            ClinicId = Guid.Empty,
            ClinicName = slip.ClinicName
        };

        var pdfBytes = _pdfService.GenerateLabRequisitionSlipPdf(slip, settings);
        return File(pdfBytes, "application/pdf", $"LabRequisition-{slip.OrderNumber}.pdf");
    }

    [HttpPost]
    [HasPermission(ClinicPermissions.LabOrdersWrite)]
    public async Task<ActionResult<ApiResponse<ClinicLabOrderDto>>> CreateLabOrder(
        [FromBody] CreateClinicLabOrderRequest request,
        CancellationToken ct)
    {
        var command = new CreateClinicLabOrderCommand(
            request.PatientId,
            request.PatientName,
            request.ConsultationId,
            request.OrderedByDoctorId,
            request.OrderedByDoctorName,
            request.ClinicalDiagnosis,
            request.Notes,
            request.Items,
            request.TargetFacilityId,
            request.TargetTenantId
        );

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<ClinicLabOrderDto>.Success(result, "Lab order created and requisition issued."));
    }

    [HttpPost("{id}/attach-external-result")]
    [HasPermission(ClinicPermissions.LabOrdersWrite)]
    public async Task<ActionResult<ApiResponse<ClinicLabOrderDto>>> AttachExternalResult(
        [FromRoute] Guid id,
        [FromBody] AttachExternalLabResultRequest request,
        CancellationToken ct)
    {
        var command = new AttachExternalLabResultCommand(
            id,
            request.ExternalLabName,
            request.DocumentType,
            request.FileBase64,
            request.Notes,
            request.ContentType,
            request.FileName
        );

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<ClinicLabOrderDto>.Success(result, "External lab result attached successfully to patient EMR."));
    }

    [HttpGet("panic-alerts")]
    [HasPermission(ClinicPermissions.LabOrdersRead)]
    public async Task<ActionResult<ApiResponse<List<ClinicLabOrderDto>>>> GetPanicAlerts(CancellationToken ct)
    {
        var result = await _sender.Send(new GetActivePanicAlertsQuery(), ct);
        return Ok(ApiResponse<List<ClinicLabOrderDto>>.Success(result));
    }

    [HttpPost("{id}/acknowledge-panic")]
    [HasPermission(ClinicPermissions.LabOrdersWrite)]
    public async Task<ActionResult<ApiResponse<ClinicLabOrderDto>>> AcknowledgePanicAlert(
        [FromRoute] Guid id,
        [FromBody] AcknowledgePanicAlertRequest request,
        CancellationToken ct)
    {
        var command = new AcknowledgePanicAlertCommand(id, request.AcknowledgedByDoctorName, request.Notes);
        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<ClinicLabOrderDto>.Success(result, "STAT critical panic alert acknowledged and logged."));
    }

    [HttpGet("{id}/report-pdf")]
    [HasPermission(ClinicPermissions.LabOrdersRead)]
    public async Task<IActionResult> GetReportPdf(
        [FromRoute] Guid id,
        CancellationToken ct)
    {
        var file = await _sender.Send(new GetLabOrderReportFileQuery(id), ct);
        return File(file.Content, file.ContentType, file.FileName);
    }
}
