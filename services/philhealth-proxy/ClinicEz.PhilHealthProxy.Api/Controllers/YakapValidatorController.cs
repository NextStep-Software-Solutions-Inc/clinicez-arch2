using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Application.Features.Validator.Queries;
using ClinicEz.PhilHealthProxy.Domain.Models;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.PhilHealthProxy.Api.Controllers;

[ApiController]
[Route("api/v1/philhealth-yakap-validator")]
public sealed class YakapValidatorController(IMediator mediator) : ControllerBase
{
    [HttpPost]
    [ProducesResponseType<ApiResponse<YakapValidatorResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> ValidateStanding([FromBody] YakapValidateStandingRequest request, CancellationToken ct)
    {
        var result = await mediator.Send(new ValidateYakapStandingQuery(request), ct);
        return Ok(ApiResponse<YakapValidatorResponse>.Success(result));
    }
}
