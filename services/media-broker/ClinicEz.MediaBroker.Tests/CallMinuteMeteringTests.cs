using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.MediaBroker.Application.Services;
using ClinicEz.MediaBroker.Domain.Entities;
using ClinicEz.MediaBroker.Infrastructure.Persistence;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
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
}
