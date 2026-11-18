using System;
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

public class AdversarialPatientTeleconsultTests
{
    private ApplicationDbContext CreateInMemoryDb()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new ApplicationDbContext(options);
    }

    [Fact]
    public async Task CommsCallStateChanged_FallbackToLiveKitUrl_WhenMessageRelayUrlIsNull()
    {
        var db = CreateInMemoryDb();
        var syncService = Substitute.For<ISyncNotificationService>();
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["LIVEKIT_URL"] = "wss://env-configured.livekit.io"
        }).Build();

        var handler = new CommsCallStateChangedInteropHandler(
            db, syncService, NullLogger<CommsCallStateChangedInteropHandler>.Instance, config);

        var callId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var payload = new CommsCallStateChangedPayload(
            CallId: callId,
            ConversationId: null,
            TenantId: "tenant-1",
            FacilityId: Guid.NewGuid().ToString(),
            Kind: CallKind.Teleconsult,
            Status: "Admitted",
            RoomName: $"call-{callId:N}",
            JoinToken: "token-1",
            StateVersion: 1,
            ChangedAtUtc: DateTime.UtcNow,
            RelayUrl: null // No relayUrl in payload
        );

        var envelope = InteropEnvelope.Create(
            InteropTypes.CommsCallStateChanged,
            Party.ForFacility("tenant-1", "clinic-1", FacilityType.Clinic),
            Party.ForPatient(patientId.ToString()),
            callId,
            payload);

        await handler.HandleAsync(payload, new InteropMessageContext(envelope), CancellationToken.None);

        await syncService.Received(1).NotifyCommsEventAsync(
            patientId,
            "CallStateChanged",
            Arg.Is<object>(o =>
                (string?)o.GetType().GetProperty("relayUrl")!.GetValue(o) == "wss://env-configured.livekit.io"),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task CommsCallStateChanged_FallbackToInternalDefault_WhenNoConfiguredRelayUrl()
    {
        var db = CreateInMemoryDb();
        var syncService = Substitute.For<ISyncNotificationService>();
        // Empty configuration without LIVEKIT_URL
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>()).Build();

        var handler = new CommsCallStateChangedInteropHandler(
            db, syncService, NullLogger<CommsCallStateChangedInteropHandler>.Instance, config);

        var callId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var payload = new CommsCallStateChangedPayload(
            CallId: callId,
            ConversationId: null,
            TenantId: "tenant-1",
            FacilityId: Guid.NewGuid().ToString(),
            Kind: CallKind.Teleconsult,
            Status: "Admitted",
            RoomName: $"call-{callId:N}",
            JoinToken: "token-1",
            StateVersion: 1,
            ChangedAtUtc: DateTime.UtcNow,
            RelayUrl: null
        );

        var envelope = InteropEnvelope.Create(
            InteropTypes.CommsCallStateChanged,
            Party.ForFacility("tenant-1", "clinic-1", FacilityType.Clinic),
            Party.ForPatient(patientId.ToString()),
            callId,
            payload);

        await handler.HandleAsync(payload, new InteropMessageContext(envelope), CancellationToken.None);

        await syncService.Received(1).NotifyCommsEventAsync(
            patientId,
            "CallStateChanged",
            Arg.Is<object>(o =>
                (string?)o.GetType().GetProperty("relayUrl")!.GetValue(o) == "wss://media.clinicez.internal"),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task CommsCallStateChanged_InvalidRecipientParty_DropsMessageWithoutMutations()
    {
        var db = CreateInMemoryDb();
        var syncService = Substitute.For<ISyncNotificationService>();
        var handler = new CommsCallStateChangedInteropHandler(
            db, syncService, NullLogger<CommsCallStateChangedInteropHandler>.Instance);

        var callId = Guid.NewGuid();
        var payload = new CommsCallStateChangedPayload(
            CallId: callId,
            ConversationId: null,
            TenantId: "tenant-1",
            FacilityId: Guid.NewGuid().ToString(),
            Kind: CallKind.Teleconsult,
            Status: "Admitted",
            RoomName: $"call-{callId:N}",
            JoinToken: "token-1",
            StateVersion: 1,
            ChangedAtUtc: DateTime.UtcNow);

        // Recipient is Facility, not Patient!
        var envelope = InteropEnvelope.Create(
            InteropTypes.CommsCallStateChanged,
            Party.ForFacility("tenant-1", "clinic-1", FacilityType.Clinic),
            Party.ForFacility("tenant-1", "clinic-2", FacilityType.Clinic),
            callId,
            payload);

        await handler.HandleAsync(payload, new InteropMessageContext(envelope), CancellationToken.None);

        (await db.PatientCallSessions.AnyAsync()).Should().BeFalse("no session must be created for non-patient recipient");
        await syncService.DidNotReceiveWithAnyArgs().NotifyCommsEventAsync(default, default!, default!);
    }

    [Fact]
    public async Task CommsCallStateChanged_DuplicateSameStateVersion_DoesNotBroadcast()
    {
        var db = CreateInMemoryDb();
        var syncService = Substitute.For<ISyncNotificationService>();
        var handler = new CommsCallStateChangedInteropHandler(
            db, syncService, NullLogger<CommsCallStateChangedInteropHandler>.Instance);

        var callId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        db.PatientCallSessions.Add(new PatientCallSession
        {
            Id = Guid.NewGuid(),
            CallId = callId,
            PatientId = patientId,
            TenantId = "tenant-1",
            FacilityId = "fac-1",
            Status = "Admitted",
            RoomName = $"call-{callId:N}",
            LiveKitToken = "token-1",
            StateVersion = 2,
            CreatedAt = DateTime.UtcNow
        });
        await db.SaveChangesAsync();

        var payload = new CommsCallStateChangedPayload(
            CallId: callId,
            ConversationId: null,
            TenantId: "tenant-1",
            FacilityId: "fac-1",
            Kind: CallKind.Teleconsult,
            Status: "Admitted",
            RoomName: $"call-{callId:N}",
            JoinToken: "token-duplicate",
            StateVersion: 2, // Exactly same version
            ChangedAtUtc: DateTime.UtcNow);

        var envelope = InteropEnvelope.Create(
            InteropTypes.CommsCallStateChanged,
            Party.ForFacility("tenant-1", "fac-1", FacilityType.Clinic),
            Party.ForPatient(patientId.ToString()),
            callId,
            payload);

        await handler.HandleAsync(payload, new InteropMessageContext(envelope), CancellationToken.None);

        await syncService.DidNotReceiveWithAnyArgs().NotifyCommsEventAsync(default, default!, default!);
    }
}
