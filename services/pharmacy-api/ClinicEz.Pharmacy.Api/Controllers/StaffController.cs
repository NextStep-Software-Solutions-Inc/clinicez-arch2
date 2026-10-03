using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Pharmacy.Application.Features.Staff.Commands;
using ClinicEz.Pharmacy.Application.Features.Staff.DTOs;
using ClinicEz.Pharmacy.Application.Features.Staff.Queries;
using ClinicEz.Pharmacy.Domain.Enums;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Pharmacy.Api.Controllers;

public sealed record CreatePharmacyStaffRequest(
    string FirstName,
    string LastName,
    string? MiddleName,
    string? Title,
    PharmacyStaffRole Role,
    string? Email,
    string? PhoneNumber,
    string? PrcLicenseNumber,
    string? S2LicenseNumber);

[ApiController]
[Route("api/v1/pharmacy/staff")]
public sealed class StaffController : ControllerBase
{
    private readonly ISender _sender;

    public StaffController(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet]
    public async Task<ActionResult<ApiResponse<List<PharmacyStaffMemberDto>>>> GetStaffMembers(
        [FromHeader(Name = "X-Facility-Id")] Guid? facilityId,
        CancellationToken ct)
    {
        var targetPharmacyId = facilityId ?? Guid.Empty;
        var result = await _sender.Send(new GetPharmacyStaffMembersQuery(targetPharmacyId), ct);
        return Ok(ApiResponse<List<PharmacyStaffMemberDto>>.Success(result));
    }

    [HttpPost]
    public async Task<ActionResult<ApiResponse<PharmacyStaffMemberDto>>> CreateStaffMember(
        [FromHeader(Name = "X-Tenant-Id")] string? tenantId,
        [FromHeader(Name = "X-Facility-Id")] Guid? facilityId,
        [FromBody] CreatePharmacyStaffRequest request,
        CancellationToken ct)
    {
        var targetTenantId = !string.IsNullOrWhiteSpace(tenantId) ? tenantId : "default";
        var targetPharmacyId = facilityId ?? Guid.Empty;

        var command = new CreatePharmacyStaffMemberCommand(
            targetTenantId,
            targetPharmacyId,
            request.FirstName,
            request.LastName,
            request.MiddleName,
            request.Title,
            request.Role,
            request.Email,
            request.PhoneNumber,
            request.PrcLicenseNumber,
            request.S2LicenseNumber);

        var result = await _sender.Send(command, ct);
        return CreatedAtAction(nameof(GetStaffMembers), new { id = result.Id }, ApiResponse<PharmacyStaffMemberDto>.Success(result, "Pharmacy staff member created successfully."));
    }
}
