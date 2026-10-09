using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using ClinicEz.Billing.Application.Abstractions;
using ClinicEz.Billing.Application.Dtos;
using ClinicEz.Billing.Application.Interop;
using ClinicEz.Billing.Domain;
using ClinicEz.Billing.Domain.Entities;
using ClinicEz.Billing.Domain.Enums;
using ClinicEz.Billing.Domain.Services;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Billing.Application.Services;

/// <summary>
/// Takes money at the counter. One payment covers one invoice or is allocated over the invoices of a visit (oldest first, or as
/// the cashier splits it), produces one official receipt, and, in the SAME save, enqueues <c>billing.payment.confirmed</c> to each
/// requesting facility (partial payments included, <c>FullyPaid=false</c>) and <c>billing.invoice.paid</c> to the portal for each
/// invoice this payment completed. Safe to retry: the <c>Idempotency-Key</c> returns the original payment.
/// </summary>
public sealed class PaymentService
{
    private readonly IBillingDbContext _db;
    private readonly IBillingContext _context;
    private readonly VisitBillService _visits;
    private readonly DocumentNumbers _numbers;
    private readonly AuditTrail _audit;
    private readonly IInteropPublisher _publisher;
    private readonly TimeProvider _clock;

    public PaymentService(
        IBillingDbContext db,
        IBillingContext context,
        VisitBillService visits,
        DocumentNumbers numbers,
        AuditTrail audit,
        IInteropPublisher publisher,
        TimeProvider clock)
    {
        _db = db;
        _context = context;
        _visits = visits;
        _numbers = numbers;
        _audit = audit;
        _publisher = publisher;
        _clock = clock;
    }

    public async Task<PaymentDto> TakeAsync(TakePaymentRequest request, string? idempotencyKey, CancellationToken ct)
    {
        var caller = _context.RequireStaff();
        if (string.IsNullOrWhiteSpace(idempotencyKey) || idempotencyKey.Trim().Length > 100)
            throw new BadRequestException("The Idempotency-Key header is required (at most 100 characters).");
        var key = idempotencyKey.Trim();
        ValidateRequest(request);
        var hash = Hash(request);

        var existing = await FindByKeyAsync(caller.TenantId, key, ct);
        if (existing is not null) return await ReplayAsync(existing, hash, ct);

        var shift = await _db.CashierShifts.FirstOrDefaultAsync(
                s => s.TenantId == caller.TenantId && s.FacilityId == caller.FacilityId && s.CashierUserId == caller.UserId && s.Status == ShiftStatus.Open, ct)
            ?? throw new ConflictException("Open a cashier shift before taking payments.");

        var allocation = await ResolveAllocationAsync(caller, request, ct);

        var now = _clock.GetUtcNow().UtcDateTime;
        var (sequence, receiptNumber) = await _numbers.NextAsync(caller.TenantId, caller.FacilityId, DocumentNumbers.Receipt, ct);
        var first = allocation[0].Invoice;
        var isCash = request.Method == PaymentMethod.Cash;
        var tendered = isCash ? request.Tendered ?? request.Amount : (decimal?)null;

        var payment = new Payment
        {
            Id = Guid.NewGuid(),
            TenantId = caller.TenantId,
            FacilityId = caller.FacilityId,
            BranchId = first.BranchId,
            PatientName = first.PatientName,
            Method = request.Method,
            InsurerKind = request.Method == PaymentMethod.Insurance ? request.InsurerKind : null,
            IsExternal = request.Method == PaymentMethod.Insurance,
            Currency = first.Currency,
            Amount = request.Amount,
            Tendered = tendered,
            Change = tendered is { } t ? t - request.Amount : 0m,
            Reference = string.IsNullOrWhiteSpace(request.Reference) ? null : request.Reference.Trim(),
            CashierUserId = caller.UserId,
            CashierName = caller.UserName,
            ShiftId = shift.Id,
            PaidAtUtc = now,
            IdempotencyKey = key,
            RequestHash = hash,
            ReceiptId = Guid.NewGuid()
        };

        foreach (var (invoice, amount) in allocation)
        {
            invoice.RegisterPayment(amount, now);
            payment.Allocations.Add(new PaymentAllocation
            {
                Id = Guid.NewGuid(),
                TenantId = caller.TenantId,
                PaymentId = payment.Id,
                InvoiceId = invoice.Id,
                InvoiceFacilityId = invoice.FacilityId,
                InvoiceFacilityType = invoice.FacilityType,
                BranchId = invoice.BranchId,
                Amount = amount
            });

            BillingMessages.PaymentConfirmed(_publisher, invoice, payment, receiptNumber, now);
            if (invoice.Status == InvoiceStatus.Paid) BillingMessages.InvoicePaid(_publisher, invoice, now);
        }

        _db.Payments.Add(payment);
        _db.Receipts.Add(new Receipt
        {
            Id = payment.ReceiptId,
            TenantId = caller.TenantId,
            FacilityId = caller.FacilityId,
            Sequence = sequence,
            Number = receiptNumber,
            PaymentId = payment.Id,
            IssuedAtUtc = now
        });
        _audit.Record(caller, caller.TenantId, caller.FacilityId, "payment.taken", nameof(Payment), payment.Id, new
        {
            ReceiptNumber = receiptNumber,
            payment.Method,
            payment.Amount,
            payment.Reference,
            Allocations = allocation.Select(a => new { a.Invoice.InvoiceNumber, a.Amount }).ToList()
        });

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException ex)
        {
            throw new ConflictException("Another cashier changed the same invoice or receipt book at the same time. Retry with the same Idempotency-Key.", ex);
        }
        catch (DbUpdateException)
        {
            // A parallel request with the same Idempotency-Key committed first (unique index): answer with ITS payment.
            var raced = await _db.Payments.AsNoTracking().FirstOrDefaultAsync(p => p.TenantId == caller.TenantId && p.IdempotencyKey == key, ct);
            if (raced is null) throw;
            return await ReplayAsync(raced, hash, ct);
        }

        return await BuildPaymentAsync(payment, false, ct);
    }

    public async Task<PaymentDto> GetAsync(Guid paymentId, CancellationToken ct)
    {
        var caller = _context.RequireStaff();
        var payment = await _db.Payments.AsNoTracking().FirstOrDefaultAsync(p => p.TenantId == caller.TenantId && p.Id == paymentId, ct)
            ?? throw new NotFoundException("Payment not found.");
        return await BuildPaymentAsync(payment, false, ct);
    }

    public async Task<ReceiptDto> GetReceiptAsync(Guid receiptId, CancellationToken ct)
    {
        var caller = _context.RequireStaff();
        var receipt = await _db.Receipts.AsNoTracking().FirstOrDefaultAsync(r => r.TenantId == caller.TenantId && r.Id == receiptId, ct)
            ?? throw new NotFoundException("Receipt not found.");
        return await BuildReceiptAsync(receipt, ct);
    }

    public async Task<ReceiptDto> GetReceiptForPaymentAsync(Guid paymentId, CancellationToken ct)
    {
        var caller = _context.RequireStaff();
        var receipt = await _db.Receipts.AsNoTracking().FirstOrDefaultAsync(r => r.TenantId == caller.TenantId && r.PaymentId == paymentId, ct)
            ?? throw new NotFoundException("Receipt not found.");
        return await BuildReceiptAsync(receipt, ct);
    }

    private static void ValidateRequest(TakePaymentRequest request)
    {
        if (request.Amount < 0.01m || Money.Round(request.Amount) != request.Amount)
            throw new BadRequestException("The payment amount must be positive with at most two decimals.");

        if (request.Method == PaymentMethod.Cash)
        {
            if (request.Tendered is { } tendered && (tendered < request.Amount || Money.Round(tendered) != tendered))
                throw new BadRequestException("The cash tendered cannot be less than the amount paid.");
        }
        else if (request.Tendered is not null)
        {
            throw new BadRequestException("Tendered cash only applies to cash payments.");
        }

        if (request.Method is PaymentMethod.Card or PaymentMethod.GCash or PaymentMethod.Maya or PaymentMethod.Insurance
            && string.IsNullOrWhiteSpace(request.Reference))
            throw new BadRequestException($"A reference (approval / transaction / claim number) is required for {request.Method} payments.");

        if (request.Method == PaymentMethod.Insurance && request.InsurerKind is null)
            throw new BadRequestException("State whether the insurance payment is PhilHealth, an HMO or other.");
    }

    private async Task<List<(Invoice Invoice, decimal Amount)>> ResolveAllocationAsync(BillingCaller caller, TakePaymentRequest request, CancellationToken ct)
    {
        var explicitAllocations = request.Allocations is { Count: > 0 } ? request.Allocations : null;
        var anchorId = explicitAllocations?[0].InvoiceId
            ?? request.AnchorInvoiceId
            ?? throw new BadRequestException("Name the visit bill (anchorInvoiceId) or give the invoice allocations.");

        var anchor = await _visits.RequireInvoiceAsync(caller.TenantId, anchorId, true, ct);
        var group = await _visits.LoadGroupAsync(caller.TenantId, anchor, true, ct);

        if (explicitAllocations is null) return PaymentAllocator.AllocateOldestFirst(group, request.Amount);

        var byId = group.ToDictionary(i => i.Id);
        if (explicitAllocations.Any(a => !byId.ContainsKey(a.InvoiceId)))
            throw new BadRequestException("All invoices of a payment must belong to the same visit bill.");

        return PaymentAllocator.AllocateExplicit(byId, explicitAllocations.Select(a => (a.InvoiceId, a.Amount)).ToList(), request.Amount);
    }

    private Task<Payment?> FindByKeyAsync(string tenantId, string key, CancellationToken ct) =>
        _db.Payments.AsNoTracking().FirstOrDefaultAsync(p => p.TenantId == tenantId && p.IdempotencyKey == key, ct);

    private async Task<PaymentDto> ReplayAsync(Payment existing, string hash, CancellationToken ct)
    {
        if (!string.Equals(existing.RequestHash, hash, StringComparison.Ordinal))
            throw new ConflictException("This Idempotency-Key was already used for a different payment request.");
        return await BuildPaymentAsync(existing, true, ct);
    }

    private async Task<PaymentDto> BuildPaymentAsync(Payment payment, bool replay, CancellationToken ct)
    {
        var receipt = await _db.Receipts.AsNoTracking().FirstAsync(r => r.TenantId == payment.TenantId && r.Id == payment.ReceiptId, ct);
        var allocations = await _db.PaymentAllocations.AsNoTracking().Where(a => a.TenantId == payment.TenantId && a.PaymentId == payment.Id).ToListAsync(ct);
        var invoiceIds = allocations.Select(a => a.InvoiceId).ToList();
        var invoices = await _db.Invoices.AsNoTracking().Where(i => i.TenantId == payment.TenantId && invoiceIds.Contains(i.Id)).ToDictionaryAsync(i => i.Id, ct);

        return new PaymentDto(
            payment.Id, receipt.Id, receipt.Number, payment.Method, payment.InsurerKind, payment.IsExternal, payment.Currency, payment.Amount,
            payment.Tendered, payment.Change, payment.Reference, payment.CashierName, payment.PaidAtUtc,
            allocations.Select(a => new PaymentAllocationDto(
                a.InvoiceId, invoices[a.InvoiceId].InvoiceNumber, a.InvoiceFacilityId, a.InvoiceFacilityType, a.Amount,
                invoices[a.InvoiceId].Status, invoices[a.InvoiceId].Balance)).ToList(),
            replay);
    }

    private async Task<ReceiptDto> BuildReceiptAsync(Receipt receipt, CancellationToken ct)
    {
        var payment = await _db.Payments.AsNoTracking().FirstAsync(p => p.TenantId == receipt.TenantId && p.Id == receipt.PaymentId, ct);
        var allocations = await _db.PaymentAllocations.AsNoTracking().Where(a => a.TenantId == receipt.TenantId && a.PaymentId == payment.Id).ToListAsync(ct);
        var invoiceIds = allocations.Select(a => a.InvoiceId).ToList();
        var invoices = await _db.Invoices.AsNoTracking().Include(i => i.Lines)
            .Where(i => i.TenantId == receipt.TenantId && invoiceIds.Contains(i.Id)).ToDictionaryAsync(i => i.Id, ct);

        var lines = allocations.Select(a =>
        {
            var invoice = invoices[a.InvoiceId];
            return new ReceiptInvoiceDto(
                invoice.Id, invoice.InvoiceNumber, invoice.FacilityId, invoice.FacilityType, invoice.SourceType,
                invoice.Lines.OrderBy(l => l.LineNo).Select(InvoiceMapper.ToDto).ToList(),
                invoice.Subtotal, invoice.DiscountTotal, invoice.Total, a.Amount, invoice.Balance);
        }).ToList();

        return new ReceiptDto(
            receipt.Id, receipt.Number, receipt.FacilityId, receipt.IssuedAtUtc, payment.PatientName, payment.Currency, payment.Method,
            payment.InsurerKind, payment.IsExternal, payment.Reference, payment.Amount, payment.Tendered, payment.Change,
            payment.CashierName, lines, lines.Sum(l => l.BalanceNow));
    }

    private static string Hash(TakePaymentRequest request)
    {
        var text = new StringBuilder()
            .Append(request.Method).Append('|')
            .Append(request.Amount.ToString("0.00", CultureInfo.InvariantCulture)).Append('|')
            .Append(request.Reference?.Trim()).Append('|')
            .Append(request.Tendered?.ToString("0.00", CultureInfo.InvariantCulture)).Append('|')
            .Append(request.InsurerKind).Append('|')
            .Append(request.AnchorInvoiceId);
        foreach (var a in (request.Allocations ?? Array.Empty<AllocationRequest>()).OrderBy(a => a.InvoiceId))
        {
            text.Append('|').Append(a.InvoiceId).Append(':').Append(a.Amount.ToString("0.00", CultureInfo.InvariantCulture));
        }

        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text.ToString())));
    }
}
