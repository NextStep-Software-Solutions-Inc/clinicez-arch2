using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Pharmacy.Api.Authorization;
using ClinicEz.Pharmacy.Application.Features.Staff.Commands;
using ClinicEz.Pharmacy.Application.Features.Staff.DTOs;
using ClinicEz.Pharmacy.Application.Features.Staff.Queries;
using ClinicEz.Pharmacy.Domain.Constants;
using ClinicEz.Pharmacy.Domain.Enums;
using ClinicEz.Pharmacy.Domain.Interfaces;
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
[Route("api/v1/staff")]
public sealed class StaffController : ControllerBase
{
    private readonly ISender _sender;
    private readonly IPharmacyContext _context;

    public StaffController(ISender sender, IPharmacyContext context)
    {
        _sender = sender;
        _context = context;
    }

    [HttpGet]
    [HasPermission(PharmacyPermissions.StaffRead)]
    public async Task<ActionResult<ApiResponse<List<PharmacyStaffMemberDto>>>> GetStaffMembers(CancellationToken ct)
    {
        // The pharmacy comes from the validated session, never from a client header.
        var targetPharmacyId = _context.PharmacyId;
        var result = await _sender.Send(new GetPharmacyStaffMembersQuery(targetPharmacyId), ct);
        return Ok(ApiResponse<List<PharmacyStaffMemberDto>>.Success(result));
    }

    [HttpPost]
    [HasPermission(PharmacyPermissions.StaffManage)]
    public async Task<ActionResult<ApiResponse<PharmacyStaffMemberDto>>> CreateStaffMember(
        [FromBody] CreatePharmacyStaffRequest request,
        CancellationToken ct)
    {
        // Tenant and pharmacy come from the validated session, never from client headers.
        var targetTenantId = _context.TenantId;
        var targetPharmacyId = _context.PharmacyId;

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

    [HttpDelete("{id:guid}")]
    [HasPermission(PharmacyPermissions.StaffManage)]
    public async Task<ActionResult<ApiResponse<bool>>> DeactivateStaffMember(Guid id, CancellationToken ct)
    {
        var targetPharmacyId = _context.PharmacyId;
        var result = await _sender.Send(new DeactivatePharmacyStaffMemberCommand(targetPharmacyId, id), ct);
        return Ok(ApiResponse<bool>.Success(result, "Pharmacy staff member deactivated successfully."));
    }
}
