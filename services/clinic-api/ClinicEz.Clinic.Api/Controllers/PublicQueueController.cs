using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Queue.DTOs;
using ClinicEz.Clinic.Application.Features.Queue.Queries;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/public/queue")]
[AllowAnonymous]
public sealed class PublicQueueController : ControllerBase
{
    private readonly ISender _sender;

    public PublicQueueController(ISender sender)
    {
        _sender = sender;
    }

    /// <summary>
    /// Anonymous endpoint for public waiting area lobby TV monitors.
    /// Returns active serving tickets and upcoming tickets with patient privacy masking.
    /// Excludes all Protected Health Information (PHI).
    /// </summary>
    [HttpGet("display")]
    public async Task<ActionResult<ApiResponse<PublicQueueDisplayDto>>> GetPublicQueueDisplay(
        [FromQuery] Guid? clinicId,
        [FromQuery] string? tenantSlug,
        [FromQuery] string? facilitySlug,
        [FromQuery] DateOnly? date,
        [FromQuery] string? pin,
        [FromHeader(Name = "X-Queue-Pin")] string? headerPin,
        CancellationToken ct = default)
    {
        var effectivePin = !string.IsNullOrWhiteSpace(headerPin) ? headerPin : pin;
        var result = await _sender.Send(new GetPublicQueueDisplayQuery(clinicId, tenantSlug, facilitySlug, date, effectivePin), ct);
        if (result == null)
        {
            return NotFound(ApiResponse<PublicQueueDisplayDto>.Fail("Clinic not found for public TV display."));
        }

        return Ok(ApiResponse<PublicQueueDisplayDto>.Success(result));
    }
}
