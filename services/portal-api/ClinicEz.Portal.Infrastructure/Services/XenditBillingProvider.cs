using System.Text.Json;
using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Infrastructure.Xendit;
using ClinicEz.Portal.Infrastructure.Xendit.Models.Invoices;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Infrastructure.Services;

public class XenditBillingProvider(
    ApplicationDbContext context,
    IXenditApiClient xenditClient,
    ISubscriptionService subscriptions,
    IConfiguration configuration,
    IHttpContextAccessor httpContextAccessor,
    TimeProvider timeProvider,
    ILogger<XenditBillingProvider> logger) : IBillingProvider
{
    public const string ProviderName = "xendit";

    public async Task<string> CreateCheckoutSessionAsync(string tenantIdOrSlug, string planId, bool isAnnual, CancellationToken cancellationToken = default)
    {
        var frontendBaseUrl = ResolveFrontendBaseUrl();

        var tenant = await FindTenantAsync(tenantIdOrSlug, cancellationToken);
        var plan = await context.Plans.FirstOrDefaultAsync(p => p.Slug.ToLower() == planId.ToLower(), cancellationToken)
            ?? throw new InvalidOperationException("Plan not found.");

        var subscription = await subscriptions.StartTrialAsync(tenant.Id, cancellationToken);
        await context.Entry(subscription).Reference(s => s.Plan).LoadAsync(cancellationToken);

        var now = timeProvider.GetUtcNow().UtcDateTime;
        var takesEffectAtPeriodEnd = false;

        if (subscription.Status == SubscriptionStatus.Active && !string.IsNullOrEmpty(subscription.ProviderSubscriptionId))
        {
            // A downgrade keeps what was paid for until the current period ends; the new plan is anchored to that date.
            takesEffectAtPeriodEnd = subscription.Plan.ChangeTo(plan, subscription.IsAnnual, isAnnual).TakesEffectAtPeriodEnd()
                && subscription.CurrentPeriodEnd > now;

            try
            {
                await xenditClient.DeactivatePlanAsync(subscription.ProviderSubscriptionId, cancellationToken);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to deactivate the previous provider plan {ProviderSubscriptionId}", subscription.ProviderSubscriptionId);
            }
        }

        var anchor = takesEffectAtPeriodEnd ? subscription.CurrentPeriodEnd!.Value : now;
        var anchorDateStr = new DateTimeOffset(anchor, TimeSpan.Zero).ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM-ddTHH:mm:sszzz");
        if (takesEffectAtPeriodEnd)
        {
            logger.LogInformation("Downgrade detected; scheduling plan {PlanSlug} to start at {Anchor}", plan.Slug, anchorDateStr);
        }

        await EnsureCustomerAsync(tenant, subscription, cancellationToken);

        var planRequest = new Xendit.Models.Subscriptions.XenditPlanRequest
        {
            ReferenceId = $"sub-{tenant.Id}-{Guid.NewGuid()}",
            CustomerId = subscription.ProviderCustomerId!,
            RecurringAction = "PAYMENT",
            Amount = isAnnual ? (long)(plan.PriceAnnually * 12) : (long)plan.PriceMonthly,
            Currency = "PHP",
            Description = isAnnual ? $"{tenant.Name} - {plan.Name} Plan Subscription (Annually)" : $"{tenant.Name} - {plan.Name} Plan Subscription (Monthly)",
            SuccessReturnUrl = $"{frontendBaseUrl}/{tenant.TenantSlug}/dashboard/billing",
            FailureReturnUrl = $"{frontendBaseUrl}/{tenant.TenantSlug}/dashboard/billing",
            Schedule = new Xendit.Models.Subscriptions.XenditScheduleRequest
            {
                ReferenceId = $"sch-{tenant.Id}-{Guid.NewGuid()}",
                Interval = "MONTH",
                IntervalCount = isAnnual ? 12 : 1,
                AnchorDate = anchorDateStr
            },
            Metadata = new Dictionary<string, object>
            {
                { "tenantId", tenant.Id.ToString() },
                { "planSlug", plan.Slug }
            }
        };

        Xendit.Models.Subscriptions.XenditPlanResponse planResponse;
        try
        {
            planResponse = await xenditClient.CreatePlanAsync(planRequest, cancellationToken);
        }
        catch (Exception ex) when (ex.Message.Contains("CUSTOMER_NOT_FOUND_ERROR") || ex.Message.Contains("CUSTOMER_NOT_FOUND"))
        {
            logger.LogWarning("Provider customer {CustomerId} was not found by the plan service; recreating", subscription.ProviderCustomerId);
            subscription.ProviderCustomerId = null;
            await EnsureCustomerAsync(tenant, subscription, cancellationToken);

            planRequest.CustomerId = subscription.ProviderCustomerId!;
            planResponse = await xenditClient.CreatePlanAsync(planRequest, cancellationToken);
        }

        return ExtractRedirectUrl(planResponse) ?? $"{frontendBaseUrl}/{tenant.TenantSlug}/dashboard/billing";
    }

    public async Task<string> GetCustomerPortalUrlAsync(string tenantIdOrSlug, CancellationToken cancellationToken = default)
    {
        var frontendBaseUrl = ResolveFrontendBaseUrl();
        var tenant = await FindTenantAsync(tenantIdOrSlug, cancellationToken);

        // Xendit has no Stripe-like customer portal, so the owner goes to the local billing history/details page.
        return $"{frontendBaseUrl}/{tenant.TenantSlug}/dashboard/billing";
    }

    public async Task<bool> CancelSubscriptionAsync(string tenantIdOrSlug, CancellationToken cancellationToken = default)
    {
        var tenant = await FindTenantAsync(tenantIdOrSlug, cancellationToken);
        var subscription = await context.Subscriptions.FirstOrDefaultAsync(s => s.TenantId == tenant.Id, cancellationToken);

        if (subscription is null || string.IsNullOrEmpty(subscription.ProviderSubscriptionId))
        {
            return false;
        }

        try
        {
            await xenditClient.DeactivatePlanAsync(subscription.ProviderSubscriptionId, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to deactivate provider subscription {ProviderSubscriptionId}", subscription.ProviderSubscriptionId);
        }

        await subscriptions.CancelAsync(tenant.Id, cancellationToken);
        return true;
    }

    private async Task<Tenant> FindTenantAsync(string tenantIdOrSlug, CancellationToken cancellationToken) =>
        await context.Tenants.FirstOrDefaultAsync(t => t.Id.ToString() == tenantIdOrSlug || t.TenantSlug == tenantIdOrSlug, cancellationToken)
            ?? throw new InvalidOperationException("Tenant not found.");

    private string ResolveFrontendBaseUrl()
    {
        string? frontendBaseUrl = null;
        var httpContext = httpContextAccessor.HttpContext;
        if (httpContext != null)
        {
            string? origin = httpContext.Request.Headers["Origin"];
            if (!string.IsNullOrEmpty(origin))
            {
                frontendBaseUrl = origin.TrimEnd('/');
            }
            else
            {
                string? referer = httpContext.Request.Headers["Referer"];
                if (!string.IsNullOrEmpty(referer) && Uri.TryCreate(referer, UriKind.Absolute, out var refererUri))
                {
                    frontendBaseUrl = $"{refererUri.Scheme}://{refererUri.Authority}";
                }
            }
        }

        if (!string.IsNullOrEmpty(frontendBaseUrl))
        {
            return frontendBaseUrl;
        }

        var configUrl = configuration["FrontendBaseUrl"];
        if (string.IsNullOrEmpty(configUrl))
        {
            throw new InvalidOperationException("Could not determine the frontend redirect base URL from request headers (Origin/Referer) or configuration (FrontendBaseUrl).");
        }

        return configUrl.TrimEnd('/');
    }

    /// <summary>Makes sure the subscription points at an existing provider customer, reusing one found by stable reference before creating a new one.</summary>
    private async Task EnsureCustomerAsync(Tenant tenant, Subscription subscription, CancellationToken cancellationToken)
    {
        if (!string.IsNullOrEmpty(subscription.ProviderCustomerId))
        {
            try
            {
                await xenditClient.GetCustomerAsync(subscription.ProviderCustomerId, cancellationToken);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Provider customer {CustomerId} was not found or accessible; resetting", subscription.ProviderCustomerId);
                subscription.ProviderCustomerId = null;
            }
        }

        if (string.IsNullOrEmpty(subscription.ProviderCustomerId))
        {
            try
            {
                var existing = await xenditClient.SearchCustomersByReferenceAsync($"cust-{tenant.Id}", cancellationToken);
                subscription.ProviderCustomerId = existing?.FirstOrDefault()?.Id;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to search for an existing provider customer");
            }
        }

        if (string.IsNullOrEmpty(subscription.ProviderCustomerId))
        {
            subscription.ProviderCustomerId = await CreateCustomerAsync(tenant, cancellationToken);
        }

        subscription.ProviderName = ProviderName;
        await context.SaveChangesAsync(cancellationToken);
    }

    private static string? ExtractRedirectUrl(Xendit.Models.Subscriptions.XenditPlanResponse planResponse)
    {
        string? redirectUrl = planResponse.Actions?
            .FirstOrDefault(a => a.Action == "AUTH" || a.Action == "AUTH_LINK")?.Url;

        if (!string.IsNullOrEmpty(redirectUrl) || planResponse.AdditionalData == null)
        {
            return redirectUrl;
        }

        if (planResponse.AdditionalData.TryGetValue("actions", out var actionsElement) && actionsElement.ValueKind == JsonValueKind.Array)
        {
            foreach (var action in actionsElement.EnumerateArray())
            {
                if (action.TryGetProperty("action", out var actionName) &&
                    (actionName.GetString() == "AUTH" || actionName.GetString() == "AUTH_LINK") &&
                    action.TryGetProperty("url", out var actionUrl))
                {
                    return actionUrl.GetString();
                }
            }
        }

        if (planResponse.AdditionalData.TryGetValue("checkout_url", out var checkoutUrl))
        {
            return checkoutUrl.GetString();
        }

        return planResponse.AdditionalData.TryGetValue("payment_url", out var paymentUrl) ? paymentUrl.GetString() : null;
    }

    private async Task<string> CreateCustomerAsync(Tenant tenant, CancellationToken cancellationToken)
    {
        var customerRequest = new Xendit.Models.Customers.XenditCustomerRequest
        {
            ReferenceId = $"cust-{tenant.Id}",
            Type = "INDIVIDUAL",
            IndividualDetail = new Xendit.Models.Customers.XenditIndividualDetail
            {
                GivenNames = string.IsNullOrEmpty(tenant.FirstName) ? (string.IsNullOrEmpty(tenant.Name) ? "Workplace" : tenant.Name) : tenant.FirstName,
                Surname = string.IsNullOrEmpty(tenant.LastName) ? "Owner" : tenant.LastName
            },
            Email = tenant.Email ?? "tenant@example.com",
            PhoneNumber = string.IsNullOrEmpty(tenant.PhoneNumber) ? null : tenant.PhoneNumber
        };

        if (!string.IsNullOrEmpty(tenant.Country))
        {
            customerRequest.Addresses = new List<XenditAddressObject>
            {
                new XenditAddressObject
                {
                    Country = tenant.Country,
                    StreetLine1 = tenant.StreetLine1,
                    StreetLine2 = tenant.StreetLine2,
                    City = tenant.City,
                    ProvinceState = tenant.Province,
                    PostalCode = tenant.PostalCode
                }
            };
        }

        if (!string.IsNullOrEmpty(tenant.TaxId))
        {
            customerRequest.Metadata = new Dictionary<string, object>
            {
                { "tax_id", tenant.TaxId }
            };
        }

        var customerResponse = await xenditClient.CreateCustomerAsync(customerRequest, cancellationToken);
        return customerResponse.Id;
    }
}
