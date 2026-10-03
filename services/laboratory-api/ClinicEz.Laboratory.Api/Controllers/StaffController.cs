using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Features.Staff.Commands;
using ClinicEz.Laboratory.Application.Features.Staff.DTOs;
using ClinicEz.Laboratory.Application.Features.Staff.Queries;
using ClinicEz.Laboratory.Domain.Enums;
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
public sealed class StaffController : ControllerBase
{
    private readonly ISender _sender;

    public StaffController(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet]
    public async Task<ActionResult<ApiResponse<List<LabStaffMemberDto>>>> GetStaffMembers(
        [FromHeader(Name = "X-Facility-Id")] Guid? facilityId,
        CancellationToken ct)
    {
        var targetLabId = facilityId ?? Guid.Empty;
        var result = await _sender.Send(new GetLabStaffMembersQuery(targetLabId), ct);
        return Ok(ApiResponse<List<LabStaffMemberDto>>.Success(result));
    }

    [HttpPost]
    public async Task<ActionResult<ApiResponse<LabStaffMemberDto>>> CreateStaffMember(
        [FromHeader(Name = "X-Tenant-Id")] string? tenantId,
        [FromHeader(Name = "X-Facility-Id")] Guid? facilityId,
        [FromBody] CreateLabStaffRequest request,
        CancellationToken ct)
    {
        var targetTenantId = !string.IsNullOrWhiteSpace(tenantId) ? tenantId : "default";
        var targetLabId = facilityId ?? Guid.Empty;

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
}
