using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Application.Features.DataUpload.Commands;
using ClinicEz.PhilHealthProxy.Application.Features.DataUpload.Queries;
using ClinicEz.PhilHealthProxy.Domain.Models;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.PhilHealthProxy.Api.Controllers;

[ApiController]
[Route("api/v1/yakap-data-upload")]
public sealed class DataUploadController(IMediator mediator) : ControllerBase
{
    private static readonly HashSet<string> ValidForms = new(StringComparer.OrdinalIgnoreCase)
    {
        "fpe", "consultation", "diagnostic-request", "diagnostic-results", "medicine", "referral"
    };

    [HttpPost("{form}")]
    [ProducesResponseType<ApiResponse<DataUploadResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<IActionResult> Upload(
        [FromRoute] string form,
        [FromBody] PhilHealthEncryptedPayload payload,
        CancellationToken ct)
    {
        if (!ValidForms.Contains(form))
        {
            return BadRequest(ApiResponse<DataUploadResponse>.Fail(
                $"Invalid upload form '{form}'. Allowed forms: {string.Join(", ", ValidForms)}"));
        }

        var result = await mediator.Send(new UploadDataCommand(form.ToLowerInvariant(), payload), ct);
        return Ok(ApiResponse<DataUploadResponse>.Success(result));
    }

    [HttpGet("status/{uploadTransactionNo}")]
    [ProducesResponseType<ApiResponse<DataUploadStatusResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetStatus(
        [FromRoute] string uploadTransactionNo,
        CancellationToken ct)
    {
        var result = await mediator.Send(new GetUploadStatusQuery(uploadTransactionNo), ct);
        return Ok(ApiResponse<DataUploadStatusResponse>.Success(result));
    }
}
