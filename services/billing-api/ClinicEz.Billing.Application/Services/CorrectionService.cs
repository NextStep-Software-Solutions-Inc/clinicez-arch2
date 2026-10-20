using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Billing.Application.Abstractions;
using ClinicEz.Billing.Application.Dtos;
using ClinicEz.Billing.Application.Interop;
using ClinicEz.Billing.Domain.Constants;
using ClinicEz.Billing.Domain.Entities;
using ClinicEz.Billing.Domain.Enums;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Billing.Application.Services;

/// <summary>
/// Supervisor actions that undo a charge. A void cancels an invoice nothing was paid on; a refund gives back part or all of the money
/// held on an invoice, against the payments it came from. Both need a reason, are audited, and tell the requesting facility (and, for a
/// fully paid invoice, the portal rollup) through <c>billing.invoice.voided</c> in the same save.
/// </summary>
public sealed class CorrectionService
{
    private readonly IBillingDbContext _db;
    private readonly IBillingContext _context;
    private readonly VisitBillService _visits;
    private readonly DocumentNumbers _numbers;
    private readonly AuditTrail _audit;
    private readonly IInteropPublisher _publisher;
    private readonly TimeProvider _clock;

    public CorrectionService(
        IBillingDbContext db, IBillingContext context, VisitBillService visits, DocumentNumbers numbers, AuditTrail audit, IInteropPublisher publisher, TimeProvider clock)
    {
        _db = db;
        _context = context;
        _visits = visits;
        _numbers = numbers;
        _audit = audit;
        _publisher = publisher;
        _clock = clock;
    }

    public async Task<InvoiceDto> VoidAsync(Guid invoiceId, VoidRequest request, CancellationToken ct)
    {
        var caller = _context.RequireStaff();
        var invoice = await _visits.RequireInvoiceAsync(caller.TenantId, invoiceId, true, ct);
        var now = _clock.GetUtcNow().UtcDateTime;

        invoice.Void(request.Reason, now);
        BillingMessages.Voided(_publisher, invoice, BillingCorrectionKind.Void, 0m, false, false, now);
        _audit.Record(caller, caller.TenantId, caller.FacilityId, "invoice.voided", nameof(Invoice), invoice.Id,
            new { invoice.InvoiceNumber, invoice.Total, request.Reason });

        await _db.SaveOrConflictAsync(ct);
        return InvoiceMapper.ToDto(invoice);
    }

    public async Task<RefundDto> RefundAsync(Guid invoiceId, RefundRequest request, CancellationToken ct)
    {
        var caller = _context.RequireStaff();
        var invoice = await _visits.RequireInvoiceAsync(caller.TenantId, invoiceId, true, ct);
        var now = _clock.GetUtcNow().UtcDateTime;
        var wasFullyPaid = invoice.Status is InvoiceStatus.Paid or InvoiceStatus.PartiallyRefunded;

        var amount = invoice.Refund(request.Amount, request.Reason, now);
        var sources = await RefundableSourcesAsync(caller.TenantId, invoice.Id, request, ct);
        var lines = TakeFrom(sources, amount);

        var shift = await _db.CashierShifts.FirstOrDefaultAsync(
            s => s.TenantId == caller.TenantId && s.FacilityId == caller.FacilityId && s.CashierUserId == caller.UserId && s.Status == ShiftStatus.Open, ct);
        if (shift is null && lines.Any(l => l.Method == PaymentMethod.Cash))
            throw new ConflictException("Open a cashier shift before refunding cash: the money leaves your drawer.");

        var (sequence, number) = await _numbers.NextAsync(caller.TenantId, caller.FacilityId, DocumentNumbers.Refund, ct);
        var refund = new Refund
        {
            Id = Guid.NewGuid(),
            TenantId = caller.TenantId,
            FacilityId = caller.FacilityId,
            Sequence = sequence,
            Number = number,
            InvoiceId = invoice.Id,
            InvoiceFacilityId = invoice.FacilityId,
            BranchId = invoice.BranchId,
            Currency = invoice.Currency,
            Amount = amount,
            Reason = request.Reason.Trim(),
            ApprovedByUserId = caller.UserId,
            ApprovedByName = caller.UserName,
            ShiftId = shift?.Id,
            RefundedAtUtc = now
        };
        foreach (var line in lines)
        {
            line.Allocation.RefundedAmount += line.Amount;
            refund.Lines.Add(new RefundLine
            {
                Id = Guid.NewGuid(),
                TenantId = caller.TenantId,
                RefundId = refund.Id,
                PaymentId = line.Allocation.PaymentId,
                PaymentAllocationId = line.Allocation.Id,
                Method = line.Method,
                Amount = line.Amount
            });
        }

        _db.Refunds.Add(refund);

        var isPartial = invoice.Status == InvoiceStatus.PartiallyRefunded;
        BillingMessages.Voided(_publisher, invoice, BillingCorrectionKind.Refund, amount, wasFullyPaid, isPartial, now);
        _audit.Record(caller, caller.TenantId, caller.FacilityId, isPartial ? "invoice.partially_refunded" : "invoice.refunded", nameof(Invoice), invoice.Id,
            new
            {
                invoice.InvoiceNumber,
                RefundNumber = number,
                Amount = amount,
                invoice.RefundedTotal,
                request.Reason,
                Lines = lines.Select(l => new { l.Method, l.Amount, l.ReceiptNumber }).ToList()
            });

        await _db.SaveOrConflictAsync(ct);
        return new RefundDto(
            refund.Id, number, invoice.Id, amount, isPartial, invoice.Status, invoice.RefundedTotal, invoice.NetPaid, refund.Reason,
            refund.ApprovedByName, now, lines.Select(l => new RefundLineDto(l.Allocation.PaymentId, l.ReceiptNumber, l.Method, l.Amount)).ToList());
    }

    /// <summary>The allocations of the invoice that still hold money, newest payment first, narrowed to what the request names.</summary>
    private async Task<List<RefundSource>> RefundableSourcesAsync(string tenantId, Guid invoiceId, RefundRequest request, CancellationToken ct)
    {
        var allocations = await _db.PaymentAllocations
            .Where(a => a.TenantId == tenantId && a.InvoiceId == invoiceId && a.Amount > a.RefundedAmount)
            .ToListAsync(ct);
        var paymentIds = allocations.Select(a => a.PaymentId).ToList();
        var payments = await _db.Payments.AsNoTracking()
            .Where(p => p.TenantId == tenantId && paymentIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, ct);
        var receiptNumbers = await _db.Receipts.AsNoTracking()
            .Where(r => r.TenantId == tenantId && paymentIds.Contains(r.PaymentId))
            .ToDictionaryAsync(r => r.PaymentId, r => r.Number, ct);

        if (request.PaymentId is { } paymentId && !allocations.Any(a => a.PaymentId == paymentId))
            throw new BadRequestException("That payment holds nothing that can be refunded on this invoice.");

        return allocations
            .Select(a => new RefundSource(a, payments[a.PaymentId].Method, payments[a.PaymentId].PaidAtUtc, receiptNumbers[a.PaymentId]))
            .Where(s => request.PaymentId is null || s.Allocation.PaymentId == request.PaymentId)
            .Where(s => request.Method is null || s.Method == request.Method)
            .OrderByDescending(s => s.PaidAtUtc)
            .ToList();
    }

    private static List<RefundSource> TakeFrom(IReadOnlyList<RefundSource> sources, decimal amount)
    {
        var taken = new List<RefundSource>();
        var remaining = amount;
        foreach (var source in sources)
        {
            if (remaining == 0m) break;
            var take = Math.Min(source.Allocation.Refundable, remaining);
            taken.Add(source with { Amount = take });
            remaining -= take;
        }

        if (remaining > 0m)
            throw new BadRequestException($"Only {amount - remaining:0.00} can be refunded from the chosen payment(s); {amount:0.00} was requested.");
        return taken;
    }

    private sealed record RefundSource(PaymentAllocation Allocation, PaymentMethod Method, DateTime PaidAtUtc, string ReceiptNumber)
    {
        public decimal Amount { get; init; }
    }
}
