using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Infrastructure.Interop;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Patient.Application.Tests.Interop;

public class ChallengerM7PatientConcurrencyTests
{
    private ApplicationDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new ApplicationDbContext(options);
    }

    [Fact]
    public async Task CallRelayUrls_HighConcurrencyStress_ThreadSafeWithoutExceptions()
    {
        const int concurrency = 50;
        var tasks = new List<Task>();
        var readResults = new ConcurrentBag<string?>();

        for (int i = 0; i < concurrency; i++)
        {
            var idx = i;
            var callId = Guid.NewGuid();
            var patientId = Guid.NewGuid();
            var testUrl = $"wss://stream-{idx}.clinicez.internal";

            tasks.Add(Task.Run(async () =>
            {
                using var db = CreateContext();
                var syncMock = Substitute.For<ISyncNotificationService>();
                var handler = new CommsCallStateChangedInteropHandler(
                    db, syncMock, NullLogger<CommsCallStateChangedInteropHandler>.Instance);

                var payload = new CommsCallStateChangedPayload(
                    CallId: callId,
                    ConversationId: null,
                    TenantId: "tenant-concur",
                    FacilityId: Guid.NewGuid().ToString(),
                    Kind: CallKind.Teleconsult,
                    Status: "Admitted",
                    RoomName: $"call-{callId:N}",
                    JoinToken: "token",
                    StateVersion: 1,
                    ChangedAtUtc: DateTime.UtcNow,
                    RelayUrl: testUrl);

                var envelope = InteropEnvelope.Create(
                    InteropTypes.CommsCallStateChanged,
                    Party.ForFacility("tenant-concur", "fac-1", FacilityType.Clinic),
                    Party.ForPatient(patientId.ToString()),
                    callId,
                    payload);

                await handler.HandleAsync(payload, new InteropMessageContext(envelope), CancellationToken.None);

                // Read immediately from static dictionary
                var retrieved = CommsCallStateChangedInteropHandler.GetRelayUrl(callId);
                readResults.Add(retrieved);
                retrieved.Should().Be(testUrl);
            }));
        }

        await Task.WhenAll(tasks);
        readResults.Should().HaveCount(concurrency);
    }

    [Fact]
    public async Task RelayUrl_FallbackHierarchy_EvaluatesCorrectPrecedence()
    {
        var callId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        // 1. Explicit RelayUrl in payload takes highest precedence
        using (var db1 = CreateContext())
        {
            var sync1 = Substitute.For<ISyncNotificationService>();
            var cfg1 = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["LIVEKIT_URL"] = "wss://config-url.clinicez.internal"
            }).Build();

            var handler1 = new CommsCallStateChangedInteropHandler(
                db1, sync1, NullLogger<CommsCallStateChangedInteropHandler>.Instance, cfg1);

            var payload1 = new CommsCallStateChangedPayload(
                callId, null, "t", "f", CallKind.Teleconsult, "Admitted", "room", "tok", 1, DateTime.UtcNow,
                RelayUrl: "wss://payload-url.clinicez.internal");

            var env1 = InteropEnvelope.Create(
                InteropTypes.CommsCallStateChanged,
                Party.ForFacility("t", "f", FacilityType.Clinic),
                Party.ForPatient(patientId.ToString()),
                callId,
                payload1);

            await handler1.HandleAsync(payload1, new InteropMessageContext(env1), CancellationToken.None);

            await sync1.Received(1).NotifyCommsEventAsync(
                patientId,
                "CallStateChanged",
                Arg.Is<object>(o => (string?)o.GetType().GetProperty("relayUrl")!.GetValue(o) == "wss://payload-url.clinicez.internal"),
                Arg.Any<CancellationToken>());
        }

        // 2. Payload with null RelayUrl reuses cached RelayUrl
        using (var db2 = CreateContext())
        {
            var sync2 = Substitute.For<ISyncNotificationService>();
            var cfg2 = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["LIVEKIT_URL"] = "wss://config-url.clinicez.internal"
            }).Build();

            var handler2 = new CommsCallStateChangedInteropHandler(
                db2, sync2, NullLogger<CommsCallStateChangedInteropHandler>.Instance, cfg2);

            // Version 2 has RelayUrl = null
            var payload2 = new CommsCallStateChangedPayload(
                callId, null, "t", "f", CallKind.Teleconsult, "Admitted", "room", "tok", 2, DateTime.UtcNow,
                RelayUrl: null);

            var env2 = InteropEnvelope.Create(
                InteropTypes.CommsCallStateChanged,
                Party.ForFacility("t", "f", FacilityType.Clinic),
                Party.ForPatient(patientId.ToString()),
                callId,
                payload2);

            await handler2.HandleAsync(payload2, new InteropMessageContext(env2), CancellationToken.None);

            // Must use cached URL from previous call
            await sync2.Received(1).NotifyCommsEventAsync(
                patientId,
                "CallStateChanged",
                Arg.Is<object>(o => (string?)o.GetType().GetProperty("relayUrl")!.GetValue(o) == "wss://payload-url.clinicez.internal"),
                Arg.Any<CancellationToken>());
        }

        // 3. Brand new call with null RelayUrl falls back to configuration LIVEKIT_URL
        var brandNewCallId = Guid.NewGuid();
        using (var db3 = CreateContext())
        {
            var sync3 = Substitute.For<ISyncNotificationService>();
            var cfg3 = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["LIVEKIT_URL"] = "wss://config-fallback.clinicez.internal"
            }).Build();

            var handler3 = new CommsCallStateChangedInteropHandler(
                db3, sync3, NullLogger<CommsCallStateChangedInteropHandler>.Instance, cfg3);

            var payload3 = new CommsCallStateChangedPayload(
                brandNewCallId, null, "t", "f", CallKind.Teleconsult, "Admitted", "room", "tok", 1, DateTime.UtcNow,
                RelayUrl: null);

            var env3 = InteropEnvelope.Create(
                InteropTypes.CommsCallStateChanged,
                Party.ForFacility("t", "f", FacilityType.Clinic),
                Party.ForPatient(patientId.ToString()),
                brandNewCallId,
                payload3);

            await handler3.HandleAsync(payload3, new InteropMessageContext(env3), CancellationToken.None);

            await sync3.Received(1).NotifyCommsEventAsync(
                patientId,
                "CallStateChanged",
                Arg.Is<object>(o => (string?)o.GetType().GetProperty("relayUrl")!.GetValue(o) == "wss://config-fallback.clinicez.internal"),
                Arg.Any<CancellationToken>());
        }
    }
}
