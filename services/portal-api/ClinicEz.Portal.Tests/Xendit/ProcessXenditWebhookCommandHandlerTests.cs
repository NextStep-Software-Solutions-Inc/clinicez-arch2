using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Billing.Commands;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace ClinicEz.Portal.Tests.Xendit;

public class ProcessXenditWebhookCommandHandlerTests : IDisposable
{
    private readonly ApplicationDbContext _context;
    private readonly ProcessXenditWebhookCommandHandler _sut;

    public ProcessXenditWebhookCommandHandlerTests()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _context = new ApplicationDbContext(options);
        _context.Database.EnsureCreated();

        _sut = new ProcessXenditWebhookCommandHandler(_context);
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    [Fact]
    public async Task Handle_SubscriptionActive_UpdatesTenantStatus()
    {
        // Arrange
        var tenant = new Tenant
        {
            Id = Guid.NewGuid(),
            Name = "Test Workplace",
            TenantSlug = "test-clinic",
            Email = "test@clinic.com",
            SubscriptionStatus = "TRIALING"
        };
        _context.Tenants.Add(tenant);
        await _context.SaveChangesAsync();

        var payload = new XenditWebhookPayload
        {
            Event = "recurring.subscription.active",
            Data = new Dictionary<string, JsonElement>
            {
                { "id", JsonSerializer.SerializeToElement("sub_active_123") },
                {
                    "metadata",
                    JsonSerializer.SerializeToElement(new Dictionary<string, string>
                    {
                        { "tenantId", tenant.Id.ToString() },
                        { "planSlug", "pro" }
                    })
                }
            }
        };

        var command = new ProcessXenditWebhookCommand(payload);

        // Act
        var result = await _sut.Handle(command, CancellationToken.None);

        // Assert
        Assert.True(result);
        var updatedTenant = await _context.Tenants.FindAsync(tenant.Id);
        Assert.NotNull(updatedTenant);
        Assert.Equal("ACTIVE", updatedTenant.SubscriptionStatus);
        Assert.Equal("sub_active_123", updatedTenant.SubscriptionId);
        Assert.Equal("pro", updatedTenant.SubscriptionPlanId);
    }

    [Fact]
    public async Task Handle_InvoicePaid_CreatesPaymentReceipt()
    {
        // Arrange
        var tenant = new Tenant
        {
            Id = Guid.NewGuid(),
            Name = "Paid Workplace",
            TenantSlug = "paid-clinic",
            XenditCustomerId = "cust_paid_999",
            SubscriptionPlanId = "pro",
            SubscriptionStatus = "TRIALING"
        };
        _context.Tenants.Add(tenant);
        await _context.SaveChangesAsync();

        var payload = new XenditWebhookPayload
        {
            Event = "recurring.invoice.paid",
            Data = new Dictionary<string, JsonElement>
            {
                { "id", JsonSerializer.SerializeToElement("inv_paid_456") },
                { "amount", JsonSerializer.SerializeToElement(12900) },
                { "currency", JsonSerializer.SerializeToElement("PHP") },
                { "customer_id", JsonSerializer.SerializeToElement("cust_paid_999") },
                { "external_id", JsonSerializer.SerializeToElement("sub-12345") }
            }
        };

        var command = new ProcessXenditWebhookCommand(payload);

        // Act
        var result = await _sut.Handle(command, CancellationToken.None);

        // Assert
        Assert.True(result);

        var updatedTenant = await _context.Tenants.FindAsync(tenant.Id);
        Assert.NotNull(updatedTenant);
        Assert.Equal("ACTIVE", updatedTenant.SubscriptionStatus);

        var invoice = await _context.BillingInvoices.FirstOrDefaultAsync(i => i.TenantId == tenant.Id);
        Assert.NotNull(invoice);
        Assert.Equal("inv_paid_456", invoice.XenditInvoiceId);
        Assert.Equal(12900, invoice.Amount);
        Assert.Equal("PHP", invoice.Currency);
        Assert.Equal("pro", invoice.PlanSlug);
        Assert.Equal("Paid", invoice.Status);

        var receipt = await _context.PaymentReceipts.FirstOrDefaultAsync(r => r.TenantId == tenant.Id);
        Assert.NotNull(receipt);
        Assert.Equal(invoice.Id, receipt.InvoiceId);
        Assert.Equal(12900, receipt.AmountPaid);
        Assert.Equal("PHP", receipt.Currency);
        Assert.StartsWith("REC-", receipt.ReceiptNumber);
    }

    [Fact]
    public async Task Handle_InvoicePaid_WithPlanSlugMetadata_UpdatesSubscriptionPlanId()
    {
        // Arrange
        var tenant = new Tenant
        {
            Id = Guid.NewGuid(),
            Name = "Upgrade Workplace",
            TenantSlug = "upgrade-clinic",
            XenditCustomerId = "cust_upgrade_111",
            SubscriptionPlanId = "starter",
            SubscriptionStatus = "TRIALING"
        };
        _context.Tenants.Add(tenant);
        await _context.SaveChangesAsync();

        var payload = new XenditWebhookPayload
        {
            Event = "recurring.invoice.paid",
            Data = new Dictionary<string, JsonElement>
            {
                { "id", JsonSerializer.SerializeToElement("inv_upgrade_789") },
                { "amount", JsonSerializer.SerializeToElement(24900) },
                { "currency", JsonSerializer.SerializeToElement("PHP") },
                { "customer_id", JsonSerializer.SerializeToElement("cust_upgrade_111") },
                { "external_id", JsonSerializer.SerializeToElement("checkout-" + tenant.Id.ToString()) },
                {
                    "metadata",
                    JsonSerializer.SerializeToElement(new Dictionary<string, string>
                    {
                        { "tenantId", tenant.Id.ToString() },
                        { "planSlug", "enterprise" }
                    })
                }
            }
        };

        var command = new ProcessXenditWebhookCommand(payload);

        // Act
        var result = await _sut.Handle(command, CancellationToken.None);

        // Assert
        Assert.True(result);
        var updatedTenant = await _context.Tenants.FindAsync(tenant.Id);
        Assert.NotNull(updatedTenant);
        Assert.Equal("ACTIVE", updatedTenant.SubscriptionStatus);
        Assert.Equal("enterprise", updatedTenant.SubscriptionPlanId);

        var invoice = await _context.BillingInvoices.FirstOrDefaultAsync(i => i.TenantId == tenant.Id);
        Assert.NotNull(invoice);
        Assert.Equal("enterprise", invoice.PlanSlug);
        Assert.Equal("Paid", invoice.Status);

        var receipt = await _context.PaymentReceipts.FirstOrDefaultAsync(r => r.TenantId == tenant.Id);
        Assert.NotNull(receipt);
        Assert.Equal(invoice.Id, receipt.InvoiceId);
        Assert.Equal(24900, receipt.AmountPaid);
    }

    [Fact]
    public async Task Handle_CycleSucceeded_WithPlanSlugMetadata_UpdatesSubscriptionPlanId()
    {
        // Arrange
        var tenant = new Tenant
        {
            Id = Guid.NewGuid(),
            Name = "Cycle Workplace",
            TenantSlug = "cycle-clinic",
            SubscriptionId = "sub_cycle_888",
            SubscriptionPlanId = "starter",
            SubscriptionStatus = "ACTIVE"
        };
        _context.Tenants.Add(tenant);
        await _context.SaveChangesAsync();

        var payload = new XenditWebhookPayload
        {
            Event = "recurring.cycle.succeeded",
            Data = new Dictionary<string, JsonElement>
            {
                { "subscription_id", JsonSerializer.SerializeToElement("sub_cycle_888") },
                { "id", JsonSerializer.SerializeToElement("inv_cycle_555") },
                { "amount", JsonSerializer.SerializeToElement(12900) },
                { "currency", JsonSerializer.SerializeToElement("PHP") },
                {
                    "metadata",
                    JsonSerializer.SerializeToElement(new Dictionary<string, string>
                    {
                        { "planSlug", "pro" }
                    })
                }
            }
        };

        var command = new ProcessXenditWebhookCommand(payload);

        // Act
        var result = await _sut.Handle(command, CancellationToken.None);

        // Assert
        Assert.True(result);
        var updatedTenant = await _context.Tenants.FindAsync(tenant.Id);
        Assert.NotNull(updatedTenant);
        Assert.Equal("ACTIVE", updatedTenant.SubscriptionStatus);
        Assert.Equal("pro", updatedTenant.SubscriptionPlanId);

        var invoice = await _context.BillingInvoices.FirstOrDefaultAsync(i => i.TenantId == tenant.Id);
        Assert.NotNull(invoice);
        Assert.Equal("pro", invoice.PlanSlug);

        var receipt = await _context.PaymentReceipts.FirstOrDefaultAsync(r => r.TenantId == tenant.Id);
        Assert.NotNull(receipt);
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
