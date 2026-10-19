using ClinicEz.Billing.Api.Authorization;
using ClinicEz.Billing.Application.Dtos;
using ClinicEz.Billing.Application.Services;
using ClinicEz.Billing.Domain.Constants;
using ClinicEz.Billing.Domain.Enums;
using ClinicEz.Shared.Common;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Billing.Api.Controllers;

[ApiController]
[Route("api/v1/invoices")]
public sealed class InvoicesController : ControllerBase
{
    private readonly InvoiceService _invoices;
    private readonly DiscountService _discounts;
    private readonly CorrectionService _corrections;

    public InvoicesController(InvoiceService invoices, DiscountService discounts, CorrectionService corrections)
    {
        _invoices = invoices;
        _discounts = discounts;
        _corrections = corrections;
    }

    [HttpGet]
    [HasPermission(BillingPermissions.InvoicesRead)]
    public async Task<ActionResult<ApiResponse<PagedResult<InvoiceDto>>>> List(
        [FromQuery] InvoiceStatus[]? status, [FromQuery] string? facilityId, [FromQuery] string? branchId, [FromQuery] string? visitKey,
        [FromQuery] string? patientName, [FromQuery] DateTime? fromUtc, [FromQuery] DateTime? toUtc, [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25, CancellationToken ct = default)
    {
        var query = new InvoiceQuery(status, facilityId, branchId, visitKey, patientName, fromUtc, toUtc, page, pageSize);
        return Ok(ApiResponse<PagedResult<InvoiceDto>>.Success(await _invoices.ListAsync(query, ct)));
    }

    [HttpGet("{invoiceId:guid}")]
    [HasPermission(BillingPermissions.InvoicesRead)]
    public async Task<ActionResult<ApiResponse<InvoiceDto>>> Get(Guid invoiceId, CancellationToken ct) =>
        Ok(ApiResponse<InvoiceDto>.Success(await _invoices.GetAsync(invoiceId, ct)));

    /// <summary>A walk-in charge entered at the counter (no requesting facility), issued under the cashier's own counter.</summary>
    [HttpPost]
    [HasPermission(BillingPermissions.InvoicesCreate)]
    public async Task<ActionResult<ApiResponse<InvoiceDto>>> CreateWalkIn([FromBody] CreateInvoiceRequest request, CancellationToken ct) =>
        StatusCode(StatusCodes.Status201Created, ApiResponse<InvoiceDto>.Success(await _invoices.CreateWalkInAsync(request, ct)));

    [HttpPost("{invoiceId:guid}/discounts")]
    [HasPermission(BillingPermissions.DiscountsApply)]
    public async Task<ActionResult<ApiResponse<InvoiceDto>>> ApplyDiscount(Guid invoiceId, [FromBody] ApplyDiscountRequest request, CancellationToken ct) =>
        Ok(ApiResponse<InvoiceDto>.Success(await _discounts.ApplyToInvoiceAsync(invoiceId, request, ct)));

    [HttpPost("{invoiceId:guid}/void")]
    [HasPermission(BillingPermissions.Approvals)]
    public async Task<ActionResult<ApiResponse<InvoiceDto>>> Void(Guid invoiceId, [FromBody] VoidRequest request, CancellationToken ct) =>
        Ok(ApiResponse<InvoiceDto>.Success(await _corrections.VoidAsync(invoiceId, request, ct)));

    [HttpPost("{invoiceId:guid}/refund")]
    [HasPermission(BillingPermissions.Approvals)]
    public async Task<ActionResult<ApiResponse<RefundDto>>> Refund(Guid invoiceId, [FromBody] RefundRequest request, CancellationToken ct) =>
        Ok(ApiResponse<RefundDto>.Success(await _corrections.RefundAsync(invoiceId, request, ct)));
}

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
