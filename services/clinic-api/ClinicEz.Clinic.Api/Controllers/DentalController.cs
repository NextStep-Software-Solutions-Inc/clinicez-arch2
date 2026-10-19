using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Features.Dental.Commands;
using ClinicEz.Clinic.Application.Features.Dental.DTOs;
using ClinicEz.Clinic.Application.Features.Dental.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/dental")]
public sealed class DentalController : ControllerBase
{
    private readonly ISender _sender;

    public DentalController(ISender sender)
    {
        _sender = sender ?? throw new ArgumentNullException(nameof(sender));
    }

    /// <summary>
    /// Retrieves the patient's dental chart, tooth records, procedures, and summary counts.
    /// </summary>
    [HttpGet("patients/{patientId:guid}/chart")]
    [HasPermission(ClinicPermissions.ConsultationsRead)]
    public async Task<ActionResult<ApiResponse<DentalChartDto>>> GetPatientChart(
        Guid patientId,
        [FromQuery] Guid? consultationId,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetPatientDentalChartQuery(patientId, consultationId), ct);
        return Ok(ApiResponse<DentalChartDto>.Success(result));
    }

    /// <summary>
    /// Creates or updates a single tooth record in the patient's dental chart.
    /// </summary>
    [HttpPost("patients/{patientId:guid}/teeth")]
    [HasPermission(ClinicPermissions.ConsultationsWrite)]
    public async Task<ActionResult<ApiResponse<DentalToothRecordDto>>> UpsertToothRecord(
        Guid patientId,
        [FromBody] UpsertDentalToothRecordRequest request,
        CancellationToken ct)
    {
        var command = new UpsertDentalToothRecordCommand(
            patientId,
            request.ToothNumber,
            request.Status,
            request.Surface,
            request.Notes,
            request.ConsultationId
        );

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<DentalToothRecordDto>.Success(result, "Tooth record saved successfully."));
    }

    /// <summary>
    /// Atomically saves multiple tooth records in the patient's dental chart.
    /// </summary>
    [HttpPost("patients/{patientId:guid}/chart/batch")]
    [HasPermission(ClinicPermissions.ConsultationsWrite)]
    public async Task<ActionResult<ApiResponse<DentalChartDto>>> BatchSaveChart(
        Guid patientId,
        [FromBody] BatchSaveDentalChartRequest request,
        CancellationToken ct)
    {
        var command = new BatchSaveDentalChartCommand(
            patientId,
            request.ConsultationId,
            request.Teeth
        );

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<DentalChartDto>.Success(result, "Dental chart saved successfully."));
    }
}

public sealed record UpsertDentalToothRecordRequest(
    int ToothNumber,
    ToothStatus Status,
    string? Surface = null,
    string? Notes = null,
    Guid? ConsultationId = null
);

public sealed record BatchSaveDentalChartRequest(
    Guid? ConsultationId,
    List<ToothRecordInput> Teeth
);
