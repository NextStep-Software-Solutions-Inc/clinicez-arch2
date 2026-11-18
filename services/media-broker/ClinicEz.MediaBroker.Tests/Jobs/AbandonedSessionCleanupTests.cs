using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.MediaBroker.Application.Common.Interfaces;
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

namespace ClinicEz.MediaBroker.Tests.Jobs;

/// <summary>
/// Verifies periodic background cleanup of stale / abandoned teleconsultation sessions.
/// Verifies TC-T2.5.6 (stale session cleanup for sessions older than 2 hours).
/// Follows Media Broker conventions: Moq + InMemory EF Core.
/// </summary>
public class AbandonedSessionCleanupTests
{
    private static MediaBrokerDbContext CreateInMemoryDb(string? dbName = null)
    {
        var options = new DbContextOptionsBuilder<MediaBrokerDbContext>()
            .UseInMemoryDatabase(dbName ?? Guid.NewGuid().ToString())
            .Options;
        return new MediaBrokerDbContext(options);
    }

    [Fact]
    public async Task TC_T2_5_6_CleanupAbandonedSessionsAsync_StaleSessionOlderThan2Hours_IsCleanedUpAndCapped()
    {
        // ARRANGE: Session started 3 hours ago that was never explicitly ended
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var metering = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);
        var liveKit = new Mock<ILiveKitRoomClient>();
        var cleanupService = new AbandonedSessionCleanupService(db, metering, liveKit.Object, NullLogger<AbandonedSessionCleanupService>.Instance);

        const string tenantId = "tenant-stale-cleanup";
        var callId = Guid.NewGuid();
        var roomName = $"call-{callId:N}";
        var startedAt = DateTime.UtcNow.AddHours(-3); // 3 hours ago (older than 2-hour TTL)

        db.Entitlements.Add(new TenantMediaEntitlement
        {
            TenantId = tenantId,
            CallMinutesMonthly = 500,
            IsActive = true
        });

        db.CallSessions.Add(new MediaCallSession
        {
            CallId = callId,
            TenantId = tenantId,
            FacilityId = "clinic-alpha",
            RoomName = roomName,
            Status = "Active",
            RequestedAtUtc = startedAt,
            StartedAtUtc = startedAt
        });

        await db.SaveChangesAsync();

        // ACT: Run cleanup with default 2-hour TTL
        var cleanedCount = await cleanupService.CleanupAbandonedSessionsAsync(TimeSpan.FromHours(2), CancellationToken.None);

        // ASSERT: 1 session cleaned
        cleanedCount.Should().Be(1);

        var session = await db.CallSessions.FirstOrDefaultAsync(s => s.CallId == callId);
        session.Should().NotBeNull();
        session!.Status.Should().Be("Ended");
        session.DurationMinutes.Should().Be(120, "Duration must be capped at 2-hour TTL rather than 3 hours");
        session.EndedAtUtc.Should().Be(startedAt.AddHours(2));

        // LiveKit room deleted
        liveKit.Verify(lk => lk.DeleteRoomAsync(roomName, It.IsAny<CancellationToken>()), Times.Once);

        // Audit log written
        var audit = await db.AuditLogs.FirstOrDefaultAsync(a => a.CallId == callId && a.EventType == "SessionAbandoned");
        audit.Should().NotBeNull();
        audit!.Details.Should().Contain("timed out after 120 mins");

        // Usage reported to Party.Portal
        publisher.Verify(p => p.Enqueue(
            InteropTypes.MediaUsageRecorded,
            Party.Media,
            Party.Portal,
            callId,
            It.Is<MediaUsageRecordedPayload>(pl => pl.DurationMinutes == 120),
            It.IsAny<int>(),
            It.IsAny<TimeSpan?>()
        ), Times.Once);
    }

    [Fact]
    public async Task TC_T2_5_6_CleanupAbandonedSessionsAsync_RecentActiveSessionUnder2Hours_NotCleaned()
    {
        // ARRANGE: Session started 110 minutes ago (within 2-hour TTL)
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var metering = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);
        var liveKit = new Mock<ILiveKitRoomClient>();
        var cleanupService = new AbandonedSessionCleanupService(db, metering, liveKit.Object, NullLogger<AbandonedSessionCleanupService>.Instance);

        const string tenantId = "tenant-active-recent";
        var callId = Guid.NewGuid();
        var startedAt = DateTime.UtcNow.AddMinutes(-110);

        db.Entitlements.Add(new TenantMediaEntitlement { TenantId = tenantId, CallMinutesMonthly = 500, IsActive = true });
        db.CallSessions.Add(new MediaCallSession
        {
            CallId = callId,
            TenantId = tenantId,
            FacilityId = "clinic-alpha",
            RoomName = $"call-{callId:N}",
            Status = "Active",
            RequestedAtUtc = startedAt,
            StartedAtUtc = startedAt
        });
        await db.SaveChangesAsync();

        // ACT
        var cleanedCount = await cleanupService.CleanupAbandonedSessionsAsync(TimeSpan.FromHours(2), CancellationToken.None);

        // ASSERT: Must NOT clean active session under 2 hours
        cleanedCount.Should().Be(0);

        var session = await db.CallSessions.FirstOrDefaultAsync(s => s.CallId == callId);
        session.Should().NotBeNull();
        session!.Status.Should().Be("Active");
        liveKit.Verify(lk => lk.DeleteRoomAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task TC_T2_5_6_CleanupAbandonedSessionsAsync_AlreadyEndedSessions_AreIgnored()
    {
        // ARRANGE: Session started 5 hours ago, but already marked Ended
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var metering = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);
        var liveKit = new Mock<ILiveKitRoomClient>();
        var cleanupService = new AbandonedSessionCleanupService(db, metering, liveKit.Object, NullLogger<AbandonedSessionCleanupService>.Instance);

        const string tenantId = "tenant-already-ended";
        var callId = Guid.NewGuid();
        var startedAt = DateTime.UtcNow.AddHours(-5);

        db.Entitlements.Add(new TenantMediaEntitlement { TenantId = tenantId, CallMinutesMonthly = 500, IsActive = true });
        db.CallSessions.Add(new MediaCallSession
        {
            CallId = callId,
            TenantId = tenantId,
            FacilityId = "clinic-alpha",
            RoomName = $"call-{callId:N}",
            Status = "Ended",
            RequestedAtUtc = startedAt,
            StartedAtUtc = startedAt,
            EndedAtUtc = startedAt.AddMinutes(20),
            DurationMinutes = 20,
            BillableMinutes = 20
        });
        await db.SaveChangesAsync();

        // ACT
        var cleanedCount = await cleanupService.CleanupAbandonedSessionsAsync(TimeSpan.FromHours(2), CancellationToken.None);

        // ASSERT
        cleanedCount.Should().Be(0);
        liveKit.Verify(lk => lk.DeleteRoomAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task TC_T2_5_6_CleanupAbandonedSessionsAsync_ConsecutiveExecutions_AreIdempotent()
    {
        // ARRANGE: 1 stale session
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var metering = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);
        var liveKit = new Mock<ILiveKitRoomClient>();
        var cleanupService = new AbandonedSessionCleanupService(db, metering, liveKit.Object, NullLogger<AbandonedSessionCleanupService>.Instance);

        const string tenantId = "tenant-idempotent-cleanup";
        var callId = Guid.NewGuid();
        var startedAt = DateTime.UtcNow.AddHours(-4);

        db.Entitlements.Add(new TenantMediaEntitlement { TenantId = tenantId, CallMinutesMonthly = 500, IsActive = true });
        db.CallSessions.Add(new MediaCallSession
        {
            CallId = callId,
            TenantId = tenantId,
            FacilityId = "clinic-alpha",
            RoomName = $"call-{callId:N}",
            Status = "Active",
            RequestedAtUtc = startedAt,
            StartedAtUtc = startedAt
        });
        await db.SaveChangesAsync();

        // ACT: First run cleans 1 session; Second run cleans 0
        var count1 = await cleanupService.CleanupAbandonedSessionsAsync(TimeSpan.FromHours(2), CancellationToken.None);
        var count2 = await cleanupService.CleanupAbandonedSessionsAsync(TimeSpan.FromHours(2), CancellationToken.None);

        // ASSERT
        count1.Should().Be(1);
        count2.Should().Be(0);
    }
}
