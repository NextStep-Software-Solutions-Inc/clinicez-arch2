using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Application.Features.Selection.Commands;
using ClinicEz.PhilHealthProxy.Domain.Models;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.PhilHealthProxy.Api.Controllers;

[ApiController]
[Route("api/v1/yakap-selection")]
public sealed class SelectionController(IMediator mediator) : ControllerBase
{
    [HttpPost]
    [ProducesResponseType<ApiResponse<YakapSelectionResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> Select([FromBody] YakapSelectionRequest request, CancellationToken ct)
    {
        var result = await mediator.Send(new SubmitSelectionCommand(request), ct);
        return Ok(ApiResponse<YakapSelectionResponse>.Success(result));
    }
}
