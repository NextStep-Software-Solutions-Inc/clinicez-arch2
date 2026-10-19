using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Billing.Commands;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Infrastructure.Services;
using ClinicEz.Shared.Exceptions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace ClinicEz.Portal.Tests.Billing;

public class CreateCheckoutSessionTests
{
    private static ApplicationDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new ApplicationDbContext(options);
    }

    [Fact]
    public async Task Handle_WhenOnlinePaymentNotReady_ThrowsServiceUnavailableException()
    {
        using var db = CreateDbContext();
        var cache = new MemoryCache(new MemoryCacheOptions());
        var settingsService = new SystemSettingsService(db, cache, NullLogger<SystemSettingsService>.Instance);
        var mockBilling = new Mock<IBillingProvider>();

        var handler = new CreateCheckoutSessionCommandHandler(mockBilling.Object, db, settingsService);

        var command = new CreateCheckoutSessionCommand
        {
            TenantId = "test-clinic",
            PlanId = "starter",
            IsAnnual = false
        };

        var ex = await Assert.ThrowsAsync<ServiceUnavailableException>(() => handler.Handle(command, CancellationToken.None));
        Assert.Equal(CreateCheckoutSessionCommandHandler.PaymentGatewayNotReadyMessage, ex.Message);
        mockBilling.Verify(b => b.CreateCheckoutSessionAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<bool>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_WhenOnlinePaymentReady_InvokesBillingProviderAndUpdatesTenant()
    {
        using var db = CreateDbContext();
        var tenant = new Tenant
        {
            Id = Guid.NewGuid(),
            TenantSlug = "verified-clinic",
            Name = "Verified Primary Care",
            OwnerId = "owner-1"
        };
        db.Tenants.Add(tenant);
        await db.SaveChangesAsync();

        var cache = new MemoryCache(new MemoryCacheOptions());
        var settingsService = new SystemSettingsService(db, cache, NullLogger<SystemSettingsService>.Instance);
        await settingsService.UpdateSettingsAsync(new Dictionary<string, string>
        {
            ["Billing:IsOnlinePaymentReady"] = "true"
        }, "AdminUser");

        var mockBilling = new Mock<IBillingProvider>();
        mockBilling.Setup(b => b.CreateCheckoutSessionAsync(tenant.TenantSlug, "pro", true, It.IsAny<CancellationToken>()))
            .ReturnsAsync("https://checkout.xendit.co/web/test-session-123");

        var handler = new CreateCheckoutSessionCommandHandler(mockBilling.Object, db, settingsService);

        var command = new CreateCheckoutSessionCommand
        {
            TenantId = tenant.TenantSlug,
            PlanId = "pro",
            IsAnnual = true,
            PhoneNumber = "09171234567",
            TaxId = "123-456-789-000",
            TradingName = "Verified Clinic Care"
        };

        var resultUrl = await handler.Handle(command, CancellationToken.None);

        Assert.Equal("https://checkout.xendit.co/web/test-session-123", resultUrl);

        var updatedTenant = await db.Tenants.FindAsync(tenant.Id);
        Assert.NotNull(updatedTenant);
        Assert.Equal("09171234567", updatedTenant!.PhoneNumber);
        Assert.Equal("123-456-789-000", updatedTenant.TaxId);
        Assert.Equal("Verified Clinic Care", updatedTenant.TradingName);

        mockBilling.Verify(b => b.CreateCheckoutSessionAsync(tenant.TenantSlug, "pro", true, It.IsAny<CancellationToken>()), Times.Once);
    }
}
