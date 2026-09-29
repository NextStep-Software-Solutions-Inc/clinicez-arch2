using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Features.Analytes.Commands;
using ClinicEz.Laboratory.Application.Features.Analytes.Queries;
using ClinicEz.Laboratory.Application.Features.Requisitions.DTOs;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Laboratory.Api.Controllers;

[ApiController]
[Route("api/v1/results")]
public sealed class ResultsController : ControllerBase
{
    private readonly ISender _sender;

    public ResultsController(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet("catalog")]
    public async Task<ActionResult<ApiResponse<List<AnalyteCatalogItemDto>>>> GetCatalog(CancellationToken ct = default)
    {
        var result = await _sender.Send(new GetAnalyteCatalogQuery(), ct);
        return Ok(ApiResponse<List<AnalyteCatalogItemDto>>.Success(result));
    }

    [HttpPost("{requisitionId:guid}")]
    public async Task<ActionResult<ApiResponse<LabRequisitionDto>>> RecordResults(
        [FromRoute] Guid requisitionId,
        [FromBody] RecordResultsRequest request,
        CancellationToken ct = default)
    {
        var command = new RecordAnalyteResultCommand(requisitionId, request.MedTechName, request.Results);
        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<LabRequisitionDto>.Success(result));
    }
}

public record RecordResultsRequest
{
    public string MedTechName { get; init; } = "Medical Technologist";
    public List<AnalyteResultInput> Results { get; init; } = new();
}
