using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Features.Queue.Commands;
using ClinicEz.Clinic.Application.Features.Queue.DTOs;
using ClinicEz.Clinic.Application.Features.Queue.Queries;
using ClinicEz.Clinic.Application.Features.Triage.Commands;
using ClinicEz.Clinic.Application.Features.Triage.DTOs;
using ClinicEz.Clinic.Application.Features.Triage.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using QueueMetricsDto = ClinicEz.Clinic.Application.Features.Queue.Queries.QueueMetricsDto;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/queue")]
public sealed class QueueController : ControllerBase
{
    private readonly ISender _sender;

    public QueueController(ISender sender)
    {
        _sender = sender;
    }

    [HttpPost("check-in")]
    [HasPermission(ClinicPermissions.QueueCheckIn)]
    public async Task<ActionResult<ApiResponse<QueueItemDto>>> CheckInPatient(
        [FromBody] CheckInPatientCommand command,
        CancellationToken ct)
    {
        var result = await _sender.Send(command, ct);
        return CreatedAtAction(nameof(GetQueue), new { id = result.Id }, ApiResponse<QueueItemDto>.Success(result, "Patient checked in successfully."));
    }

    [HttpGet]
    [HasPermission(ClinicPermissions.QueueRead)]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<QueueItemDto>>>> GetQueue(
        [FromQuery] DateOnly? date,
        [FromQuery] QueueStatus? status,
        [FromQuery] Guid? doctorId,
        [FromQuery] string? roomOrStation,
        [FromQuery] string? view,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetQueueQuery(date, status, doctorId, roomOrStation, view), ct);
        return Ok(ApiResponse<IReadOnlyList<QueueItemDto>>.Success(result));
    }

    [HttpGet("metrics")]
    [HasPermission(ClinicPermissions.QueueRead)]
    public async Task<ActionResult<ApiResponse<QueueMetricsDto>>> GetQueueMetrics(
        [FromQuery] DateOnly? date,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetQueueMetricsQuery(date), ct);
        return Ok(ApiResponse<QueueMetricsDto>.Success(result));
    }

    [HttpPost("{id:guid}/triage")]
    [HasPermission(ClinicPermissions.TriageWrite)]
    public async Task<ActionResult<ApiResponse<TriageVitalsDto>>> RecordTriage(
        Guid id,
        [FromBody] RecordTriageRequest request,
        CancellationToken ct)
    {
        var command = new RecordTriageVitalsCommand(
            id,
            request.NurseId,
            request.RecordedByNurseName,
            request.SystolicBp,
            request.DiastolicBp,
            request.HeartRateBpm,
            request.TemperatureCelsius,
            request.RespiratoryRateBreathsPerMin,
            request.OxygenSaturationPercent,
            request.HeightCm,
            request.WeightKg,
            request.PainScore,
            request.Notes,
            request.VisualAcuityLeft,
            request.VisualAcuityRight,
            request.HeadCircumferenceCm,
            request.MidUpperArmCircumferenceCm,
            request.IsMeasuredRecumbent,
            request.ZScoreWeightForAge,
            request.ZScoreLengthForAge,
            request.ZScoreWeightForLength,
            request.PhilHealthZScoreCategory,
            request.PhilHealthZScoreCode);

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<TriageVitalsDto>.Success(result, "Triage vitals recorded successfully."));
    }

    [HttpGet("{id:guid}/triage")]
    [HasPermission(ClinicPermissions.TriageRead)]
    public async Task<ActionResult<ApiResponse<TriageVitalsDto>>> GetTriage(
        Guid id,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetTriageVitalsQuery(id), ct);
        if (result == null)
        {
            return NotFound(ApiResponse<TriageVitalsDto>.Fail("No vitals recorded for this queue ticket."));
        }
        return Ok(ApiResponse<TriageVitalsDto>.Success(result));
    }

    [HttpPost("{id:guid}/call")]
    [HasPermission(ClinicPermissions.QueueCall)]
    public async Task<ActionResult<ApiResponse<QueueItemDto>>> CallQueueItem(
        Guid id,
        [FromBody] CallQueueRequest? request,
        CancellationToken ct)
    {
        var result = await _sender.Send(new CallQueueItemCommand(id, request?.DoctorId, request?.DoctorName, request?.RoomOrStation), ct);
        return Ok(ApiResponse<QueueItemDto>.Success(result, "Patient called to room."));
    }

    [HttpPost("{id:guid}/complete")]
    [HasPermission(ClinicPermissions.QueueComplete)]
    public async Task<ActionResult<ApiResponse<bool>>> CompleteQueueItem(
        Guid id,
        CancellationToken ct)
    {
        var result = await _sender.Send(new CompleteQueueItemCommand(id), ct);
        return Ok(ApiResponse<bool>.Success(result, "Queue item completed."));
    }

    [HttpPost("{id:guid}/no-show")]
    [HasPermission(ClinicPermissions.QueueCall)]
    public async Task<ActionResult<ApiResponse<QueueItemDto>>> MarkNoShow(
        Guid id,
        CancellationToken ct)
    {
        var result = await _sender.Send(new MarkQueueItemNoShowCommand(id), ct);
        return Ok(ApiResponse<QueueItemDto>.Success(result, "Patient marked as no-show."));
    }

    [HttpPost("{id:guid}/hold")]
    [HasPermission(ClinicPermissions.QueueCall)]
    public async Task<ActionResult<ApiResponse<QueueItemDto>>> PutOnHold(
        Guid id,
        CancellationToken ct)
    {
        var result = await _sender.Send(new PutQueueItemOnHoldCommand(id), ct);
        return Ok(ApiResponse<QueueItemDto>.Success(result, "Patient put on hold."));
    }

    [HttpPost("{id:guid}/reactivate")]
    [HasPermission(ClinicPermissions.QueueCall)]
    public async Task<ActionResult<ApiResponse<QueueItemDto>>> Reactivate(
        Guid id,
        CancellationToken ct)
    {
        var result = await _sender.Send(new ReactivateQueueItemCommand(id), ct);
        return Ok(ApiResponse<QueueItemDto>.Success(result, "Queue ticket reactivated."));
    }

    [HttpPost("{id:guid}/cancel")]
    [HasPermission(ClinicPermissions.QueueCall)]
    public async Task<ActionResult<ApiResponse<QueueItemDto>>> CancelTicket(
        Guid id,
        [FromBody] CancelQueueTicketRequest? request,
        CancellationToken ct)
    {
        var result = await _sender.Send(new CancelQueueTicketCommand(id, request?.Reason), ct);
        return Ok(ApiResponse<QueueItemDto>.Success(result, "Queue ticket cancelled."));
    }
}

public sealed record CancelQueueTicketRequest(string? Reason = null);

public sealed record RecordTriageRequest(
    Guid? NurseId,
    string? RecordedByNurseName,
    int? SystolicBp,
    int? DiastolicBp,
    int? HeartRateBpm,
    decimal? TemperatureCelsius,
    int? RespiratoryRateBreathsPerMin,
    decimal? OxygenSaturationPercent,
    decimal? HeightCm,
    decimal? WeightKg,
    int? PainScore,
    string? Notes,
    string? VisualAcuityLeft = null,
    string? VisualAcuityRight = null,
    decimal? HeadCircumferenceCm = null,
    decimal? MidUpperArmCircumferenceCm = null,
    bool IsMeasuredRecumbent = false,
    decimal? ZScoreWeightForAge = null,
    decimal? ZScoreLengthForAge = null,
    decimal? ZScoreWeightForLength = null,
    string? PhilHealthZScoreCategory = null,
    string? PhilHealthZScoreCode = null);

public sealed record CallQueueRequest(Guid? DoctorId, string? DoctorName, string? RoomOrStation = null);
