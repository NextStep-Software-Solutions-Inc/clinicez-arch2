using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Features.LabResults.Commands;
using ClinicEz.Clinic.Application.Features.LabResults.DTOs;
using ClinicEz.Clinic.Application.Features.LabResults.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interoperability;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

/// <summary>The doctor's review inbox for results that did not come from a ClinicEZ laboratory.</summary>
[ApiController]
[Route("api/v1/lab-results")]
public sealed class LabResultsController : ControllerBase
{
    private readonly ISender _sender;

    public LabResultsController(ISender sender)
    {
        _sender = sender;
    }

    /// <param name="state">Unverified (default), Verified or Rejected.</param>
    /// <param name="scope"><c>mine</c> (default: results of the signed-in doctor's own orders) or <c>all</c>.</param>
    [HttpGet("review")]
    [HasPermission(ClinicPermissions.LabOrdersRead)]
    public async Task<ActionResult<ApiResponse<List<LabResultReviewItemDto>>>> GetReviewQueue(
        [FromQuery] VerificationState state = VerificationState.Unverified,
        [FromQuery] string scope = "mine",
        CancellationToken ct = default)
    {
        var mineOnly = !string.Equals(scope, "all", StringComparison.OrdinalIgnoreCase);
        var result = await _sender.Send(new GetLabResultReviewQueueQuery(state, mineOnly), ct);
        return Ok(ApiResponse<List<LabResultReviewItemDto>>.Success(result));
    }

    [HttpPost("{id:guid}/review")]
    [HasPermission(ClinicPermissions.LabResultsReview)]
    public async Task<ActionResult<ApiResponse<LabResultReviewItemDto>>> Review(
        [FromRoute] Guid id,
        [FromBody] ReviewLabResultRequest request,
        CancellationToken ct)
    {
        var result = await _sender.Send(new ReviewLabResultCommand(id, request.Accepted, request.Remarks), ct);
        return Ok(ApiResponse<LabResultReviewItemDto>.Success(
            result, request.Accepted ? "Result accepted." : "Result rejected."));
    }

    [HttpGet("{id:guid}/file")]
    [HasPermission(ClinicPermissions.LabOrdersRead)]
    public async Task<IActionResult> GetFile([FromRoute] Guid id, CancellationToken ct)
    {
        var file = await _sender.Send(new GetLabResultFileQuery(id), ct);
        return File(file.Content, file.ContentType, file.FileName);
    }
}
