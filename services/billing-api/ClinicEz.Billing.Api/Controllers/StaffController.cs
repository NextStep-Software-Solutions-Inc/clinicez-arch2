using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Billing.Api.Authorization;
using ClinicEz.Billing.Domain.Constants;
using ClinicEz.Billing.Infrastructure.Auth;
using ClinicEz.Shared.Common;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Billing.Api.Controllers;

[ApiController]
[Route("api/v1/staff")]
[HasPermission(BillingPermissions.StaffManage)]
public sealed class StaffController : ControllerBase
{
    private readonly StaffAdminService _staff;

    public StaffController(StaffAdminService staff) => _staff = staff;

    [HttpGet]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<StaffDto>>>> List(CancellationToken ct) =>
        Ok(ApiResponse<IReadOnlyList<StaffDto>>.Success(await _staff.ListAsync(ct)));

    [HttpPost]
    public async Task<ActionResult<ApiResponse<StaffDto>>> Create([FromBody] CreateStaffRequest request, CancellationToken ct) =>
        StatusCode(StatusCodes.Status201Created, ApiResponse<StaffDto>.Success(await _staff.CreateAsync(request, ct)));

    [HttpPost("{staffId:guid}/deactivate")]
    public async Task<ActionResult<ApiResponse<StaffDto>>> Deactivate(Guid staffId, CancellationToken ct) =>
        Ok(ApiResponse<StaffDto>.Success(await _staff.DeactivateAsync(staffId, ct)));
}
