using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Settings.Queries;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/public/join")]
[AllowAnonymous]
public sealed class PublicJoinController : ControllerBase
{
    private readonly ISender _sender;

    public PublicJoinController(ISender sender)
    {
        _sender = sender;
    }

    /// <summary>
    /// Validates an alphanumeric clinic join code, verifying active intake status, expiration,
    /// and resolving the associated tenant and clinic facility metadata without leaking other facilities.
    /// </summary>
    [HttpGet("validate/{code}")]
    public async Task<ActionResult<ApiResponse<PublicJoinCodeValidationResult>>> ValidateJoinCode(
        [FromRoute] string code,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new ValidateJoinCodeQuery(code), ct);
        if (!result.IsValid)
        {
            return StatusCode(result.StatusCode, ApiResponse<PublicJoinCodeValidationResult>.Fail(result.ErrorMessage ?? "Invalid join code."));
        }

        return Ok(ApiResponse<PublicJoinCodeValidationResult>.Success(result, "Join code verified successfully."));
    }
}
