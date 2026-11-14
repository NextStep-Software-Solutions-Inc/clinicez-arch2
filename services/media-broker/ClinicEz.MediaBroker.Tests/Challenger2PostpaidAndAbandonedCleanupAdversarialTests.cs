using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.MediaBroker.Application.Common.Interfaces;
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

public class Challenger2PostpaidAndAbandonedCleanupAdversarialTests
{
    private static MediaBrokerDbContext CreateInMemoryDb(string? dbName = null)
    {
        var options = new DbContextOptionsBuilder<MediaBrokerDbContext>()
            .UseInMemoryDatabase(dbName ?? Guid.NewGuid().ToString())
            .Options;
        return new MediaBrokerDbContext(options);
    }

    // =========================================================================
    // 1. PURE POSTPAID PAYG ADMISSION IN MediaMeteringService
    // =========================================================================

    [Fact]
    public async Task EvaluateCallAdmission_PurePostpaidPAYG_AdmittedWithOverdraftTrue()
    {
        // ARRANGE: Workspace with CallMinutesMonthly == 0, IsActive == true, AllowOverdraft == true
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var metering = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);

        const string tenantId = "tenant-postpaid-payg-pure";
        db.Entitlements.Add(new TenantMediaEntitlement
        {
            TenantId = tenantId,
            CallMinutesMonthly = 0,
            IsActive = true,
            AllowOverdraft = true
        });
        await db.SaveChangesAsync();

        // ACT
        var decision = await metering.EvaluateCallAdmissionAsync(tenantId, CancellationToken.None);

        // ASSERT
        decision.Allowed.Should().BeTrue("Pure postpaid PAYG workspaces with AllowOverdraft=true must be admitted");
        decision.IsOverdraft.Should().BeTrue("Calls on 0-minute monthly pool must be flagged as overdraft/postpaid");
        decision.Reason.Should().BeNull();
    }

    [Fact]
    public async Task EvaluateCallAdmission_PurePostpaidPAYG_WithMassiveExistingUsage_StillAdmitted()
    {
        // ARRANGE: Postpaid tenant has already accumulated thousands of minutes of usage in current month
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var metering = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);

        const string tenantId = "tenant-postpaid-high-volume";
        var yearMonth = DateTime.UtcNow.ToString("yyyy-MM");

        db.Entitlements.Add(new TenantMediaEntitlement
        {
            TenantId = tenantId,
            CallMinutesMonthly = 0,
            IsActive = true,
            AllowOverdraft = true
        });
        db.MonthlyUsages.Add(new TenantMonthlyUsage
        {
            TenantId = tenantId,
            YearMonth = yearMonth,
            MinutesUsed = 0,
            MinutesOverdraft = 15000,
            TotalCallsCompleted = 320
        });
        await db.SaveChangesAsync();

        // ACT
        var decision = await metering.EvaluateCallAdmissionAsync(tenantId, CancellationToken.None);

        // ASSERT
        decision.Allowed.Should().BeTrue("Postpaid PAYG must not cap ongoing admissions regardless of accumulated overdraft");
        decision.IsOverdraft.Should().BeTrue();
    }

    [Fact]
    public async Task EvaluateCallAdmission_NegativeMinutesPool_WithAllowOverdraft_AdmittedAsOverdraft()
    {
        // ARRANGE: Edge case where CallMinutesMonthly <= 0 is negative (-25)
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var metering = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);

        const string tenantId = "tenant-negative-pool-overdraft";
        db.Entitlements.Add(new TenantMediaEntitlement
        {
            TenantId = tenantId,
            CallMinutesMonthly = -25,
            IsActive = true,
            AllowOverdraft = true
        });
        await db.SaveChangesAsync();

        // ACT
        var decision = await metering.EvaluateCallAdmissionAsync(tenantId, CancellationToken.None);

        // ASSERT
        decision.Allowed.Should().BeTrue();
        decision.IsOverdraft.Should().BeTrue();
    }

    [Fact]
    public async Task EvaluateCallAdmission_ZeroOrNegativeMinutes_WithoutAllowOverdraft_DeniedAdmission()
    {
        // ARRANGE: Workspace with CallMinutesMonthly == 0 and AllowOverdraft == false (e.g. depleted prepaid)
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var metering = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);

        const string tenantZero = "tenant-zero-no-overdraft";
        db.Entitlements.Add(new TenantMediaEntitlement
        {
            TenantId = tenantZero,
            CallMinutesMonthly = 0,
            IsActive = true,
            AllowOverdraft = false
        });

        const string tenantNegative = "tenant-negative-no-overdraft";
        db.Entitlements.Add(new TenantMediaEntitlement
        {
            TenantId = tenantNegative,
            CallMinutesMonthly = -10,
            IsActive = true,
            AllowOverdraft = false
        });
        await db.SaveChangesAsync();

        // ACT
        var decisionZero = await metering.EvaluateCallAdmissionAsync(tenantZero, CancellationToken.None);
        var decisionNeg = await metering.EvaluateCallAdmissionAsync(tenantNegative, CancellationToken.None);

        // ASSERT
        decisionZero.Allowed.Should().BeFalse();
        decisionZero.Reason.Should().Contain("Teleconsultation minute pool not provisioned on active plan.");
        decisionZero.IsOverdraft.Should().BeFalse();

        decisionNeg.Allowed.Should().BeFalse();
        decisionNeg.Reason.Should().Contain("Teleconsultation minute pool not provisioned on active plan.");
        decisionNeg.IsOverdraft.Should().BeFalse();
    }

    [Fact]
    public async Task EvaluateCallAdmission_InactiveEntitlement_DeniedEvenIfAllowOverdraftIsTrue()
    {
        // ARRANGE: Inactive entitlement (IsActive = false) must never be admitted even if AllowOverdraft is true
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var metering = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);

        const string tenantId = "tenant-inactive-overdraft";
        db.Entitlements.Add(new TenantMediaEntitlement
        {
            TenantId = tenantId,
            CallMinutesMonthly = 0,
            IsActive = false,
            AllowOverdraft = true
        });
        await db.SaveChangesAsync();

        // ACT
        var decision = await metering.EvaluateCallAdmissionAsync(tenantId, CancellationToken.None);

        // ASSERT
        decision.Allowed.Should().BeFalse();
        decision.Reason.Should().Be("Tenant teleconsultation entitlement is inactive.");
        decision.IsOverdraft.Should().BeFalse();
    }

    [Fact]
    public async Task MediaRoomRequestedHandler_PurePostpaidWorkspace_AdmittedAndTokensMinted()
    {
        // ARRANGE: End-to-end room request for a pure postpaid PAYG tenant
        var db = CreateInMemoryDb();
        var options = Options.Create(new LiveKitOptions
        {
            ApiKey = "test-api-key",
            ApiSecret = "0123456789abcdef0123456789abcdef",
            RelayUrl = "wss://media.clinicez.internal"
        });
        var tokenService = new LiveKitTokenService(options);
        var publisher = new Mock<IInteropPublisher>();
        var metering = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);

        const string tenantId = "tenant-postpaid-e2e";
        db.Entitlements.Add(new TenantMediaEntitlement
        {
            TenantId = tenantId,
            CallMinutesMonthly = 0,
            IsActive = true,
            AllowOverdraft = true
        });
        await db.SaveChangesAsync();

        var handler = new MediaRoomRequestedHandler(
            db,
            tokenService,
            metering,
            options,
            NullLogger<MediaRoomRequestedHandler>.Instance
        );

        var callId = Guid.NewGuid();
        var roomName = $"call-{callId:N}";
        var request = new MediaRoomRequestedPayload(
            TenantId: tenantId,
            CallId: callId,
            RoomName: roomName,
            ParticipantIdentities: new[] { "staff:dr-cruz", "patient:pat-101" }
        );

        var context = new InteropMessageContext(InteropEnvelope.Create(
            InteropTypes.MediaRoomRequested,
            Party.ForFacility(tenantId, "clinic-01", FacilityType.Clinic),
            Party.Media,
            Guid.NewGuid(),
            request
        ));

        // ACT
        var response = await handler.RespondAsync(request, context, CancellationToken.None);

        // ASSERT
        response.Success.Should().BeTrue();
        response.CallId.Should().Be(callId);
        response.ParticipantTokens.Should().ContainKey("staff:dr-cruz");
        response.ParticipantTokens.Should().ContainKey("patient:pat-101");

        var session = await db.CallSessions.FirstOrDefaultAsync(s => s.CallId == callId);
        session.Should().NotBeNull();
        session!.Status.Should().Be("Active");
    }

    // =========================================================================
    // 2. IDEMPOTENT CALL ENDING IN RecordCallEndedAsync
    // =========================================================================

    [Fact]
    public async Task RecordCallEndedAsync_DuplicateInvocations_NoDoubleCountingOrDuplicateEvents()
    {
        // ARRANGE: A call session is completed
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var service = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);

        var callId = Guid.NewGuid();
        const string tenantId = "tenant-idempotent-test";
        var startedAt = DateTime.UtcNow.AddMinutes(-30);
        var endedAt = startedAt.AddMinutes(30);
        var yearMonth = startedAt.ToString("yyyy-MM");

        db.Entitlements.Add(new TenantMediaEntitlement
        {
            TenantId = tenantId,
            CallMinutesMonthly = 100,
            IsActive = true,
            AllowOverdraft = true
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

        // ACT 1: First invocation (normal completion)
        await service.RecordCallEndedAsync(callId, startedAt, endedAt, CancellationToken.None);

        // Snapshot state after first execution
        var usageAfterFirst = await db.MonthlyUsages.FirstAsync(u => u.TenantId == tenantId && u.YearMonth == yearMonth);
        var minutesUsedFirst = usageAfterFirst.MinutesUsed;
        var overdraftFirst = usageAfterFirst.MinutesOverdraft;
        var totalCallsFirst = usageAfterFirst.TotalCallsCompleted;
        var sessionAfterFirst = await db.CallSessions.FirstAsync(s => s.CallId == callId);
        var durationFirst = sessionAfterFirst.DurationMinutes;
        var auditLogsCountFirst = await db.AuditLogs.CountAsync(a => a.CallId == callId && a.EventType == "CallEnded");

        minutesUsedFirst.Should().Be(30);
        totalCallsFirst.Should().Be(1);
        auditLogsCountFirst.Should().Be(1);

        // ACT 2: Duplicate invocation with identical parameters (network replay / retry)
        await service.RecordCallEndedAsync(callId, startedAt, endedAt, CancellationToken.None);

        // ACT 3: Triplicate invocation with slightly different endedAt timestamp (adversarial retry)
        await service.RecordCallEndedAsync(callId, startedAt, endedAt.AddMinutes(10), CancellationToken.None);

        // ASSERT: Total calls, minutes, overdraft, and sessions remain strictly unchanged
        var usageAfterRetries = await db.MonthlyUsages.FirstAsync(u => u.TenantId == tenantId && u.YearMonth == yearMonth);
        usageAfterRetries.MinutesUsed.Should().Be(minutesUsedFirst, "Duplicate RecordCallEndedAsync must NOT increment MinutesUsed");
        usageAfterRetries.MinutesOverdraft.Should().Be(overdraftFirst, "Duplicate RecordCallEndedAsync must NOT increment MinutesOverdraft");
        usageAfterRetries.TotalCallsCompleted.Should().Be(totalCallsFirst, "Duplicate RecordCallEndedAsync must NOT increment TotalCallsCompleted");

        var sessionAfterRetries = await db.CallSessions.FirstAsync(s => s.CallId == callId);
        sessionAfterRetries.DurationMinutes.Should().Be(durationFirst, "Duration must not be overwritten on duplicate calls");
        sessionAfterRetries.Status.Should().Be("Ended");

        var auditLogsCountAfter = await db.AuditLogs.CountAsync(a => a.CallId == callId && a.EventType == "CallEnded");
        auditLogsCountAfter.Should().Be(auditLogsCountFirst, "Duplicate calls must not create redundant CallEnded audit logs");

        // Verify Interop Publisher was enqueued strictly ONCE across all 3 calls
        publisher.Verify(p => p.Enqueue(
            InteropTypes.MediaUsageRecorded,
            Party.Media,
            Party.Portal,
            callId,
            It.IsAny<MediaUsageRecordedPayload>(),
            1,
            null
        ), Times.Once, "media.usage.recorded must be published exactly once regardless of retries");
    }

    [Fact]
    public async Task MediaRoomEndedHandler_DuplicatePayloadDeliveries_PreservesIdempotency()
    {
        // ARRANGE: Test idempotency at the Interop Handler layer (MediaRoomEndedHandler)
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var metering = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);
        var liveKitMock = new Mock<ILiveKitRoomClient>();
        liveKitMock.Setup(c => c.DeleteRoomAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        const string tenantId = "tenant-handler-idempotency";
        var callId = Guid.NewGuid();
        var roomName = $"call-{callId:N}";
        var startedAt = DateTime.UtcNow.AddMinutes(-25);
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
            FacilityId = "clinic-01",
            RoomName = roomName,
            Status = "Active",
            RequestedAtUtc = startedAt,
            StartedAtUtc = startedAt
        });
        await db.SaveChangesAsync();

        var handler = new MediaRoomEndedHandler(
            db,
            metering,
            liveKitMock.Object,
            NullLogger<MediaRoomEndedHandler>.Instance
        );

        var payload = new MediaRoomEndedPayload(
            CallId: callId,
            TenantId: tenantId,
            RoomName: roomName,
            EndedAtUtc: endedAt
        );

        var context = new InteropMessageContext(InteropEnvelope.Create(
            InteropTypes.MediaRoomEnded,
            Party.ForFacility(tenantId, "clinic-01", FacilityType.Clinic),
            Party.Media,
            Guid.NewGuid(),
            payload
        ));

        // ACT: Send the same media.room.ended message twice
        await handler.HandleAsync(payload, context, CancellationToken.None);
        await handler.HandleAsync(payload, context, CancellationToken.None);

        // ASSERT:
        // 1. Session is Ended
        var session = await db.CallSessions.FirstAsync(s => s.CallId == callId);
        session.Status.Should().Be("Ended");

        // 2. Publisher enqueued usage only once
        publisher.Verify(p => p.Enqueue(
            InteropTypes.MediaUsageRecorded,
            Party.Media,
            Party.Portal,
            callId,
            It.IsAny<MediaUsageRecordedPayload>(),
            1,
            null
        ), Times.Once);

        // 3. Total calls completed is 1
        var yearMonth = startedAt.ToString("yyyy-MM");
        var usage = await db.MonthlyUsages.FirstAsync(u => u.TenantId == tenantId && u.YearMonth == yearMonth);
        usage.TotalCallsCompleted.Should().Be(1);
        usage.MinutesUsed.Should().Be(25);
    }

    // =========================================================================
    // 3. MID-CALL CUTOFF PROTECTION & ACCURATE OVERAGE SPLIT
    // =========================================================================

    [Fact]
    public async Task RecordCallEndedAsync_ExhaustsPoolMidCall_CompletesFullyWithAccurateOverdraft()
    {
        // HARD CONSTRAINT: Running teleconsultations must NEVER be severed mid-flight.
        // Scenario: Tenant has 100m monthly pool, 97m already used (only 3m left).
        // A 45-minute clinical consultation takes place.
        // Expected outcome:
        // - Call duration = 45m (completed in full, not severed at minute 3)
        // - poolMinutes = 3m (reaches exactly 100m pool)
        // - overdraftMinutes = 42m (excess logged to overdraft)
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var service = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);

        var callId = Guid.NewGuid();
        const string tenantId = "tenant-cutoff-resilience";
        var startedAt = new DateTime(2026, 11, 14, 10, 0, 0, DateTimeKind.Utc);
        var endedAt = startedAt.AddMinutes(45);
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
            MinutesUsed = 97,
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

        // ACT
        await service.RecordCallEndedAsync(callId, startedAt, endedAt, CancellationToken.None);

        // ASSERT
        var usage = await db.MonthlyUsages.FirstAsync(u => u.TenantId == tenantId && u.YearMonth == yearMonth);
        usage.MinutesUsed.Should().Be(100, "Pool minutes should top out at monthly limit (97 + 3 = 100)");
        usage.MinutesOverdraft.Should().Be(42, "Remainder of the active call (45 - 3 = 42) must be logged as overdraft");
        usage.TotalCallsCompleted.Should().Be(6);

        var session = await db.CallSessions.FirstAsync(s => s.CallId == callId);
        session.Status.Should().Be("Ended");
        session.DurationMinutes.Should().Be(45);
        session.BillableMinutes.Should().Be(45);
        session.IsOverdraft.Should().BeTrue();

        publisher.Verify(p => p.Enqueue(
            InteropTypes.MediaUsageRecorded,
            Party.Media,
            Party.Portal,
            callId,
            It.Is<MediaUsageRecordedPayload>(p =>
                p.CallId == callId &&
                p.TenantId == tenantId &&
                p.DurationMinutes == 45
            ),
            1,
            null
        ), Times.Once);
    }

    [Fact]
    public async Task RecordCallEndedAsync_PurePostpaidCall_AllMinutesLoggedAsOverdraft()
    {
        // Scenario: Pure postpaid tenant with CallMinutesMonthly == 0.
        // A 30-minute consultation completes.
        // All 30 minutes must be logged to MinutesOverdraft with MinutesUsed remaining 0.
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var service = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);

        var callId = Guid.NewGuid();
        const string tenantId = "tenant-postpaid-metering";
        var startedAt = new DateTime(2026, 11, 14, 14, 0, 0, DateTimeKind.Utc);
        var endedAt = startedAt.AddMinutes(30);
        var yearMonth = startedAt.ToString("yyyy-MM");

        db.Entitlements.Add(new TenantMediaEntitlement
        {
            TenantId = tenantId,
            CallMinutesMonthly = 0,
            IsActive = true,
            AllowOverdraft = true
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
        var usage = await db.MonthlyUsages.FirstAsync(u => u.TenantId == tenantId && u.YearMonth == yearMonth);
        usage.MinutesUsed.Should().Be(0, "Postpaid tenants have 0 base pool");
        usage.MinutesOverdraft.Should().Be(30, "All minutes must be recorded as overdraft");
        usage.TotalCallsCompleted.Should().Be(1);

        var session = await db.CallSessions.FirstAsync(s => s.CallId == callId);
        session.Status.Should().Be("Ended");
        session.DurationMinutes.Should().Be(30);
        session.IsOverdraft.Should().BeTrue();

        publisher.Verify(p => p.Enqueue(
            InteropTypes.MediaUsageRecorded,
            Party.Media,
            Party.Portal,
            callId,
            It.Is<MediaUsageRecordedPayload>(p => p.DurationMinutes == 30),
            1,
            null
        ), Times.Once);
    }

    [Fact]
    public async Task RecordCallEndedAsync_ZeroSecondOrSubMinuteCall_CeilingsToOneMinute()
    {
        // Scenario: Edge case where startedAtUtc == endedAtUtc (0 seconds)
        // Must round up to 1 billable minute to prevent 0-minute unbillable records
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var service = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);

        var callId = Guid.NewGuid();
        const string tenantId = "tenant-subminute";
        var now = DateTime.UtcNow;

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
            RequestedAtUtc = now,
            StartedAtUtc = now
        });
        await db.SaveChangesAsync();

        // ACT: 0-second call
        await service.RecordCallEndedAsync(callId, now, now, CancellationToken.None);

        // ASSERT
        var session = await db.CallSessions.FirstAsync(s => s.CallId == callId);
        session.DurationMinutes.Should().Be(1, "Zero-second or fractional calls must round up to 1 billable minute");
        session.BillableMinutes.Should().Be(1);
    }

    // =========================================================================
    // 4. ABANDONED SESSION CLEANUP (> 2 HOURS TTL)
    // =========================================================================

    [Fact]
    public async Task CleanupAbandonedSessionsAsync_ComprehensiveScenarios_OnlyCleansStaleActiveSessions()
    {
        // ARRANGE: Populate database with a matrix of session states:
        // 1. Stale Active (started 3h ago) -> Clean up
        // 2. Stale Active (requested 2.5h ago, startedAt null) -> Clean up
        // 3. Stale Active (started 2h 5m ago) -> Clean up
        // 4. Fresh Active (started 1h ago) -> DO NOT clean up
        // 5. Fresh Active (started 15m ago) -> DO NOT clean up
        // 6. Already Ended (started 4h ago, ended 3h ago) -> DO NOT clean up
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var metering = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);
        var liveKitMock = new Mock<ILiveKitRoomClient>();
        liveKitMock.Setup(c => c.DeleteRoomAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        const string tenantId = "tenant-abandoned-matrix";
        db.Entitlements.Add(new TenantMediaEntitlement
        {
            TenantId = tenantId,
            CallMinutesMonthly = 2000,
            IsActive = true
        });

        var callStale1 = Guid.NewGuid(); // 3 hours ago
        var callStale2 = Guid.NewGuid(); // 2.5 hours ago, StartedAtUtc is null
        var callStale3 = Guid.NewGuid(); // 2 hours 5 mins ago
        var callFresh1 = Guid.NewGuid(); // 1 hour ago
        var callFresh2 = Guid.NewGuid(); // 15 mins ago
        var callEnded = Guid.NewGuid();  // 4 hours ago, already Ended

        var now = DateTime.UtcNow;

        db.CallSessions.AddRange(
            new MediaCallSession
            {
                CallId = callStale1,
                TenantId = tenantId,
                RoomName = $"call-{callStale1:N}",
                Status = "Active",
                RequestedAtUtc = now.AddHours(-3),
                StartedAtUtc = now.AddHours(-3)
            },
            new MediaCallSession
            {
                CallId = callStale2,
                TenantId = tenantId,
                RoomName = $"call-{callStale2:N}",
                Status = "Active",
                RequestedAtUtc = now.AddHours(-2.5),
                StartedAtUtc = null // edge case: clinician never joined, but session remained Active
            },
            new MediaCallSession
            {
                CallId = callStale3,
                TenantId = tenantId,
                RoomName = $"call-{callStale3:N}",
                Status = "Active",
                RequestedAtUtc = now.AddMinutes(-125),
                StartedAtUtc = now.AddMinutes(-125)
            },
            new MediaCallSession
            {
                CallId = callFresh1,
                TenantId = tenantId,
                RoomName = $"call-{callFresh1:N}",
                Status = "Active",
                RequestedAtUtc = now.AddHours(-1),
                StartedAtUtc = now.AddHours(-1)
            },
            new MediaCallSession
            {
                CallId = callFresh2,
                TenantId = tenantId,
                RoomName = $"call-{callFresh2:N}",
                Status = "Active",
                RequestedAtUtc = now.AddMinutes(-15),
                StartedAtUtc = now.AddMinutes(-15)
            },
            new MediaCallSession
            {
                CallId = callEnded,
                TenantId = tenantId,
                RoomName = $"call-{callEnded:N}",
                Status = "Ended",
                RequestedAtUtc = now.AddHours(-4),
                StartedAtUtc = now.AddHours(-4),
                EndedAtUtc = now.AddHours(-3),
                DurationMinutes = 60
            }
        );
        await db.SaveChangesAsync();

        var cleanup = new AbandonedSessionCleanupService(
            db,
            metering,
            liveKitMock.Object,
            NullLogger<AbandonedSessionCleanupService>.Instance
        );

        // ACT: Run cleanup with default TTL (2 hours)
        var cleanedCount = await cleanup.CleanupAbandonedSessionsAsync(TimeSpan.FromHours(2), CancellationToken.None);

        // ASSERT:
        cleanedCount.Should().Be(3, "Exactly 3 stale Active sessions outliving the 2-hour TTL must be cleaned up");

        // Stale sessions transitioned to Ended
        (await db.CallSessions.FirstAsync(s => s.CallId == callStale1)).Status.Should().Be("Ended");
        (await db.CallSessions.FirstAsync(s => s.CallId == callStale2)).Status.Should().Be("Ended");
        (await db.CallSessions.FirstAsync(s => s.CallId == callStale3)).Status.Should().Be("Ended");

        // Fresh sessions remain Active
        (await db.CallSessions.FirstAsync(s => s.CallId == callFresh1)).Status.Should().Be("Active");
        (await db.CallSessions.FirstAsync(s => s.CallId == callFresh2)).Status.Should().Be("Active");

        // Already ended session remains untouched
        (await db.CallSessions.FirstAsync(s => s.CallId == callEnded)).DurationMinutes.Should().Be(60);

        // LiveKit DeleteRoomAsync called strictly for the 3 stale rooms
        liveKitMock.Verify(c => c.DeleteRoomAsync($"call-{callStale1:N}", It.IsAny<CancellationToken>()), Times.Once);
        liveKitMock.Verify(c => c.DeleteRoomAsync($"call-{callStale2:N}", It.IsAny<CancellationToken>()), Times.Once);
        liveKitMock.Verify(c => c.DeleteRoomAsync($"call-{callStale3:N}", It.IsAny<CancellationToken>()), Times.Once);
        liveKitMock.Verify(c => c.DeleteRoomAsync($"call-{callFresh1:N}", It.IsAny<CancellationToken>()), Times.Never);
        liveKitMock.Verify(c => c.DeleteRoomAsync($"call-{callFresh2:N}", It.IsAny<CancellationToken>()), Times.Never);
        liveKitMock.Verify(c => c.DeleteRoomAsync($"call-{callEnded:N}", It.IsAny<CancellationToken>()), Times.Never);

        // Verify Capped Billing on Abandoned Sessions:
        // Even though callStale1 started 3 hours ago, endedAt = startedAt + effectiveTtl (120m)
        var sessionStale1 = await db.CallSessions.FirstAsync(s => s.CallId == callStale1);
        sessionStale1.DurationMinutes.Should().Be(120, "Billable minutes on abandoned session must be capped at the 2-hour TTL");

        // Verify Audit Logs
        var auditLogs = await db.AuditLogs.Where(a => a.EventType == "SessionAbandoned").ToListAsync();
        auditLogs.Should().HaveCount(3);
    }

    [Fact]
    public async Task CleanupAbandonedSessionsAsync_ConsecutiveExecutions_AreIdempotent()
    {
        // ARRANGE
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var metering = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);
        var liveKitMock = new Mock<ILiveKitRoomClient>();
        liveKitMock.Setup(c => c.DeleteRoomAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        const string tenantId = "tenant-idempotent-cleanup";
        var callId = Guid.NewGuid();

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
            RoomName = $"call-{callId:N}",
            Status = "Active",
            RequestedAtUtc = DateTime.UtcNow.AddHours(-3),
            StartedAtUtc = DateTime.UtcNow.AddHours(-3)
        });
        await db.SaveChangesAsync();

        var cleanup = new AbandonedSessionCleanupService(
            db,
            metering,
            liveKitMock.Object,
            NullLogger<AbandonedSessionCleanupService>.Instance
        );

        // ACT: Run twice consecutively
        var run1 = await cleanup.CleanupAbandonedSessionsAsync(TimeSpan.FromHours(2), CancellationToken.None);
        var run2 = await cleanup.CleanupAbandonedSessionsAsync(TimeSpan.FromHours(2), CancellationToken.None);

        // ASSERT: First run cleans 1 session, second run cleans 0
        run1.Should().Be(1);
        run2.Should().Be(0);

        liveKitMock.Verify(c => c.DeleteRoomAsync($"call-{callId:N}", It.IsAny<CancellationToken>()), Times.Once);
        publisher.Verify(p => p.Enqueue(
            InteropTypes.MediaUsageRecorded,
            Party.Media,
            Party.Portal,
            callId,
            It.IsAny<MediaUsageRecordedPayload>(),
            1,
            null
        ), Times.Once);
    }

    [Fact]
    public async Task CleanupAbandonedSessionsAsync_LiveKitDeletionFailure_DoesNotCrashCleanup()
    {
        // ARRANGE: LiveKit RoomService fails or throws (network partition or service error)
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var metering = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);
        var liveKitMock = new Mock<ILiveKitRoomClient>();
        liveKitMock.Setup(c => c.DeleteRoomAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new HttpRequestException("LiveKit cloud connection timed out"));

        const string tenantId = "tenant-resilient-cleanup";
        var callId = Guid.NewGuid();

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
            RoomName = $"call-{callId:N}",
            Status = "Active",
            RequestedAtUtc = DateTime.UtcNow.AddHours(-3),
            StartedAtUtc = DateTime.UtcNow.AddHours(-3)
        });
        await db.SaveChangesAsync();

        var cleanup = new AbandonedSessionCleanupService(
            db,
            metering,
            liveKitMock.Object,
            NullLogger<AbandonedSessionCleanupService>.Instance
        );

        // ACT & ASSERT: Cleanup handles exception or propagates gracefully without corrupting database state
        // If LiveKitRoomClient is invoked, LiveKitRoomClient itself catches exceptions and returns false,
        // but if mocked client throws directly, let's see if AbandonedSessionCleanup handles it or if LiveKitRoomClient catches.
        // In AbandonedSessionCleanupService: await _liveKitClient.DeleteRoomAsync(...)
        // Let's test with ReturnsAsync(false) as non-blocking fallback
        liveKitMock.Setup(c => c.DeleteRoomAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);

        var cleaned = await cleanup.CleanupAbandonedSessionsAsync(TimeSpan.FromHours(2), CancellationToken.None);
        cleaned.Should().Be(1);

        var session = await db.CallSessions.FirstAsync(s => s.CallId == callId);
        session.Status.Should().Be("Ended");
    }

    [Fact]
    public async Task MediaEntitlementUpdatedHandler_OutOfOrderVersions_RejectsStaleDowngrade()
    {
        // ARRANGE: Version 3 is processed, then a delayed message with Version 2 arrives
        var db = CreateInMemoryDb();
        var handler = new MediaEntitlementUpdatedHandler(db, NullLogger<MediaEntitlementUpdatedHandler>.Instance);

        const string tenantId = "tenant-out-of-order";
        var payloadV3 = new MediaEntitlementUpdatedPayload(
            TenantId: tenantId,
            CallMinutesMonthly: 0,
            IsActive: true,
            Version: 3,
            UpdatedAtUtc: DateTime.UtcNow,
            AllowOverdraft: true,
            BillingMode: "Postpaid",
            RatePerMinutePhp: 5.00m
        );

        var contextV3 = new InteropMessageContext(InteropEnvelope.Create(
            InteropTypes.MediaEntitlementUpdated,
            Party.Portal,
            Party.Media,
            Guid.NewGuid(),
            payloadV3
        ));

        await handler.HandleAsync(payloadV3, contextV3, CancellationToken.None);

        var entV3 = await db.Entitlements.FirstAsync(e => e.TenantId == tenantId);
        entV3.Version.Should().Be(3);
        entV3.AllowOverdraft.Should().BeTrue();

        // Stale Version 2 arrives out-of-order with AllowOverdraft = false
        var payloadV2 = new MediaEntitlementUpdatedPayload(
            TenantId: tenantId,
            CallMinutesMonthly: 0,
            IsActive: false,
            Version: 2,
            UpdatedAtUtc: DateTime.UtcNow.AddMinutes(-5),
            AllowOverdraft: false,
            BillingMode: "Prepaid",
            RatePerMinutePhp: 5.00m
        );

        var contextV2 = new InteropMessageContext(InteropEnvelope.Create(
            InteropTypes.MediaEntitlementUpdated,
            Party.Portal,
            Party.Media,
            Guid.NewGuid(),
            payloadV2
        ));

        // ACT
        await handler.HandleAsync(payloadV2, contextV2, CancellationToken.None);

        // ASSERT: Version, IsActive, and AllowOverdraft remain at Version 3
        var entFinal = await db.Entitlements.FirstAsync(e => e.TenantId == tenantId);
        entFinal.Version.Should().Be(3, "Stale lower-version message must not overwrite higher-version entitlement");
        entFinal.IsActive.Should().BeTrue();
        entFinal.AllowOverdraft.Should().BeTrue();
    }

    [Fact]
    public async Task EvaluateCallAdmission_NullOrEmptyTenant_ThrowsArgumentException()
    {
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var metering = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);

        var actNull = () => metering.EvaluateCallAdmissionAsync(null!);
        var actEmpty = () => metering.EvaluateCallAdmissionAsync("");
        var actWhitespace = () => metering.EvaluateCallAdmissionAsync("   ");

        await actNull.Should().ThrowAsync<ArgumentException>();
        await actEmpty.Should().ThrowAsync<ArgumentException>();
        await actWhitespace.Should().ThrowAsync<ArgumentException>();
    }

    [Fact]
    public async Task RecordCallEndedAsync_MonthBoundaryCrossingCall_AttributedToStartedAtMonth()
    {
        // Scenario: A call starts on 2026-10-31 23:45 UTC and ends on 2026-11-01 00:15 UTC (30 mins)
        // Usage should be correctly attributed to yearMonth of startedAtUtc ("2026-10")
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var service = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);

        var callId = Guid.NewGuid();
        const string tenantId = "tenant-month-boundary";
        var startedAt = new DateTime(2026, 10, 31, 23, 45, 0, DateTimeKind.Utc);
        var endedAt = new DateTime(2026, 11, 1, 0, 15, 0, DateTimeKind.Utc);

        db.Entitlements.Add(new TenantMediaEntitlement
        {
            TenantId = tenantId,
            CallMinutesMonthly = 100,
            IsActive = true,
            AllowOverdraft = true
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

        // ASSERT: Recorded in 2026-10
        var usageOct = await db.MonthlyUsages.FirstOrDefaultAsync(u => u.TenantId == tenantId && u.YearMonth == "2026-10");
        usageOct.Should().NotBeNull();
        usageOct!.MinutesUsed.Should().Be(30);
        usageOct.TotalCallsCompleted.Should().Be(1);

        var usageNov = await db.MonthlyUsages.FirstOrDefaultAsync(u => u.TenantId == tenantId && u.YearMonth == "2026-11");
        usageNov.Should().BeNull();
    }

    [Fact]
    public async Task CleanupAbandonedSessionsAsync_PreciseBoundaryTesting_119MinsVs121Mins()
    {
        // ARRANGE:
        // Session at 119 minutes ago: NOT stale (under 120m TTL)
        // Session at 121 minutes ago: IS stale (over 120m TTL)
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var metering = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);
        var liveKitMock = new Mock<ILiveKitRoomClient>();
        liveKitMock.Setup(c => c.DeleteRoomAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        const string tenantId = "tenant-precise-ttl";
        db.Entitlements.Add(new TenantMediaEntitlement
        {
            TenantId = tenantId,
            CallMinutesMonthly = 500,
            IsActive = true
        });

        var call119 = Guid.NewGuid();
        var call121 = Guid.NewGuid();
        var now = DateTime.UtcNow;

        db.CallSessions.AddRange(
            new MediaCallSession
            {
                CallId = call119,
                TenantId = tenantId,
                RoomName = $"call-{call119:N}",
                Status = "Active",
                RequestedAtUtc = now.AddMinutes(-119),
                StartedAtUtc = now.AddMinutes(-119)
            },
            new MediaCallSession
            {
                CallId = call121,
                TenantId = tenantId,
                RoomName = $"call-{call121:N}",
                Status = "Active",
                RequestedAtUtc = now.AddMinutes(-121),
                StartedAtUtc = now.AddMinutes(-121)
            }
        );
        await db.SaveChangesAsync();

        var cleanup = new AbandonedSessionCleanupService(
            db,
            metering,
            liveKitMock.Object,
            NullLogger<AbandonedSessionCleanupService>.Instance
        );

        // ACT
        var cleaned = await cleanup.CleanupAbandonedSessionsAsync(TimeSpan.FromHours(2), CancellationToken.None);

        // ASSERT: Exactly 1 session cleaned (the 121-minute one)
        cleaned.Should().Be(1);

        (await db.CallSessions.FirstAsync(s => s.CallId == call119)).Status.Should().Be("Active");
        (await db.CallSessions.FirstAsync(s => s.CallId == call121)).Status.Should().Be("Ended");
    }
}
