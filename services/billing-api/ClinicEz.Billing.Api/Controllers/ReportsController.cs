using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Billing.Api.Authorization;
using ClinicEz.Billing.Application.Dtos;
using ClinicEz.Billing.Application.Services;
using ClinicEz.Billing.Domain.Constants;
using ClinicEz.Shared.Common;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Billing.Api.Controllers;

[ApiController]
[Route("api/v1")]
[HasPermission(BillingPermissions.ReportsRead)]
public sealed class ReportsController : ControllerBase
{
    private readonly ReportService _reports;

    public ReportsController(ReportService reports) => _reports = reports;

    /// <summary>Daily collection over a local-date range (<c>utcOffsetMinutes</c> converts the local day boundaries; default UTC+8).</summary>
    [HttpGet("reports/daily-collection")]
    public async Task<ActionResult<ApiResponse<DailyCollectionReport>>> DailyCollection(
        [FromQuery] DateOnly from, [FromQuery] DateOnly to, [FromQuery] int utcOffsetMinutes = 480, [FromQuery] string currency = "PHP",
        [FromQuery] string? facilityId = null, [FromQuery] string? branchId = null, [FromQuery] Guid? cashierUserId = null, CancellationToken ct = default)
    {
        var query = new DailyCollectionQuery(from, to, utcOffsetMinutes, currency, facilityId, branchId, cashierUserId);
        return Ok(ApiResponse<DailyCollectionReport>.Success(await _reports.DailyCollectionAsync(query, ct)));
    }

    [HttpGet("audit")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<AuditEntryDto>>>> Audit(
        [FromQuery] string? entityType, [FromQuery] Guid? entityId, [FromQuery] int take = 50, CancellationToken ct = default) =>
        Ok(ApiResponse<IReadOnlyList<AuditEntryDto>>.Success(await _reports.AuditAsync(entityType, entityId, take, ct)));
}
