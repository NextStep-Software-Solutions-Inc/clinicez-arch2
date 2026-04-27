using CLINICEZ.PhilHealth.Proxy.Common;
using CLINICEZ.PhilHealth.Proxy.Features.Eligibility.Queries.CheckEligibility;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace CLINICEZ.PhilHealth.Proxy.Controllers;

[ApiController]
[Route("api/[controller]")]
public sealed class EligibilityController(ISender mediator) : ControllerBase
{
    /// <summary>Checks PhilHealth Konsulta eligibility for a member at a facility on a given date.</summary>
    [HttpPost("check")]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status502BadGateway)]
    public async Task<IActionResult> CheckEligibility(
        [FromBody] CheckEligibilityRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            var query = new CheckEligibilityQuery(
                request.PhilHealthNumber,
                request.FacilityAccreditationNumber,
                request.ConsultationDate,
                request.DiagnosisCodes);

            var result = await mediator.Send(query, cancellationToken);

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
}

/// <summary>Request body for the eligibility check endpoint.</summary>
public sealed record CheckEligibilityRequest(
    string PhilHealthNumber,
    string FacilityAccreditationNumber,
    string ConsultationDate,
    IReadOnlyList<string> DiagnosisCodes
);
