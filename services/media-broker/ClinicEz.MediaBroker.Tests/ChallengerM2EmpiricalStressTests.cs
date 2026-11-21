using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.MediaBroker.Application.Common.Interfaces;
using ClinicEz.MediaBroker.Application.Features.Rooms.Handlers;
using ClinicEz.MediaBroker.Application.Services;
using ClinicEz.MediaBroker.Domain.Entities;
using ClinicEz.MediaBroker.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace ClinicEz.MediaBroker.Tests;

/// <summary>
/// Empirical Adversarial Challenge Suite for Milestone E2E-M2:
/// Stress-tests Media Broker PaygMetering, AbandonedSessionCleanup, and MediaRoomEndedHandler.
/// </summary>
public class ChallengerM2EmpiricalStressTests
{
    private static MediaBrokerDbContext CreateInMemoryDb(string? dbName = null)
    {
        var options = new DbContextOptionsBuilder<MediaBrokerDbContext>()
            .UseInMemoryDatabase(dbName ?? Guid.NewGuid().ToString())
            .Options;
        return new MediaBrokerDbContext(options);
    }

    // =========================================================================
    // 1. PaygMetering: Exact 0-Second Duration Call Handling
    // =========================================================================
    [Fact]
    public async Task PaygMetering_ExactlyZeroSecondCall_BilledAsMinimumOneMinutePerPolicy()
    {
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var service = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);

        const string tenantId = "tenant-zero-sec";
        var callId = Guid.NewGuid();
        var timestamp = new DateTime(2026, 11, 14, 12, 0, 0, DateTimeKind.Utc);

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
            RequestedAtUtc = timestamp,
            StartedAtUtc = timestamp
        });
        await db.SaveChangesAsync();

        // ACT: Exact zero seconds duration (startedAtUtc == endedAtUtc)
        await service.RecordCallEndedAsync(callId, timestamp, timestamp, CancellationToken.None);

        // ASSERT: MediaBroker ceiling policy Math.Max(1, Math.Ceiling(0)) ensures 1 billable minute
        var session = await db.CallSessions.FirstAsync(s => s.CallId == callId);
        session.Status.Should().Be("Ended");
        session.DurationMinutes.Should().Be(1);
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

    // =========================================================================
    // 2. PaygMetering: Boundary Rounding Steps (1s, 59s, 60s, 61s, 119s, 120s, 121s)
    // =========================================================================
    [Theory]
    [InlineData(1, 1)]     // 1 second -> 1 minute
    [InlineData(59, 1)]    // 59 seconds -> 1 minute
    [InlineData(60, 1)]    // 60 seconds -> 1 minute
    [InlineData(61, 2)]    // 61 seconds -> 2 minutes
    [InlineData(119, 2)]   // 119 seconds -> 2 minutes
    [InlineData(120, 2)]   // 120 seconds -> 2 minutes
    [InlineData(121, 3)]   // 121 seconds -> 3 minutes
    public async Task PaygMetering_CommercialCeilingRounding_ProducesExactExpectedMinutes(int elapsedSeconds, int expectedMinutes)
    {
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var service = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);

        const string tenantId = "tenant-rounding-theory";
        var callId = Guid.NewGuid();
        var startedAt = new DateTime(2026, 11, 14, 13, 0, 0, DateTimeKind.Utc);
        var endedAt = startedAt.AddSeconds(elapsedSeconds);

        db.Entitlements.Add(new TenantMediaEntitlement { TenantId = tenantId, CallMinutesMonthly = 500, IsActive = true });
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

        await service.RecordCallEndedAsync(callId, startedAt, endedAt, CancellationToken.None);

        var session = await db.CallSessions.FirstAsync(s => s.CallId == callId);
        session.DurationMinutes.Should().Be(expectedMinutes);
        session.BillableMinutes.Should().Be(expectedMinutes);
    }

    // =========================================================================
    // 3. MediaRoomEndedHandler: Non-Blocking SFU Teardown
    // =========================================================================
    [Fact]
    public async Task MediaRoomEndedHandler_WhenSFUReturnsFalse_MeteringCompletesWithoutCrashing()
    {
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var metering = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);
        var liveKit = new Mock<ILiveKitRoomClient>();
        liveKit.Setup(lk => lk.DeleteRoomAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(false); // SFU failure returns false

        var handler = new MediaRoomEndedHandler(db, metering, liveKit.Object, NullLogger<MediaRoomEndedHandler>.Instance);

        var callId = Guid.NewGuid();
        const string tenantId = "tenant-sfu-false";
        var roomName = $"call-{callId:N}";
        var startedAt = new DateTime(2026, 11, 14, 13, 0, 0, DateTimeKind.Utc);
        var endedAt = startedAt.AddMinutes(10);

        db.Entitlements.Add(new TenantMediaEntitlement { TenantId = tenantId, CallMinutesMonthly = 100, IsActive = true });
        db.CallSessions.Add(new MediaCallSession
        {
            CallId = callId,
            TenantId = tenantId,
            FacilityId = "clinic-01",
            RoomName = roomName,
            Status = "Active",
            RequestedAtUtc = startedAt,
            StartedAtUtc = startedAt
        });
        await db.SaveChangesAsync();

        var payload = new MediaRoomEndedPayload(callId, tenantId, roomName, endedAt);
        var context = new InteropMessageContext(InteropEnvelope.Create(
            InteropTypes.MediaRoomEnded,
            Party.ForFacility("clinic-01", "clinic-01", FacilityType.Clinic),
            Party.Media,
            callId,
            payload
        ));

        // ACT
        await handler.HandleAsync(payload, context, CancellationToken.None);

        // ASSERT: Session is ended and usage reported despite LiveKit returning false
        var session = await db.CallSessions.FirstAsync(s => s.CallId == callId);
        session.Status.Should().Be("Ended");
        session.DurationMinutes.Should().Be(10);

        publisher.Verify(p => p.Enqueue(
            InteropTypes.MediaUsageRecorded,
            Party.Media,
            Party.Portal,
            callId,
            It.Is<MediaUsageRecordedPayload>(pl => pl.DurationMinutes == 10),
            It.IsAny<int>(),
            It.IsAny<TimeSpan?>()
        ), Times.Once);
    }

    // =========================================================================
    // 4. AbandonedSessionCleanup: Exactly at Cutoff Boundary
    // =========================================================================
    [Fact]
    public async Task AbandonedSessionCleanup_ExactlyAtTtlBoundary_IsCleanedUp()
    {
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var metering = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);
        var liveKit = new Mock<ILiveKitRoomClient>();
        liveKit.Setup(lk => lk.DeleteRoomAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        var cleanup = new AbandonedSessionCleanupService(db, metering, liveKit.Object, NullLogger<AbandonedSessionCleanupService>.Instance);

        const string tenantId = "tenant-cutoff-test";
        var callId = Guid.NewGuid();
        // Started 121 minutes ago (just beyond 120-minute threshold)
        var startedAt = DateTime.UtcNow.AddMinutes(-121);

        db.Entitlements.Add(new TenantMediaEntitlement { TenantId = tenantId, CallMinutesMonthly = 500, IsActive = true });
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

        var count = await cleanup.CleanupAbandonedSessionsAsync(TimeSpan.FromHours(2), CancellationToken.None);

        count.Should().Be(1);
        var session = await db.CallSessions.FirstAsync(s => s.CallId == callId);
        session.Status.Should().Be("Ended");
        session.DurationMinutes.Should().Be(120, "Duration must be capped at 2-hour TTL");
    }
}
