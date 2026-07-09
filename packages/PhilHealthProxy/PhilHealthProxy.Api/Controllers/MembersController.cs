using CLINICEZ.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using PhilHealthProxy.Application.Common;
using PhilHealthProxy.Application.Features.Members.Queries.IsMemberDependentRegistered;

namespace PhilHealthProxy.Api.Controllers;

[ApiController]
[Route("api/konsulta/[controller]")]
public sealed class MembersController(IMediator mediator) : ControllerBase
{
    /// <summary>
    /// Checks whether a PhilHealth member or dependent is registered as a Konsulta beneficiary.
    /// </summary>
    /// <param name="pin">PhilHealth Identification Number.</param>
    /// <param name="type">Member type code (e.g. "M" for member, "D" for dependent).</param>
    [HttpGet("is-registered")]
    [ProducesResponseType<ApiResponse<KonsultaOperationResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> IsMemberDependentRegistered(
        [FromQuery] string pin,
        [FromQuery] string type,
        CancellationToken ct)
    {
        var result = await mediator.Send(
            new IsMemberDependentRegisteredQuery { Pin = pin, Type = type },
            ct);
        return Ok(result);
    }
}
