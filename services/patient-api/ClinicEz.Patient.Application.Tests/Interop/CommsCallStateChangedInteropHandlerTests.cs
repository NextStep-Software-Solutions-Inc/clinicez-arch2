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

public class CommsCallStateChangedInteropHandlerTests
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ISyncNotificationService _syncNotificationService;
    private readonly IConfiguration _configuration;
    private readonly CommsCallStateChangedInteropHandler _handler;

    public CommsCallStateChangedInteropHandlerTests()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        _dbContext = new ApplicationDbContext(options);
        _syncNotificationService = Substitute.For<ISyncNotificationService>();
        _configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["LIVEKIT_URL"] = "wss://media.clinicez.internal"
        }).Build();

        _handler = new CommsCallStateChangedInteropHandler(
            _dbContext,
            _syncNotificationService,
            NullLogger<CommsCallStateChangedInteropHandler>.Instance,
            _configuration);
    }

    [Fact]
    public async Task CallStateChanged_NewSession_CreatesSessionAndBroadcastsRelayUrl()
    {
        // Arrange
        var callId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var relayUrl = "wss://livekit.cloud.clinicez.internal";
        var roomName = $"call-{callId:N}";
        var joinToken = "jwt-patient-token";

        var payload = new CommsCallStateChangedPayload(
            CallId: callId,
            ConversationId: null,
            TenantId: "tenant-1",
            FacilityId: Guid.NewGuid().ToString(),
            Kind: CallKind.Teleconsult,
            Status: "Admitted",
            RoomName: roomName,
            JoinToken: joinToken,
            StateVersion: 1,
            ChangedAtUtc: DateTime.UtcNow,
            RelayUrl: relayUrl);

        var envelope = InteropEnvelope.Create(
            InteropTypes.CommsCallStateChanged,
            Party.ForFacility("tenant-1", "fac-1", FacilityType.Clinic),
            Party.ForPatient(patientId.ToString()),
            callId,
            payload);

        var context = new InteropMessageContext(envelope);

        // Act
        await _handler.HandleAsync(payload, context, CancellationToken.None);

        // Assert session created
        var session = await _dbContext.PatientCallSessions.FirstOrDefaultAsync(s => s.CallId == callId);
        session.Should().NotBeNull();
        session!.PatientId.Should().Be(patientId);
        session.Status.Should().Be("Admitted");
        session.RoomName.Should().Be(roomName);
        session.LiveKitToken.Should().Be(joinToken);
        session.StateVersion.Should().Be(1);

        // Assert SignalR broadcast with relayUrl
        await _syncNotificationService.Received(1).NotifyCommsEventAsync(
            patientId,
            "CallStateChanged",
            Arg.Is<object>(o =>
                o != null &&
                (string?)o.GetType().GetProperty("relayUrl")!.GetValue(o) == relayUrl &&
                (string?)o.GetType().GetProperty("status")!.GetValue(o) == "Admitted" &&
                (string?)o.GetType().GetProperty("roomName")!.GetValue(o) == roomName &&
                (string?)o.GetType().GetProperty("joinToken")!.GetValue(o) == joinToken),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task CallStateChanged_ExistingSession_UpdatesStateAndBroadcastsRelayUrl()
    {
        // Arrange
        var callId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var existing = new PatientCallSession
        {
            Id = Guid.NewGuid(),
            CallId = callId,
            PatientId = patientId,
            TenantId = "tenant-1",
            FacilityId = "fac-1",
            Status = "Admitted",
            RoomName = $"call-{callId:N}",
            LiveKitToken = "token-1",
            StateVersion = 1,
            CreatedAt = DateTime.UtcNow
        };
        _dbContext.PatientCallSessions.Add(existing);
        await _dbContext.SaveChangesAsync();

        var payload = new CommsCallStateChangedPayload(
            CallId: callId,
            ConversationId: null,
            TenantId: "tenant-1",
            FacilityId: "fac-1",
            Kind: CallKind.Teleconsult,
            Status: "Ended",
            RoomName: existing.RoomName,
            JoinToken: null,
            StateVersion: 2,
            ChangedAtUtc: DateTime.UtcNow,
            RelayUrl: "wss://custom.relay.url");

        var envelope = InteropEnvelope.Create(
            InteropTypes.CommsCallStateChanged,
            Party.ForFacility("tenant-1", "fac-1", FacilityType.Clinic),
            Party.ForPatient(patientId.ToString()),
            callId,
            payload);

        var context = new InteropMessageContext(envelope);

        // Act
        await _handler.HandleAsync(payload, context, CancellationToken.None);

        // Assert session updated
        var updated = await _dbContext.PatientCallSessions.FirstOrDefaultAsync(s => s.CallId == callId);
        updated.Should().NotBeNull();
        updated!.Status.Should().Be("Ended");
        updated.StateVersion.Should().Be(2);

        // Assert SignalR broadcast includes relayUrl
        await _syncNotificationService.Received(1).NotifyCommsEventAsync(
            patientId,
            "CallStateChanged",
            Arg.Is<object>(o =>
                o != null &&
                (string?)o.GetType().GetProperty("relayUrl")!.GetValue(o) == "wss://custom.relay.url" &&
                (string?)o.GetType().GetProperty("status")!.GetValue(o) == "Ended"),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task CallStateChanged_StaleVersion_IsIgnored()
    {
        // Arrange
        var callId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var existing = new PatientCallSession
        {
            Id = Guid.NewGuid(),
            CallId = callId,
            PatientId = patientId,
            TenantId = "tenant-1",
            FacilityId = "fac-1",
            Status = "InCall",
            RoomName = $"call-{callId:N}",
            LiveKitToken = "token-1",
            StateVersion = 3,
            CreatedAt = DateTime.UtcNow
        };
        _dbContext.PatientCallSessions.Add(existing);
        await _dbContext.SaveChangesAsync();

        var stalePayload = new CommsCallStateChangedPayload(
            CallId: callId,
            ConversationId: null,
            TenantId: "tenant-1",
            FacilityId: "fac-1",
            Kind: CallKind.Teleconsult,
            Status: "Admitted",
            RoomName: existing.RoomName,
            JoinToken: "token-stale",
            StateVersion: 2,
            ChangedAtUtc: DateTime.UtcNow,
            RelayUrl: "wss://custom.relay.url");

        var envelope = InteropEnvelope.Create(
            InteropTypes.CommsCallStateChanged,
            Party.ForFacility("tenant-1", "fac-1", FacilityType.Clinic),
            Party.ForPatient(patientId.ToString()),
            callId,
            stalePayload);

        var context = new InteropMessageContext(envelope);

        // Act
        await _handler.HandleAsync(stalePayload, context, CancellationToken.None);

        // Assert no update and no broadcast
        var current = await _dbContext.PatientCallSessions.FirstOrDefaultAsync(s => s.CallId == callId);
        current!.StateVersion.Should().Be(3);
        current.Status.Should().Be("InCall");
        await _syncNotificationService.DidNotReceiveWithAnyArgs().NotifyCommsEventAsync(default, default!, default!);
    }
}
