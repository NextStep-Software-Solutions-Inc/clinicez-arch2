using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using ClinicEz.Patient.Api.Tests.Infrastructure;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Features.DeviceSessions.Commands.RegisterDeviceSession;
using ClinicEz.Patient.Application.Features.DeviceSessions.Commands.RevokeAllDeviceSessions;
using ClinicEz.Patient.Application.Features.DeviceSessions.Commands.RevokeDeviceSession;
using ClinicEz.Patient.Application.Features.DeviceSessions.Queries.ListDeviceSessions;
using FluentAssertions;
using NSubstitute;

namespace ClinicEz.Patient.Api.Tests.Security;

/// <summary>The device-session endpoints: only the patient themself manages their devices, one device at a time or all at once.</summary>
public sealed class DeviceSessionEndpointTests : IAsyncLifetime
{
    private const string Owner = "user_owner";
    private const string Intruder = "user_intruder";

    private readonly Guid _patientId = Guid.NewGuid();
    private PatientApiTestHost _host = null!;

    public async Task InitializeAsync()
    {
        _host = await PatientApiTestHost.StartAsync();
        _host.Patients
            .IsOwnedByAsync(Arg.Any<Guid>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(call => call.ArgAt<Guid>(0) == _patientId && call.ArgAt<string>(1) == Owner);
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    public static TheoryData<string, string> Routes => new()
    {
        { "POST", "sessions" },
        { "GET", "sessions" },
        { "DELETE", "sessions" },
        { "DELETE", "sessions/{session}" }
    };

    private HttpRequestMessage Build(string method, string route, string? user)
    {
        var path = $"/api/v1/patients/{_patientId}/{route.Replace("{session}", Guid.NewGuid().ToString())}";
        var request = new HttpRequestMessage(new HttpMethod(method), path)
        {
            Content = method == "POST"
                ? JsonContent.Create(new { deviceId = "phone", deviceLabel = "Pixel", clerkSessionId = "sess_1" })
                : null
        };
        if (user is not null) request.Headers.Add(PatientApiTestHost.UserHeader, user);
        return request;
    }

    [Theory]
    [MemberData(nameof(Routes))]
    public async Task Another_user_is_forbidden_and_the_application_is_never_reached(string method, string route)
    {
        var response = await _host.Client.SendAsync(Build(method, route, Intruder));

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        _host.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Theory]
    [MemberData(nameof(Routes))]
    public async Task An_unauthenticated_caller_is_unauthorized(string method, string route)
    {
        var response = await _host.Client.SendAsync(Build(method, route, user: null));

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        _host.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task The_owner_registering_a_device_reaches_the_command()
    {
        _host.Sender
            .Send(Arg.Any<RegisterDeviceSessionCommand>(), Arg.Any<CancellationToken>())
            .Returns(new RegisterDeviceSessionResponse(Guid.NewGuid(), "phone", "Pixel", DateTime.UtcNow));

        var response = await _host.Client.SendAsync(Build("POST", "sessions", Owner));

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        await _host.Sender.Received(1).Send(
            Arg.Is<RegisterDeviceSessionCommand>(c =>
                c.PatientId == _patientId && c.DeviceId == "phone" && c.DeviceLabel == "Pixel" && c.ClerkSessionId == "sess_1"),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task The_owner_listing_devices_gets_them_with_camel_case_properties()
    {
        var sessionId = Guid.NewGuid();
        var seen = new DateTime(2026, 10, 9, 8, 0, 0, DateTimeKind.Utc);
        _host.Sender
            .Send(Arg.Is<ListDeviceSessionsQuery>(q => q.PatientId == _patientId), Arg.Any<CancellationToken>())
            .Returns(Task.FromResult<IReadOnlyList<DeviceSessionDto>>([new DeviceSessionDto(sessionId, "phone", "Pixel", seen, seen)]));

        var response = await _host.Client.SendAsync(Build("GET", "sessions", Owner));

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var device = body.RootElement.GetProperty("data")[0];
        device.GetProperty("id").GetGuid().Should().Be(sessionId);
        device.GetProperty("deviceId").GetString().Should().Be("phone");
        device.GetProperty("deviceLabel").GetString().Should().Be("Pixel");
    }

    [Fact]
    public async Task The_owner_revoking_one_device_reaches_the_command_with_that_session()
    {
        var sessionId = Guid.NewGuid();
        var request = new HttpRequestMessage(HttpMethod.Delete, $"/api/v1/patients/{_patientId}/sessions/{sessionId}");
        request.Headers.Add(PatientApiTestHost.UserHeader, Owner);

        var response = await _host.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
        await _host.Sender.Received(1).Send(
            Arg.Is<RevokeDeviceSessionCommand>(c => c.PatientId == _patientId && c.SessionId == sessionId),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task The_owner_signing_out_everywhere_reaches_the_revoke_all_command()
    {
        var response = await _host.Client.SendAsync(Build("DELETE", "sessions", Owner));

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
        await _host.Sender.Received(1).Send(
            Arg.Is<RevokeAllDeviceSessionsCommand>(c => c.PatientId == _patientId),
            Arg.Any<CancellationToken>());
    }
}
