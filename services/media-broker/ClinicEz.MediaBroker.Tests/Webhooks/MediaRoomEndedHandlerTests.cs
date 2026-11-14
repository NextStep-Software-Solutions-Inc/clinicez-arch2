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

namespace ClinicEz.MediaBroker.Tests.Webhooks;

/// <summary>
/// Verifies room teardown, LiveKit room cleanup, and metering finalization on media.room.ended.
/// Verifies TC-T1.5.4 (room teardown, LiveKit room cleanup, non-blocking fallback, idempotency).
/// Follows Media Broker conventions: Moq + InMemory EF Core.
/// </summary>
public class MediaRoomEndedHandlerTests
{
    private static MediaBrokerDbContext CreateInMemoryDb(string? dbName = null)
    {
        var options = new DbContextOptionsBuilder<MediaBrokerDbContext>()
            .UseInMemoryDatabase(dbName ?? Guid.NewGuid().ToString())
            .Options;
        return new MediaBrokerDbContext(options);
    }

    private static InteropMessageContext CreateContext(MediaRoomEndedPayload payload)
    {
        return new InteropMessageContext(InteropEnvelope.Create(
            InteropTypes.MediaRoomEnded,
            Party.ForFacility("clinic-alpha", "clinic-alpha", FacilityType.Clinic),
            Party.Media,
            Guid.NewGuid(),
            payload
        ));
    }

    [Fact]
    public async Task TC_T1_5_4_HandleAsync_ValidPayload_RecordsCallCompletion_AndDeletesLiveKitRoom()
    {
        // ARRANGE
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var metering = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);
        var liveKit = new Mock<ILiveKitRoomClient>();
        var handler = new MediaRoomEndedHandler(db, metering, liveKit.Object, NullLogger<MediaRoomEndedHandler>.Instance);

        var callId = Guid.NewGuid();
        const string tenantId = "tenant-webhook-end";
        var roomName = $"call-{callId:N}";
        var startedAt = new DateTime(2026, 11, 14, 11, 0, 0, DateTimeKind.Utc);
        var endedAt = startedAt.AddMinutes(25);

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
            FacilityId = "clinic-alpha",
            RoomName = roomName,
            Status = "Active",
            RequestedAtUtc = startedAt,
            StartedAtUtc = startedAt
        });

        await db.SaveChangesAsync();

        var payload = new MediaRoomEndedPayload(callId, tenantId, roomName, endedAt);
        var context = CreateContext(payload);

        // ACT
        await handler.HandleAsync(payload, context, CancellationToken.None);

        // ASSERT: 1. Session is marked ended with accurate duration
        var session = await db.CallSessions.FirstOrDefaultAsync(s => s.CallId == callId);
        session.Should().NotBeNull();
        session!.Status.Should().Be("Ended");
        session.DurationMinutes.Should().Be(25);
        session.EndedAtUtc.Should().Be(endedAt);

        // ASSERT: 2. LiveKit room teardown was requested
        liveKit.Verify(lk => lk.DeleteRoomAsync(roomName, It.IsAny<CancellationToken>()), Times.Once);

        // ASSERT: 3. Usage was reported to Party.Portal
        publisher.Verify(p => p.Enqueue(
            InteropTypes.MediaUsageRecorded,
            Party.Media,
            Party.Portal,
            callId,
            It.Is<MediaUsageRecordedPayload>(pl => pl.CallId == callId && pl.DurationMinutes == 25),
            It.IsAny<int>(),
            It.IsAny<TimeSpan?>()
        ), Times.Once);
    }

    [Fact]
    public async Task TC_T1_5_4_HandleAsync_LiveKitDeletionFailure_DoesNotThrow_NonBlockingFallback()
    {
        // ARRANGE: LiveKit SFU server is temporarily unreachable or throws an exception
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var metering = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);
        var liveKit = new Mock<ILiveKitRoomClient>();
        liveKit.Setup(lk => lk.DeleteRoomAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(false); // LiveKit failure returns false cleanly without crashing caller

        var handler = new MediaRoomEndedHandler(db, metering, liveKit.Object, NullLogger<MediaRoomEndedHandler>.Instance);

        var callId = Guid.NewGuid();
        const string tenantId = "tenant-sfu-fallback";
        var roomName = $"call-{callId:N}";
        var startedAt = DateTime.UtcNow.AddMinutes(-15);
        var endedAt = DateTime.UtcNow;

        db.Entitlements.Add(new TenantMediaEntitlement { TenantId = tenantId, CallMinutesMonthly = 50, IsActive = true });
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

        var payload = new MediaRoomEndedPayload(callId, tenantId, roomName, endedAt);
        var context = CreateContext(payload);

        // ACT & ASSERT: Must NOT throw; failure to delete SFU room must not fail the handler
        var act = async () => await handler.HandleAsync(payload, context, CancellationToken.None);
        await act.Should().NotThrowAsync("LiveKit RoomService deletion must have non-blocking exception handling");

        // Session metering must still succeed despite LiveKit error
        var session = await db.CallSessions.FirstOrDefaultAsync(s => s.CallId == callId);
        session.Should().NotBeNull();
        session!.Status.Should().Be("Ended");
    }

    [Fact]
    public async Task TC_T1_5_4_HandleAsync_DuplicatePayloadDelivery_IsIdempotent()
    {
        // ARRANGE: Duplicate delivery of media.room.ended on the message broker
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var metering = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);
        var liveKit = new Mock<ILiveKitRoomClient>();
        var handler = new MediaRoomEndedHandler(db, metering, liveKit.Object, NullLogger<MediaRoomEndedHandler>.Instance);

        var callId = Guid.NewGuid();
        const string tenantId = "tenant-duplicate-delivery";
        var roomName = $"call-{callId:N}";
        var startedAt = DateTime.UtcNow.AddMinutes(-30);
        var endedAt = DateTime.UtcNow;

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
        var context = CreateContext(payload);

        // ACT: Deliver twice
        await handler.HandleAsync(payload, context, CancellationToken.None);
        await handler.HandleAsync(payload, context, CancellationToken.None);

        // ASSERT: Only billed once, publisher enqueued once
        publisher.Verify(p => p.Enqueue(
            InteropTypes.MediaUsageRecorded,
            Party.Media,
            Party.Portal,
            callId,
            It.IsAny<MediaUsageRecordedPayload>(),
            It.IsAny<int>(),
            It.IsAny<TimeSpan?>()
        ), Times.Once, "Duplicate delivery must not double-bill or duplicate outbox messages");
    }

    [Fact]
    public async Task TC_T1_5_4_HandleAsync_NullPayloadOrUnknownSession_HandledSafely()
    {
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var metering = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);
        var liveKit = new Mock<ILiveKitRoomClient>();
        var handler = new MediaRoomEndedHandler(db, metering, liveKit.Object, NullLogger<MediaRoomEndedHandler>.Instance);

        var dummyPayload = new MediaRoomEndedPayload(Guid.NewGuid(), "dummy", "call-dummy", DateTime.UtcNow);
        var context = CreateContext(dummyPayload);

        // Null payload
        var actNull = async () => await handler.HandleAsync(null!, context, CancellationToken.None);
        await actNull.Should().NotThrowAsync();

        // Unknown session
        var unknownPayload = new MediaRoomEndedPayload(Guid.NewGuid(), "unknown-tenant", "call-nonexistent", DateTime.UtcNow);
        var actUnknown = async () => await handler.HandleAsync(unknownPayload, context, CancellationToken.None);
        await actUnknown.Should().NotThrowAsync();
    }
}
