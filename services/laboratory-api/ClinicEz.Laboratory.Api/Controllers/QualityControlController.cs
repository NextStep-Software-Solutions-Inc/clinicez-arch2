using System;
using ClinicEz.Laboratory.Api.Authorization;
using ClinicEz.Laboratory.Domain.Constants;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Features.QualityControl.Commands;
using ClinicEz.Laboratory.Application.Features.QualityControl.Queries;
using ClinicEz.Laboratory.Application.Features.Requisitions.DTOs;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Laboratory.Api.Controllers;

[ApiController]
[Route("api/v1/qc")]
public sealed class QualityControlController : ControllerBase
{
    private readonly ISender _sender;
    private readonly ILabContext _context;

    public QualityControlController(ISender sender, ILabContext context)
    {
        _sender = sender;
        _context = context;
    }

    [HttpGet("lots")]
    [HasPermission(LabPermissions.QcRead)]
    public async Task<ActionResult<ApiResponse<List<QcLotDto>>>> GetLots(
        [FromQuery] string? analyteCode,
        [FromQuery] bool? activeOnly = true,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new GetQcLotsQuery(analyteCode, activeOnly), ct);
        return Ok(ApiResponse<List<QcLotDto>>.Success(result));
    }

    [HttpPost("lots")]
    [HasPermission(LabPermissions.QcWrite)]
    public async Task<ActionResult<ApiResponse<QcLotDto>>> CreateLot(
        [FromBody] CreateLotRequest request,
        CancellationToken ct = default)
    {
        // Tenant comes from the validated session; any tenant in the request body is ignored.
        if (_context.TenantId is not { Length: > 0 } tenantId) return Forbid();

        var command = new CreateQcLotCommand(
            TenantId: tenantId,
            LotNumber: request.LotNumber,
            ControlName: request.ControlName,
            Level: request.Level,
            AnalyteCode: request.AnalyteCode,
            InstrumentName: request.InstrumentName,
            TargetMean: request.TargetMean,
            TargetStandardDeviation: request.TargetStandardDeviation,
            ManufacturerExpirationDate: request.ManufacturerExpirationDate,
            OpenVialDate: request.OpenVialDate,
            OpenVialStabilityDays: request.OpenVialStabilityDays
        );

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<QcLotDto>.Success(result));
    }

    [HttpPost("runs")]
    [HasPermission(LabPermissions.QcWrite)]
    public async Task<ActionResult<ApiResponse<QcRunDto>>> RecordRun(
        [FromBody] RecordRunRequest request,
        CancellationToken ct = default)
    {
        var command = new RecordQcRunCommand(
            QcLotId: request.QcLotId,
            MeasuredValue: request.MeasuredValue,
            MedTechName: request.MedTechName,
            RunAt: request.RunAt,
            PeerLevelZScore: request.PeerLevelZScore,
            Notes: request.Notes
        );

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<QcRunDto>.Success(result));
    }

    [HttpGet("chart")]
    [HasPermission(LabPermissions.QcRead)]
    public async Task<ActionResult<ApiResponse<LeveyJenningsChartDto>>> GetChart(
        [FromQuery] Guid? lotId,
        [FromQuery] string? analyteCode,
        [FromQuery] ControlLevel? level,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new GetLeveyJenningsChartQuery(lotId, analyteCode, level), ct);
        if (result == null)
            return NotFound(ApiResponse<LeveyJenningsChartDto>.Fail("No QC data found for the specified lot or parameters."));

        return Ok(ApiResponse<LeveyJenningsChartDto>.Success(result));
    }
}

public record CreateLotRequest
{
    public string? TenantId { get; init; }
    public required string LotNumber { get; init; }
    public required string ControlName { get; init; }
    public required ControlLevel Level { get; init; } = ControlLevel.Level2_Normal;
    public required string AnalyteCode { get; init; }
    public string InstrumentName { get; init; } = "Main Laboratory Analyzer";
    public double TargetMean { get; init; }
    public double TargetStandardDeviation { get; init; }
    public DateTime ManufacturerExpirationDate { get; init; }
    public DateTime? OpenVialDate { get; init; }
    public int OpenVialStabilityDays { get; init; } = 30;
}

public record RecordRunRequest
{
    public Guid QcLotId { get; init; }
    public double MeasuredValue { get; init; }
    public string MedTechName { get; init; } = "Registered Medical Technologist";
    public DateTime? RunAt { get; init; }
    public double? PeerLevelZScore { get; init; }
    public string? Notes { get; init; }
}
