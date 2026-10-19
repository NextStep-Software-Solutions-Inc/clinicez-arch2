using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using ClinicEz.PhilHealthProxy.Application.Common;
using ClinicEz.PhilHealthProxy.Application.Features.Atc.Queries.IsAtcValid;

namespace ClinicEz.PhilHealthProxy.Api.Controllers;

[ApiController]
[Route("api/konsulta/[controller]")]
public sealed class AtcController(IMediator mediator) : ControllerBase
{
    /// <summary>
    /// Validates an Authorization to Claim (ATC) for a given PhilHealth member.
    /// </summary>
    /// <param name="pin">PhilHealth Identification Number.</param>
    /// <param name="atc">Authorization to Claim code.</param>
    /// <param name="effectivityDate">ATC effectivity date in yyyy-MM-dd format.</param>
    [HttpGet("is-valid")]
    [ProducesResponseType<ApiResponse<KonsultaOperationResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> IsAtcValid(
        [FromQuery] string pin,
        [FromQuery] string atc,
        [FromQuery] string effectivityDate,
        CancellationToken ct)
    {
        var result = await mediator.Send(
            new IsAtcValidQuery { Pin = pin, Atc = atc, EffectivityDate = effectivityDate },
            ct);
        return Ok(result);
    }
}
