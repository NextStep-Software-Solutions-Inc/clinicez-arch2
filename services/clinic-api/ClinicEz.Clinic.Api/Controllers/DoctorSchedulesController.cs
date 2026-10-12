using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Features.Schedules.Commands;
using ClinicEz.Clinic.Application.Features.Schedules.DTOs;
using ClinicEz.Clinic.Application.Features.Schedules.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/doctors/{doctorId:guid}/schedules")]
public sealed class DoctorSchedulesController : ControllerBase
{
    private readonly ISender _sender;

    public DoctorSchedulesController(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet("templates")]
    [HasPermission(ClinicPermissions.SchedulesRead)]
    public async Task<ActionResult<ApiResponse<List<DoctorScheduleTemplateDto>>>> GetTemplates(
        Guid doctorId,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetDoctorScheduleTemplatesQuery(doctorId), ct);
        return Ok(ApiResponse<List<DoctorScheduleTemplateDto>>.Success(result));
    }

    [HttpPost("templates")]
    [HasPermission(ClinicPermissions.SchedulesManage)]
    public async Task<ActionResult<ApiResponse<DoctorScheduleTemplateDto>>> UpsertTemplate(
        Guid doctorId,
        [FromBody] UpsertTemplateRequest request,
        CancellationToken ct)
    {
        var command = new UpsertDoctorScheduleTemplateCommand(
            DoctorId: doctorId,
            DoctorName: request.DoctorName,
            DayOfWeek: request.DayOfWeek,
            StartTime: request.StartTime,
            EndTime: request.EndTime,
            IsOvernightShift: request.IsOvernightShift,
            SlotDurationMinutes: request.SlotDurationMinutes > 0 ? request.SlotDurationMinutes : 30,
            MaxPatientsPerSlot: request.MaxPatientsPerSlot > 0 ? request.MaxPatientsPerSlot : 1,
            IsActive: request.IsActive,
            EffectiveStartDate: request.EffectiveStartDate,
            EffectiveEndDate: request.EffectiveEndDate,
            Breaks: request.Breaks);

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<DoctorScheduleTemplateDto>.Success(result, "Doctor schedule template saved successfully."));
    }

    [HttpDelete("templates/{templateId:guid}")]
    [HasPermission(ClinicPermissions.SchedulesManage)]
    public async Task<ActionResult<ApiResponse<bool>>> DeleteTemplate(
        Guid doctorId,
        Guid templateId,
        CancellationToken ct)
    {
        var result = await _sender.Send(new DeleteDoctorScheduleTemplateCommand(doctorId, templateId), ct);
        return Ok(ApiResponse<bool>.Success(result, "Doctor schedule template removed successfully."));
    }

    [HttpGet("availability")]
    [HasPermission(ClinicPermissions.SchedulesRead)]
    public async Task<ActionResult<ApiResponse<DoctorAvailabilityDto>>> GetAvailability(
        Guid doctorId,
        [FromQuery] DateOnly? date,
        [FromQuery] int? interval,
        CancellationToken ct)
    {
        var targetDate = date ?? DateOnly.FromDateTime(DateTime.UtcNow);
        var result = await _sender.Send(new GetDoctorAvailableSlotsQuery(doctorId, targetDate, interval), ct);
        return Ok(ApiResponse<DoctorAvailabilityDto>.Success(result));
    }

    [HttpGet("leaves")]
    [HasPermission(ClinicPermissions.SchedulesRead)]
    public async Task<ActionResult<ApiResponse<List<DoctorLeaveDto>>>> GetLeaves(
        Guid doctorId,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetDoctorLeavesQuery(doctorId), ct);
        return Ok(ApiResponse<List<DoctorLeaveDto>>.Success(result));
    }

    [HttpPost("leaves")]
    [HasPermission(ClinicPermissions.SchedulesManage)]
    public async Task<ActionResult<ApiResponse<DoctorLeaveDto>>> CreateLeave(
        Guid doctorId,
        [FromBody] CreateLeaveRequest request,
        CancellationToken ct)
    {
        var command = new CreateDoctorLeaveCommand(
            DoctorId: doctorId,
            DoctorName: request.DoctorName,
            StartDate: request.StartDate,
            EndDate: request.EndDate,
            PartialDayStartTime: request.PartialDayStartTime,
            PartialDayEndTime: request.PartialDayEndTime,
            Reason: request.Reason,
            LeaveType: request.LeaveType ?? "Vacation");

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<DoctorLeaveDto>.Success(result, "Doctor leave recorded successfully."));
    }

    [HttpDelete("leaves/{leaveId:guid}")]
    [HasPermission(ClinicPermissions.SchedulesManage)]
    public async Task<ActionResult<ApiResponse<bool>>> DeleteLeave(
        Guid doctorId,
        Guid leaveId,
        CancellationToken ct)
    {
        var result = await _sender.Send(new DeleteDoctorLeaveCommand(leaveId), ct);
        return Ok(ApiResponse<bool>.Success(result, "Doctor leave removed successfully."));
    }
}

public sealed record UpsertTemplateRequest(
    string? DoctorName,
    DayOfWeek DayOfWeek,
    TimeOnly StartTime,
    TimeOnly EndTime,
    bool IsOvernightShift = false,
    int SlotDurationMinutes = 30,
    int MaxPatientsPerSlot = 1,
    bool IsActive = true,
    DateOnly? EffectiveStartDate = null,
    DateOnly? EffectiveEndDate = null,
    List<DoctorBreakTimeDto>? Breaks = null);

public sealed record CreateLeaveRequest(
    string? DoctorName,
    DateOnly StartDate,
    DateOnly EndDate,
    TimeOnly? PartialDayStartTime = null,
    TimeOnly? PartialDayEndTime = null,
    string? Reason = null,
    string? LeaveType = "Vacation");
