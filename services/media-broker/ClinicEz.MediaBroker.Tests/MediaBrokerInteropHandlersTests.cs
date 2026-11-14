using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.MediaBroker.Application.Common.Options;
using ClinicEz.MediaBroker.Application.Features.Entitlements.Handlers;
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
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace ClinicEz.MediaBroker.Tests;

public class MediaBrokerInteropHandlersTests
{
    private static MediaBrokerDbContext CreateInMemoryDb(string? dbName = null)
    {
        var options = new DbContextOptionsBuilder<MediaBrokerDbContext>()
            .UseInMemoryDatabase(dbName ?? Guid.NewGuid().ToString())
            .Options;
        return new MediaBrokerDbContext(options);
    }

    [Fact]
    public async Task MediaRoomRequestedHandler_CreatesRoomAndReturnsTokens()
    {
        var db = CreateInMemoryDb();
        var options = Options.Create(new LiveKitOptions
        {
            ApiKey = "test-key",
            ApiSecret = "0123456789abcdef0123456789abcdef",
            RelayUrl = "wss://media.clinicez.internal"
        });
        var tokenService = new LiveKitTokenService(options);
        var publisher = new Mock<IInteropPublisher>();
        var meteringService = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);

        var tenantId = "tenant-test";
        db.Entitlements.Add(new TenantMediaEntitlement
        {
            TenantId = tenantId,
            CallMinutesMonthly = 500,
            IsActive = true
        });
        await db.SaveChangesAsync();

        var handler = new MediaRoomRequestedHandler(
            db,
            tokenService,
            meteringService,
            options,
            NullLogger<MediaRoomRequestedHandler>.Instance
        );

        var callId = Guid.NewGuid();
        var roomName = $"call-{callId:N}";
        var request = new MediaRoomRequestedPayload(
            TenantId: tenantId,
            CallId: callId,
            RoomName: roomName,
            ParticipantIdentities: new[] { "staff:dr-smith", "patient:pat-456" }
        );

        var context = new InteropMessageContext(InteropEnvelope.Create(
            InteropTypes.MediaRoomRequested,
            Party.ForFacility(tenantId, "clinic-01", FacilityType.Clinic),
            Party.Media,
            Guid.NewGuid(),
            request
        ));

        var response = await handler.RespondAsync(request, context, CancellationToken.None);

        response.Success.Should().BeTrue();
        response.CallId.Should().Be(callId);
        response.RoomName.Should().Be(roomName);
        response.RelayUrl.Should().Be("wss://media.clinicez.internal");
        response.ParticipantTokens.Should().HaveCount(2);
        response.ParticipantTokens.Should().ContainKey("staff:dr-smith");
        response.ParticipantTokens.Should().ContainKey("patient:pat-456");

        // Assert session created in DB with E2EE key hash
        var session = await db.CallSessions.FirstOrDefaultAsync(s => s.CallId == callId);
        session.Should().NotBeNull();
        session!.RoomName.Should().Be(roomName);
        session.Status.Should().Be("Active");
        session.E2eeKeyHash.Should().NotBeNullOrWhiteSpace();
        session.E2eeKeyHash!.Length.Should().Be(64); // SHA256 hex string length
    }

    [Fact]
    public async Task MediaRoomRequestedHandler_RejectsInvalidRoomNaming()
    {
        var db = CreateInMemoryDb();
        var options = Options.Create(new LiveKitOptions());
        var tokenService = new LiveKitTokenService(options);
        var publisher = new Mock<IInteropPublisher>();
        var meteringService = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);

        var handler = new MediaRoomRequestedHandler(
            db,
            tokenService,
            meteringService,
            options,
            NullLogger<MediaRoomRequestedHandler>.Instance
        );

        var request = new MediaRoomRequestedPayload(
            TenantId: "tenant-test",
            CallId: Guid.NewGuid(),
            RoomName: "clinical-patient-room", // Illegal name pattern
            ParticipantIdentities: new[] { "staff:dr-smith" }
        );

        var context = new InteropMessageContext(InteropEnvelope.Create(
            InteropTypes.MediaRoomRequested,
            Party.ForFacility("tenant-test", "clinic-01", FacilityType.Clinic),
            Party.Media,
            Guid.NewGuid(),
            request
        ));

        var response = await handler.RespondAsync(request, context, CancellationToken.None);

        response.Success.Should().BeFalse();
        response.ErrorMessage.Should().Contain("Invalid room name");
    }

    [Fact]
    public async Task MediaEntitlementUpdatedHandler_UpsertsEntitlementIdempotently()
    {
        var db = CreateInMemoryDb();
        var handler = new MediaEntitlementUpdatedHandler(db, NullLogger<MediaEntitlementUpdatedHandler>.Instance);

        var tenantId = "tenant-alpha";
        var payload1 = new MediaEntitlementUpdatedPayload(
            TenantId: tenantId,
            CallMinutesMonthly: 600,
            IsActive: true,
            Version: 1,
            UpdatedAtUtc: DateTime.UtcNow
        );

        var context1 = new InteropMessageContext(InteropEnvelope.Create(
            InteropTypes.MediaEntitlementUpdated,
            Party.Portal,
            Party.Media,
            Guid.NewGuid(),
            payload1
        ));

        await handler.HandleAsync(payload1, context1, CancellationToken.None);

        var entitlement = await db.Entitlements.FirstOrDefaultAsync(e => e.TenantId == tenantId);
        entitlement.Should().NotBeNull();
        entitlement!.CallMinutesMonthly.Should().Be(600);
        entitlement.Version.Should().Be(1);

        // Update with higher version
        var payload2 = new MediaEntitlementUpdatedPayload(
            TenantId: tenantId,
            CallMinutesMonthly: 1200,
            IsActive: true,
            Version: 2,
            UpdatedAtUtc: DateTime.UtcNow
        );
        var context2 = new InteropMessageContext(InteropEnvelope.Create(
            InteropTypes.MediaEntitlementUpdated,
            Party.Portal,
            Party.Media,
            Guid.NewGuid(),
            payload2
        ));

        await handler.HandleAsync(payload2, context2, CancellationToken.None);

        var updated = await db.Entitlements.FirstOrDefaultAsync(e => e.TenantId == tenantId);
        updated!.CallMinutesMonthly.Should().Be(1200);
        updated.Version.Should().Be(2);
    }

    [Fact]
    public async Task MediaRoomRequestedHandler_RepeatedRequestsForSameCallId_SucceedIdempotentlyAcrossScopes()
    {
        var dbName = Guid.NewGuid().ToString();
        var options = Options.Create(new LiveKitOptions
        {
            ApiKey = "test-key",
            ApiSecret = "0123456789abcdef0123456789abcdef",
            RelayUrl = "wss://clinic-ez-dimt0usk.livekit.cloud"
        });
        var tokenService = new LiveKitTokenService(options);
        var publisher = new Mock<IInteropPublisher>();

        var tenantId = "tenant-test";
        var callId = Guid.NewGuid();
        var roomName = $"call-{callId:N}";
        string originalKeyHash;

        await using (var db1 = CreateInMemoryDb(dbName))
        {
            db1.Entitlements.Add(new TenantMediaEntitlement
            {
                TenantId = tenantId,
                CallMinutesMonthly = 500,
                IsActive = true
            });
            await db1.SaveChangesAsync();

            var metering1 = new MediaMeteringService(db1, publisher.Object, NullLogger<MediaMeteringService>.Instance);
            var handler1 = new MediaRoomRequestedHandler(
                db1,
                tokenService,
                metering1,
                options,
                NullLogger<MediaRoomRequestedHandler>.Instance);

            var request1 = new MediaRoomRequestedPayload(
                TenantId: tenantId,
                CallId: callId,
                RoomName: roomName,
                ParticipantIdentities: new[] { "staff:dr-smith", "patient:pat-456" });

            var context1 = new InteropMessageContext(InteropEnvelope.Create(
                InteropTypes.MediaRoomRequested,
                Party.ForFacility(tenantId, "clinic-01", FacilityType.Clinic),
                Party.Media,
                Guid.NewGuid(),
                request1));

            var response1 = await handler1.RespondAsync(request1, context1, CancellationToken.None);

            response1.Success.Should().BeTrue();
            response1.ParticipantTokens.Should().ContainKey("staff:dr-smith");

            var session1 = await db1.CallSessions.FirstOrDefaultAsync(s => s.CallId == callId);
            session1.Should().NotBeNull();
            session1!.Status.Should().Be("Active");
            session1.E2eeKeyHash.Should().NotBeNullOrWhiteSpace();
            originalKeyHash = session1.E2eeKeyHash!;
        }

        await using (var db2 = CreateInMemoryDb(dbName))
        {
            var metering2 = new MediaMeteringService(db2, publisher.Object, NullLogger<MediaMeteringService>.Instance);
            var handler2 = new MediaRoomRequestedHandler(
                db2,
                tokenService,
                metering2,
                options,
                NullLogger<MediaRoomRequestedHandler>.Instance);

            var request2 = new MediaRoomRequestedPayload(
                TenantId: tenantId,
                CallId: callId,
                RoomName: roomName,
                ParticipantIdentities: new[] { "guest:otp-789" });

            var context2 = new InteropMessageContext(InteropEnvelope.Create(
                InteropTypes.MediaRoomRequested,
                Party.ForFacility(tenantId, "clinic-01", FacilityType.Clinic, InteropServices.Comms),
                Party.Media,
                Guid.NewGuid(),
                request2));

            var response2 = await handler2.RespondAsync(request2, context2, CancellationToken.None);

            response2.Success.Should().BeTrue();
            response2.CallId.Should().Be(callId);
            response2.RoomName.Should().Be(roomName);
            response2.RelayUrl.Should().Be("wss://clinic-ez-dimt0usk.livekit.cloud");
            response2.ParticipantTokens.Should().ContainKey("guest:otp-789");

            (await db2.CallSessions.CountAsync(s => s.CallId == callId)).Should().Be(1);
            var session2 = await db2.CallSessions.FirstOrDefaultAsync(s => s.CallId == callId);
            session2.Should().NotBeNull();
            session2!.Status.Should().Be("Active");
            session2.EndedAtUtc.Should().BeNull();
            session2.E2eeKeyHash.Should().Be(originalKeyHash);

            var createdLogged = await db2.AuditLogs.AnyAsync(a => a.CallId == callId && a.EventType == "RoomCreated");
            var rejoinedLogged = await db2.AuditLogs.AnyAsync(a => a.CallId == callId && a.EventType == "RoomRejoined");
            createdLogged.Should().BeTrue();
            rejoinedLogged.Should().BeTrue();
        }
    }

    [Fact]
    public async Task MediaRoomRequestedHandler_CrossTenantCallIdCollision_RejectsRequest()
    {
        var dbName = Guid.NewGuid().ToString();
        var options = Options.Create(new LiveKitOptions
        {
            ApiKey = "test-key",
            ApiSecret = "0123456789abcdef0123456789abcdef",
            RelayUrl = "wss://clinic-ez-dimt0usk.livekit.cloud"
        });
        var tokenService = new LiveKitTokenService(options);
        var publisher = new Mock<IInteropPublisher>();

        var callId = Guid.NewGuid();
        var roomName = $"call-{callId:N}";

        await using (var db1 = CreateInMemoryDb(dbName))
        {
            db1.Entitlements.Add(new TenantMediaEntitlement
            {
                TenantId = "tenant-a",
                CallMinutesMonthly = 500,
                IsActive = true
            });
            await db1.SaveChangesAsync();

            var metering1 = new MediaMeteringService(db1, publisher.Object, NullLogger<MediaMeteringService>.Instance);
            var handler1 = new MediaRoomRequestedHandler(
                db1,
                tokenService,
                metering1,
                options,
                NullLogger<MediaRoomRequestedHandler>.Instance);

            var request1 = new MediaRoomRequestedPayload(
                TenantId: "tenant-a",
                CallId: callId,
                RoomName: roomName,
                ParticipantIdentities: new[] { "staff:dr-a" });

            var context1 = new InteropMessageContext(InteropEnvelope.Create(
                InteropTypes.MediaRoomRequested,
                Party.ForFacility("tenant-a", "clinic-a", FacilityType.Clinic),
                Party.Media,
                Guid.NewGuid(),
                request1));

            var response1 = await handler1.RespondAsync(request1, context1, CancellationToken.None);
            response1.Success.Should().BeTrue();
        }

        await using (var db2 = CreateInMemoryDb(dbName))
        {
            db2.Entitlements.Add(new TenantMediaEntitlement
            {
                TenantId = "tenant-b",
                CallMinutesMonthly = 500,
                IsActive = true
            });
            await db2.SaveChangesAsync();

            var metering2 = new MediaMeteringService(db2, publisher.Object, NullLogger<MediaMeteringService>.Instance);
            var handler2 = new MediaRoomRequestedHandler(
                db2,
                tokenService,
                metering2,
                options,
                NullLogger<MediaRoomRequestedHandler>.Instance);

            var request2 = new MediaRoomRequestedPayload(
                TenantId: "tenant-b",
                CallId: callId,
                RoomName: roomName,
                ParticipantIdentities: new[] { "staff:dr-b" });

            var context2 = new InteropMessageContext(InteropEnvelope.Create(
                InteropTypes.MediaRoomRequested,
                Party.ForFacility("tenant-b", "clinic-b", FacilityType.Clinic),
                Party.Media,
                Guid.NewGuid(),
                request2));

            var response2 = await handler2.RespondAsync(request2, context2, CancellationToken.None);
            response2.Success.Should().BeFalse();
            response2.ParticipantTokens.Should().BeEmpty();
            response2.ErrorMessage.Should().Contain("another tenant");
        }
    }
}
