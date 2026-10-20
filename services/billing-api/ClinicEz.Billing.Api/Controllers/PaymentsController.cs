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

