using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Application.Features.VerificationCode.Commands;
using ClinicEz.PhilHealthProxy.Domain.Models;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.PhilHealthProxy.Api.Controllers;

[ApiController]
[Route("api/v1/yakap-patient-verification-code")]
public sealed class VerificationCodeController(IMediator mediator) : ControllerBase
{
    [HttpPost]
    [ProducesResponseType<ApiResponse<VerificationCodeResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> ValidateCode([FromBody] VerificationCodeRequest request, CancellationToken ct)
    {
        var result = await mediator.Send(new ValidateVerificationCodeCommand(request), ct);
        return Ok(ApiResponse<VerificationCodeResponse>.Success(result));
    }
}
