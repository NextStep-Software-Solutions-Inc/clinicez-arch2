using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Features.Rooms.Commands;
using ClinicEz.Clinic.Application.Features.Rooms.DTOs;
using ClinicEz.Clinic.Application.Features.Rooms.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/rooms")]
[Authorize]
public sealed class RoomsController : ControllerBase
{
    private readonly ISender _sender;

    public RoomsController(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<ClinicRoomDto>>>> GetRooms(
        [FromQuery] bool activeOnly = false,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new GetClinicRoomsQuery(activeOnly), ct);
        return Ok(ApiResponse<IReadOnlyList<ClinicRoomDto>>.Success(result));
    }

    [HttpPost]
    [HasPermission(ClinicPermissions.SettingsManage)]
    public async Task<ActionResult<ApiResponse<ClinicRoomDto>>> CreateRoom(
        [FromBody] CreateClinicRoomCommand command,
        CancellationToken ct)
    {
        var result = await _sender.Send(command, ct);
        return CreatedAtAction(nameof(GetRooms), ApiResponse<ClinicRoomDto>.Success(result, "Clinic room created successfully."));
    }

    [HttpPut("{id:guid}")]
    [HasPermission(ClinicPermissions.SettingsManage)]
    public async Task<ActionResult<ApiResponse<ClinicRoomDto>>> UpdateRoom(
        Guid id,
        [FromBody] UpdateClinicRoomRequest request,
        CancellationToken ct)
    {
        var result = await _sender.Send(new UpdateClinicRoomCommand(
            id,
            request.Name,
            request.Code,
            request.Type,
            request.Description,
            request.DisplayOrder,
            request.IsActive), ct);
        return Ok(ApiResponse<ClinicRoomDto>.Success(result, "Clinic room updated successfully."));
    }

    [HttpDelete("{id:guid}")]
    [HasPermission(ClinicPermissions.SettingsManage)]
    public async Task<ActionResult<ApiResponse<bool>>> DeleteRoom(Guid id, CancellationToken ct)
    {
        var result = await _sender.Send(new DeleteClinicRoomCommand(id), ct);
        return Ok(ApiResponse<bool>.Success(result, "Clinic room deleted successfully."));
    }

    [HttpPost("reorder")]
    [HasPermission(ClinicPermissions.SettingsManage)]
    public async Task<ActionResult<ApiResponse<bool>>> ReorderRooms(
        [FromBody] ReorderClinicRoomsRequest request,
        CancellationToken ct)
    {
        var result = await _sender.Send(new ReorderClinicRoomsCommand(request.OrderedIds), ct);
        return Ok(ApiResponse<bool>.Success(result, "Clinic rooms reordered successfully."));
    }
}

public sealed record UpdateClinicRoomRequest(
    string Name,
    string? Code,
    ClinicRoomType Type,
    string? Description = null,
    int? DisplayOrder = null,
    bool IsActive = true);

public sealed record ReorderClinicRoomsRequest(IReadOnlyList<Guid> OrderedIds);

