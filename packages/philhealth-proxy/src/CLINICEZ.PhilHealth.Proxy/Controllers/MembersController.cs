using CLINICEZ.PhilHealth.Proxy.Common;
using CLINICEZ.PhilHealth.Proxy.Features.Members.Commands.VerifyMember;
using CLINICEZ.PhilHealth.Proxy.Features.Members.Queries.GetMemberInfo;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace CLINICEZ.PhilHealth.Proxy.Controllers;

[ApiController]
[Route("api/[controller]")]
public sealed class MembersController(ISender mediator) : ControllerBase
{
    /// <summary>Retrieves PhilHealth member information by PhilHealth Identification Number (PIN).</summary>
    /// <param name="philHealthNumber">12-character PhilHealth Identification Number (format: XX-XXXXXXXXX-X).</param>
    [HttpGet("{philHealthNumber}")]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status502BadGateway)]
    public async Task<IActionResult> GetMemberInfo(
        string philHealthNumber,
        CancellationToken cancellationToken)
    {
        try
        {
            var result = await mediator.Send(
                new GetMemberInfoQuery(philHealthNumber),
                cancellationToken);

            return Ok(ApiResponse<object>.Ok(result, HttpContext.TraceIdentifier));
        }
        catch (ValidationException ex)
        {
            return BadRequest(ApiResponse<object>.Fail(
                ex.Errors.Select(e => new ApiError(e.ErrorCode, e.ErrorMessage, e.PropertyName)).ToList(),
                HttpContext.TraceIdentifier));
        }
        catch (InvalidOperationException ex)
        {
            return StatusCode(StatusCodes.Status502BadGateway,
                ApiResponse<object>.Fail("UPSTREAM_ERROR", ex.Message, HttpContext.TraceIdentifier));
        }
    }

    /// <summary>
    /// Verifies that a PhilHealth Identification Number belongs to the member with the given name.
    /// </summary>
    [HttpPost("verify")]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status502BadGateway)]
    public async Task<IActionResult> VerifyMember(
        [FromBody] VerifyMemberCommand command,
        CancellationToken cancellationToken)
    {
        try
        {
            var result = await mediator.Send(command, cancellationToken);

            return Ok(ApiResponse<object>.Ok(new { Verified = result }, HttpContext.TraceIdentifier));
        }
        catch (ValidationException ex)
        {
            return BadRequest(ApiResponse<object>.Fail(
                ex.Errors.Select(e => new ApiError(e.ErrorCode, e.ErrorMessage, e.PropertyName)).ToList(),
                HttpContext.TraceIdentifier));
        }
        catch (InvalidOperationException ex)
        {
            return StatusCode(StatusCodes.Status502BadGateway,
                ApiResponse<object>.Fail("UPSTREAM_ERROR", ex.Message, HttpContext.TraceIdentifier));
        }
    }
}
