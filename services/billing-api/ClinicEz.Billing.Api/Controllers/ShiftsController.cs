using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Billing.Api.Authorization;
using ClinicEz.Billing.Application.Dtos;
using ClinicEz.Billing.Application.Services;
using ClinicEz.Billing.Domain.Constants;
using ClinicEz.Shared.Common;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Billing.Api.Controllers;

[ApiController]
[Route("api/v1/shifts")]
[HasPermission(BillingPermissions.ShiftsManage)]
public sealed class ShiftsController : ControllerBase
{
    private readonly ShiftService _shifts;

    public ShiftsController(ShiftService shifts) => _shifts = shifts;

    [HttpGet]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<ShiftDto>>>> List(CancellationToken ct) =>
        Ok(ApiResponse<IReadOnlyList<ShiftDto>>.Success(await _shifts.ListAsync(ct)));

    /// <summary>The caller's open shift at their counter; <c>data</c> is <c>null</c> when none is open.</summary>
    [HttpGet("current")]
    public async Task<ActionResult<ApiResponse<ShiftDto?>>> Current(CancellationToken ct) =>
        Ok(ApiResponse<ShiftDto?>.Success(await _shifts.CurrentAsync(ct)));

    [HttpPost("open")]
    public async Task<ActionResult<ApiResponse<ShiftDto>>> Open([FromBody] OpenShiftRequest request, CancellationToken ct) =>
        StatusCode(StatusCodes.Status201Created, ApiResponse<ShiftDto>.Success(await _shifts.OpenAsync(request, ct)));

    [HttpPost("{shiftId:guid}/close")]
    public async Task<ActionResult<ApiResponse<ShiftDto>>> Close(Guid shiftId, [FromBody] CloseShiftRequest request, CancellationToken ct) =>
        Ok(ApiResponse<ShiftDto>.Success(await _shifts.CloseAsync(shiftId, request, ct)));
}
