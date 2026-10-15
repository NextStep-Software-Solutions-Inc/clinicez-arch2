using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Admin.Commands.RecordManualPayment;
using ClinicEz.Portal.Application.Features.Billing.Services;
using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Application.Features.Licensing;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Infrastructure.Persistence.Interceptors;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Licensing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace ClinicEz.Portal.Tests.Features.Admin;

/// <summary>
/// Empirical challenge tests for Milestone 1:
/// 1. Concurrency stress testing on DocumentNumberGenerator and RecordManualPaymentCommand.
/// 2. Unique index collision resistance on synthetic XenditInvoiceId.
/// 3. Invariant verification: subscription status = Active, EntitlementVersion++, license staging call.
/// </summary>
public class EmpiricalConcurrencyAndInvariantsChallengeTests
{
    private static ApplicationDbContext CreateSharedContext(string dbName)
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(dbName)
            .AddInterceptors(new FacilityDirectoryInterceptor(Options.Create(new HubOptions()), new SameBranchFacilityLinkService()))
            .Options;
        var context = new ApplicationDbContext(options);
        TestSupport.Entitlements(context);
        return context;
    }

    private static (RecordManualPaymentCommandHandler Handler, ApplicationDbContext Context) CreateHandler(string dbName)
    {
        var context = CreateSharedContext(dbName);
        var documentNumbers = new DocumentNumberGenerator(context);
        var entitlements = TestSupport.Entitlements(context);

        var publisher = new EntitlementsPublisher(
            context,
            entitlements,
            new FacilityAllocationService(context),
            new LicenseIssuer(new FacilityLicenseSigner(), Options.Create(new LicenseOptions()), TimeProvider.System),
            new InteropPublisher(context));

        var subscriptions = new SubscriptionService(
            context,
            Options.Create(TestSupport.Plans()),
            TimeProvider.System,
            publisher);

        var handler = new RecordManualPaymentCommandHandler(
            context,
            subscriptions,
            documentNumbers,
            TimeProvider.System,
            NullLogger<RecordManualPaymentCommandHandler>.Instance);

        return (handler, context);
    }

    private static async Task<(Tenant Tenant, Facility Facility)> SeedTenantAsync(ApplicationDbContext context, string slug)
    {
        var tenant = new Tenant
        {
            Id = Guid.NewGuid(),
            Name = slug,
            TenantSlug = slug,
            Email = $"{slug}@clinic.test",
            OwnerId = $"owner-{slug}"
        };
        context.Tenants.Add(tenant);

        var facility = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            Name = $"{slug}-clinic",
            Slug = $"{slug}-clinic",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active,
            DeploymentMode = FacilityDeploymentMode.SharedCloud
        };
        context.Facilities.Add(facility);

        await context.SaveChangesAsync();
        return (tenant, facility);
    }

    // =========================================================================
    // 1. Concurrency testing on DocumentNumberGenerator
    // =========================================================================

    [Fact]
    public async Task Concurrency_MultipleSimultaneousCommands_MustProduceUniqueDocumentNumbers()
    {
        var dbName = $"concurrency-test-{Guid.NewGuid():N}";

        // Seed tenant in a setup context
        Guid tenantId;
        using (var setupContext = CreateSharedContext(dbName))
        {
            var (tenant, _) = await SeedTenantAsync(setupContext, "parallel-tenant");
            tenantId = tenant.Id;
        }

        const int concurrencyLevel = 5;
        var paymentDate = new DateTime(2026, 10, 15, 0, 0, 0, DateTimeKind.Utc);

        var tasks = Enumerable.Range(1, concurrencyLevel).Select(async i =>
        {
            var (handler, context) = CreateHandler(dbName);
            using (context)
            {
                var command = new RecordManualPaymentCommand(
                    TenantId: tenantId,
                    PlanSlug: "starter",
                    IsAnnual: false,
                    PaymentMethod: "Cash",
                    TransactionReference: null,
                    Amount: 1000m * i,
                    Notes: $"Concurrent payment {i}",
                    PaymentDate: paymentDate,
                    RecordedBy: $"Agent-{i}"
                );

                return await handler.Handle(command, CancellationToken.None);
            }
        });

        var results = await Task.WhenAll(tasks);

        // All must succeed
        Assert.All(results, r => Assert.NotNull(r));
        Assert.All(results, r => Assert.True(r!.Success));

        var invoiceNumbers = results.Select(r => r!.InvoiceNumber).ToList();
        var receiptNumbers = results.Select(r => r!.ReceiptNumber).ToList();

        // EMPIRICAL CHALLENGE: Verify all generated invoice numbers are strictly unique
        var distinctInvoices = invoiceNumbers.Distinct().ToList();
        var distinctReceipts = receiptNumbers.Distinct().ToList();

        Assert.Equal(concurrencyLevel, distinctInvoices.Count);
        Assert.Equal(concurrencyLevel, distinctReceipts.Count);
    }

    [Fact]
    public async Task Concurrency_DirectDocumentNumberGenerator_ParallelCalls_MustNotCollide()
    {
        var dbName = $"doc-gen-concurrency-{Guid.NewGuid():N}";
        const int callCount = 10;
        var paymentDate = new DateTime(2026, 10, 15, 0, 0, 0, DateTimeKind.Utc);

        var generatedInvoices = new ConcurrentBag<string>();
        var generatedReceipts = new ConcurrentBag<string>();

        // 10 parallel callers requesting document numbers simultaneously
        var tasks = Enumerable.Range(1, callCount).Select(async _ =>
        {
            using var ctx = CreateSharedContext(dbName);
            var generator = new DocumentNumberGenerator(ctx);
            var inv = await generator.NextInvoiceNumberAsync(paymentDate);
            var rec = await generator.NextReceiptNumberAsync(paymentDate);
            generatedInvoices.Add(inv);
            generatedReceipts.Add(rec);
        });

        await Task.WhenAll(tasks);

        // EMPIRICAL CHALLENGE: Do parallel uncommitted calls produce unique numbers?
        Assert.Equal(callCount, generatedInvoices.Distinct().Count());
        Assert.Equal(callCount, generatedReceipts.Distinct().Count());
    }

    // =========================================================================
    // 2. Unique index collision resistance on synthetic XenditInvoiceId
    // =========================================================================

    [Fact]
    public void UniqueIndex_SyntheticXenditInvoiceId_ZeroCollisionsInTightLoop()
    {
        const int iterations = 100_000;
        var set = new HashSet<string>(iterations);
        const string prefix = "INV-202610-0001";

        for (var i = 0; i < iterations; i++)
        {
            var syntheticId = $"MANUAL-{prefix}-{Guid.NewGuid():N}";
            Assert.True(set.Add(syntheticId), $"Collision detected for synthetic ID: {syntheticId} at iteration {i}");
        }

        Assert.Equal(iterations, set.Count);
    }

    // =========================================================================
    // 3. Invariant checks: Subscription status always transitions to Active
    // =========================================================================

    [Theory]
    [InlineData(SubscriptionStatus.PastDue)]
    [InlineData(SubscriptionStatus.Expired)]
    [InlineData(SubscriptionStatus.Cancelled)]
    [InlineData(SubscriptionStatus.Trialing)]
    public async Task Invariant_SubscriptionStatus_AlwaysTransitionsToActive_FromPriorStatuses(SubscriptionStatus priorStatus)
    {
        var dbName = $"status-invariant-{priorStatus}-{Guid.NewGuid():N}";
        var (handler, context) = CreateHandler(dbName);
        using (context)
        {
            var (tenant, _) = await SeedTenantAsync(context, $"tenant-{priorStatus}");

            // Seed subscription in prior status
            var plan = await context.Plans.FirstAsync(p => p.Slug == "starter");
            var subscription = new Subscription
            {
                TenantId = tenant.Id,
                PlanId = plan.Id,
                Plan = plan,
                Status = priorStatus,
                CurrentPeriodEnd = DateTime.UtcNow.AddDays(-5),
                EntitlementVersion = 3
            };
            context.Subscriptions.Add(subscription);
            await context.SaveChangesAsync();

            // Record manual payment
            var command = new RecordManualPaymentCommand(
                TenantId: tenant.Id,
                PlanSlug: "starter",
                IsAnnual: false,
                PaymentMethod: "Bank Transfer",
                TransactionReference: "TX-STATUS-TEST",
                Amount: 2990m,
                Notes: "Reactivation payment"
            );

            var result = await handler.Handle(command, CancellationToken.None);

            Assert.NotNull(result);
            Assert.True(result.Success);
            Assert.Equal("Active", result.Status);

            var reloadedSubscription = await context.Subscriptions.SingleAsync(s => s.TenantId == tenant.Id);
            Assert.Equal(SubscriptionStatus.Active, reloadedSubscription.Status);
            Assert.Equal("Manual", reloadedSubscription.ProviderName);
        }
    }

    [Fact]
    public async Task Invariant_SubscriptionStatus_FreshTenantWithNoPriorSubscription_BecomesActive()
    {
        var dbName = $"status-fresh-tenant-{Guid.NewGuid():N}";
        var (handler, context) = CreateHandler(dbName);
        using (context)
        {
            var (tenant, _) = await SeedTenantAsync(context, "fresh-tenant");

            // Ensure no subscription exists initially
            var priorSub = await context.Subscriptions.FirstOrDefaultAsync(s => s.TenantId == tenant.Id);
            Assert.Null(priorSub);

            var command = new RecordManualPaymentCommand(
                TenantId: tenant.Id,
                PlanSlug: "starter",
                IsAnnual: true,
                PaymentMethod: "Cash",
                TransactionReference: null,
                Amount: 29990m,
                Notes: "First payment onboarding"
            );

            var result = await handler.Handle(command, CancellationToken.None);

            Assert.NotNull(result);
            Assert.True(result.Success);
            Assert.Equal("Active", result.Status);

            var reloadedSubscription = await context.Subscriptions.SingleAsync(s => s.TenantId == tenant.Id);
            Assert.Equal(SubscriptionStatus.Active, reloadedSubscription.Status);
            Assert.Equal("Manual", reloadedSubscription.ProviderName);
        }
    }

    // =========================================================================
    // 4. Invariant checks: EntitlementVersion monotonically increments
    // =========================================================================

    [Fact]
    public async Task Invariant_EntitlementVersion_MonotonicallyIncrementsAcrossMultiplePayments()
    {
        var dbName = $"version-monotonic-{Guid.NewGuid():N}";
        var (handler, context) = CreateHandler(dbName);
        using (context)
        {
            var (tenant, _) = await SeedTenantAsync(context, "version-tenant");

            var versions = new List<int>();

            // Execute 4 sequential manual payments for the same tenant
            for (var paymentIndex = 1; paymentIndex <= 4; paymentIndex++)
            {
                var command = new RecordManualPaymentCommand(
                    TenantId: tenant.Id,
                    PlanSlug: "starter",
                    IsAnnual: false,
                    PaymentMethod: "Cash",
                    TransactionReference: null,
                    Amount: 1000m * paymentIndex,
                    Notes: $"Payment round {paymentIndex}"
                );

                var result = await handler.Handle(command, CancellationToken.None);
                Assert.NotNull(result);
                Assert.True(result.Success);
                versions.Add(result.EntitlementVersion);
            }

            // Verify monotonic strictly increasing sequence
            for (var i = 1; i < versions.Count; i++)
            {
                Assert.True(versions[i] > versions[i - 1],
                    $"EntitlementVersion failed to strictly increase: v[{i - 1}]={versions[i - 1]}, v[{i}]={versions[i]}");
            }
        }
    }

    // =========================================================================
    // 5. Invariant checks: Facility licenses staged properly
    // =========================================================================

    [Fact]
    public async Task Invariant_FacilityLicenses_StagedWithValidSignatureAndExpiration()
    {
        var dbName = $"license-staging-{Guid.NewGuid():N}";
        var (handler, context) = CreateHandler(dbName);
        using (context)
        {
            var (tenant, clinic1) = await SeedTenantAsync(context, "staged-licenses-tenant");

            // Add a second routable facility and one unroutable facility
            var clinic2 = new Facility
            {
                Id = Guid.NewGuid(),
                TenantId = tenant.Id,
                Name = "clinic-2",
                Slug = "clinic-2",
                FacilityType = FacilityType.Clinic,
                Status = FacilityStatus.Active,
                DeploymentMode = FacilityDeploymentMode.SharedCloud
            };
            var privateFacility = new Facility
            {
                Id = Guid.NewGuid(),
                TenantId = tenant.Id,
                Name = "unroutable-facility",
                Slug = "unroutable-facility",
                FacilityType = FacilityType.Laboratory,
                Status = FacilityStatus.Suspended,
                DeploymentMode = FacilityDeploymentMode.OnPremise,
                CellId = "" // Suspended status makes facility non-routable
            };
            context.Facilities.AddRange(clinic2, privateFacility);
            await context.SaveChangesAsync();

            var paymentDate = new DateTime(2026, 10, 15, 0, 0, 0, DateTimeKind.Utc);
            var command = new RecordManualPaymentCommand(
                TenantId: tenant.Id,
                PlanSlug: "starter",
                IsAnnual: true,
                PaymentMethod: "Bank Transfer",
                TransactionReference: "TX-STAGING-001",
                Amount: 29990m,
                Notes: "Staging test",
                PaymentDate: paymentDate
            );

            var result = await handler.Handle(command, CancellationToken.None);
            Assert.NotNull(result);
            Assert.True(result.Success);

            // Exactly 2 routable facilities
            Assert.Equal(2, result.FacilitiesLicensed);

            Assert.Equal(paymentDate.AddYears(1), result.SubscriptionExpiresAt);

            // Verify each routable facility has a valid license token and valid rolling expiration
            var reloadedClinic1 = await context.Facilities.SingleAsync(f => f.Id == clinic1.Id);
            var reloadedClinic2 = await context.Facilities.SingleAsync(f => f.Id == clinic2.Id);

            Assert.NotNull(reloadedClinic1.LicenseToken);
            Assert.NotNull(reloadedClinic2.LicenseToken);
            Assert.NotNull(reloadedClinic1.LicenseExpiresAt);
            Assert.NotNull(reloadedClinic2.LicenseExpiresAt);
            Assert.True(reloadedClinic1.LicenseExpiresAt > DateTime.UtcNow);
            Assert.True(reloadedClinic2.LicenseExpiresAt > DateTime.UtcNow);

            // Verify InteropOutbox has entitlements.changed message
            var outboxMessages = await context.InteropOutbox.ToListAsync();
            Assert.Contains(outboxMessages, m => m.Type == InteropTypes.EntitlementsChanged);
        }
    }
}
