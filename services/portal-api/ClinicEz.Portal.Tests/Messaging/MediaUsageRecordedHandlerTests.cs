using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Messaging.Handlers;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace ClinicEz.Portal.Tests.Messaging;

/// <summary>
/// Comprehensive verification of MediaUsageRecordedHandler in Portal API.
/// Verifies:
/// - TC-T1.3.4: Usage recording and balance deduction (Prepaid deduction, Postpaid accrual, zero-PHI audit).
/// - TC-T2.3.5: Duplicate message idempotency (no double deduction on duplicate CallId).
/// Follows Portal API conventions: Moq + InMemory EF Core.
/// </summary>
public class MediaUsageRecordedHandlerTests : IDisposable
{
    private readonly ApplicationDbContext _db = TestSupport.NewContext();
    private readonly Mock<IInteropPublisher> _publisherMock = new();

    public void Dispose()
    {
        _db.Database.EnsureDeleted();
        _db.Dispose();
    }

    private static InteropMessageContext CreateContext(MediaUsageRecordedPayload payload)
    {
        return new InteropMessageContext(InteropEnvelope.Create(
            InteropTypes.MediaUsageRecorded,
            Party.Media,
            Party.Portal,
            payload.CallId,
            payload
        ));
    }

    // =========================================================================
    // TC-T1.3.4: Usage Recording and Balance Deduction (Prepaid)
    // =========================================================================
    [Fact]
    public async Task TC_T1_3_4_HandleAsync_PrepaidUsage_DeductsBalance_AndPersistsZeroPhiRecord()
    {
        // ARRANGE: Prepaid tenant with ₱100.00 balance (₱5.00/min rate).
        // 10-minute call completes (cost: ₱50.00).
        var tenant = new Tenant { Id = Guid.NewGuid(), TenantSlug = "prepaid-deduct", Name = "Prepaid Deduct" };
        _db.Tenants.Add(tenant);

        var billing = new WorkspaceTeleconsultBilling
        {
            TenantId = tenant.Id,
            IsEnabled = true,
            BillingMode = WorkspaceTeleconsultBilling.ModePrepaid,
            RatePerMinutePhp = 5.00m,
            PrepaidBalancePhp = 100.00m,
            CurrentPeriodYearMonth = DateTime.UtcNow.ToString("yyyy-MM")
        };
        _db.WorkspaceTeleconsultBillings.Add(billing);
        await _db.SaveChangesAsync();

        var handler = new MediaUsageRecordedHandler(_db, _publisherMock.Object, NullLogger<MediaUsageRecordedHandler>.Instance);

        var callId = Guid.NewGuid();
        var startedAt = DateTime.UtcNow.AddMinutes(-10);
        var endedAt = DateTime.UtcNow;
        var payload = new MediaUsageRecordedPayload(callId, tenant.Id.ToString(), 10, startedAt, endedAt);
        var context = CreateContext(payload);

        // ACT
        await handler.HandleAsync(payload, context, CancellationToken.None);

        // ASSERT: 1. Balance deducted by ₱50.00 (from ₱100.00 to ₱50.00)
        var updatedBilling = await _db.WorkspaceTeleconsultBillings.FirstAsync(b => b.TenantId == tenant.Id);
        Assert.Equal(50.00m, updatedBilling.PrepaidBalancePhp);
        Assert.Equal(10, updatedBilling.CurrentPeriodMinutesUsed);
        Assert.Equal(50.00m, updatedBilling.CurrentPeriodBilledPhp);

        // ASSERT: 2. TeleconsultUsageRecord persisted with zero PHI
        var record = await _db.TeleconsultUsageRecords.FirstOrDefaultAsync(r => r.CallId == callId);
        Assert.NotNull(record);
        Assert.Equal(tenant.Id.ToString(), record.TenantId);
        Assert.Equal(callId, record.CallId);
        Assert.Equal(10, record.DurationMinutes);
        Assert.Equal(5.00m, record.RatePerMinutePhp);
        Assert.Equal(50.00m, record.TotalCostPhp);
        Assert.Equal(50.00m, record.PrepaidDeductedPhp);
        Assert.Equal(0m, record.PostpaidOveragePhp);

        // Zero-PHI assertion: Record must NOT contain patient identifiers
        var propNames = record.GetType().GetProperties().Select(p => p.Name.ToLowerInvariant()).ToList();
        Assert.DoesNotContain("mrn", propNames);
        Assert.DoesNotContain("patientname", propNames);
        Assert.DoesNotContain("dateofbirth", propNames);
        Assert.DoesNotContain("dob", propNames);
        Assert.DoesNotContain("diagnosis", propNames);
    }

    [Fact]
    public async Task TC_T1_3_4_HandleAsync_PrepaidDepleted_RestagesMediaEntitlementWithDeactivated()
    {
        // ARRANGE: Prepaid tenant with ₱25.00 balance (5 minutes at ₱5.00/min).
        // 12-minute call completes (costs ₱60.00 -> balance becomes ₱0, ₱35 overdraft).
        var tenant = new Tenant { Id = Guid.NewGuid(), TenantSlug = "prepaid-depleted", Name = "Prepaid Depleted" };
        _db.Tenants.Add(tenant);

        var billing = new WorkspaceTeleconsultBilling
        {
            TenantId = tenant.Id,
            IsEnabled = true,
            BillingMode = WorkspaceTeleconsultBilling.ModePrepaid,
            RatePerMinutePhp = 5.00m,
            PrepaidBalancePhp = 25.00m,
            CurrentPeriodYearMonth = DateTime.UtcNow.ToString("yyyy-MM")
        };
        _db.WorkspaceTeleconsultBillings.Add(billing);
        await _db.SaveChangesAsync();

        var handler = new MediaUsageRecordedHandler(_db, _publisherMock.Object, NullLogger<MediaUsageRecordedHandler>.Instance);

        var callId = Guid.NewGuid();
        var startedAt = DateTime.UtcNow.AddMinutes(-12);
        var endedAt = DateTime.UtcNow;
        var payload = new MediaUsageRecordedPayload(callId, tenant.Id.ToString(), 12, startedAt, endedAt);
        var context = CreateContext(payload);

        // ACT
        await handler.HandleAsync(payload, context, CancellationToken.None);

        // ASSERT: Balance is 0; overdraft recorded
        var updatedBilling = await _db.WorkspaceTeleconsultBillings.FirstAsync(b => b.TenantId == tenant.Id);
        Assert.Equal(0m, updatedBilling.PrepaidBalancePhp);
        Assert.Equal(35.00m, updatedBilling.CurrentPeriodOveragePhp);

        // MediaEntitlementUpdated is published to Party.Media with IsActive = false to prevent new calls
        _publisherMock.Verify(p => p.Enqueue(
            InteropTypes.MediaEntitlementUpdated,
            Party.Portal,
            Party.Media,
            payload.CallId,
            It.Is<MediaEntitlementUpdatedPayload>(pl =>
                pl.TenantId == tenant.Id.ToString() &&
                pl.IsActive == false &&
                pl.CallMinutesMonthly == 0),
            It.IsAny<int>(),
            It.IsAny<TimeSpan?>()
        ), Times.Once);
    }

    [Fact]
    public async Task TC_T1_3_4_HandleAsync_PostpaidUsage_AccruesBilledAndOverage()
    {
        // ARRANGE: Postpaid tenant with ₱100 budget and AllowOverage = true.
        // CurrentPeriodBilledPhp is ₱80. A 10-minute call completes (costs ₱50).
        // Total becomes ₱130 -> ₱20 standard allocation + ₱30 overage.
        var tenant = new Tenant { Id = Guid.NewGuid(), TenantSlug = "postpaid-overage", Name = "Postpaid Overage" };
        _db.Tenants.Add(tenant);

        var billing = new WorkspaceTeleconsultBilling
        {
            TenantId = tenant.Id,
            IsEnabled = true,
            BillingMode = WorkspaceTeleconsultBilling.ModePostpaid,
            RatePerMinutePhp = 5.00m,
            AllocatedBudgetPhp = 100.00m,
            AllowOverageBeyondAllocation = true,
            CurrentPeriodBilledPhp = 80.00m,
            CurrentPeriodMinutesUsed = 16,
            CurrentPeriodYearMonth = DateTime.UtcNow.ToString("yyyy-MM")
        };
        _db.WorkspaceTeleconsultBillings.Add(billing);
        await _db.SaveChangesAsync();

        var handler = new MediaUsageRecordedHandler(_db, _publisherMock.Object, NullLogger<MediaUsageRecordedHandler>.Instance);

        var callId = Guid.NewGuid();
        var payload = new MediaUsageRecordedPayload(callId, tenant.Id.ToString(), 10, DateTime.UtcNow.AddMinutes(-10), DateTime.UtcNow);
        var context = CreateContext(payload);

        // ACT
        await handler.HandleAsync(payload, context, CancellationToken.None);

        // ASSERT: ₱20 to standard (reaching ₱100), ₱30 to overage
        var updated = await _db.WorkspaceTeleconsultBillings.FirstAsync(b => b.TenantId == tenant.Id);
        Assert.Equal(100.00m, updated.CurrentPeriodBilledPhp);
        Assert.Equal(30.00m, updated.CurrentPeriodOveragePhp);
        Assert.Equal(26, updated.CurrentPeriodMinutesUsed);

        var record = await _db.TeleconsultUsageRecords.FirstOrDefaultAsync(r => r.CallId == callId);
        Assert.NotNull(record);
        Assert.Equal(0m, record.PrepaidDeductedPhp);
        Assert.Equal(30.00m, record.PostpaidOveragePhp);
    }

    // =========================================================================
    // TC-T2.3.5: Duplicate Message Idempotency
    // =========================================================================
    [Fact]
    public async Task TC_T2_3_5_HandleAsync_DuplicateCallId_DoesNotDoubleDeductOrRecharge()
    {
        // ARRANGE: Prepaid tenant with ₱100 balance
        var tenant = new Tenant { Id = Guid.NewGuid(), TenantSlug = "idempotent-tenant", Name = "Idempotent Tenant" };
        _db.Tenants.Add(tenant);

        var billing = new WorkspaceTeleconsultBilling
        {
            TenantId = tenant.Id,
            IsEnabled = true,
            BillingMode = WorkspaceTeleconsultBilling.ModePrepaid,
            RatePerMinutePhp = 5.00m,
            PrepaidBalancePhp = 100.00m,
            CurrentPeriodYearMonth = DateTime.UtcNow.ToString("yyyy-MM")
        };
        _db.WorkspaceTeleconsultBillings.Add(billing);
        await _db.SaveChangesAsync();

        var handler = new MediaUsageRecordedHandler(_db, _publisherMock.Object, NullLogger<MediaUsageRecordedHandler>.Instance);

        var callId = Guid.NewGuid();
        var payload = new MediaUsageRecordedPayload(callId, tenant.Id.ToString(), 10, DateTime.UtcNow.AddMinutes(-10), DateTime.UtcNow);
        var context = CreateContext(payload);

        // ACT: Process same payload twice
        await handler.HandleAsync(payload, context, CancellationToken.None);
        await handler.HandleAsync(payload, context, CancellationToken.None);

        // ASSERT: Deducted exactly ONCE (₱50 remaining, not ₱0)
        var updated = await _db.WorkspaceTeleconsultBillings.FirstAsync(b => b.TenantId == tenant.Id);
        Assert.Equal(50.00m, updated.PrepaidBalancePhp);
        Assert.Equal(10, updated.CurrentPeriodMinutesUsed);

        // Exactly 1 usage record exists for CallId
        var recordCount = await _db.TeleconsultUsageRecords.CountAsync(r => r.CallId == callId);
        Assert.Equal(1, recordCount);
    }
}
