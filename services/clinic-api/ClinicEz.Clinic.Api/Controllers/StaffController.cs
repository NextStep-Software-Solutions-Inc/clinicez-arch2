using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Features.Staff.Commands;
using ClinicEz.Clinic.Application.Features.Staff.DTOs;
using ClinicEz.Clinic.Application.Features.Staff.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/staff")]
public sealed class StaffController : ControllerBase
{
    private readonly ISender _sender;

    public StaffController(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet]
    [HasPermission(ClinicPermissions.StaffRead)]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<StaffMemberDto>>>> GetStaff(
        [FromQuery] StaffRole? role,
        [FromQuery] bool? isActive,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetStaffMembersQuery(role, isActive), ct);
        return Ok(ApiResponse<IReadOnlyList<StaffMemberDto>>.Success(result));
    }

    [HttpGet("{id:guid}")]
    [HasPermission(ClinicPermissions.StaffRead)]
    public async Task<ActionResult<ApiResponse<StaffMemberDto>>> GetStaffMember(Guid id, CancellationToken ct)
    {
        var result = await _sender.Send(new GetStaffMemberByIdQuery(id), ct);
        return Ok(ApiResponse<StaffMemberDto>.Success(result));
    }

    [HttpPost]
    [HasPermission(ClinicPermissions.StaffManage)]
    public async Task<ActionResult<ApiResponse<StaffMemberDto>>> CreateStaffMember(
        [FromBody] CreateStaffMemberCommand command,
        CancellationToken ct)
    {
        var result = await _sender.Send(command, ct);
        return CreatedAtAction(nameof(GetStaffMember), new { id = result.Id }, ApiResponse<StaffMemberDto>.Success(result));
    }

    [HttpPut("{id:guid}")]
    [HasPermission(ClinicPermissions.StaffManage)]
    public async Task<ActionResult<ApiResponse<StaffMemberDto>>> UpdateStaffMember(
        Guid id,
        [FromBody] UpdateStaffMemberRequest request,
        CancellationToken ct)
    {
        var command = new UpdateStaffMemberCommand(
            id,
            request.FirstName,
            request.LastName,
            request.MiddleName,
            request.Title,
            request.Role,
            request.ClinicRoleId,
            request.Email,
            request.PhoneNumber,
            request.PrcLicenseNumber,
            request.PtrNumber,
            request.S2LicenseNumber,
            request.Specialty,
            request.IsActive);

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<StaffMemberDto>.Success(result));
    }

    [HttpPost("{id:guid}/reset-password")]
    [HasPermission(ClinicPermissions.StaffManage)]
    public async Task<ActionResult<ApiResponse<ResetStaffPasswordResult>>> ResetPassword(
        Guid id,
        [FromBody] ResetStaffPasswordRequest? request,
        CancellationToken ct)
    {
        var result = await _sender.Send(new ResetStaffPasswordCommand(id, request?.TemporaryPassword), ct);
        return Ok(ApiResponse<ResetStaffPasswordResult>.Success(result, "Staff password reset successfully."));
    }

    [HttpDelete("{id:guid}")]
    [HasPermission(ClinicPermissions.StaffManage)]
    public async Task<ActionResult<ApiResponse<bool>>> DeactivateStaffMember(Guid id, CancellationToken ct)
    {
        var result = await _sender.Send(new DeactivateStaffMemberCommand(id), ct);
        return Ok(ApiResponse<bool>.Success(result, "Staff member deactivated successfully."));
    }

    [HttpPost("{id:guid}/activate")]
    [HttpPost("{id:guid}/reactivate")]
    [HasPermission(ClinicPermissions.StaffManage)]
    public async Task<ActionResult<ApiResponse<StaffMemberDto>>> ActivateStaffMember(Guid id, CancellationToken ct)
    {
        var result = await _sender.Send(new ActivateStaffMemberCommand(id), ct);
        return Ok(ApiResponse<StaffMemberDto>.Success(result, "Staff member activated successfully."));
    }
}

public sealed record ResetStaffPasswordRequest(string? TemporaryPassword);

public sealed record UpdateStaffMemberRequest(
    string FirstName,
    string LastName,
    string? MiddleName,
    string? Title,
    StaffRole Role,
    Guid? ClinicRoleId,
    string? Email,
    string? PhoneNumber,
    string? PrcLicenseNumber,
    string? PtrNumber,
    string? S2LicenseNumber,
    string? Specialty,
    bool IsActive = true);
