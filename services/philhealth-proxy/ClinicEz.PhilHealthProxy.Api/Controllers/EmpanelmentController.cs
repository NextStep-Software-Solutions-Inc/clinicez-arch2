using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Application.Features.Empanelment.Commands;
using ClinicEz.PhilHealthProxy.Domain.Models;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.PhilHealthProxy.Api.Controllers;

[ApiController]
[Route("api/v1/yakap-empanelment")]
public sealed class EmpanelmentController(IMediator mediator) : ControllerBase
{
    [HttpPost]
    [ProducesResponseType<ApiResponse<YakapEmpanelmentResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> Empanel([FromBody] YakapEmpanelmentRequest request, CancellationToken ct)
    {
        var result = await mediator.Send(new SubmitEmpanelmentCommand(request), ct);
        return Ok(ApiResponse<YakapEmpanelmentResponse>.Success(result));
    }
}
