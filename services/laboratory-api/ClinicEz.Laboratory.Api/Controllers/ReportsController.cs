using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Features.Reports.Commands;
using ClinicEz.Laboratory.Application.Features.Requisitions.DTOs;
using ClinicEz.Laboratory.Application.Features.Requisitions.Queries;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Laboratory.Api.Controllers;

[ApiController]
[Route("api/v1/reports")]
public sealed class ReportsController : ControllerBase
{
    private readonly ISender _sender;

    public ReportsController(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet("{requisitionId:guid}")]
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
