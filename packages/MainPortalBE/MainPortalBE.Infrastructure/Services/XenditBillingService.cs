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

namespace MainPortalBE.Infrastructure.Services;

public class XenditBillingService : IXenditBillingService
{
    private readonly ApplicationDbContext _context;
    private readonly IXenditApiClient _xenditClient;

    public XenditBillingService(ApplicationDbContext context, IXenditApiClient xenditClient)
    {
        _context = context;
        _xenditClient = xenditClient;
    }

    public async Task<string> CreateCheckoutSessionAsync(string tenantIdOrSlug, string planId, CancellationToken cancellationToken = default)
    {
        var tenant = await _context.Tenants.FirstOrDefaultAsync(t => t.Id.ToString() == tenantIdOrSlug || t.TenantSlug == tenantIdOrSlug, cancellationToken)
            ?? throw new Exception("Tenant not found");

        // Amounts are adjusted to PHP for Xendit testing support
        long amount = planId.ToLower() == "pro" ? 12900 : 4900;  
        
        var request = new XenditInvoiceRequest
        {
            ExternalId = $"checkout-{tenant.Id}-{Guid.NewGuid()}",
            Amount = amount,
            PayerEmail = tenant.Email ?? "tenant@example.com",
            Description = $"Subscription to ClinicEZ {planId} Plan",
            SuccessRedirectUrl = $"http://localhost:3000/{tenant.TenantSlug}/dashboard/billing",
            FailureRedirectUrl = $"http://localhost:3000/{tenant.TenantSlug}/dashboard/billing",
            Currency = "PHP"
        };

        var invoice = await _xenditClient.CreateInvoiceAsync(request, cancellationToken);
        return invoice.InvoiceUrl;
    }

    public async Task<string> GetCustomerPortalUrlAsync(string tenantIdOrSlug, CancellationToken cancellationToken = default)
    {
        var tenant = await _context.Tenants.FirstOrDefaultAsync(t => t.Id.ToString() == tenantIdOrSlug || t.TenantSlug == tenantIdOrSlug, cancellationToken)
            ?? throw new Exception("Tenant not found");

        if (string.IsNullOrEmpty(tenant.XenditCustomerId))
        {
            throw new Exception("No active billing account found for this tenant.");
        }

        // TODO: Implement Xendit Customer Portal retrieval or returning the latest Invoice URL
        throw new NotImplementedException("Xendit Customer Portal URL generation not implemented.");
    }
}
