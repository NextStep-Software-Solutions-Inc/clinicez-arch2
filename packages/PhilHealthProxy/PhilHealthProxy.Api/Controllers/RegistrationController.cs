using Clinic EZ.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using PhilHealthProxy.Application.Common;
using PhilHealthProxy.Application.Features.Registration.Queries.ExtractRegistrationList;

namespace PhilHealthProxy.Api.Controllers;

[ApiController]
[Route("api/konsulta/[controller]")]
public sealed class RegistrationController(IMediator mediator) : ControllerBase
{
    /// <summary>
    /// Extracts the list of registered Konsulta beneficiaries for a date range.
    /// </summary>
    /// <param name="startDate">Start date in yyyy-MM-dd format.</param>
    /// <param name="endDate">End date in yyyy-MM-dd format (inclusive).</param>
    [HttpGet]
    [ProducesResponseType<ApiResponse<KonsultaOperationResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> ExtractRegistrationList(
        [FromQuery] string startDate,
        [FromQuery] string endDate,
        CancellationToken ct)
    {
        var result = await mediator.Send(
            new ExtractRegistrationListQuery { StartDate = startDate, EndDate = endDate },
            ct);
        return Ok(result);
    }
}
