using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Features.Licensing;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Constants;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Licensing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace ClinicEz.Portal.Tests.Billing;

/// <summary>
/// Comprehensive verification of Teleconsultation Pay-As-You-Go (PAYG) Billing in Portal API.
/// Verifies:
/// - TC-T1.3.1: Seeded plans default disabled.
/// - TC-T1.3.2: WorkspaceTeleconsultBilling entity default configuration.
/// - TC-T1.3.3: MediaEntitlementUpdated Interop synchronization.
/// - TC-T2.3.6: Budget exhaustion in Postpaid with AllowOverageBeyondAllocation = false.
/// - TC-T2.3.7: Negative input validation.
/// Follows Portal API conventions: Moq + InMemory EF Core + Transactional Outbox.
/// </summary>
public class TeleconsultPaygBillingTests : IDisposable
{
    private readonly ApplicationDbContext _db = TestSupport.NewContext();
    private readonly TestClock _clock = new(new DateTimeOffset(2026, 11, 14, 10, 0, 0, TimeSpan.Zero));
    private readonly LicenseOptions _options = new() { TtlDays = 30, GraceDays = 14 };

    public void Dispose()
    {
        _db.Database.EnsureDeleted();
        _db.Dispose();
    }

    private DateTime Now => _clock.GetUtcNow().UtcDateTime;

    private LicenseIssuer Issuer() => new(new FacilityLicenseSigner(), Options.Create(_options), _clock);

    private EntitlementsPublisher CreatePublisher() =>
        new(
            _db,
            TestSupport.Entitlements(_db, _clock),
            new FacilityAllocationService(_db),
            Issuer(),
            new InteropPublisher(_db));

    // =========================================================================
    // TC-T1.3.1: Seeded Plans Default to Teleconsultation Disabled
    // =========================================================================
    [Theory]
    [InlineData("starter")]
    [InlineData("standard")]
    [InlineData("pro")]
    [InlineData("enterprise")]
    public void TC_T1_3_1_SeededPlans_DefaultToTeleconsultationDisabled(string planTier)
    {
        // ARRANGE & ACT: Query default features for each tier
        var features = PlanTierDefaults.GetFeaturesForTier(planTier);

        // ASSERT: FeatureKeys.Teleconsultation must NOT be present by default
        Assert.DoesNotContain(FacilityFeatureKeys.Teleconsultation, features);
    }

    [Fact]
    public async Task TC_T1_3_1_UnconfiguredWorkspace_HasTeleconsultationFeatureDisabled()
    {
        // ARRANGE: Workspace on pro plan without explicit PAYG enablement
        var tenant = new Tenant { Id = Guid.NewGuid(), TenantSlug = "unconfigured-site", Name = "Unconfigured" };
        _db.Tenants.Add(tenant);
        await _db.SaveChangesAsync();

        await TestSupport.SeedSubscriptionAsync(_db, tenant.Id, SubscriptionStatus.Active, "pro", Now.AddDays(30));

        // ACT: Resolve entitlements
        var snapshot = await TestSupport.Entitlements(_db, _clock).ResolveAsync(tenant.Id, CancellationToken.None);

        // ASSERT
        Assert.False(snapshot.Has(EntitlementKeys.FeatureTeleconsultation));
    }

    // =========================================================================
    // TC-T1.3.2: WorkspaceTeleconsultBilling Entity Default Configuration
    // =========================================================================
    [Fact]
    public void TC_T1_3_2_WorkspaceTeleconsultBilling_DefaultValues_ConformToCommercialSpec()
    {
        // ARRANGE & ACT
        var billing = new WorkspaceTeleconsultBilling();

        // ASSERT
        Assert.False(billing.IsEnabled);
        Assert.Equal(WorkspaceTeleconsultBilling.ModePostpaid, billing.BillingMode);
        Assert.Equal(5.00m, billing.RatePerMinutePhp);
        Assert.Equal(0m, billing.AllocatedBudgetPhp);
        Assert.Equal(0m, billing.PrepaidBalancePhp);
        Assert.True(billing.AllowOverageBeyondAllocation);
        Assert.Equal(0, billing.CurrentPeriodMinutesUsed);
        Assert.Equal(0m, billing.CurrentPeriodBilledPhp);
        Assert.Equal(0m, billing.CurrentPeriodOveragePhp);
    }

    // =========================================================================
    // TC-T1.3.3: MediaEntitlementUpdated Interop Synchronization
    // =========================================================================
    [Fact]
    public async Task TC_T1_3_3_InteropSync_PrepaidActivation_StagesMediaEntitlementUpdatedToMedia()
    {
        // ARRANGE: Tenant opts into teleconsultation in Portal with Prepaid balance ₱500.00 (100 mins at ₱5.00/min)
        var tenant = new Tenant { Id = Guid.NewGuid(), TenantSlug = "metro-prepaid", Name = "Metro Prepaid" };
        var clinic = new Facility { Id = Guid.NewGuid(), TenantId = tenant.Id, Name = "Clinic Main", FacilityType = FacilityType.Clinic, Status = FacilityStatus.Active };
        _db.Tenants.Add(tenant);
        _db.Facilities.Add(clinic);
        await _db.SaveChangesAsync();

        await TestSupport.SeedSubscriptionAsync(_db, tenant.Id, SubscriptionStatus.Active, "pro", Now.AddDays(60));

        var billing = new WorkspaceTeleconsultBilling
        {
            TenantId = tenant.Id,
            IsEnabled = true,
            BillingMode = WorkspaceTeleconsultBilling.ModePrepaid,
            RatePerMinutePhp = 5.00m,
            PrepaidBalancePhp = 500.00m,
            AllowOverageBeyondAllocation = false
        };
        _db.WorkspaceTeleconsultBillings.Add(billing);
        await _db.SaveChangesAsync();

        var publisher = CreatePublisher();

        // ACT: Stage for workspace
        await publisher.StageForWorkspaceAsync(tenant.Id, CancellationToken.None);
        await _db.SaveChangesAsync();

        // ASSERT: Interop message staged in transactional outbox for Party.Media
        var mediaMessages = TestSupport.Outbox(_db, InteropTypes.MediaEntitlementUpdated)
            .Where(m => m.To == Party.Media)
            .ToList();

        Assert.Single(mediaMessages);
        var message = mediaMessages[0];
        Assert.Equal(Party.Portal, message.From);

        var payload = message.GetPayload<MediaEntitlementUpdatedPayload>();
        Assert.NotNull(payload);
        Assert.Equal(tenant.Id.ToString(), payload.TenantId);
        Assert.True(payload.IsActive);
        Assert.Equal(100, payload.CallMinutesMonthly); // ₱500.00 / ₱5.00/min = 100 minutes
        Assert.Equal("Prepaid", payload.BillingMode);
        Assert.Equal(5.00m, payload.RatePerMinutePhp);
        Assert.False(payload.AllowOverdraft);

        // Facility license re-minted with teleconsultation enabled
        var clinicChanged = TestSupport.Outbox(_db, InteropTypes.EntitlementsChanged)
            .FirstOrDefault(m => m.To.Service is null);
        Assert.NotNull(clinicChanged);
    }

    [Fact]
    public async Task TC_T1_3_3_InteropSync_PostpaidActivation_StagesMediaEntitlementWithOverdraftAllowed()
    {
        // ARRANGE: Postpaid mode with ₱250 budget (50 minutes) and AllowOverage = true
        var tenant = new Tenant { Id = Guid.NewGuid(), TenantSlug = "postpaid-sync", Name = "Postpaid Sync" };
        _db.Tenants.Add(tenant);
        await _db.SaveChangesAsync();

        await TestSupport.SeedSubscriptionAsync(_db, tenant.Id, SubscriptionStatus.Active, "pro", Now.AddDays(30));

        var billing = new WorkspaceTeleconsultBilling
        {
            TenantId = tenant.Id,
            IsEnabled = true,
            BillingMode = WorkspaceTeleconsultBilling.ModePostpaid,
            RatePerMinutePhp = 5.00m,
            AllocatedBudgetPhp = 250.00m,
            AllowOverageBeyondAllocation = true
        };
        _db.WorkspaceTeleconsultBillings.Add(billing);
        await _db.SaveChangesAsync();

        var publisher = CreatePublisher();

        // ACT
        await publisher.StageForWorkspaceAsync(tenant.Id, CancellationToken.None);
        await _db.SaveChangesAsync();

        // ASSERT
        var payload = TestSupport.Outbox(_db, InteropTypes.MediaEntitlementUpdated)
            .Where(m => m.To == Party.Media)
            .Select(m => m.GetPayload<MediaEntitlementUpdatedPayload>())
            .Single();

        Assert.True(payload.IsActive);
        Assert.Equal(50, payload.CallMinutesMonthly);
        Assert.True(payload.AllowOverdraft);
        Assert.Equal("Postpaid", payload.BillingMode);
    }

    // =========================================================================
    // TC-T2.3.6: Budget Exhaustion in Postpaid
    // =========================================================================
    [Fact]
    public void TC_T2_3_6_ComputeAvailableMinutes_PostpaidExhaustedWithoutOverage_ReturnsZero()
    {
        // ARRANGE: Postpaid workspace with ₱200 allocated budget and AllowOverageBeyondAllocation = false.
        // CurrentPeriodBilledPhp is ₱200 (exact budget match).
        var billing = new WorkspaceTeleconsultBilling
        {
            IsEnabled = true,
            BillingMode = WorkspaceTeleconsultBilling.ModePostpaid,
            RatePerMinutePhp = 5.00m,
            AllocatedBudgetPhp = 200m,
            AllowOverageBeyondAllocation = false,
            CurrentPeriodBilledPhp = 200m
        };

        // ACT
        var availableMinutes = billing.ComputeAvailableMinutes();

        // ASSERT: Budget exhausted and overage disallowed -> 0 available minutes
        Assert.Equal(0, availableMinutes);
    }

    [Fact]
    public void TC_T2_3_6_ComputeAvailableMinutes_PostpaidWithOverageAllowed_ReturnsRemainingAllocation()
    {
        // ARRANGE: Postpaid workspace with AllowOverageBeyondAllocation = true
        var billing = new WorkspaceTeleconsultBilling
        {
            IsEnabled = true,
            BillingMode = WorkspaceTeleconsultBilling.ModePostpaid,
            RatePerMinutePhp = 5.00m,
            AllocatedBudgetPhp = 200m,
            AllowOverageBeyondAllocation = true,
            CurrentPeriodBilledPhp = 100m
        };

        // ACT
        var availableMinutes = billing.ComputeAvailableMinutes();

        // ASSERT: Remaining ₱100 / ₱5 = 20 minutes
        Assert.Equal(20, availableMinutes);
    }

    // =========================================================================
    // TC-T2.3.7: Negative Input Validation
    // =========================================================================
    [Theory]
    [InlineData(-5.00)]
    [InlineData(0.00)]
    public void TC_T2_3_7_NegativeOrZeroRate_ComputeAvailableMinutes_ReturnsZeroSafely(double testRate)
    {
        // ARRANGE: Edge case where rate is zero or negative
        var billing = new WorkspaceTeleconsultBilling
        {
            IsEnabled = true,
            BillingMode = WorkspaceTeleconsultBilling.ModePrepaid,
            RatePerMinutePhp = (decimal)testRate,
            PrepaidBalancePhp = 500m
        };

        // ACT & ASSERT: Must not divide by zero or allow negative minutes
        Assert.Equal(0, billing.ComputeAvailableMinutes());
    }

    [Fact]
    public void TC_T2_3_7_PeriodRoll_ResetsPeriodCountersCleanly()
    {
        // ARRANGE: Workspace with previous month usage
        var billing = new WorkspaceTeleconsultBilling
        {
            CurrentPeriodYearMonth = "2026-10",
            CurrentPeriodMinutesUsed = 120,
            CurrentPeriodBilledPhp = 600m,
            CurrentPeriodOveragePhp = 100m
        };

        // ACT: New period arrives
        billing.RollPeriodIfNeeded("2026-11");

        // ASSERT
        Assert.Equal("2026-11", billing.CurrentPeriodYearMonth);
        Assert.Equal(0, billing.CurrentPeriodMinutesUsed);
        Assert.Equal(0m, billing.CurrentPeriodBilledPhp);
        Assert.Equal(0m, billing.CurrentPeriodOveragePhp);
    }
}
