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

/// <summary>One bill for a visit across the facilities of the cell, addressed by its anchor (oldest) invoice.</summary>
[ApiController]
[Route("api/v1/visit-bills")]
public sealed class VisitBillsController : ControllerBase
{
    private readonly VisitBillService _visits;
    private readonly DiscountService _discounts;

    public VisitBillsController(VisitBillService visits, DiscountService discounts)
    {
        _visits = visits;
        _discounts = discounts;
    }

    [HttpGet]
    [HasPermission(BillingPermissions.InvoicesRead)]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<VisitBillSummaryDto>>>> Search(
        [FromQuery] string? search, [FromQuery] string? visitKey, [FromQuery] string? branchId, [FromQuery] string? facilityId, CancellationToken ct) =>
        Ok(ApiResponse<IReadOnlyList<VisitBillSummaryDto>>.Success(await _visits.SearchAsync(search, visitKey, branchId, facilityId, ct)));

    [HttpGet("{anchorInvoiceId:guid}")]
    [HasPermission(BillingPermissions.InvoicesRead)]
    public async Task<ActionResult<ApiResponse<VisitBillDto>>> Get(Guid anchorInvoiceId, CancellationToken ct) =>
        Ok(ApiResponse<VisitBillDto>.Success(await _visits.GetAsync(anchorInvoiceId, ct)));

    [HttpPost("{anchorInvoiceId:guid}/discounts")]
    [HasPermission(BillingPermissions.DiscountsApply)]
    public async Task<ActionResult<ApiResponse<VisitDiscountResult>>> ApplyDiscount(
        Guid anchorInvoiceId, [FromBody] ApplyDiscountRequest request, CancellationToken ct) =>
        Ok(ApiResponse<VisitDiscountResult>.Success(await _discounts.ApplyToVisitAsync(anchorInvoiceId, request, ct)));
}
