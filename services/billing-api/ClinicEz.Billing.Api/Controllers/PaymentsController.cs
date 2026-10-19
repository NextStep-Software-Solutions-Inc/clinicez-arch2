using ClinicEz.Billing.Api.Authorization;
using ClinicEz.Billing.Application.Dtos;
using ClinicEz.Billing.Application.Services;
using ClinicEz.Billing.Domain.Constants;
using ClinicEz.Shared.Common;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Billing.Api.Controllers;

[ApiController]
[Route("api/v1")]
public sealed class PaymentsController : ControllerBase
{
    private const string IdempotencyHeader = "Idempotency-Key";

    private readonly PaymentService _payments;

    public PaymentsController(PaymentService payments) => _payments = payments;

    /// <summary>
    /// Takes a payment against one visit bill. A client retry with the same <c>Idempotency-Key</c> and body returns the original
    /// payment (<c>isReplay</c>) instead of charging twice; the same key with a different body is a 409.
    /// </summary>
    [HttpPost("payments")]
    [HasPermission(BillingPermissions.PaymentsTake)]
    public async Task<ActionResult<ApiResponse<PaymentDto>>> Take(
        [FromBody] TakePaymentRequest request, [FromHeader(Name = IdempotencyHeader)] string? idempotencyKey, CancellationToken ct)
    {
        var payment = await _payments.TakeAsync(request, idempotencyKey, ct);
        return StatusCode(payment.IsReplay ? StatusCodes.Status200OK : StatusCodes.Status201Created, ApiResponse<PaymentDto>.Success(payment));
    }

    [HttpGet("payments/{paymentId:guid}")]
    [HasPermission(BillingPermissions.InvoicesRead)]
    public async Task<ActionResult<ApiResponse<PaymentDto>>> Get(Guid paymentId, CancellationToken ct) =>
        Ok(ApiResponse<PaymentDto>.Success(await _payments.GetAsync(paymentId, ct)));

    [HttpGet("payments/{paymentId:guid}/receipt")]
    [HasPermission(BillingPermissions.InvoicesRead)]
    public async Task<ActionResult<ApiResponse<ReceiptDto>>> GetReceiptForPayment(Guid paymentId, CancellationToken ct) =>
        Ok(ApiResponse<ReceiptDto>.Success(await _payments.GetReceiptForPaymentAsync(paymentId, ct)));

    [HttpGet("receipts/{receiptId:guid}")]
    [HasPermission(BillingPermissions.InvoicesRead)]
    public async Task<ActionResult<ApiResponse<ReceiptDto>>> GetReceipt(Guid receiptId, CancellationToken ct) =>
        Ok(ApiResponse<ReceiptDto>.Success(await _payments.GetReceiptAsync(receiptId, ct)));
}

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
