using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Application.Features.Pcu.Commands;
using ClinicEz.PhilHealthProxy.Domain.Models;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.PhilHealthProxy.Api.Controllers;

[ApiController]
[Route("api/v1/pcu")]
public sealed class PcuController(IMediator mediator) : ControllerBase
{
    [HttpPost("start")]
    [ProducesResponseType<ApiResponse<PcuStartResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Start([FromBody] PcuStartRequest request, CancellationToken ct)
    {
        var result = await mediator.Send(new StartPcuCommand(request), ct);
        return Ok(ApiResponse<PcuStartResponse>.Success(result));
    }

    [HttpPost("verify")]
    [ProducesResponseType<ApiResponse<PcuVerifyResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Verify([FromBody] PcuVerifyRequest request, CancellationToken ct)
    {
        var result = await mediator.Send(new VerifyPcuCommand(request), ct);
        return Ok(ApiResponse<PcuVerifyResponse>.Success(result));
    }
}
