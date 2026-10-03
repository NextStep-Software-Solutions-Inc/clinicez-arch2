using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Features.QualityControl.Commands;
using ClinicEz.Laboratory.Application.Features.QualityControl.Queries;
using ClinicEz.Laboratory.Application.Features.Requisitions.DTOs;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Laboratory.Api.Controllers;

[ApiController]
[Route("api/v1/qc")]
public sealed class QualityControlController : ControllerBase
{
    private readonly ISender _sender;

    public QualityControlController(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet("lots")]
    public async Task<ActionResult<ApiResponse<List<QcLotDto>>>> GetLots(
        [FromQuery] string? analyteCode,
        [FromQuery] bool? activeOnly = true,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new GetQcLotsQuery(analyteCode, activeOnly), ct);
        return Ok(ApiResponse<List<QcLotDto>>.Success(result));
    }

    [HttpPost("lots")]
    public async Task<ActionResult<ApiResponse<QcLotDto>>> CreateLot(
        [FromBody] CreateLotRequest request,
        CancellationToken ct = default)
    {
        var command = new CreateQcLotCommand(
            TenantId: request.TenantId ?? "default",
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
    public async Task<ActionResult<ApiResponse<LeveyJenningsChartDto>>> GetChart(
        [FromQuery] Guid? lotId,
        [FromQuery] string? analyteCode,
        [FromQuery] string? level,
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
    public required string Level { get; init; } = "Level2_Normal";
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
