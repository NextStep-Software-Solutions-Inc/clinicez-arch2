using System;
using ClinicEz.Laboratory.Api.Authorization;
using ClinicEz.Laboratory.Domain.Constants;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Common.Interfaces;
using ClinicEz.Laboratory.Application.Features.Analytes.Commands;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Laboratory.Api.Controllers;

[ApiController]
[Route("api/v1/analyzers")]
public sealed class AnalyzersController : ControllerBase
{
    private readonly ISender _sender;
    private readonly IAnalyzerFeedService _feedService;

    public AnalyzersController(ISender sender, IAnalyzerFeedService feedService)
    {
        _sender = sender;
        _feedService = feedService;
    }

    [HttpPost("feed")]
    [HasPermission(LabPermissions.AnalyzersFeed)]
    public async Task<ActionResult<ApiResponse<IngestAnalyzerFeedResultDto>>> IngestFeed(
        [FromBody] IngestFeedRequest request,
        CancellationToken ct = default)
    {
        var command = new IngestAnalyzerFeedCommand(
            request.RawPayload,
            request.ProtocolHint,
            request.MedTechName
        );

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<IngestAnalyzerFeedResultDto>.Success(result));
    }

    [HttpPost("simulate")]
    [HasPermission(LabPermissions.AnalyzersFeed)]
    public ActionResult<ApiResponse<SimulateAnalyzerResponse>> SimulatePayload(
        [FromBody] SimulateAnalyzerRequest request)
    {
        var payload = _feedService.GenerateSimulationPayload(
            request.AnalyzerModel ?? "Mindray BC-5150",
            request.AccessionNumber,
            request.Format ?? "ASTM"
        );

        return Ok(ApiResponse<SimulateAnalyzerResponse>.Success(new SimulateAnalyzerResponse
        {
            Format = request.Format ?? "ASTM",
            AnalyzerModel = request.AnalyzerModel ?? "Mindray BC-5150",
            AccessionNumber = request.AccessionNumber,
            RawPayload = payload
        }));
    }
}

public record IngestFeedRequest
{
    public required string RawPayload { get; init; }
    public string? ProtocolHint { get; init; }
    public string? MedTechName { get; init; }
}

public record SimulateAnalyzerRequest
{
    public required string AccessionNumber { get; init; }
    public string? AnalyzerModel { get; init; } = "Mindray BC-5150";
    public string? Format { get; init; } = "ASTM";
}

public record SimulateAnalyzerResponse
{
    public required string Format { get; init; }
    public required string AnalyzerModel { get; init; }
    public required string AccessionNumber { get; init; }
    public required string RawPayload { get; init; }
}
