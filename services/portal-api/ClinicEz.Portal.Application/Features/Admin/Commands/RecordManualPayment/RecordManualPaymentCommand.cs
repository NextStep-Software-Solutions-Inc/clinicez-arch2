using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Billing.Services;
using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Application.Features.Licensing;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Application.Features.Admin.Commands.RecordManualPayment;

public record RecordManualPaymentResult(
    bool Success,
    string InvoiceNumber,
    string ReceiptNumber,
    string Status,
    DateTime SubscriptionExpiresAt,
    int EntitlementVersion,
    int FacilitiesLicensed
);

public record RecordManualPaymentResultDto(
    bool Success,
    string InvoiceNumber,
    string ReceiptNumber,
    string Status,
    DateTime SubscriptionExpiresAt,
    int EntitlementVersion,
    int FacilitiesLicensed
)
{
    public static implicit operator RecordManualPaymentResultDto(RecordManualPaymentResult r) =>
        new(r.Success, r.InvoiceNumber, r.ReceiptNumber, r.Status, r.SubscriptionExpiresAt, r.EntitlementVersion, r.FacilitiesLicensed);

    public static implicit operator RecordManualPaymentResult(RecordManualPaymentResultDto r) =>
        new(r.Success, r.InvoiceNumber, r.ReceiptNumber, r.Status, r.SubscriptionExpiresAt, r.EntitlementVersion, r.FacilitiesLicensed);
}

public record RecordManualPaymentCommand(
    Guid TenantId,
    string PlanSlug,
    bool IsAnnual,
    string PaymentMethod,
    string? TransactionReference,
    decimal Amount,
    string? Notes,
    DateTime? PaymentDate = null,
    string? RecordedBy = null
) : IRequest<RecordManualPaymentResult?>;

public class RecordManualPaymentCommandHandler(
    IApplicationDbContext context,
    ISubscriptionService subscriptions,
    IDocumentNumberGenerator documentNumbers,
    TimeProvider timeProvider,
    ILogger<RecordManualPaymentCommandHandler> logger)
    : IRequestHandler<RecordManualPaymentCommand, RecordManualPaymentResult?>
{
    public async Task<RecordManualPaymentResult?> Handle(
        RecordManualPaymentCommand request,
        CancellationToken cancellationToken)
    {
        // 1. Resolve Tenant
        var tenant = await context.Tenants.FirstOrDefaultAsync(t => t.Id == request.TenantId, cancellationToken);
        if (tenant == null)
        {
            logger.LogWarning("RecordManualPayment aborted: tenant {TenantId} not found", request.TenantId);
            return null;
        }

        // 2. Resolve Plan
        var planSlugClean = (request.PlanSlug ?? string.Empty).Trim().ToLowerInvariant();
        var plan = await context.Plans.FirstOrDefaultAsync(
            p => p.Slug.ToLower() == planSlugClean && !p.IsDeleted,
            cancellationToken);
        if (plan == null)
        {
            logger.LogWarning("RecordManualPayment aborted: plan {PlanSlug} not found", request.PlanSlug);
            return null;
        }

        // 3. Resolve Effective Dates
        var nowUtc = timeProvider.GetUtcNow().UtcDateTime;
        var paymentDate = request.PaymentDate ?? nowUtc;
        var periodEnd = request.IsAnnual ? paymentDate.AddYears(1) : paymentDate.AddMonths(1);

        // 4. Generate Atomic Sequential Document Numbers
        var invoiceNumber = await documentNumbers.NextInvoiceNumberAsync(paymentDate, cancellationToken);
        var receiptNumber = await documentNumbers.NextReceiptNumberAsync(paymentDate, cancellationToken);

        var db = context as DbContext;
        await using var tx = db != null && db.Database.IsRelational() && db.Database.CurrentTransaction == null
            ? await db.Database.BeginTransactionAsync(cancellationToken)
            : null;

        BillingInvoice invoice;
        PaymentReceipt receipt;
        try
        {
            // 5. Create BillingInvoice (Status = "Paid") with collision-proof synthetic XenditInvoiceId
            var syntheticXenditInvoiceId = $"MANUAL-{invoiceNumber}-{Guid.NewGuid():N}";
            invoice = new BillingInvoice
            {
                TenantId = tenant.Id,
                XenditInvoiceId = syntheticXenditInvoiceId,
                InvoiceNumber = invoiceNumber,
                Amount = request.Amount,
                Currency = "PHP",
                Status = "Paid",
                PlanSlug = plan.Slug,
                IsAnnual = request.IsAnnual,
                CreatedAt = paymentDate,
                CreatedBy = request.RecordedBy ?? "SuperAdmin"
            };
            context.BillingInvoices.Add(invoice);
            await context.SaveChangesAsync(cancellationToken);

            // 6. Create PaymentReceipt
            receipt = new PaymentReceipt
            {
                TenantId = tenant.Id,
                InvoiceId = invoice.Id,
                ReceiptNumber = receiptNumber,
                AmountPaid = request.Amount,
                Currency = "PHP",
                PaidAt = paymentDate,
                ExpiryDate = periodEnd,
                PaymentMethod = request.PaymentMethod,
                TransactionReference = request.TransactionReference,
                Notes = request.Notes,
                CreatedAt = paymentDate,
                CreatedBy = request.RecordedBy ?? "SuperAdmin"
            };
            context.PaymentReceipts.Add(receipt);

            // 7. Update Subscription Provider to "Manual"
            var subscription = await context.Subscriptions.FirstOrDefaultAsync(s => s.TenantId == tenant.Id, cancellationToken);
            if (subscription == null)
            {
                subscription = await subscriptions.StartTrialAsync(tenant.Id, cancellationToken);
            }
            subscription.ProviderName = "Manual";
            await context.SaveChangesAsync(cancellationToken);

            // 8. Subscription Activation & License Staging
            await subscriptions.ActivateAsync(tenant.Id, plan, request.IsAnnual, periodEnd, cancellationToken);

            // Ensure outbox and facility changes are persisted
            await context.SaveChangesAsync(cancellationToken);

            if (tx != null)
            {
                await tx.CommitAsync(cancellationToken);
            }
        }
        catch
        {
            if (tx != null)
            {
                await tx.RollbackAsync(cancellationToken);
            }
            throw;
        }

        // 9. Count Licensed Routable Facilities
        var facilities = (await context.Facilities
                .Where(f => f.TenantId == tenant.Id)
                .ToListAsync(cancellationToken))
            .Where(FacilityCells.IsRoutable)
            .ToList();
        var facilitiesLicensed = facilities.Count;

        // 10. Query Reloaded Subscription State
        var updatedSubscription = await context.Subscriptions
            .AsNoTracking()
            .Include(s => s.Plan)
            .FirstAsync(s => s.TenantId == tenant.Id, cancellationToken);

        logger.LogInformation(
            "Manual payment recorded for workspace {TenantId}: Invoice {InvoiceNumber}, Receipt {ReceiptNumber}, Plan {PlanSlug}, Method {PaymentMethod}, Status {Status}, Licensed Facilities: {FacilitiesLicensed}",
            tenant.Id, invoiceNumber, receiptNumber, plan.Slug, request.PaymentMethod, updatedSubscription.Status, facilitiesLicensed);

        return new RecordManualPaymentResult(
            Success: true,
            InvoiceNumber: invoice.InvoiceNumber,
            ReceiptNumber: receipt.ReceiptNumber,
            Status: updatedSubscription.Status.ToString(),
            SubscriptionExpiresAt: updatedSubscription.CurrentPeriodEnd ?? periodEnd,
            EntitlementVersion: updatedSubscription.EntitlementVersion,
            FacilitiesLicensed: facilitiesLicensed
        );
    }
}
