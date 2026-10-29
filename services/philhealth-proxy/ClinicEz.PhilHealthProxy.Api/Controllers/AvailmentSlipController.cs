using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Application.Features.AvailmentSlip.Queries;
using ClinicEz.PhilHealthProxy.Domain.Models;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.PhilHealthProxy.Api.Controllers;

[ApiController]
[Route("api/v1/yakap-availment-slip")]
public sealed class AvailmentSlipController(IMediator mediator) : ControllerBase
{
    [HttpPost]
    [ProducesResponseType<ApiResponse<PhilHealthEncryptedPayload>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Generate([FromBody] AvailmentSlipRequest request, CancellationToken ct)
    {
        var result = await mediator.Send(new GenerateAvailmentSlipQuery(request), ct);
        return Ok(ApiResponse<PhilHealthEncryptedPayload>.Success(result));
    }
}
