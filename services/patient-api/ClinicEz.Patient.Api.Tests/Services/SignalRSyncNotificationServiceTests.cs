using ClinicEz.Patient.Api.Hubs;
using ClinicEz.Patient.Api.Services;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Interfaces;
using FluentAssertions;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.DependencyInjection;
using NSubstitute;

namespace ClinicEz.Patient.Api.Tests.Services;

/// <summary>Real-time and push notifications reach every device of the patient, and a single-device revoke reaches only that device.</summary>
public sealed class SignalRSyncNotificationServiceTests
{
    private readonly Guid _patientId = Guid.NewGuid();
    private readonly IHubClients _clients = Substitute.For<IHubClients>();
    private readonly IClientProxy _proxy = Substitute.For<IClientProxy>();
    private readonly IPushNotificationService _push = Substitute.For<IPushNotificationService>();
    private readonly IDeviceSessionRepository _sessions = Substitute.For<IDeviceSessionRepository>();
    private readonly SignalRSyncNotificationService _service;

    public SignalRSyncNotificationServiceTests()
    {
        var hub = Substitute.For<IHubContext<SyncHub>>();
        hub.Clients.Returns(_clients);
        _clients.Group(Arg.Any<string>()).Returns(_proxy);

        var provider = new ServiceCollection().AddSingleton(_sessions).BuildServiceProvider();
        _service = new SignalRSyncNotificationService(hub, _push, provider);
    }

    private static DeviceSession Session(string deviceId, string? pushToken) =>
        new() { DeviceId = deviceId, PushToken = pushToken };

    [Fact]
    public async Task A_completed_sync_pushes_to_every_distinct_device_token_and_skips_devices_without_one()
    {
        _sessions.GetActiveByPatientIdAsync(_patientId, Arg.Any<CancellationToken>()).Returns(
        [
            Session("phone", "token-phone"),
            Session("tablet", "token-tablet"),
            Session("tablet-again", "token-tablet"),
            Session("laptop", null),
            Session("web", " ")
        ]);

        await _service.NotifySyncCompletedAsync(_patientId, 2, 0);

        _clients.Received(1).Group(SyncHub.PatientGroup(_patientId));
        await _push.Received(1).SendPushNotificationAsync("token-phone", Arg.Any<string>(), Arg.Any<string>(), "sync_ready", Arg.Any<CancellationToken>());
        await _push.Received(1).SendPushNotificationAsync("token-tablet", Arg.Any<string>(), Arg.Any<string>(), "sync_ready", Arg.Any<CancellationToken>());
        await _push.ReceivedWithAnyArgs(2).SendPushNotificationAsync(default!, default!, default!, default!, default);
    }

    [Fact]
    public async Task Revoking_every_session_notifies_the_whole_patient_group()
    {
        await _service.NotifySessionRevokedAsync(_patientId, "bye");

        _clients.Received(1).Group(SyncHub.PatientGroup(_patientId));
        _clients.DidNotReceive().Group(SyncHub.DeviceGroup(_patientId, "phone"));
    }

    [Fact]
    public async Task Revoking_one_device_notifies_only_that_devices_group()
    {
        await _service.NotifySessionRevokedAsync(_patientId, "bye", "phone");

        _clients.Received(1).Group(SyncHub.DeviceGroup(_patientId, "phone"));
        _clients.DidNotReceive().Group(SyncHub.PatientGroup(_patientId));
    }

    [Fact]
    public void Device_groups_are_distinct_per_patient_and_device()
    {
        SyncHub.DeviceGroup(_patientId, "phone").Should().NotBe(SyncHub.DeviceGroup(_patientId, "tablet"));
        SyncHub.DeviceGroup(_patientId, "phone").Should().NotBe(SyncHub.DeviceGroup(Guid.NewGuid(), "phone"));
    }
}
