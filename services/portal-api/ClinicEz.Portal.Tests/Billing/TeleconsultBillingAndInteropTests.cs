using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Features.Guest;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Constants;
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

namespace ClinicEz.Portal.Tests.Billing;

public class TeleconsultBillingAndInteropTests : IDisposable
{
    private readonly ApplicationDbContext _db = TestSupport.NewContext();
    private readonly Mock<IInteropPublisher> _publisherMock = new();
    private readonly Mock<IGuestVerificationService> _guestVerificationMock = new();

    public void Dispose()
    {
        _db.Database.EnsureDeleted();
        _db.Dispose();
    }

    [Fact]
    public async Task MediaUsageRecordedHandler_PostpaidUsage_AccruesBilledAndCreatesUsageRecord()
    {
        var tenant = new Tenant
        {
            Id = Guid.NewGuid(),
            TenantSlug = "metro-health",
            Name = "Metro Health"
        };
        _db.Tenants.Add(tenant);

        var billing = new WorkspaceTeleconsultBilling
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            IsEnabled = true,
            BillingMode = WorkspaceTeleconsultBilling.ModePostpaid,
            RatePerMinutePhp = 5.00m,
            AllocatedBudgetPhp = 500m,
            CurrentPeriodYearMonth = DateTime.UtcNow.ToString("yyyy-MM")
        };
        _db.WorkspaceTeleconsultBillings.Add(billing);
        await _db.SaveChangesAsync();

        var handler = new MediaUsageRecordedHandler(_db, _publisherMock.Object, NullLogger<MediaUsageRecordedHandler>.Instance);

        var callId = Guid.NewGuid();
        var payload = new MediaUsageRecordedPayload(
            callId,
            tenant.TenantSlug,
            10, // 10 minutes
            DateTime.UtcNow.AddMinutes(-10),
            DateTime.UtcNow);

        var envelope = InteropEnvelope.Create(
            InteropTypes.MediaUsageRecorded,
            Party.Media,
            Party.Portal,
            Guid.NewGuid(),
            payload);
        var context = new InteropMessageContext(envelope);

        await handler.HandleAsync(payload, context, CancellationToken.None);

        var savedBilling = await _db.WorkspaceTeleconsultBillings.FirstAsync(b => b.TenantId == tenant.Id);
        Assert.Equal(10, savedBilling.CurrentPeriodMinutesUsed);
        Assert.Equal(50.00m, savedBilling.CurrentPeriodBilledPhp);

        var usage = await _db.TeleconsultUsageRecords.FirstOrDefaultAsync(u => u.CallId == callId);
        Assert.NotNull(usage);
        Assert.Equal(10, usage!.DurationMinutes);
        Assert.Equal(50.00m, usage.TotalCostPhp);
        Assert.Equal(0m, usage.PrepaidDeductedPhp);
        Assert.Equal(0m, usage.PostpaidOveragePhp);
    }

    [Fact]
    public async Task MediaUsageRecordedHandler_PrepaidUsage_DeductsPrepaidBalance()
    {
        var tenant = new Tenant
        {
            Id = Guid.NewGuid(),
            TenantSlug = "prepaid-clinic",
            Name = "Prepaid Clinic"
        };
        _db.Tenants.Add(tenant);

        var billing = new WorkspaceTeleconsultBilling
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            IsEnabled = true,
            BillingMode = WorkspaceTeleconsultBilling.ModePrepaid,
            RatePerMinutePhp = 10.00m,
            PrepaidBalancePhp = 100.00m,
            CurrentPeriodYearMonth = DateTime.UtcNow.ToString("yyyy-MM")
        };
        _db.WorkspaceTeleconsultBillings.Add(billing);
        await _db.SaveChangesAsync();

        var handler = new MediaUsageRecordedHandler(_db, _publisherMock.Object, NullLogger<MediaUsageRecordedHandler>.Instance);

        var callId = Guid.NewGuid();
        var payload = new MediaUsageRecordedPayload(
            callId,
            tenant.Id.ToString(),
            5, // 5 mins * 10 = 50.00m
            DateTime.UtcNow.AddMinutes(-5),
            DateTime.UtcNow);

        var envelope = InteropEnvelope.Create(
            InteropTypes.MediaUsageRecorded,
            Party.Media,
            Party.Portal,
            Guid.NewGuid(),
            payload);
        var context = new InteropMessageContext(envelope);

        await handler.HandleAsync(payload, context, CancellationToken.None);

        var savedBilling = await _db.WorkspaceTeleconsultBillings.FirstAsync(b => b.TenantId == tenant.Id);
        Assert.Equal(50.00m, savedBilling.PrepaidBalancePhp);
        Assert.Equal(5, savedBilling.CurrentPeriodMinutesUsed);
        Assert.Equal(50.00m, savedBilling.CurrentPeriodBilledPhp);

        var usage = await _db.TeleconsultUsageRecords.FirstAsync(u => u.CallId == callId);
        Assert.Equal(50.00m, usage.PrepaidDeductedPhp);
        Assert.Equal(0m, usage.PostpaidOveragePhp);
    }

    [Fact]
    public async Task MediaUsageRecordedHandler_PrepaidDepleted_RestagesMediaEntitlementUpdatedWithDeactivated()
    {
        var tenant = new Tenant
        {
            Id = Guid.NewGuid(),
            TenantSlug = "depleted-clinic",
            Name = "Depleted Clinic"
        };
        _db.Tenants.Add(tenant);

        var billing = new WorkspaceTeleconsultBilling
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            IsEnabled = true,
            BillingMode = WorkspaceTeleconsultBilling.ModePrepaid,
            RatePerMinutePhp = 10.00m,
            PrepaidBalancePhp = 30.00m,
            CurrentPeriodYearMonth = DateTime.UtcNow.ToString("yyyy-MM")
        };
        _db.WorkspaceTeleconsultBillings.Add(billing);
        await _db.SaveChangesAsync();

        var handler = new MediaUsageRecordedHandler(_db, _publisherMock.Object, NullLogger<MediaUsageRecordedHandler>.Instance);

        var callId = Guid.NewGuid();
        var payload = new MediaUsageRecordedPayload(
            callId,
            tenant.Id.ToString(),
            5, // 5 mins * 10 = 50.00m (30 covered by prepaid, 20 overage)
            DateTime.UtcNow.AddMinutes(-5),
            DateTime.UtcNow);

        var envelope = InteropEnvelope.Create(
            InteropTypes.MediaUsageRecorded,
            Party.Media,
            Party.Portal,
            Guid.NewGuid(),
            payload);
        var context = new InteropMessageContext(envelope);

        await handler.HandleAsync(payload, context, CancellationToken.None);

        var savedBilling = await _db.WorkspaceTeleconsultBillings.FirstAsync(b => b.TenantId == tenant.Id);
        Assert.Equal(0.00m, savedBilling.PrepaidBalancePhp);
        Assert.Equal(20.00m, savedBilling.CurrentPeriodOveragePhp);

        // Verify that depleted balance re-staged media entitlement with IsActive = false
        _publisherMock.Verify(p => p.Enqueue(
            InteropTypes.MediaEntitlementUpdated,
            Party.Portal,
            Party.Media,
            payload.CallId,
            It.Is<MediaEntitlementUpdatedPayload>(e => e.TenantId == tenant.Id.ToString() && !e.IsActive),
            1,
            null), Times.Once);
    }

    [Fact]
    public async Task MediaUsageRecordedHandler_IdempotentOnSameCallId_DoesNotDoubleCharge()
    {
        var tenant = new Tenant
        {
            Id = Guid.NewGuid(),
            TenantSlug = "idempotent-clinic",
            Name = "Idempotent Clinic"
        };
        _db.Tenants.Add(tenant);

        var billing = new WorkspaceTeleconsultBilling
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            IsEnabled = true,
            BillingMode = WorkspaceTeleconsultBilling.ModePostpaid,
            RatePerMinutePhp = 5.00m,
            CurrentPeriodYearMonth = DateTime.UtcNow.ToString("yyyy-MM")
        };
        _db.WorkspaceTeleconsultBillings.Add(billing);
        await _db.SaveChangesAsync();

        var handler = new MediaUsageRecordedHandler(_db, _publisherMock.Object, NullLogger<MediaUsageRecordedHandler>.Instance);

        var callId = Guid.NewGuid();
        var payload = new MediaUsageRecordedPayload(
            callId,
            tenant.Id.ToString(),
            10,
            DateTime.UtcNow.AddMinutes(-10),
            DateTime.UtcNow);

        var envelope = InteropEnvelope.Create(
            InteropTypes.MediaUsageRecorded,
            Party.Media,
            Party.Portal,
            Guid.NewGuid(),
            payload);
        var context = new InteropMessageContext(envelope);

        await handler.HandleAsync(payload, context, CancellationToken.None);
        await handler.HandleAsync(payload, context, CancellationToken.None); // second delivery

        var savedBilling = await _db.WorkspaceTeleconsultBillings.FirstAsync(b => b.TenantId == tenant.Id);
        Assert.Equal(10, savedBilling.CurrentPeriodMinutesUsed);
        Assert.Equal(50.00m, savedBilling.CurrentPeriodBilledPhp);

        var count = await _db.TeleconsultUsageRecords.CountAsync(u => u.CallId == callId);
        Assert.Equal(1, count);
    }

    [Fact]
    public async Task GuestTeleconsultInviteRevokedHandler_CallsVerificationService()
    {
        var handler = new GuestTeleconsultInviteRevokedHandler(
            _guestVerificationMock.Object,
            NullLogger<GuestTeleconsultInviteRevokedHandler>.Instance);

        var callId = Guid.NewGuid();
        var apptId = Guid.NewGuid();
        var revokedAt = DateTime.UtcNow;
        var payload = new GuestTeleconsultInviteRevokedPayload(
            apptId,
            callId,
            "tenant-1",
            "fac-1",
            revokedAt,
            "Doctor ended consult");

        var envelope = InteropEnvelope.Create(
            InteropTypes.GuestTeleconsultInviteRevoked,
            Party.ForFacility("tenant-1", "fac-1", FacilityType.Clinic),
            Party.Portal,
            Guid.NewGuid(),
            payload);
        var context = new InteropMessageContext(envelope);

        await handler.HandleAsync(payload, context, CancellationToken.None);

        _guestVerificationMock.Verify(s => s.RevokeInviteByCall(callId, "Doctor ended consult", revokedAt), Times.Once);
    }

    [Fact]
    public async Task EntitlementService_ResolveAsync_EnforcesTeleconsultationPAYGDefaults()
    {
        var tenant = new Tenant
        {
            Id = Guid.NewGuid(),
            TenantSlug = "payg-resolve-test",
            Name = "PAYG Resolve Test"
        };
        _db.Tenants.Add(tenant);
        await _db.SaveChangesAsync();

        await TestSupport.SeedSubscriptionAsync(_db, tenant.Id, planSlug: "pro");
        var service = TestSupport.Entitlements(_db);

        // 1. Without WorkspaceTeleconsultBilling record -> FeatureTeleconsultation is NOT present
        var snapshot1 = await service.ResolveAsync(tenant.Id, CancellationToken.None);
        Assert.False(snapshot1.Has(EntitlementKeys.FeatureTeleconsultation));

        // 2. With WorkspaceTeleconsultBilling Disabled -> FeatureTeleconsultation is NOT present
        var billing = new WorkspaceTeleconsultBilling
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            IsEnabled = false,
            BillingMode = WorkspaceTeleconsultBilling.ModePostpaid,
            RatePerMinutePhp = 5.00m,
            CurrentPeriodYearMonth = DateTime.UtcNow.ToString("yyyy-MM")
        };
        _db.WorkspaceTeleconsultBillings.Add(billing);
        await _db.SaveChangesAsync();

        var snapshot2 = await service.ResolveAsync(tenant.Id, CancellationToken.None);
        Assert.False(snapshot2.Has(EntitlementKeys.FeatureTeleconsultation));

        // 3. With WorkspaceTeleconsultBilling Enabled & Postpaid -> FeatureTeleconsultation IS present
        billing.IsEnabled = true;
        await _db.SaveChangesAsync();

        var snapshot3 = await service.ResolveAsync(tenant.Id, CancellationToken.None);
        Assert.True(snapshot3.Has(EntitlementKeys.FeatureTeleconsultation));

        // 4. With WorkspaceTeleconsultBilling Enabled & Prepaid with 0 balance -> FeatureTeleconsultation is NOT present
        billing.BillingMode = WorkspaceTeleconsultBilling.ModePrepaid;
        billing.PrepaidBalancePhp = 0m;
        billing.RatePerMinutePhp = 5.00m;
        await _db.SaveChangesAsync();

        var snapshot4 = await service.ResolveAsync(tenant.Id, CancellationToken.None);
        Assert.False(snapshot4.Has(EntitlementKeys.FeatureTeleconsultation));

        // 5. With WorkspaceTeleconsultBilling Enabled & Prepaid with sufficient balance -> FeatureTeleconsultation IS present
        billing.PrepaidBalancePhp = 25.00m;
        await _db.SaveChangesAsync();

        var snapshot5 = await service.ResolveAsync(tenant.Id, CancellationToken.None);
        Assert.True(snapshot5.Has(EntitlementKeys.FeatureTeleconsultation));
    }
}
