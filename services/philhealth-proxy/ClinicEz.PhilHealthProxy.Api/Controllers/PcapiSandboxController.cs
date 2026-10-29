using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Application.Features.Sandbox;
using ClinicEz.PhilHealthProxy.Domain.Models;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.PhilHealthProxy.Api.Controllers;

[ApiController]
[Route("api/v1/sandbox")]
public sealed class PcapiSandboxController(IMediator mediator) : ControllerBase
{
    [HttpGet("status")]
    [ProducesResponseType<ApiResponse<SandboxStatus>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetStatus(CancellationToken ct)
    {
        var result = await mediator.Send(new GetSandboxStatusQuery(), ct);
        return Ok(ApiResponse<SandboxStatus>.Success(result));
    }

    [HttpPost("scenario")]
    [ProducesResponseType<ApiResponse<SandboxStatus>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> SetScenario([FromBody] SetSandboxScenarioRequest request, CancellationToken ct)
    {
        var result = await mediator.Send(new SetSandboxScenarioCommand(request.Scenario), ct);
        return Ok(ApiResponse<SandboxStatus>.Success(result));
    }

    [HttpPost("reset")]
    [ProducesResponseType<ApiResponse<SandboxStatus>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Reset(CancellationToken ct)
    {
        var result = await mediator.Send(new ResetSandboxCommand(), ct);
        return Ok(ApiResponse<SandboxStatus>.Success(result));
    }
}
