using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.MediaBroker.Application.Common.Interfaces;
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

namespace ClinicEz.MediaBroker.Tests.Metering;

/// <summary>
/// Comprehensive verification of Pay-As-You-Go (PAYG) Metering in Media Broker.
/// Verifies TC-T1.3.5 (mid-call cutoff protection), TC-T2.3.1 (zero balance admission),
/// TC-T2.3.2 (overdraft on postpaid), TC-T2.3.3 (fractional minute rounding), and TC-T2.3.4 (sub-second call).
/// Follows Media Broker conventions: Moq + InMemory EF Core.
/// </summary>
public class PaygMeteringTests
{
    private static MediaBrokerDbContext CreateInMemoryDb(string? dbName = null)
    {
        var options = new DbContextOptionsBuilder<MediaBrokerDbContext>()
            .UseInMemoryDatabase(dbName ?? Guid.NewGuid().ToString())
            .Options;
        return new MediaBrokerDbContext(options);
    }

    // =========================================================================
    // TC-T1.3.5: Mid-Call Cutoff Protection
    // =========================================================================
    [Fact]
    public async Task TC_T1_3_5_MidCallCutoffProtection_CallExceedingRemainingPool_RunsToCompletionAndLogsOverdraft()
    {
        // ARRANGE: Workspace with 100-minute monthly limit, currently at 95 minutes used (5 mins remaining).
        // A call lasting 40 minutes begins.
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var service = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);

        const string tenantId = "tenant-midcall-protection";
        var callId = Guid.NewGuid();
        var startedAt = new DateTime(2026, 11, 14, 10, 0, 0, DateTimeKind.Utc);
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
            MinutesUsed = 95,
            MinutesOverdraft = 0,
            TotalCallsCompleted = 5
        });

        db.CallSessions.Add(new MediaCallSession
        {
            CallId = callId,
            TenantId = tenantId,
            FacilityId = "clinic-01",
            RoomName = $"call-{callId:N}",
            Status = "Active",
            RequestedAtUtc = startedAt,
            StartedAtUtc = startedAt
        });

        await db.SaveChangesAsync();

        // ACT: Call ends after 40 minutes (exceeding 5 remaining quota minutes by 35 minutes)
        await service.RecordCallEndedAsync(callId, startedAt, endedAt, CancellationToken.None);

        // ASSERT: Cutoff protection guarantees call is NEVER terminated at minute 5.
        // Pool is capped at 100, remaining 35 minutes allocated to overdraft.
        var session = await db.CallSessions.FirstOrDefaultAsync(s => s.CallId == callId);
        session.Should().NotBeNull();
        session!.Status.Should().Be("Ended");
        session.DurationMinutes.Should().Be(40);
        session.BillableMinutes.Should().Be(40);
        session.IsOverdraft.Should().BeTrue("Call exceeded available monthly quota");

        var usage = await db.MonthlyUsages.FirstOrDefaultAsync(u => u.TenantId == tenantId && u.YearMonth == yearMonth);
        usage.Should().NotBeNull();
        usage!.MinutesUsed.Should().Be(100, "Consumed remaining 5 minutes up to quota limit");
        usage.MinutesOverdraft.Should().Be(35, "Excess 35 minutes safely recorded as overdraft");
        usage.TotalCallsCompleted.Should().Be(6);

        // Interop message must be dispatched strictly to Party.Portal
        publisher.Verify(p => p.Enqueue(
            InteropTypes.MediaUsageRecorded,
            Party.Media,
            Party.Portal,
            callId,
            It.Is<MediaUsageRecordedPayload>(payload =>
                payload.CallId == callId &&
                payload.TenantId == tenantId &&
                payload.DurationMinutes == 40 &&
                payload.CallStartedAtUtc == startedAt &&
                payload.CallEndedAtUtc == endedAt),
            It.IsAny<int>(),
            It.IsAny<TimeSpan?>()
        ), Times.Once);
    }

    // =========================================================================
    // TC-T2.3.1: Zero Balance Admission
    // =========================================================================
    [Fact]
    public async Task TC_T2_3_1_ZeroBalanceAdmission_DeniedWhenQuotaZeroOrExhausted_AndOverdraftDisallowed()
    {
        // ARRANGE: Workspace with Prepaid exhaustion (CallMinutesMonthly == 0, AllowOverdraft == false)
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var service = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);

        const string tenantId = "tenant-zero-balance";
        db.Entitlements.Add(new TenantMediaEntitlement
        {
            TenantId = tenantId,
            CallMinutesMonthly = 0,
            IsActive = true,
            AllowOverdraft = false
        });
        await db.SaveChangesAsync();

        // ACT
        var decision = await service.EvaluateCallAdmissionAsync(tenantId, CancellationToken.None);

        // ASSERT: Admission blocked before room creation
        decision.Allowed.Should().BeFalse();
        decision.Reason.Should().Be("Teleconsultation minute pool not provisioned on active plan.");
        decision.IsOverdraft.Should().BeFalse();
    }

    [Fact]
    public async Task TC_T2_3_1_ZeroBalanceAdmission_DeniedWhenEntitlementIsInactive()
    {
        // ARRANGE: Workspace where IsActive == false
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var service = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);

        const string tenantId = "tenant-inactive";
        db.Entitlements.Add(new TenantMediaEntitlement
        {
            TenantId = tenantId,
            CallMinutesMonthly = 100,
            IsActive = false,
            AllowOverdraft = true
        });
        await db.SaveChangesAsync();

        // ACT
        var decision = await service.EvaluateCallAdmissionAsync(tenantId, CancellationToken.None);

        // ASSERT: Inactive entitlement cannot admit calls even if AllowOverdraft is true
        decision.Allowed.Should().BeFalse();
        decision.Reason.Should().Be("Tenant teleconsultation entitlement is inactive.");
    }

    // =========================================================================
    // TC-T2.3.2: Overdraft on Postpaid
    // =========================================================================
    [Fact]
    public async Task TC_T2_3_2_OverdraftOnPostpaid_AdmittedWhenMonthlyQuotaIsZero_WithAllowOverdraft()
    {
        // ARRANGE: Pure PAYG Postpaid tenant with CallMinutesMonthly == 0 and AllowOverdraft == true
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var service = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);

        const string tenantId = "tenant-postpaid-payg";
        db.Entitlements.Add(new TenantMediaEntitlement
        {
            TenantId = tenantId,
            CallMinutesMonthly = 0,
            IsActive = true,
            AllowOverdraft = true
        });
        await db.SaveChangesAsync();

        // ACT
        var decision = await service.EvaluateCallAdmissionAsync(tenantId, CancellationToken.None);

        // ASSERT: Pure postpaid calls allowed and marked as overdraft
        decision.Allowed.Should().BeTrue();
        decision.IsOverdraft.Should().BeTrue();
        decision.Reason.Should().BeNull();
    }

    [Fact]
    public async Task TC_T2_3_2_OverdraftOnPostpaid_AdmittedWhenMonthlyLimitAlreadyReached_WithAllowOverdraft()
    {
        // ARRANGE: Postpaid tenant with 100 minutes quota that has already used 100 minutes
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var service = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);

        const string tenantId = "tenant-postpaid-exhausted";
        var yearMonth = DateTime.UtcNow.ToString("yyyy-MM");

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
            MinutesUsed = 100,
            MinutesOverdraft = 50,
            TotalCallsCompleted = 10
        });
        await db.SaveChangesAsync();

        // ACT
        var decision = await service.EvaluateCallAdmissionAsync(tenantId, CancellationToken.None);

        // ASSERT
        decision.Allowed.Should().BeTrue();
        decision.IsOverdraft.Should().BeTrue();
        decision.Reason.Should().BeNull();
    }

    // =========================================================================
    // TC-T2.3.3: Fractional Minute Rounding
    // =========================================================================
    [Fact]
    public async Task TC_T2_3_3_FractionalMinuteRounding_65SecondsRoundsUpTo2WholeMinutes()
    {
        // ARRANGE: Commercial rounding policy: Math.Ceiling(seconds / 60.0)
        // 65 seconds = 1 minute 5 seconds -> rounds up to 2 billable minutes
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var service = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);

        const string tenantId = "tenant-rounding";
        var callId = Guid.NewGuid();
        var startedAt = new DateTime(2026, 11, 14, 14, 0, 0, DateTimeKind.Utc);
        var endedAt = startedAt.AddSeconds(65);

        db.Entitlements.Add(new TenantMediaEntitlement
        {
            TenantId = tenantId,
            CallMinutesMonthly = 60,
            IsActive = true
        });
        db.CallSessions.Add(new MediaCallSession
        {
            CallId = callId,
            TenantId = tenantId,
            FacilityId = "clinic-01",
            RoomName = $"call-{callId:N}",
            Status = "Active",
            RequestedAtUtc = startedAt,
            StartedAtUtc = startedAt
        });
        await db.SaveChangesAsync();

        // ACT
        await service.RecordCallEndedAsync(callId, startedAt, endedAt, CancellationToken.None);

        // ASSERT
        var session = await db.CallSessions.FirstOrDefaultAsync(s => s.CallId == callId);
        session.Should().NotBeNull();
        session!.DurationMinutes.Should().Be(2, "65 seconds must round up to 2 whole minutes per commercial ceiling policy");
        session.BillableMinutes.Should().Be(2);

        var usage = await db.MonthlyUsages.FirstOrDefaultAsync(u => u.TenantId == tenantId);
        usage.Should().NotBeNull();
        usage!.MinutesUsed.Should().Be(2);

        publisher.Verify(p => p.Enqueue(
            InteropTypes.MediaUsageRecorded,
            Party.Media,
            Party.Portal,
            callId,
            It.Is<MediaUsageRecordedPayload>(pl => pl.DurationMinutes == 2),
            It.IsAny<int>(),
            It.IsAny<TimeSpan?>()
        ), Times.Once);
    }

    // =========================================================================
    // TC-T2.3.4: Sub-Second Call
    // =========================================================================
    [Fact]
    public async Task TC_T2_3_4_SubSecondCall_RoundsUpToMinimum1BillableMinuteInMediaBroker()
    {
        // ARRANGE: Connection drops after 500ms or 0 seconds.
        // MediaBroker enforces Math.Max(1, Math.Ceiling(...)) ensuring at least 1 minute is recorded.
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var service = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);

        const string tenantId = "tenant-subsecond";
        var callId = Guid.NewGuid();
        var startedAt = new DateTime(2026, 11, 14, 15, 0, 0, DateTimeKind.Utc);
        var endedAt = startedAt.AddMilliseconds(500);

        db.Entitlements.Add(new TenantMediaEntitlement
        {
            TenantId = tenantId,
            CallMinutesMonthly = 100,
            IsActive = true
        });
        db.CallSessions.Add(new MediaCallSession
        {
            CallId = callId,
            TenantId = tenantId,
            FacilityId = "clinic-01",
            RoomName = $"call-{callId:N}",
            Status = "Active",
            RequestedAtUtc = startedAt,
            StartedAtUtc = startedAt
        });
        await db.SaveChangesAsync();

        // ACT
        await service.RecordCallEndedAsync(callId, startedAt, endedAt, CancellationToken.None);

        // ASSERT
        var session = await db.CallSessions.FirstOrDefaultAsync(s => s.CallId == callId);
        session.Should().NotBeNull();
        session!.DurationMinutes.Should().Be(1, "Sub-second call must ceiling to minimum 1 billable minute");
        session.BillableMinutes.Should().Be(1);

        publisher.Verify(p => p.Enqueue(
            InteropTypes.MediaUsageRecorded,
            Party.Media,
            Party.Portal,
            callId,
            It.Is<MediaUsageRecordedPayload>(pl => pl.DurationMinutes == 1),
            It.IsAny<int>(),
            It.IsAny<TimeSpan?>()
        ), Times.Once);
    }
}
