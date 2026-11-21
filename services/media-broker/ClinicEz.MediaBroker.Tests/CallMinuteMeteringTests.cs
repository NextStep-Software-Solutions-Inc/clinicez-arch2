using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.MediaBroker.Application.Common.Options;
using ClinicEz.MediaBroker.Application.Services;
using ClinicEz.MediaBroker.Domain.Entities;
using ClinicEz.MediaBroker.Infrastructure.Persistence;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace ClinicEz.MediaBroker.Tests;

public class CallMinuteMeteringTests
{
    private static MediaBrokerDbContext CreateInMemoryDb()
    {
        var options = new DbContextOptionsBuilder<MediaBrokerDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new MediaBrokerDbContext(options);
    }

    [Fact]
    public async Task EvaluateCallAdmission_AllowsCall_WhenWithinQuota()
    {
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var service = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);

        db.Entitlements.Add(new TenantMediaEntitlement
        {
            TenantId = "tenant-normal",
            CallMinutesMonthly = 500,
            IsActive = true,
            AllowOverdraft = false
        });
        await db.SaveChangesAsync();

        var decision = await service.EvaluateCallAdmissionAsync("tenant-normal");

        decision.Allowed.Should().BeTrue();
        decision.IsOverdraft.Should().BeFalse();
        decision.Reason.Should().BeNull();
    }

    [Fact]
    public async Task EvaluateCallAdmission_RejectsCall_WhenPoolExhausted_AndOverdraftDisallowed()
    {
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var service = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);

        var yearMonth = DateTime.UtcNow.ToString("yyyy-MM");
        db.Entitlements.Add(new TenantMediaEntitlement
        {
            TenantId = "tenant-capped",
            CallMinutesMonthly = 100,
            IsActive = true,
            AllowOverdraft = false
        });
        db.MonthlyUsages.Add(new TenantMonthlyUsage
        {
            TenantId = "tenant-capped",
            YearMonth = yearMonth,
            MinutesUsed = 100,
            MinutesOverdraft = 0
        });
        await db.SaveChangesAsync();

        var decision = await service.EvaluateCallAdmissionAsync("tenant-capped");

        decision.Allowed.Should().BeFalse();
        decision.Reason.Should().Contain("exhausted");
    }

    [Fact]
    public async Task EvaluateCallAdmission_AllowsWithOverdraftFlag_WhenPoolExhausted_AndOverdraftAllowed()
    {
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var service = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);

        var yearMonth = DateTime.UtcNow.ToString("yyyy-MM");
        db.Entitlements.Add(new TenantMediaEntitlement
        {
            TenantId = "tenant-overdraft",
            CallMinutesMonthly = 100,
            IsActive = true,
            AllowOverdraft = true
        });
        db.MonthlyUsages.Add(new TenantMonthlyUsage
        {
            TenantId = "tenant-overdraft",
            YearMonth = yearMonth,
            MinutesUsed = 100,
            MinutesOverdraft = 0
        });
        await db.SaveChangesAsync();

        var decision = await service.EvaluateCallAdmissionAsync("tenant-overdraft");

        decision.Allowed.Should().BeTrue();
        decision.IsOverdraft.Should().BeTrue();
    }

    [Fact]
    public async Task RecordCallEnded_EnforcesRunningCallCutoffProtection_AndReportsToPortal()
    {
        // HARD CONSTRAINT: Running teleconsultations must NEVER be abruptly terminated.
        // If a call starts with 5 minutes left in quota and lasts 40 minutes:
        // - Call completes in full (40 minutes)
        // - Remaining 5 minutes consume the quota (MinutesUsed: 100)
        // - Remaining 35 minutes are logged as overdraft (MinutesOverdraft: 35)
        // - media.usage.recorded is published strictly to Party.Portal
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var service = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);

        var callId = Guid.NewGuid();
        var tenantId = "tenant-clinical";
        var startedAt = new DateTime(2026, 10, 26, 10, 0, 0, DateTimeKind.Utc);
        var endedAt = startedAt.AddMinutes(40);
        var yearMonth = startedAt.ToString("yyyy-MM");

        db.Entitlements.Add(new TenantMediaEntitlement
        {
            TenantId = tenantId,
            CallMinutesMonthly = 100,
            IsActive = true,
            AllowOverdraft = true
        });
        db.MonthlyUsages.Add(new TenantMonthlyUsage
        {
            TenantId = tenantId,
            YearMonth = yearMonth,
            MinutesUsed = 95, // only 5 minutes remaining in pool!
            MinutesOverdraft = 0
        });
        db.CallSessions.Add(new MediaCallSession
        {
            CallId = callId,
            TenantId = tenantId,
            FacilityId = "clinic-1",
            RoomName = $"call-{callId:N}",
            Status = "Active",
            RequestedAtUtc = startedAt,
            StartedAtUtc = startedAt
        });
        await db.SaveChangesAsync();

        await service.RecordCallEndedAsync(callId, startedAt, endedAt);

        // Assert DB usage
        var usage = await db.MonthlyUsages.FirstAsync(u => u.TenantId == tenantId && u.YearMonth == yearMonth);
        usage.MinutesUsed.Should().Be(100, "5 pool minutes were consumed to reach the 100m monthly ceiling");
        usage.MinutesOverdraft.Should().Be(35, "the remaining 35 minutes ran to completion under cutoff protection and logged to overdraft");
        usage.TotalCallsCompleted.Should().Be(1);

        // Assert Session
        var session = await db.CallSessions.FirstAsync(s => s.CallId == callId);
        session.Status.Should().Be("Ended");
        session.DurationMinutes.Should().Be(40);
        session.IsOverdraft.Should().BeTrue();

        // Assert Interop Publisher called with Party.Portal
        publisher.Verify(p => p.Enqueue(
            InteropTypes.MediaUsageRecorded,
            Party.Media,
            Party.Portal,
            callId,
            It.Is<MediaUsageRecordedPayload>(payload =>
                payload.CallId == callId &&
                payload.TenantId == tenantId &&
                payload.DurationMinutes == 40
            ),
            1,
            null
        ), Times.Once);
    }

    [Fact]
    public void MediaMeteringOptions_Defaults_AutoProvisionDefaultEntitlement_To_False()
    {
        var options = new MediaMeteringOptions();
        options.AutoProvisionDefaultEntitlement.Should().BeFalse(
            "unconfigured environments must not automatically grant entitlements without explicit opt-in");
        options.DefaultCallMinutesMonthly.Should().Be(1000);
        options.DefaultAllowOverdraft.Should().BeTrue();
        options.DefaultAllowTransportOnlyFallback.Should().BeTrue();
    }

    [Fact]
    public async Task EvaluateCallAdmission_RejectsCall_WhenNoEntitlementExists_AndAutoProvisionDefaultEntitlementIsFalse()
    {
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        // Instantiate without options to verify default options behavior (AutoProvisionDefaultEntitlement = false)
        var service = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);

        var decision = await service.EvaluateCallAdmissionAsync("tenant-unprovisioned");

        decision.Allowed.Should().BeFalse();
        decision.Reason.Should().Be("Tenant teleconsultation entitlement is inactive.");
        decision.IsOverdraft.Should().BeFalse();

        // Verify zero database mutations
        var exists = await db.Entitlements.AnyAsync(e => e.TenantId == "tenant-unprovisioned");
        exists.Should().BeFalse();

        var auditCount = await db.AuditLogs.CountAsync(a => a.TenantId == "tenant-unprovisioned");
        auditCount.Should().Be(0);
    }

    [Fact]
    public async Task EvaluateCallAdmission_AdmitsCallAndAutoProvisionsEntitlement_WhenAutoProvisionDefaultEntitlementIsTrue()
    {
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var options = Options.Create(new MediaMeteringOptions
        {
            AutoProvisionDefaultEntitlement = true,
            DefaultCallMinutesMonthly = 1000,
            DefaultAllowOverdraft = true,
            DefaultAllowTransportOnlyFallback = true
        });
        var service = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance, options);

        var decision = await service.EvaluateCallAdmissionAsync("tenant-autoprovisioned");

        decision.Allowed.Should().BeTrue();
        decision.Reason.Should().BeNull();
        decision.IsOverdraft.Should().BeFalse();

        // Verify entitlement record created in database
        var entitlement = await db.Entitlements.FirstOrDefaultAsync(e => e.TenantId == "tenant-autoprovisioned");
        entitlement.Should().NotBeNull();
        entitlement!.CallMinutesMonthly.Should().Be(1000);
        entitlement.IsActive.Should().BeTrue();
        entitlement.AllowOverdraft.Should().BeTrue();
        entitlement.AllowTransportOnlyFallback.Should().BeTrue();
        entitlement.Version.Should().Be(0);

        // Verify immutable audit log entry
        var audit = await db.AuditLogs.FirstOrDefaultAsync(
            a => a.TenantId == "tenant-autoprovisioned" && a.EventType == "EntitlementAutoProvisioned");
        audit.Should().NotBeNull();
        audit!.Details.Should().Contain("1000 mins/mo");
    }

    [Fact]
    public async Task EvaluateCallAdmission_SubsequentCalls_ReuseExistingAutoProvisionedEntitlement_WithoutDuplicateAuditLogs()
    {
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var options = Options.Create(new MediaMeteringOptions
        {
            AutoProvisionDefaultEntitlement = true,
            DefaultCallMinutesMonthly = 1000
        });
        var service = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance, options);

        // First call triggers auto-provisioning
        var decision1 = await service.EvaluateCallAdmissionAsync("tenant-repeat");
        decision1.Allowed.Should().BeTrue();

        // Second call reuses existing entitlement
        var decision2 = await service.EvaluateCallAdmissionAsync("tenant-repeat");
        decision2.Allowed.Should().BeTrue();

        // Verify strictly 1 entitlement and 1 audit log created
        var entitlementCount = await db.Entitlements.CountAsync(e => e.TenantId == "tenant-repeat");
        entitlementCount.Should().Be(1);

        var auditCount = await db.AuditLogs.CountAsync(
            a => a.TenantId == "tenant-repeat" && a.EventType == "EntitlementAutoProvisioned");
        auditCount.Should().Be(1);
    }
}
