using Clinic EZ.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using PhilHealthProxy.Application.Common;
using PhilHealthProxy.Application.Features.UploadStatus.Queries.CheckUploadStatus;

namespace PhilHealthProxy.Api.Controllers;

[ApiController]
[Route("api/konsulta/upload-status")]
public sealed class UploadStatusController(IMediator mediator) : ControllerBase
{
    /// <summary>
    /// Checks the upload status of Konsulta submissions for a given date range.
    /// Requires the <c>X-Tenant-Id</c> header to identify the HCI (clinic).
    /// </summary>
    [HttpGet]
    [ProducesResponseType<ApiResponse<KonsultaOperationResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
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
