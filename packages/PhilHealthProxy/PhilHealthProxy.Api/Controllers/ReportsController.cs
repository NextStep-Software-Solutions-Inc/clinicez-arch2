using CLINICEZ.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using PhilHealthProxy.Application.Common;
using PhilHealthProxy.Application.Features.Reports.Commands.SubmitReport;
using PhilHealthProxy.Application.Features.Reports.Commands.ValidateReport;

namespace PhilHealthProxy.Api.Controllers;

[ApiController]
[Route("api/konsulta/[controller]")]
public sealed class ReportsController(IMediator mediator) : ControllerBase
{
    /// <summary>
    /// Validates a Konsulta report before submission.
    /// </summary>
    [HttpPost("validate")]
    [ProducesResponseType<ApiResponse<KonsultaOperationResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> ValidateReport(
        [FromBody] ValidateReportCommand command,
        CancellationToken ct)
    {
        var result = await mediator.Send(command, ct);
        return Ok(result);
    }

    /// <summary>
    /// Submits a validated Konsulta report to PhilHealth.
    /// </summary>
    [HttpPost("submit")]
    [ProducesResponseType<ApiResponse<KonsultaOperationResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> SubmitReport(
        [FromBody] SubmitReportCommand command,
        CancellationToken ct)
    {
        var result = await mediator.Send(command, ct);
        return Ok(result);
    }
}
