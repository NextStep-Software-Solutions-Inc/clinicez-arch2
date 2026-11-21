using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Application.Features.Masterlist.Queries;
using ClinicEz.PhilHealthProxy.Domain.Models;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.PhilHealthProxy.Api.Controllers;

[ApiController]
[Route("api/v1/yakap-selection-masterlist")]
public sealed class MasterlistController(IMediator mediator) : ControllerBase
{
    [HttpPost("individual")]
    [ProducesResponseType<ApiResponse<MasterlistDownloadResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> DownloadIndividual([FromBody] MasterlistIndividualRequest request, CancellationToken ct)
    {
        var result = await mediator.Send(new DownloadIndividualMasterlistQuery(request), ct);
        return Ok(ApiResponse<MasterlistDownloadResponse>.Success(result));
    }

    [HttpPost("batch")]
    [ProducesResponseType<ApiResponse<MasterlistDownloadResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> DownloadBatch([FromBody] MasterlistBatchRequest request, CancellationToken ct)
    {
        var result = await mediator.Send(new DownloadBatchMasterlistQuery(request), ct);
        return Ok(ApiResponse<MasterlistDownloadResponse>.Success(result));
    }
}
