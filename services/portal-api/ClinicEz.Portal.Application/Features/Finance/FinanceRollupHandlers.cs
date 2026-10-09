using ClinicEz.Portal.Application.Features.Admin.Consumers;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Application.Features.Finance;

/// <summary>
/// Builds the workspace finance rollup from <c>billing.invoice.paid</c>. Totals only, no patient data. The sender must be the
/// billing service of the facility the invoice is about; each invoice is counted once however often the message is redelivered.
/// </summary>
public sealed class BillingInvoicePaidHandler(
    IApplicationDbContext dbContext,
    ILogger<BillingInvoicePaidHandler> logger) : IInteropHandler<BillingInvoicePaidPayload>
{
    public async Task HandleAsync(BillingInvoicePaidPayload payload, InteropMessageContext context, CancellationToken ct)
    {
        if (!Guid.TryParse(payload.TenantId, out var tenantId) || !Guid.TryParse(payload.FacilityId, out var facilityId)
            || !InteropSenders.IsFacility(context.From, tenantId, facilityId, InteropServices.Billing))
        {
            logger.LogWarning("Ignoring billing.invoice.paid {InvoiceId} from {Sender}: the sender is not the billing service of that facility.",
                payload.InvoiceId, context.From.Address);
            return;
        }

        var facility = await dbContext.Facilities.AsNoTracking()
            .FirstOrDefaultAsync(f => f.Id == facilityId && f.TenantId == tenantId, ct);
        if (facility is null)
        {
            logger.LogWarning("Ignoring billing.invoice.paid {InvoiceId}: facility {FacilityId} is unknown.", payload.InvoiceId, facilityId);
            return;
        }

        if (payload.Total <= 0m || await dbContext.FinanceInvoiceRecords.AnyAsync(r => r.InvoiceId == payload.InvoiceId, ct))
        {
            return;
        }

        var day = DateOnly.FromDateTime(payload.PaidAtUtc);
        var branchId = Guid.TryParse(payload.BranchId, out var branch) ? branch : (Guid?)null;
        var currency = string.IsNullOrWhiteSpace(payload.Currency) ? "PHP" : payload.Currency.Trim().ToUpperInvariant();

        var summary = await FinanceSummaries.GetOrAddAsync(dbContext, tenantId, facilityId, branchId, day, payload.SourceType, currency, ct);
        summary.TotalPaid += payload.Total;
        summary.PaidInvoiceCount += 1;

        dbContext.FinanceInvoiceRecords.Add(new FinanceInvoiceRecord
        {
            Id = Guid.NewGuid(),
            InvoiceId = payload.InvoiceId,
            TenantId = tenantId,
            FacilityId = facilityId,
            BranchId = branchId,
            PaidDay = day,
            SourceType = payload.SourceType,
            Currency = currency,
            PaidAmount = payload.Total
        });

        await dbContext.SaveChangesAsync(ct);
    }
}

/// <summary>
/// Reverses what <c>billing.invoice.paid</c> added when billing voids or refunds an invoice (<c>billing.invoice.voided</c>). Only
/// fully paid invoices are ever reported; the reversal lands on the day the money was originally counted. Corrections carry the
/// cumulative refunded amount, so the handler applies only the difference to what it already took back: repeating or reordering
/// messages changes nothing, and a partial refund leaves the invoice open for further refunds until all of it is given back.
/// </summary>
public sealed class BillingInvoiceVoidedHandler(
    IApplicationDbContext dbContext,
    ILogger<BillingInvoiceVoidedHandler> logger) : IInteropHandler<BillingInvoiceVoidedPayload>
{
    public async Task HandleAsync(BillingInvoiceVoidedPayload payload, InteropMessageContext context, CancellationToken ct)
    {
        if (!Guid.TryParse(payload.TenantId, out var tenantId) || !Guid.TryParse(payload.FacilityId, out var facilityId)
            || !InteropSenders.IsFacility(context.From, tenantId, facilityId, InteropServices.Billing))
        {
            logger.LogWarning("Ignoring billing.invoice.voided {InvoiceId} from {Sender}: the sender is not the billing service of that facility.",
                payload.InvoiceId, context.From.Address);
            return;
        }

        if (!payload.WasFullyPaid) return;

        var cumulative = Math.Max(payload.RefundedTotal > 0m ? payload.RefundedTotal : payload.IsPartial ? 0m : payload.AmountReversed, 0m);
        var currency = string.IsNullOrWhiteSpace(payload.Currency) ? "PHP" : payload.Currency.Trim().ToUpperInvariant();
        var branchId = Guid.TryParse(payload.BranchId, out var branch) ? branch : (Guid?)null;

        var record = await dbContext.FinanceInvoiceRecords.FirstOrDefaultAsync(r => r.InvoiceId == payload.InvoiceId && r.TenantId == tenantId, ct);
        if (record is null)
        {
            var overtakesPaymentReport = cumulative >= payload.Total;
            record = new FinanceInvoiceRecord
            {
                Id = Guid.NewGuid(),
                InvoiceId = payload.InvoiceId,
                TenantId = tenantId,
                FacilityId = facilityId,
                BranchId = branchId,
                PaidDay = DateOnly.FromDateTime(payload.CorrectedAtUtc),
                SourceType = payload.SourceType,
                Currency = currency
            };
            dbContext.FinanceInvoiceRecords.Add(record);

            if (overtakesPaymentReport)
            {
                // Everything was given back before the payment report arrived: remember the invoice as settled so the late report is not counted.
                record.Reversed = true;
                await dbContext.SaveChangesAsync(ct);
                return;
            }

            // Only part was given back, so the payment still counts: take it now (the late report is then recognised as already counted).
            var paidSummary = await FinanceSummaries.GetOrAddAsync(
                dbContext, tenantId, facilityId, branchId, record.PaidDay, record.SourceType, currency, ct);
            paidSummary.TotalPaid += payload.Total;
            paidSummary.PaidInvoiceCount += 1;
            record.PaidAmount = payload.Total;
            await dbContext.SaveChangesAsync(ct);
        }

        var target = Math.Min(cumulative, record.PaidAmount);
        var delta = target - record.ReversedAmount;
        if (delta <= 0m) return;

        var summary = await FinanceSummaries.GetOrAddAsync(
            dbContext, record.TenantId, record.FacilityId, record.BranchId, record.PaidDay, record.SourceType, record.Currency, ct);

        summary.TotalReversed += delta;
        if (record.ReversedAmount == 0m) summary.ReversedInvoiceCount += 1;
        record.ReversedAmount = target;
        record.Reversed = target >= record.PaidAmount;

        await dbContext.SaveChangesAsync(ct);
    }
}

internal static class FinanceSummaries
{
    public static async Task<FinanceDailySummary> GetOrAddAsync(
        IApplicationDbContext dbContext,
        Guid tenantId,
        Guid facilityId,
        Guid? branchId,
        DateOnly day,
        string sourceType,
        string currency,
        CancellationToken ct)
    {
        var summary = await dbContext.FinanceDailySummaries.FirstOrDefaultAsync(s =>
            s.TenantId == tenantId && s.FacilityId == facilityId && s.Day == day && s.SourceType == sourceType && s.Currency == currency, ct);
        if (summary is not null) return summary;

        summary = new FinanceDailySummary
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            FacilityId = facilityId,
            BranchId = branchId,
            Day = day,
            SourceType = sourceType,
            Currency = currency
        };
        dbContext.FinanceDailySummaries.Add(summary);
        return summary;
    }
}
