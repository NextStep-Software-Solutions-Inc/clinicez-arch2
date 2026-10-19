using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Billing.Commands;
using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Features.Licensing;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace ClinicEz.Portal.Tests.Xendit;

public class ProcessXenditWebhookCommandHandlerTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly ProcessXenditWebhookCommandHandler _sut;

    public ProcessXenditWebhookCommandHandlerTests()
    {
        var subscriptions = new SubscriptionService(
            _context,
            Options.Create(TestSupport.Plans()),
            TimeProvider.System,
            new Mock<IEntitlementsPublisher>().Object);
        _sut = new ProcessXenditWebhookCommandHandler(_context, subscriptions, TimeProvider.System, NullLogger<ProcessXenditWebhookCommandHandler>.Instance);
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private async Task<(Tenant Tenant, Subscription Subscription)> SeedWorkspaceAsync(
        string slug,
        string planSlug,
        SubscriptionStatus status,
        string? customerId = null,
        string? providerSubscriptionId = null)
    {
        var tenant = new Tenant { Id = Guid.NewGuid(), Name = slug, TenantSlug = slug, Email = $"{slug}@clinic.com", OwnerId = $"owner-{slug}" };
        _context.Tenants.Add(tenant);
        await _context.SaveChangesAsync();

        var subscription = await TestSupport.SeedSubscriptionAsync(_context, tenant.Id, status, planSlug, trialEndsAt: DateTime.UtcNow.AddDays(7));
        subscription.ProviderCustomerId = customerId;
        subscription.ProviderSubscriptionId = providerSubscriptionId;
        await _context.SaveChangesAsync();
        return (tenant, subscription);
    }

    private async Task<Subscription> ReloadAsync(Guid tenantId) =>
        await _context.Subscriptions.AsNoTracking().Include(s => s.Plan).SingleAsync(s => s.TenantId == tenantId);

    private static XenditWebhookPayload Payload(string eventName, params (string Key, object Value)[] data) =>
        new()
        {
            Event = eventName,
            Data = data.ToDictionary(d => d.Key, d => JsonSerializer.SerializeToElement(d.Value))
        };

    [Fact]
    public async Task Handle_SubscriptionActive_ActivatesTheWorkspaceSubscriptionOnTheMetadataPlan()
    {
        var (tenant, _) = await SeedWorkspaceAsync("test-clinic", "starter", SubscriptionStatus.Trialing);
        var payload = Payload(
            "recurring.subscription.active",
            ("id", "sub_active_123"),
            ("metadata", new Dictionary<string, string> { ["tenantId"] = tenant.Id.ToString(), ["planSlug"] = "pro" }));

        var result = await _sut.Handle(new ProcessXenditWebhookCommand(payload), CancellationToken.None);

        Assert.True(result);
        var subscription = await ReloadAsync(tenant.Id);
        Assert.Equal(SubscriptionStatus.Active, subscription.Status);
        Assert.Equal("sub_active_123", subscription.ProviderSubscriptionId);
        Assert.Equal("pro", subscription.Plan.Slug);
    }

    [Fact]
    public async Task Handle_CallbackThatCannotBeTiedToAWorkspace_IsRejected_AndTouchesNothing()
    {
        var (tenant, _) = await SeedWorkspaceAsync("test-clinic", "starter", SubscriptionStatus.Trialing);
        var payload = Payload("recurring.subscription.active", ("id", "sub_unknown_1"), ("customer_id", "cust_unknown"));

        var result = await _sut.Handle(new ProcessXenditWebhookCommand(payload), CancellationToken.None);

        Assert.False(result);
        var subscription = await ReloadAsync(tenant.Id);
        Assert.Equal(SubscriptionStatus.Trialing, subscription.Status);
        Assert.Null(subscription.ProviderSubscriptionId);
    }

    [Fact]
    public async Task Handle_SubscriptionCancelled_CancelsTheSubscriptionMatchedByProviderId()
    {
        var (tenant, _) = await SeedWorkspaceAsync("test-clinic", "pro", SubscriptionStatus.Active, providerSubscriptionId: "sub_cancel_1");

        var result = await _sut.Handle(new ProcessXenditWebhookCommand(Payload("recurring.subscription.cancelled", ("id", "sub_cancel_1"))), CancellationToken.None);

        Assert.True(result);
        Assert.Equal(SubscriptionStatus.Cancelled, (await ReloadAsync(tenant.Id)).Status);
    }

    [Fact]
    public async Task Handle_InvoicePaid_CreatesPaymentReceipt_AndActivatesTheSubscription()
    {
        var (tenant, _) = await SeedWorkspaceAsync("paid-clinic", "pro", SubscriptionStatus.Trialing, customerId: "cust_paid_999");
        var payload = Payload(
            "recurring.invoice.paid",
            ("id", "inv_paid_456"),
            ("amount", 12900),
            ("currency", "PHP"),
            ("customer_id", "cust_paid_999"),
            ("external_id", "sub-12345"));

        var result = await _sut.Handle(new ProcessXenditWebhookCommand(payload), CancellationToken.None);

        Assert.True(result);
        Assert.Equal(SubscriptionStatus.Active, (await ReloadAsync(tenant.Id)).Status);

        var invoice = await _context.BillingInvoices.SingleAsync(i => i.TenantId == tenant.Id);
        Assert.Equal("inv_paid_456", invoice.XenditInvoiceId);
        Assert.Equal(12900, invoice.Amount);
        Assert.Equal("PHP", invoice.Currency);
        Assert.Equal("pro", invoice.PlanSlug);
        Assert.Equal("Paid", invoice.Status);

        var receipt = await _context.PaymentReceipts.SingleAsync(r => r.TenantId == tenant.Id);
        Assert.Equal(invoice.Id, receipt.InvoiceId);
        Assert.Equal(12900, receipt.AmountPaid);
        Assert.Equal("PHP", receipt.Currency);
        Assert.StartsWith("REC-", receipt.ReceiptNumber);
    }

    [Fact]
    public async Task Handle_InvoicePaid_Twice_RecordsOneReceipt()
    {
        var (tenant, _) = await SeedWorkspaceAsync("paid-clinic", "pro", SubscriptionStatus.Trialing, customerId: "cust_paid_999");
        XenditWebhookPayload Paid() => Payload(
            "recurring.invoice.paid",
            ("id", "inv_paid_456"),
            ("amount", 12900),
            ("currency", "PHP"),
            ("customer_id", "cust_paid_999"));

        await _sut.Handle(new ProcessXenditWebhookCommand(Paid()), CancellationToken.None);
        await _sut.Handle(new ProcessXenditWebhookCommand(Paid()), CancellationToken.None);

        Assert.Single(_context.BillingInvoices.Where(i => i.TenantId == tenant.Id));
        Assert.Single(_context.PaymentReceipts.Where(r => r.TenantId == tenant.Id));
    }

    [Fact]
    public async Task Handle_InvoicePaid_WithPlanSlugMetadata_MovesTheSubscriptionToThatPlan()
    {
        var (tenant, _) = await SeedWorkspaceAsync("upgrade-clinic", "starter", SubscriptionStatus.Trialing, customerId: "cust_upgrade_111");
        var payload = Payload(
            "recurring.invoice.paid",
            ("id", "inv_upgrade_789"),
            ("amount", 24900),
            ("currency", "PHP"),
            ("customer_id", "cust_upgrade_111"),
            ("external_id", "checkout-" + tenant.Id),
            ("metadata", new Dictionary<string, string> { ["tenantId"] = tenant.Id.ToString(), ["planSlug"] = "pro" }));

        var result = await _sut.Handle(new ProcessXenditWebhookCommand(payload), CancellationToken.None);

        Assert.True(result);
        var subscription = await ReloadAsync(tenant.Id);
        Assert.Equal(SubscriptionStatus.Active, subscription.Status);
        Assert.Equal("pro", subscription.Plan.Slug);

        var invoice = await _context.BillingInvoices.SingleAsync(i => i.TenantId == tenant.Id);
        Assert.Equal("pro", invoice.PlanSlug);
        Assert.Equal("Paid", invoice.Status);

        var receipt = await _context.PaymentReceipts.SingleAsync(r => r.TenantId == tenant.Id);
        Assert.Equal(invoice.Id, receipt.InvoiceId);
        Assert.Equal(24900, receipt.AmountPaid);
    }

    [Fact]
    public async Task Handle_CycleSucceeded_WithPlanSlugMetadata_MovesTheSubscriptionToThatPlan()
    {
        var (tenant, _) = await SeedWorkspaceAsync("cycle-clinic", "starter", SubscriptionStatus.Active, providerSubscriptionId: "sub_cycle_888");
        var payload = Payload(
            "recurring.cycle.succeeded",
            ("subscription_id", "sub_cycle_888"),
            ("id", "inv_cycle_555"),
            ("amount", 12900),
            ("currency", "PHP"),
            ("metadata", new Dictionary<string, string> { ["planSlug"] = "pro" }));

        var result = await _sut.Handle(new ProcessXenditWebhookCommand(payload), CancellationToken.None);

        Assert.True(result);
        var subscription = await ReloadAsync(tenant.Id);
        Assert.Equal(SubscriptionStatus.Active, subscription.Status);
        Assert.Equal("pro", subscription.Plan.Slug);

        var invoice = await _context.BillingInvoices.SingleAsync(i => i.TenantId == tenant.Id);
        Assert.Equal("pro", invoice.PlanSlug);

        var receipt = await _context.PaymentReceipts.SingleAsync(r => r.TenantId == tenant.Id);
        Assert.Equal(invoice.Id, receipt.InvoiceId);
        Assert.Equal(12900, receipt.AmountPaid);
    }

    [Fact]
    public void Test_XenditCustomerRequest_Serialization()
    {
        var request = new ClinicEz.Portal.Infrastructure.Xendit.Models.Customers.XenditCustomerRequest
        {
            ReferenceId = "ref_123",
            Type = "BUSINESS",
            BusinessDetail = new ClinicEz.Portal.Infrastructure.Xendit.Models.Customers.XenditBusinessDetail
            {
                BusinessName = "Test Clinic Name"
            }
        };

        var options = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        };

        var json = JsonSerializer.Serialize(request, options);
        Assert.Contains("business_detail", json);
        Assert.Contains("business_name", json);
    }
}