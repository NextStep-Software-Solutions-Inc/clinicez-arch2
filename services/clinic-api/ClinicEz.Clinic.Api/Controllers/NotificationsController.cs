using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Notifications.Commands;
using ClinicEz.Clinic.Application.Features.Notifications.DTOs;
using ClinicEz.Clinic.Application.Features.Notifications.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/notifications")]
[Authorize]
public sealed class NotificationsController : ControllerBase
{
    private readonly ISender _sender;

    public NotificationsController(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet]
    public async Task<ActionResult<ApiResponse<StaffNotificationListDto>>> GetNotifications(
        [FromQuery] bool? unreadOnly = null,
        [FromQuery] StaffNotificationCategory? category = null,
        [FromQuery] NotificationUrgency? urgency = null,
        [FromQuery] int limit = 50,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new GetStaffNotificationsQuery(unreadOnly, category, urgency, limit), ct);
        return Ok(ApiResponse<StaffNotificationListDto>.Success(result));
    }

    [HttpPost("{id:guid}/read")]
    public async Task<ActionResult<ApiResponse<bool>>> MarkRead(
        [FromRoute] Guid id,
        CancellationToken ct = default)
    {
        var success = await _sender.Send(new MarkStaffNotificationReadCommand(id), ct);
        if (!success)
        {
            return NotFound(ApiResponse<bool>.Fail("Notification not found or access denied.", "NOT_FOUND"));
        }
        return Ok(ApiResponse<bool>.Success(true, "Notification marked as read."));
    }

    [HttpPost("read-all")]
    public async Task<ActionResult<ApiResponse<int>>> MarkAllRead(CancellationToken ct = default)
    {
        var count = await _sender.Send(new MarkAllStaffNotificationsReadCommand(), ct);
        return Ok(ApiResponse<int>.Success(count, $"{count} notifications marked as read."));
    }
}
