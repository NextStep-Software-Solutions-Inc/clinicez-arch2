using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Features.Roles.Commands;
using ClinicEz.Clinic.Application.Features.Roles.DTOs;
using ClinicEz.Clinic.Application.Features.Roles.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/roles")]
public sealed class RolesController : ControllerBase
{
    private readonly ISender _sender;

    public RolesController(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet]
    [HasPermission(ClinicPermissions.RolesRead)]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<ClinicRoleDto>>>> GetRoles(CancellationToken ct)
    {
        var result = await _sender.Send(new GetClinicRolesQuery(), ct);
        return Ok(ApiResponse<IReadOnlyList<ClinicRoleDto>>.Success(result));
    }

    [HttpGet("permissions")]
    [HasPermission(ClinicPermissions.RolesRead)]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<string>>>> GetAvailablePermissions(CancellationToken ct)
    {
        var result = await _sender.Send(new GetClinicPermissionsQuery(), ct);
        return Ok(ApiResponse<IReadOnlyList<string>>.Success(result));
    }

    [HttpPost]
    [HasPermission(ClinicPermissions.RolesManage)]
    public async Task<ActionResult<ApiResponse<ClinicRoleDto>>> CreateRole([FromBody] CreateClinicRoleCommand command, CancellationToken ct)
    {
        var result = await _sender.Send(command, ct);
        return CreatedAtAction(nameof(GetRoles), ApiResponse<ClinicRoleDto>.Success(result));
    }

    [HttpPut("{id:guid}")]
    [HasPermission(ClinicPermissions.RolesManage)]
    public async Task<ActionResult<ApiResponse<ClinicRoleDto>>> UpdateRole(Guid id, [FromBody] UpdateRoleRequest request, CancellationToken ct)
    {
        var result = await _sender.Send(new UpdateClinicRoleCommand(id, request.Name, request.Description, request.Permissions), ct);
        return Ok(ApiResponse<ClinicRoleDto>.Success(result));
    }

    [HttpDelete("{id:guid}")]
    [HasPermission(ClinicPermissions.RolesManage)]
    public async Task<ActionResult<ApiResponse<bool>>> DeleteRole(Guid id, CancellationToken ct)
    {
        var result = await _sender.Send(new DeleteClinicRoleCommand(id), ct);
        return Ok(ApiResponse<bool>.Success(result, "Role deleted successfully."));
    }
}

public sealed record UpdateRoleRequest(string Name, string? Description, List<string> Permissions);
