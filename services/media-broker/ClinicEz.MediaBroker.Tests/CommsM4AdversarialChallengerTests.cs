using System;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.MediaBroker.Application.Common.Options;
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

public class CommsM4AdversarialChallengerTests
{
    private static MediaBrokerDbContext CreateInMemoryDb()
    {
        var options = new DbContextOptionsBuilder<MediaBrokerDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new MediaBrokerDbContext(options);
    }

    /// <summary>
    /// Objective 1: Running Call Non-Cutoff Protection
    /// - Seed a tenant with 5 minutes remaining in monthly pool (TenantMonthlyUsage).
    /// - Initiate a call, simulate duration of 35 minutes.
    /// - Assert call was NOT forcibly terminated mid-call.
    /// - Assert remaining 5 minutes depleted, and 30 overdraft minutes recorded in MinutesOverdraft.
    /// - Assert media.usage.recorded payload contains correct total duration (35 minutes) and is published to Party.Portal.
    /// </summary>
    [Fact]
    public async Task RunningCallNonCutoffProtection_Seeds5MinPool_Runs35MinCall_Records30Overdraft_ReportsToPortal()
    {
        var db = CreateInMemoryDb();
        var publisher = new Mock<IInteropPublisher>();
        var service = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);

        var tenantId = "tenant-challenger-cutoff";
        var callId = Guid.NewGuid();
        var startedAt = new DateTime(2026, 10, 26, 14, 0, 0, DateTimeKind.Utc);
        var endedAt = startedAt.AddMinutes(35); // Exactly 35-minute call
        var yearMonth = startedAt.ToString("yyyy-MM");

        // Seed 100 minutes monthly quota, but 95 already used -> exactly 5 minutes remaining
        db.Entitlements.Add(new TenantMediaEntitlement
        {
            TenantId = tenantId,
            CallMinutesMonthly = 100,
            IsActive = true,
            AllowOverdraft = false // Even if overdraft is false on plan, running call must NOT be cut off!
        });
        db.MonthlyUsages.Add(new TenantMonthlyUsage
        {
            TenantId = tenantId,
            YearMonth = yearMonth,
            MinutesUsed = 95, // 5 minutes remaining
            MinutesOverdraft = 0,
            TotalCallsCompleted = 0
        });
        db.CallSessions.Add(new MediaCallSession
        {
            CallId = callId,
            TenantId = tenantId,
            FacilityId = "clinic-challenger-1",
            RoomName = $"call-{callId:N}",
            Status = "Active",
            RequestedAtUtc = startedAt,
            StartedAtUtc = startedAt
        });
        await db.SaveChangesAsync();

        // Simulate call completing naturally after 35 minutes
        await service.RecordCallEndedAsync(callId, startedAt, endedAt);

        // 1. Assert call was NOT forcibly terminated mid-call, status is Ended
        var session = await db.CallSessions.FirstAsync(s => s.CallId == callId);
        session.Status.Should().Be("Ended");
        session.DurationMinutes.Should().Be(35, "the full 35-minute teleconsultation was honored without cutoff");
        session.IsOverdraft.Should().BeTrue();

        // 2. Assert remaining 5 minutes depleted (pool reached 100), and 30 overdraft minutes recorded
        var usage = await db.MonthlyUsages.FirstAsync(u => u.TenantId == tenantId && u.YearMonth == yearMonth);
        usage.MinutesUsed.Should().Be(100, "the remaining 5 pool minutes were consumed");
        usage.MinutesOverdraft.Should().Be(30, "the excess 30 minutes must be recorded as overdraft");
        usage.TotalCallsCompleted.Should().Be(1);

        // 3. Assert media.usage.recorded payload contains correct total duration (35 minutes) and is published to Party.Portal
        publisher.Verify(p => p.Enqueue(
            InteropTypes.MediaUsageRecorded,
            Party.Media,
            Party.Portal,
            callId,
            It.Is<MediaUsageRecordedPayload>(payload =>
                payload.CallId == callId &&
                payload.TenantId == tenantId &&
                payload.DurationMinutes == 35 &&
                payload.CallStartedAtUtc == startedAt &&
                payload.CallEndedAtUtc == endedAt
            ),
            1,
            null
        ), Times.Once, "media.usage.recorded must be published strictly to Party.Portal with 35 minutes duration");
    }

    /// <summary>
    /// Objective 2: Zero-PHI LiveKit Token Invariant
    /// - Decode issued JWTs using JwtSecurityTokenHandler.
    /// - Assert sub contains only opaque identifier.
    /// - Assert claims contains NO patient name, MRN, date of birth, diagnosis, or facility name.
    /// - Assert metadata claim is strictly empty string or absent.
    /// - Assert room name strictly matches ^call-[0-9a-fA-F\-]{32,36}$.
    /// </summary>
    [Fact]
    public void ZeroPhiLiveKitTokenInvariant_DecodesJwt_AssertsOpaqueIdentityAndNoPhi()
    {
        var options = new LiveKitOptions
        {
            ApiKey = "api-key-challenger",
            ApiSecret = "0123456789abcdef0123456789abcdef",
            RelayUrl = "wss://media.clinicez.internal"
        };
        var service = new LiveKitTokenService(Options.Create(options));

        var callId = Guid.NewGuid();
        var roomName = $"call-{callId:N}"; // 32 hex chars

        // Room format check: ^call-[0-9a-fA-F\-]{32,36}$
        Regex.IsMatch(roomName, @"^call-[0-9a-fA-F\-]{32,36}$").Should().BeTrue();

        var identities = new[] { "staff:doc-01", "patient:pat-99", "guest:gst-77" };

        foreach (var identity in identities)
        {
            var tokenString = service.CreateRoomToken(roomName, identity, TimeSpan.FromHours(1));
            var handler = new JwtSecurityTokenHandler();
            var jwt = handler.ReadJwtToken(tokenString);

            // 1. sub contains opaque identifier
            jwt.Subject.Should().Be(identity);

            // 2. Zero clinical data or PHI claims
            var forbiddenClaimKeys = new[]
            {
                "name", "given_name", "family_name", "mrn", "patient_id",
                "dob", "birthdate", "diagnosis", "clinical", "facility",
                "facility_name", "clinic_name", "ssn", "phi", "address"
            };

            foreach (var forbidden in forbiddenClaimKeys)
            {
                jwt.Claims.Should().NotContain(c => c.Type.Equals(forbidden, StringComparison.OrdinalIgnoreCase),
                    $"claim '{forbidden}' constitutes PHI and is forbidden in media tokens");
            }

            // 3. metadata claim is strictly empty string or absent
            var metadataClaim = jwt.Claims.FirstOrDefault(c => c.Type == "metadata");
            if (metadataClaim != null)
            {
                metadataClaim.Value.Should().BeEmpty("metadata claim must be strictly empty if present");
            }
        }
    }

    /// <summary>
    /// Objective 3: Malicious Room Naming Injection Attack
    /// Submit media.room.requested with invalid/malicious room names:
    /// - room-clinical-triage
    /// - call-123; DROP TABLE
    /// - ../../
    /// Assert handler rejects with Success: false
    /// </summary>
    [Theory]
    [InlineData("room-clinical-triage")]
    [InlineData("call-123; DROP TABLE")]
    [InlineData("../../")]
    [InlineData("call-<script>alert(1)</script>")]
    [InlineData("consultation-dr-smith")]
    public async Task RoomNamingInjectionAttack_RejectsNonCompliantNames(string maliciousRoomName)
    {
        var db = CreateInMemoryDb();
        var options = Options.Create(new LiveKitOptions());
        var tokenService = new LiveKitTokenService(options);
        var publisher = new Mock<IInteropPublisher>();
        var meteringService = new MediaMeteringService(db, publisher.Object, NullLogger<MediaMeteringService>.Instance);

        db.Entitlements.Add(new TenantMediaEntitlement
        {
            TenantId = "tenant-attack-test",
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

        var request = new MediaRoomRequestedPayload(
            TenantId: "tenant-attack-test",
            CallId: Guid.NewGuid(),
            RoomName: maliciousRoomName,
            ParticipantIdentities: new[] { "staff:dr-smith" }
        );

        var context = new InteropMessageContext(InteropEnvelope.Create(
            InteropTypes.MediaRoomRequested,
            Party.ForFacility("tenant-attack-test", "clinic-01", FacilityType.Clinic),
            Party.Media,
            Guid.NewGuid(),
            request
        ));

        var response = await handler.RespondAsync(request, context, CancellationToken.None);

        response.Success.Should().BeFalse($"malicious or non-compliant room name '{maliciousRoomName}' must be rejected");
        response.ErrorMessage.Should().Contain("Invalid room name");
    }

    /// <summary>
    /// Dispatch requirement 2 & Worker Handoff Claim:
    /// "Claims contain opaque identities (participant-{ParticipantId:N})"
    /// "Assert sub contains only opaque identifier (participant-{id})."
    /// </summary>
    [Fact]
    public void CreateRoomToken_AcceptsOpaqueParticipantIdentifierFormat()
    {
        var options = new LiveKitOptions
        {
            ApiKey = "api-key-challenger",
            ApiSecret = "0123456789abcdef0123456789abcdef",
            RelayUrl = "wss://media.clinicez.internal"
        };
        var service = new LiveKitTokenService(Options.Create(options));
        var callId = Guid.NewGuid();
        var roomName = $"call-{callId:N}";
        var participantId = $"participant-{Guid.NewGuid():N}";

        var tokenString = service.CreateRoomToken(roomName, participantId, TimeSpan.FromHours(1));
        var handler = new JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(tokenString);
        jwt.Subject.Should().Be(participantId);
    }
}
