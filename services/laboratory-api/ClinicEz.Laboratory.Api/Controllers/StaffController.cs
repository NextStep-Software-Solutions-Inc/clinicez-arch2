using System;
using ClinicEz.Laboratory.Api.Authorization;
using ClinicEz.Laboratory.Domain.Constants;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Features.Staff.Commands;
using ClinicEz.Laboratory.Application.Features.Staff.DTOs;
using ClinicEz.Laboratory.Application.Features.Staff.Queries;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Laboratory.Api.Controllers;

public sealed record CreateLabStaffRequest(
    string FirstName,
    string LastName,
    string? MiddleName,
    string? Title,
    LabStaffRole Role,
    string? Email,
    string? PhoneNumber,
    string? PrcLicenseNumber,
    string? PtrNumber,
    string? Specialty);

[ApiController]
[Route("api/v1/laboratory/staff")]
[Route("api/v1/staff")]
public sealed class StaffController : ControllerBase
{
    private readonly ISender _sender;
    private readonly ILabContext _context;

    public StaffController(ISender sender, ILabContext context)
    {
        _sender = sender;
        _context = context;
    }

    [HttpGet]
    [HasPermission(LabPermissions.StaffRead)]
    public async Task<ActionResult<ApiResponse<List<LabStaffMemberDto>>>> GetStaffMembers(CancellationToken ct)
    {
        // Laboratory comes from the validated session, never from a client header.
        if (_context.LaboratoryId is not { } targetLabId) return Forbid();
        var result = await _sender.Send(new GetLabStaffMembersQuery(targetLabId), ct);
        return Ok(ApiResponse<List<LabStaffMemberDto>>.Success(result));
    }

    [HttpPost]
    [HasPermission(LabPermissions.StaffManage)]
    public async Task<ActionResult<ApiResponse<LabStaffMemberDto>>> CreateStaffMember(
        [FromBody] CreateLabStaffRequest request,
        CancellationToken ct)
    {
        // Tenant and laboratory come from the validated session, never from client headers.
        if (_context.LaboratoryId is not { } targetLabId || _context.TenantId is not { Length: > 0 } targetTenantId) return Forbid();

        var command = new CreateLabStaffMemberCommand(
            targetTenantId,
            targetLabId,
            request.FirstName,
            request.LastName,
            request.MiddleName,
            request.Title,
            request.Role,
            request.Email,
            request.PhoneNumber,
            request.PrcLicenseNumber,
            request.PtrNumber,
            request.Specialty);

        var result = await _sender.Send(command, ct);
        return CreatedAtAction(nameof(GetStaffMembers), new { id = result.Id }, ApiResponse<LabStaffMemberDto>.Success(result, "Laboratory staff member created successfully."));
    }

    [HttpDelete("{id:guid}")]
    [HasPermission(LabPermissions.StaffManage)]
    public async Task<ActionResult<ApiResponse<bool>>> DeactivateStaffMember(Guid id, CancellationToken ct)
    {
        if (_context.LaboratoryId is not { } targetLabId) return Forbid();
        var result = await _sender.Send(new DeactivateLabStaffMemberCommand(targetLabId, id), ct);
        return Ok(ApiResponse<bool>.Success(result, "Laboratory staff member deactivated successfully."));
    }
}
