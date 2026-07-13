using System;
using System.Threading;
using System.Threading.Tasks;
using MainPortalBE.Application.Interfaces;
using MainPortalBE.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Collections.Generic;
using MainPortalBE.Infrastructure.Xendit;
using MainPortalBE.Infrastructure.Xendit.Models.Invoices;
using MainPortalBE.Domain.Entities;
using Microsoft.AspNetCore.Http;

namespace MainPortalBE.Infrastructure.Services;

public class XenditBillingService : IXenditBillingService
{
    private readonly ApplicationDbContext _context;
    private readonly IXenditApiClient _xenditClient;
    private readonly IConfiguration _configuration;
    private readonly IHttpContextAccessor _httpContextAccessor;

    public XenditBillingService(
        ApplicationDbContext context, 
        IXenditApiClient xenditClient, 
        IConfiguration configuration,
        IHttpContextAccessor httpContextAccessor)
    {
        _context = context;
        _xenditClient = xenditClient;
        _configuration = configuration;
        _httpContextAccessor = httpContextAccessor;
    }

    public async Task<string> CreateCheckoutSessionAsync(string tenantIdOrSlug, string planId, bool isAnnual, CancellationToken cancellationToken = default)
    {
        string? frontendBaseUrl = null;
        var httpContext = _httpContextAccessor.HttpContext;
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

        if (string.IsNullOrEmpty(frontendBaseUrl))
        {
            frontendBaseUrl = (_configuration["FrontendBaseUrl"] ?? "http://localhost:3000").TrimEnd('/');
        }

        var tenant = await _context.Tenants.FirstOrDefaultAsync(t => t.Id.ToString() == tenantIdOrSlug || t.TenantSlug == tenantIdOrSlug, cancellationToken)
            ?? throw new Exception("Tenant not found.");

        var plan = await _context.SubscriptionPlans.FirstOrDefaultAsync(p => p.Slug.ToLower() == planId.ToLower(), cancellationToken)
            ?? throw new Exception("Plan not found.");

        bool isUpgrade = true;
        DateTime? currentExpiry = null;

        if (tenant.SubscriptionStatus == "ACTIVE" && !string.IsNullOrEmpty(tenant.SubscriptionId))
        {
            var currentPlan = await _context.SubscriptionPlans.FirstOrDefaultAsync(
                p => p.Slug.ToLower() == tenant.SubscriptionPlanId.ToLower() || p.Id.ToString() == tenant.SubscriptionPlanId, 
                cancellationToken);

            if (currentPlan != null)
            {
                int currentRank = currentPlan.Slug.ToLower() == "pro" ? 2 : 1;
                int newRank = plan.Slug.ToLower() == "pro" ? 2 : 1;

                var latestReceipt = await _context.PaymentReceipts
                    .Where(r => r.TenantId == tenant.Id)
                    .OrderByDescending(r => r.PaidAt)
                    .FirstOrDefaultAsync(cancellationToken);

                if (latestReceipt != null && latestReceipt.ExpiryDate > DateTime.UtcNow)
                {
                    currentExpiry = latestReceipt.ExpiryDate;

                    if (newRank < currentRank)
                    {
                        isUpgrade = false; // Tier downgrade (Pro -> Starter)
                    }
                    else if (newRank == currentRank)
                    {
                        var currentIsAnnual = latestReceipt.ExpiryDate - latestReceipt.PaidAt > TimeSpan.FromDays(40);
                        if (currentIsAnnual && !isAnnual)
                        {
                            isUpgrade = false; // Interval downgrade (Annual -> Monthly)
                        }
                    }
                }
            }

            try
            {
                await _xenditClient.DeactivatePlanAsync(tenant.SubscriptionId, cancellationToken);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Billing] Failed to deactivate old plan {tenant.SubscriptionId}: {ex.Message}");
            }
        }

        string anchorDateStr = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM-ddTHH:mm:sszzz");
        if (!isUpgrade && currentExpiry.HasValue)
        {
            anchorDateStr = new DateTimeOffset(currentExpiry.Value).ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM-ddTHH:mm:sszzz");
            Console.WriteLine($"[Billing] Downgrade detected. Scheduling new plan {plan.Slug} to start at {anchorDateStr}");
        }

        // 1. Ensure the Customer exists on Xendit
        if (!string.IsNullOrEmpty(tenant.XenditCustomerId))
        {
            try
            {
                await _xenditClient.GetCustomerAsync(tenant.XenditCustomerId, cancellationToken);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Billing] Customer ID '{tenant.XenditCustomerId}' was not found/accessible in Xendit ({ex.Message}). Resetting.");
                tenant.XenditCustomerId = string.Empty;
            }
        }

        // If XenditCustomerId is not stored in DB, check by stable Reference ID first to prevent duplicate profiles
        if (string.IsNullOrEmpty(tenant.XenditCustomerId))
        {
            try
            {
                var existing = await _xenditClient.SearchCustomersByReferenceAsync($"cust-{tenant.Id}", cancellationToken);
                var match = existing?.FirstOrDefault();
                if (match != null)
                {
                    tenant.XenditCustomerId = match.Id;
                    await _context.SaveChangesAsync(cancellationToken);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Billing] Failed to search for existing customer: {ex.Message}");
            }
        }

        // Recreate if still empty
        if (string.IsNullOrEmpty(tenant.XenditCustomerId))
        {
            tenant.XenditCustomerId = await CreateCustomerOnXenditAsync(tenant, cancellationToken);
            await _context.SaveChangesAsync(cancellationToken);
        }

        // 2. Create Plan on-the-fly for this Customer (which represents the subscription contract)
        var planRequest = new Xendit.Models.Subscriptions.XenditPlanRequest
        {
            ReferenceId = $"sub-{tenant.Id}-{Guid.NewGuid()}",
            CustomerId = tenant.XenditCustomerId,
            RecurringAction = "PAYMENT",
            Amount = isAnnual ? (long)(plan.PriceAnnually * 12) : (long)plan.PriceMonthly,
            Currency = "PHP",
            Description = isAnnual ? $"{tenant.ClinicName} - {plan.Name} Plan Subscription (Annually)" : $"{tenant.ClinicName} - {plan.Name} Plan Subscription (Monthly)",
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
            planResponse = await _xenditClient.CreatePlanAsync(planRequest, cancellationToken);
        }
        catch (Exception ex) when (ex.Message.Contains("CUSTOMER_NOT_FOUND_ERROR") || ex.Message.Contains("CUSTOMER_NOT_FOUND"))
        {
            Console.WriteLine($"[Billing] Customer '{tenant.XenditCustomerId}' was not found by plan service. Resolving existing profile or recreating...");
            tenant.XenditCustomerId = string.Empty;

            try
            {
                var existing = await _xenditClient.SearchCustomersByReferenceAsync($"cust-{tenant.Id}", cancellationToken);
                var match = existing?.FirstOrDefault();
                if (match != null)
                {
                    tenant.XenditCustomerId = match.Id;
                }
            }
            catch (Exception searchEx)
            {
                Console.WriteLine($"[Billing] Search fallback failed: {searchEx.Message}");
            }

            if (string.IsNullOrEmpty(tenant.XenditCustomerId))
            {
                tenant.XenditCustomerId = await CreateCustomerOnXenditAsync(tenant, cancellationToken);
            }

            await _context.SaveChangesAsync(cancellationToken);

            planRequest.CustomerId = tenant.XenditCustomerId;
            planResponse = await _xenditClient.CreatePlanAsync(planRequest, cancellationToken);
        }

        // 3. Parse the redirect URL from the Actions list in response
        string? redirectUrl = planResponse.Actions?
            .FirstOrDefault(a => a.Action == "AUTH" || a.Action == "AUTH_LINK")?.Url;

        if (string.IsNullOrEmpty(redirectUrl) && planResponse.AdditionalData != null)
        {
            if (planResponse.AdditionalData.TryGetValue("actions", out var actionsElement) && actionsElement.ValueKind == JsonValueKind.Array)
            {
                foreach (var action in actionsElement.EnumerateArray())
                {
                    if (action.TryGetProperty("action", out var actionName) && 
                        (actionName.GetString() == "AUTH" || actionName.GetString() == "AUTH_LINK") &&
                        action.TryGetProperty("url", out var actionUrl))
                    {
                        redirectUrl = actionUrl.GetString();
                        break;
                    }
                }
            }

            if (string.IsNullOrEmpty(redirectUrl))
            {
                if (planResponse.AdditionalData.TryGetValue("checkout_url", out var checkoutUrl))
                    redirectUrl = checkoutUrl.GetString();
                else if (planResponse.AdditionalData.TryGetValue("payment_url", out var paymentUrl))
                    redirectUrl = paymentUrl.GetString();
            }
        }

        return redirectUrl ?? $"{frontendBaseUrl}/{tenant.TenantSlug}/dashboard/billing";
    }

    public async Task<string> GetCustomerPortalUrlAsync(string tenantIdOrSlug, CancellationToken cancellationToken = default)
    {
        string? frontendBaseUrl = null;
        var httpContext = _httpContextAccessor.HttpContext;
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

        if (string.IsNullOrEmpty(frontendBaseUrl))
        {
            frontendBaseUrl = (_configuration["FrontendBaseUrl"] ?? "http://localhost:3000").TrimEnd('/');
        }

        var tenant = await _context.Tenants.FirstOrDefaultAsync(t => t.Id.ToString() == tenantIdOrSlug || t.TenantSlug == tenantIdOrSlug, cancellationToken)
            ?? throw new Exception("Tenant not found");

        // Since Xendit does not have a Stripe-like customer portal, we redirect the user to the local billing history/details page
        return $"{frontendBaseUrl}/{tenant.TenantSlug}/dashboard/billing";
    }

    public async Task<bool> CancelSubscriptionAsync(string tenantIdOrSlug, CancellationToken cancellationToken = default)
    {
        var tenant = await _context.Tenants.FirstOrDefaultAsync(t => t.Id.ToString() == tenantIdOrSlug || t.TenantSlug == tenantIdOrSlug, cancellationToken)
            ?? throw new Exception("Tenant not found.");

        if (string.IsNullOrEmpty(tenant.SubscriptionId))
        {
            return false;
        }

        try
        {
            await _xenditClient.DeactivatePlanAsync(tenant.SubscriptionId, cancellationToken);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[Billing] Failed to deactivate subscription {tenant.SubscriptionId}: {ex.Message}");
        }

        tenant.SubscriptionStatus = "CANCELLED";
        await _context.SaveChangesAsync(cancellationToken);
        return true;
    }

    private async Task<string> CreateCustomerOnXenditAsync(Tenant tenant, CancellationToken cancellationToken)
    {
        var customerRequest = new Xendit.Models.Customers.XenditCustomerRequest
        {
            ReferenceId = $"cust-{tenant.Id}",
            Type = "INDIVIDUAL",
            IndividualDetail = new Xendit.Models.Customers.XenditIndividualDetail
            {
                GivenNames = string.IsNullOrEmpty(tenant.FirstName) ? (string.IsNullOrEmpty(tenant.ClinicName) ? "Clinic" : tenant.ClinicName) : tenant.FirstName,
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

        var customerResponse = await _xenditClient.CreateCustomerAsync(customerRequest, cancellationToken);
        return customerResponse.Id;
    }
}
