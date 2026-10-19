using MediatR;
using System.Text.Json;
using System.Text.Json.Serialization;
using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Application.Features.Billing.Commands;

public class XenditWebhookPayload
{
    [JsonPropertyName("id")] public string Id { get; set; } = string.Empty;
    [JsonPropertyName("event")] public string Event { get; set; } = string.Empty;
    [JsonPropertyName("created")] public string Created { get; set; } = string.Empty;
    [JsonPropertyName("business_id")] public string BusinessId { get; set; } = string.Empty;
    [JsonPropertyName("data")] public Dictionary<string, JsonElement>? Data { get; set; }

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? AdditionalData { get; set; }
}

public class ProcessXenditWebhookCommand : IRequest<bool>
{
    public XenditWebhookPayload Payload { get; }

    public ProcessXenditWebhookCommand(XenditWebhookPayload payload)
    {
        Payload = payload;
    }
}

/// <summary>
/// Applies Xendit billing callbacks to the workspace's one <see cref="Subscription"/>. A callback that cannot be tied to a
/// workspace through its metadata, customer id, subscription id or checkout reference is rejected: there is no "first tenant" guess.
/// </summary>
public class ProcessXenditWebhookCommandHandler(
    IApplicationDbContext context,
    ISubscriptionService subscriptions,
    TimeProvider timeProvider,
    ILogger<ProcessXenditWebhookCommandHandler> logger) : IRequestHandler<ProcessXenditWebhookCommand, bool>
{
    private const string ProviderName = "xendit";
    private const string CheckoutReferencePrefix = "checkout-";

    public async Task<bool> Handle(ProcessXenditWebhookCommand request, CancellationToken cancellationToken)
    {
        var payload = request.Payload;
        if (payload == null) return false;

        // Auto-detect flat invoice payload structure (all invoice callbacks are flat JSON)
        if (string.IsNullOrEmpty(payload.Event) && payload.AdditionalData != null && payload.AdditionalData.ContainsKey("status"))
        {
            var statusVal = payload.AdditionalData.TryGetValue("status", out var statusEl) ? statusEl.GetString() : null;
            if (!string.IsNullOrEmpty(statusVal))
            {
                payload.Event = $"invoice.{statusVal.ToLower()}";

                var mergedData = new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase)
                {
                    ["id"] = JsonSerializer.SerializeToElement(payload.Id),
                    ["created"] = JsonSerializer.SerializeToElement(payload.Created)
                };
                foreach (var kvp in payload.AdditionalData)
                {
                    mergedData[kvp.Key] = kvp.Value;
                }
                payload.Data = mergedData;
            }
        }

        logger.LogInformation("Processing billing webhook event {Event}", payload.Event);

        if (payload.Data == null) return false;

        switch (payload.Event)
        {
            case "recurring.subscription.active":
            case "recurring.plan.activated":
                return await HandleSubscriptionActiveAsync(payload.Data, cancellationToken);

            case "recurring.subscription.cancelled":
            case "recurring.plan.deactivated":
            case "recurring.plan.inactivated":
                return await HandleSubscriptionCancelledAsync(payload.Data, cancellationToken);

            case "recurring.invoice.paid":
            case "invoice.paid":
                return await HandleInvoicePaidAsync(payload.Data, cancellationToken);

            case "recurring.cycle.created":
                return await HandleCycleCreatedAsync(payload.Data, cancellationToken);

            case "recurring.cycle.succeeded":
            case "recurring_cycle.succeeded":
                return await HandleCycleSucceededAsync(payload.Data, cancellationToken);

            default:
                logger.LogInformation("Billing webhook event type {Event} is not handled", payload.Event);
                return true;
        }
    }

    private async Task<bool> HandleSubscriptionActiveAsync(Dictionary<string, JsonElement> data, CancellationToken cancellationToken)
    {
        var providerSubscriptionId = Text(data, "id") ?? string.Empty;

        var tenant = await ResolveTenantAsync(data, providerSubscriptionId, cancellationToken);
        if (tenant is null)
        {
            logger.LogWarning("Active-subscription webhook could not be tied to a workspace");
            return false;
        }

        var subscription = await subscriptions.StartTrialAsync(tenant.Id, cancellationToken);
        subscription = await context.Subscriptions.Include(s => s.Plan).FirstAsync(s => s.Id == subscription.Id, cancellationToken);

        var plan = await ResolvePlanAsync(Metadata(data, "planSlug"), subscription, cancellationToken);
        subscription.ProviderName = ProviderName;
        subscription.ProviderSubscriptionId = providerSubscriptionId;

        var now = timeProvider.GetUtcNow().UtcDateTime;
        var periodEnd = subscription.CurrentPeriodEnd is { } current && current > now
            ? current
            : (subscription.IsAnnual ? now.AddYears(1) : now.AddMonths(1));

        await subscriptions.ActivateAsync(tenant.Id, plan, subscription.IsAnnual, periodEnd, cancellationToken);
        logger.LogInformation("Subscription {ProviderSubscriptionId} active for workspace {TenantId}", providerSubscriptionId, tenant.Id);
        return true;
    }

    private async Task<bool> HandleSubscriptionCancelledAsync(Dictionary<string, JsonElement> data, CancellationToken cancellationToken)
    {
        var providerSubscriptionId = Text(data, "id");
        if (string.IsNullOrEmpty(providerSubscriptionId)) return false;

        var subscription = await context.Subscriptions.FirstOrDefaultAsync(s => s.ProviderSubscriptionId == providerSubscriptionId, cancellationToken);
        if (subscription is null)
        {
            logger.LogInformation("No workspace has provider subscription {ProviderSubscriptionId}", providerSubscriptionId);
            return true;
        }

        await subscriptions.CancelAsync(subscription.TenantId, cancellationToken);
        logger.LogInformation("Subscription {ProviderSubscriptionId} cancelled for workspace {TenantId}", providerSubscriptionId, subscription.TenantId);
        return true;
    }

    private async Task<bool> HandleInvoicePaidAsync(Dictionary<string, JsonElement> data, CancellationToken cancellationToken)
    {
        var invoiceId = Text(data, "id") ?? string.Empty;
        var tenant = await ResolveTenantAsync(data, null, cancellationToken);
        if (tenant is null)
        {
            logger.LogWarning("Paid-invoice webhook could not be tied to a workspace");
            return false;
        }

        var paymentMethod = Text(data, "payment_method") ?? "E-Wallet";
        if (Text(data, "payment_channel") is { } channel) paymentMethod += $" ({channel})";

        return await RecordPaymentAsync(tenant, data, invoiceId, Amount(data, "amount"), Text(data, "currency") ?? "PHP", paymentMethod, cancellationToken);
    }

    private async Task<bool> HandleCycleSucceededAsync(Dictionary<string, JsonElement> data, CancellationToken cancellationToken)
    {
        var providerSubscriptionId = Text(data, "subscription_id") ?? Text(data, "plan_id");
        var tenant = await ResolveTenantAsync(data, providerSubscriptionId, cancellationToken);
        if (tenant is null)
        {
            logger.LogWarning("Cycle-succeeded webhook could not be tied to a workspace");
            return false;
        }

        var invoiceId = Text(data, "invoice_id") ?? Text(data, "id") ?? string.Empty;

        var paymentMethod = "E-Wallet";
        if (data.TryGetValue("attempt_details", out var attemptDetailsEl) && attemptDetailsEl.ValueKind == JsonValueKind.Array)
        {
            var attempts = attemptDetailsEl.EnumerateArray().ToList();
            if (attempts.Count > 0 && attempts[0].TryGetProperty("payment_method", out var pmProp))
            {
                if (pmProp.TryGetProperty("type", out var typeProp)) paymentMethod = typeProp.GetString() ?? "E-Wallet";
                if (pmProp.TryGetProperty("card_information", out var cardProp) && cardProp.ValueKind == JsonValueKind.Object &&
                    cardProp.TryGetProperty("brand", out var brandProp) && cardProp.TryGetProperty("last_four_digits", out var last4Prop))
                {
                    paymentMethod += $" ({brandProp.GetString()} {last4Prop.GetString()})";
                }
            }
        }

        return await RecordPaymentAsync(tenant, data, invoiceId, Amount(data, "amount"), Text(data, "currency") ?? "PHP", paymentMethod, cancellationToken);
    }

    private async Task<bool> HandleCycleCreatedAsync(Dictionary<string, JsonElement> data, CancellationToken cancellationToken)
    {
        var providerSubscriptionId = Text(data, "plan_id") ?? Text(data, "subscription_id");
        var cycleId = Text(data, "id") ?? string.Empty;
        var tenant = await ResolveTenantAsync(data, providerSubscriptionId, cancellationToken);
        if (tenant is null)
        {
            logger.LogWarning("Cycle-created webhook could not be tied to a workspace");
            return false;
        }

        if (await context.BillingInvoices.AnyAsync(i => i.XenditInvoiceId == cycleId, cancellationToken))
        {
            return true;
        }

        var subscription = await subscriptions.StartTrialAsync(tenant.Id, cancellationToken);
        subscription = await context.Subscriptions.Include(s => s.Plan).FirstAsync(s => s.Id == subscription.Id, cancellationToken);

        var amount = Amount(data, "amount");
        var isAnnual = false;
        if (data.TryGetValue("schedule", out var scheduleEl) && scheduleEl.ValueKind == JsonValueKind.Object)
        {
            if (scheduleEl.TryGetProperty("interval", out var intervalProp) && intervalProp.GetString() == "MONTH" &&
                scheduleEl.TryGetProperty("interval_count", out var countProp) && countProp.ValueKind == JsonValueKind.Number)
            {
                isAnnual = countProp.GetInt32() == 12;
            }
        }
        else if (amount > 15000)
        {
            isAnnual = true;
        }

        context.BillingInvoices.Add(new BillingInvoice
        {
            TenantId = tenant.Id,
            XenditInvoiceId = cycleId,
            InvoiceNumber = $"INV-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..8].ToUpper()}",
            Amount = amount,
            Currency = Text(data, "currency") ?? "PHP",
            Status = "Pending",
            IsAnnual = isAnnual,
            PlanSlug = subscription.Plan.Slug,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "Webhook"
        });
        await context.SaveChangesAsync(cancellationToken);

        logger.LogInformation("Unpaid billing invoice logged for workspace {TenantId}, cycle {CycleId}", tenant.Id, cycleId);
        return true;
    }

    /// <summary>Logs the invoice and receipt (once) and activates the subscription on the paid plan until the paid period ends.</summary>
    private async Task<bool> RecordPaymentAsync(
        Tenant tenant,
        Dictionary<string, JsonElement> data,
        string invoiceId,
        long amount,
        string currency,
        string paymentMethod,
        CancellationToken cancellationToken)
    {
        var subscription = await subscriptions.StartTrialAsync(tenant.Id, cancellationToken);
        subscription = await context.Subscriptions.Include(s => s.Plan).FirstAsync(s => s.Id == subscription.Id, cancellationToken);
        var plan = await ResolvePlanAsync(Metadata(data, "planSlug"), subscription, cancellationToken);

        var invoice = await context.BillingInvoices.FirstOrDefaultAsync(i => i.XenditInvoiceId == invoiceId, cancellationToken);
        if (invoice == null)
        {
            invoice = new BillingInvoice
            {
                TenantId = tenant.Id,
                XenditInvoiceId = invoiceId,
                InvoiceNumber = $"INV-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..8].ToUpper()}",
                Amount = amount,
                Currency = currency,
                Status = "Paid",
                PlanSlug = plan.Slug,
                IsAnnual = amount > 15000,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "Webhook"
            };
            context.BillingInvoices.Add(invoice);
            await context.SaveChangesAsync(cancellationToken);
        }
        else
        {
            invoice.Status = "Paid";
            invoice.UpdatedAt = DateTime.UtcNow;
            invoice.UpdatedBy = "Webhook";
        }

        if (await context.PaymentReceipts.AnyAsync(r => r.InvoiceId == invoice.Id, cancellationToken))
        {
            logger.LogInformation("Receipt for invoice {InvoiceId} was already logged", invoiceId);
            return true;
        }

        var paidAt = timeProvider.GetUtcNow().UtcDateTime;
        var expiry = invoice.IsAnnual ? paidAt.AddYears(1) : paidAt.AddMonths(1);

        context.PaymentReceipts.Add(new PaymentReceipt
        {
            TenantId = tenant.Id,
            InvoiceId = invoice.Id,
            ReceiptNumber = $"REC-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..8].ToUpper()}",
            AmountPaid = amount,
            Currency = currency,
            PaidAt = paidAt,
            ExpiryDate = expiry,
            PaymentMethod = paymentMethod,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "Webhook"
        });
        subscription.ProviderName = ProviderName;
        await context.SaveChangesAsync(cancellationToken);

        await subscriptions.ActivateAsync(tenant.Id, plan, invoice.IsAnnual, expiry, cancellationToken);

        logger.LogInformation("Payment recorded for workspace {TenantId}: invoice {InvoiceId}, {Currency} {Amount}", tenant.Id, invoiceId, currency, amount);
        return true;
    }

    private async Task<Tenant?> ResolveTenantAsync(Dictionary<string, JsonElement> data, string? providerSubscriptionId, CancellationToken cancellationToken)
    {
        if (Metadata(data, "tenantId") is { } tenantIdText && Guid.TryParse(tenantIdText, out var metadataTenantId))
        {
            var byMetadata = await context.Tenants.FirstOrDefaultAsync(t => t.Id == metadataTenantId, cancellationToken);
            if (byMetadata is not null) return byMetadata;
        }

        var customerId = Text(data, "customer_id");
        if (customerId is null && data.TryGetValue("customer", out var customerObject) && customerObject.ValueKind == JsonValueKind.Object &&
            customerObject.TryGetProperty("id", out var customerIdProp))
        {
            customerId = customerIdProp.GetString();
        }

        if (!string.IsNullOrEmpty(customerId))
        {
            var byCustomer = await context.Subscriptions.Where(s => s.ProviderCustomerId == customerId).Select(s => s.TenantId).FirstOrDefaultAsync(cancellationToken);
            if (byCustomer != Guid.Empty) return await context.Tenants.FirstOrDefaultAsync(t => t.Id == byCustomer, cancellationToken);
        }

        if (!string.IsNullOrEmpty(providerSubscriptionId))
        {
            var bySubscription = await context.Subscriptions.Where(s => s.ProviderSubscriptionId == providerSubscriptionId).Select(s => s.TenantId).FirstOrDefaultAsync(cancellationToken);
            if (bySubscription != Guid.Empty) return await context.Tenants.FirstOrDefaultAsync(t => t.Id == bySubscription, cancellationToken);
        }

        var externalId = Text(data, "external_id");
        if (externalId is not null && externalId.StartsWith(CheckoutReferencePrefix, StringComparison.Ordinal) &&
            externalId.Length >= CheckoutReferencePrefix.Length + 36 &&
            Guid.TryParse(externalId.AsSpan(CheckoutReferencePrefix.Length, 36), out var checkoutTenantId))
        {
            return await context.Tenants.FirstOrDefaultAsync(t => t.Id == checkoutTenantId, cancellationToken);
        }

        return null;
    }

    private async Task<Plan> ResolvePlanAsync(string? planRef, Subscription subscription, CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(planRef))
        {
            var slug = planRef.ToLowerInvariant();
            var plan = Guid.TryParse(planRef, out var planId)
                ? await context.Plans.FirstOrDefaultAsync(p => p.Id == planId, cancellationToken)
                : await context.Plans.FirstOrDefaultAsync(p => p.Slug.ToLower() == slug, cancellationToken);
            if (plan is not null) return plan;
        }

        return subscription.Plan;
    }

    private static string? Text(Dictionary<string, JsonElement> data, string key) =>
        data.TryGetValue(key, out var el) && el.ValueKind == JsonValueKind.String ? el.GetString() : null;

    private static long Amount(Dictionary<string, JsonElement> data, string key) =>
        data.TryGetValue(key, out var el) && el.ValueKind == JsonValueKind.Number ? el.GetInt64() : 0;

    private static string? Metadata(Dictionary<string, JsonElement> data, string key) =>
        data.TryGetValue("metadata", out var meta) && meta.ValueKind == JsonValueKind.Object && meta.TryGetProperty(key, out var prop)
            ? prop.GetString()
            : null;
}
