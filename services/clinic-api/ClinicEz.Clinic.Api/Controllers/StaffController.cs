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

using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Documents.Configuration;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/staff")]
public sealed class StaffController : ControllerBase
{
    private readonly ISender _sender;
    private readonly IClinicContext _clinicContext;

    public StaffController(ISender sender, IClinicContext clinicContext)
    {
        _sender = sender;
        _clinicContext = clinicContext;
    }

    [HttpGet("me")]
    public async Task<ActionResult<ApiResponse<StaffMemberDto>>> GetMyProfile(CancellationToken ct)
    {
        if (!_clinicContext.StaffId.HasValue)
        {
            return Unauthorized(ApiResponse<StaffMemberDto>.Fail("No authenticated staff member associated with the current session."));
        }

        var result = await _sender.Send(new GetStaffMemberByIdQuery(_clinicContext.StaffId.Value), ct);
        return Ok(ApiResponse<StaffMemberDto>.Success(result));
    }

    [HttpPut("me")]
    public async Task<ActionResult<ApiResponse<StaffMemberDto>>> UpdateMyProfile(
        [FromBody] UpdateMyProfileRequest request,
        CancellationToken ct)
    {
        if (!_clinicContext.StaffId.HasValue)
        {
            return Unauthorized(ApiResponse<StaffMemberDto>.Fail("No authenticated staff member associated with the current session."));
        }

        var command = new UpdateMyProfileCommand(
            _clinicContext.StaffId.Value,
            request.FirstName,
            request.LastName,
            request.MiddleName,
            request.Title,
            request.PhoneNumber,
            request.PrcLicenseNumber,
            request.PtrNumber,
            request.S2LicenseNumber,
            request.Specialty,
            request.PhilHealthPan,
            SignatureSpecimen: request.SignatureSpecimen,
            DefaultSignatureMode: request.DefaultSignatureMode);

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<StaffMemberDto>.Success(result, "Profile updated successfully."));
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
    public async Task<ActionResult<ApiResponse<StaffMemberDto>>> UpdateStaffMember(
        Guid id,
        [FromBody] UpdateStaffMemberRequest request,
        CancellationToken ct)
    {
        bool isSelf = _clinicContext.StaffId.HasValue && _clinicContext.StaffId.Value == id;
        bool hasManage = _clinicContext.HasPermission(ClinicPermissions.StaffManage);

        if (!hasManage && !isSelf)
        {
            return StatusCode(StatusCodes.Status403Forbidden, ApiResponse<StaffMemberDto>.Fail(
                $"Forbidden: Insufficient permissions. Required permission '{ClinicPermissions.StaffManage}' is not granted for this clinic role.",
                new[] { new ApiFieldError("Permission", "FORBIDDEN", $"Missing required permission: {ClinicPermissions.StaffManage}") }));
        }

        if (!hasManage && isSelf)
        {
            var myCommand = new UpdateMyProfileCommand(
                id,
                request.FirstName,
                request.LastName,
                request.MiddleName,
                request.Title,
                request.PhoneNumber,
                request.PrcLicenseNumber,
                request.PtrNumber,
                request.S2LicenseNumber,
                request.Specialty,
                request.PhilHealthPan,
                RequestedRole: request.Role,
                RequestedClinicRoleId: request.ClinicRoleId,
                SignatureSpecimen: request.SignatureSpecimen,
                DefaultSignatureMode: request.DefaultSignatureMode);

            var myResult = await _sender.Send(myCommand, ct);
            return Ok(ApiResponse<StaffMemberDto>.Success(myResult, "Profile updated successfully."));
        }

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
            request.IsActive,
            request.PhilHealthPan,
            request.AssignedRoomIds,
            request.ClearAssignedRoom,
            SignatureSpecimen: request.SignatureSpecimen,
            DefaultSignatureMode: request.DefaultSignatureMode);

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<StaffMemberDto>.Success(result, "Staff member updated successfully."));
    }

    [HttpPost("{id:guid}/reset-password")]
    [HasPermission(ClinicPermissions.StaffManage)]
    public async Task<ActionResult<ApiResponse<ResetStaffPasswordResult>>> ResetPassword(
        Guid id,
        [FromBody] ResetStaffPasswordRequest? request,
        CancellationToken ct)
    {
        var result = await _sender.Send(
            new ResetStaffPasswordCommand(
                id,
                request?.TemporaryPassword,
                request?.SendResetEmail ?? false,
                request?.GenerateResetLink ?? false),
            ct);
        return Ok(ApiResponse<ResetStaffPasswordResult>.Success(result, "Staff password reset successfully."));
    }

    [HttpDelete("{id:guid}")]
    [HasPermission(ClinicPermissions.StaffManage)]
    public async Task<ActionResult<ApiResponse<bool>>> DeactivateStaffMember(Guid id, CancellationToken ct)
    {
        var result = await _sender.Send(new DeactivateStaffMemberCommand(id), ct);
        return Ok(ApiResponse<bool>.Success(result, "Staff member deactivated successfully."));
    }

    [HttpPost("{id:guid}/resend-invite")]
    [HasPermission(ClinicPermissions.StaffManage)]
    public async Task<ActionResult<ApiResponse<StaffMemberDto>>> ResendInvite(
        Guid id,
        [FromBody] ResendStaffInviteRequest? request,
        CancellationToken ct)
    {
        var result = await _sender.Send(new ResendStaffInvitationCommand(id, request?.SendInviteEmail ?? true), ct);
        return Ok(ApiResponse<StaffMemberDto>.Success(result, "Staff invitation resent successfully."));
    }

    [HttpPost("{id:guid}/revoke-invite")]
    [HasPermission(ClinicPermissions.StaffManage)]
    public async Task<ActionResult<ApiResponse<bool>>> RevokeInvite(Guid id, CancellationToken ct)
    {
        var result = await _sender.Send(new RevokeStaffInvitationCommand(id), ct);
        return Ok(ApiResponse<bool>.Success(result, "Staff invitation revoked successfully."));
    }

    [HttpPost("{id:guid}/suspend")]
    [HasPermission(ClinicPermissions.StaffManage)]
    public async Task<ActionResult<ApiResponse<StaffMemberDto>>> SuspendStaffMember(Guid id, CancellationToken ct)
    {
        var result = await _sender.Send(new SuspendStaffMemberCommand(id), ct);
        return Ok(ApiResponse<StaffMemberDto>.Success(result, "Staff member suspended successfully."));
    }

    [HttpPost("{id:guid}/activate")]
    [HasPermission(ClinicPermissions.StaffManage)]
    public async Task<ActionResult<ApiResponse<StaffMemberDto>>> ActivateStaffMember(Guid id, CancellationToken ct)
    {
        var result = await _sender.Send(new ActivateStaffMemberCommand(id), ct);
        return Ok(ApiResponse<StaffMemberDto>.Success(result, "Staff member activated successfully."));
    }

    [HttpPost("{id:guid}/reactivate")]
    [HasPermission(ClinicPermissions.StaffManage)]
    public async Task<ActionResult<ApiResponse<StaffMemberDto>>> ReactivateStaffMember(Guid id, CancellationToken ct)
    {
        var result = await _sender.Send(new ReactivateStaffMemberCommand(id), ct);
        return Ok(ApiResponse<StaffMemberDto>.Success(result, "Staff member reactivated successfully."));
    }

    [HttpPost("{id:guid}/reinvite")]
    [HasPermission(ClinicPermissions.StaffManage)]
    public async Task<ActionResult<ApiResponse<StaffMemberDto>>> ReinviteStaffMember(
        Guid id,
        [FromBody] ResendStaffInviteRequest? request,
        CancellationToken ct)
    {
        var result = await _sender.Send(new ReinviteStaffMemberCommand(id, request?.SendInviteEmail ?? true), ct);
        return Ok(ApiResponse<StaffMemberDto>.Success(result, "Staff member re-invited successfully."));
    }

    [HttpDelete("{id:guid}/permanent")]
    [HasPermission(ClinicPermissions.StaffManage)]
    public async Task<ActionResult<ApiResponse<bool>>> RemoveStaffMember(Guid id, CancellationToken ct)
    {
        var result = await _sender.Send(new RemoveStaffMemberCommand(id), ct);
        return Ok(ApiResponse<bool>.Success(result, "Staff member permanently removed from facility directory."));
    }
}

public sealed record ResetStaffPasswordRequest(
    string? TemporaryPassword = null,
    bool SendResetEmail = false,
    bool GenerateResetLink = false);

public sealed record ResendStaffInviteRequest(bool SendInviteEmail = true);

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
    bool IsActive = true,
    string? PhilHealthPan = null,
    IReadOnlyList<Guid>? AssignedRoomIds = null,
    bool ClearAssignedRoom = false,
    string? SignatureSpecimen = null,
    SignatureMode? DefaultSignatureMode = null);

public sealed record UpdateMyProfileRequest(
    string FirstName,
    string LastName,
    string? MiddleName,
    string? Title,
    string? PhoneNumber,
    string? PrcLicenseNumber,
    string? PtrNumber,
    string? S2LicenseNumber,
    string? Specialty,
    string? PhilHealthPan = null,
    string? SignatureSpecimen = null,
    SignatureMode? DefaultSignatureMode = null);
