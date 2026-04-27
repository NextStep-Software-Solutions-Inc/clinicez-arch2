using CLINICEZ.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using PhilHealthProxy.Application.Features.UploadStatus.Queries.CheckUploadStatus;

namespace PhilHealthProxy.Api.Controllers;

[ApiController]
[Route("api/konsulta/[controller]")]
public sealed class UploadStatusController(IMediator mediator) : ControllerBase
{
    /// <summary>
    /// Checks the upload status of Konsulta submissions for a given date range.
    /// Requires the <c>X-Tenant-Id</c> header to identify the HCI (clinic).
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<CheckUploadStatusResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> CheckUploadStatus(
        [FromQuery] string? startDate,
        [FromQuery] string? endDate,
        [FromQuery] string? transmittalId,
        [FromQuery] string? report,
        CancellationToken cancellationToken)
    {
        var query = new CheckUploadStatusQuery
        {
            StartDate = startDate,
            EndDate = endDate,
            TransmittalId = transmittalId,
            Report = report
        };

        var result = await mediator.Send(query, cancellationToken);
        return Ok(result);
    }
}
