using CLINICEZ.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using PhilHealthProxy.Application.Common;
using PhilHealthProxy.Application.Features.Token.Queries.GetToken;

namespace PhilHealthProxy.Api.Controllers;

[ApiController]
[Route("api/konsulta/[controller]")]
public sealed class TokenController(IMediator mediator) : ControllerBase
{
    /// <summary>
    /// Retrieves a session token from the PhilHealth Konsulta system using the
    /// tenant's registered credentials. The token is returned as raw XML.
    /// </summary>
    [HttpGet]
    [ProducesResponseType<ApiResponse<KonsultaOperationResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> GetToken(CancellationToken ct)
    {
        var result = await mediator.Send(new GetTokenQuery(), ct);
        return Ok(result);
    }
}
