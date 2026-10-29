using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Application.Features.Token.Commands.AuthenticateToken;
using ClinicEz.PhilHealthProxy.Application.Features.Token.Queries.GetToken;
using ClinicEz.PhilHealthProxy.Domain.Models;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.PhilHealthProxy.Api.Controllers;

[ApiController]
public sealed class TokenController(IMediator mediator) : ControllerBase
{
    [HttpPost("api/v1/auth/token")]
    [HttpPost("api/v1/token")]
    [ProducesResponseType<PcapiTokenResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Authenticate([FromBody] PcapiTokenRequest request, CancellationToken ct)
    {
        var result = await mediator.Send(new AuthenticateTokenCommand(request), ct);
        return Ok(result);
    }

    [HttpGet("api/v1/auth/token")]
    [HttpGet("api/v1/token")]
    [ProducesResponseType<PcapiTokenResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetToken(CancellationToken ct)
    {
        var result = await mediator.Send(new GetTokenQuery(), ct);
        return Ok(result);
    }
}
