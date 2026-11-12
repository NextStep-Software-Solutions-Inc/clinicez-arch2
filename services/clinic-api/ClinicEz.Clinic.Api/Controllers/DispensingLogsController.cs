using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Features.Dispensing.Commands;
using ClinicEz.Clinic.Application.Features.Dispensing.DTOs;
using ClinicEz.Clinic.Application.Features.Dispensing.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/dispensing-logs")]
public sealed class DispensingLogsController : ControllerBase
{
    private readonly ISender _sender;

    public DispensingLogsController(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet]
    [HasPermission(ClinicPermissions.TriageRead)]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<ClinicDispensingLogDto>>>> GetDispensingLogs(
        [FromQuery] DateTime? startDate,
        [FromQuery] DateTime? endDate,
        [FromQuery] string? source,
        [FromQuery] bool? unreviewedOnly,
        [FromQuery] Guid? patientId,
        [FromQuery] Guid? queueItemId,
        [FromQuery] string? rosCategory,
        [FromQuery] string? search,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetClinicDispensingLogsQuery(
            startDate,
            endDate,
            source,
            unreviewedOnly,
            patientId,
            queueItemId,
            rosCategory,
            search), ct);

        return Ok(ApiResponse<IReadOnlyList<ClinicDispensingLogDto>>.Success(result));
    }

    [HttpPost("{id:guid}/review")]
    [HasPermission(ClinicPermissions.ConsultationsSign)]
    public async Task<ActionResult<ApiResponse<ClinicDispensingLogDto>>> ReviewDispensingLog(
        Guid id,
        [FromBody] ReviewDispensingLogRequest? request,
        CancellationToken ct)
    {
        var result = await _sender.Send(new ReviewClinicDispensingLogCommand(
            id,
            request?.DoctorId,
            request?.DoctorName,
            request?.ReviewNotes,
            request?.InterventionFlagged ?? false), ct);

        return Ok(ApiResponse<ClinicDispensingLogDto>.Success(result, "Dispensing log reviewed by physician."));
    }
}

public sealed record ReviewDispensingLogRequest(
    Guid? DoctorId = null,
    string? DoctorName = null,
    string? ReviewNotes = null,
    bool InterventionFlagged = false);
