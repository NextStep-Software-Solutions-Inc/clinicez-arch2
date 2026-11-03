using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Api.Tests.Infrastructure;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Features.Patients.Commands.RecordPatientVitals;
using ClinicEz.Patient.Application.Features.Patients.Queries.GetLatestVitals;
using ClinicEz.Patient.Application.Features.Patients.Queries.GetPatientVitals;
using ClinicEz.Shared.Common;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Patient.Api.Tests.Security;

public sealed class PatientVitalsEndpointTests : IAsyncLifetime
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

    private HttpRequestMessage Build(string method, string relativePath, string? user, HttpContent? content = null)
    {
        var path = $"/api/v1/patients/{_patientId}/{relativePath}";
        var req = new HttpRequestMessage(new HttpMethod(method), path) { Content = content };
        if (user is not null) req.Headers.Add(PatientApiTestHost.UserHeader, user);
        return req;
    }

    [Fact]
    public async Task GetLatestVitals_WhenOwner_Returns200WithTelemetry()
    {
        var expected = new LatestVitalsDto(
            72, "+2 bpm", 118, 76, "Optimal", 94m, "Fasting", 7.75m, "7h 45m", "2h 10m", DateTime.UtcNow);

        _host.Sender.Send(Arg.Is<GetLatestVitalsQuery>(q => q.PatientId == _patientId), Arg.Any<CancellationToken>())
            .Returns(expected);

        var req = Build("GET", "vitals/latest", Owner);
        var res = await _host.Client.SendAsync(req);

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var payload = await res.Content.ReadFromJsonAsync<ApiResponse<LatestVitalsDto>>();
        payload.Should().NotBeNull();
        payload!.Succeeded.Should().BeTrue();
        payload.Data.Should().NotBeNull();
        payload.Data!.HeartRateBpm.Should().Be(72);
        payload.Data.BpCategory.Should().Be("Optimal");
        payload.Data.GlucoseCategory.Should().Be("Fasting");
        payload.Data.SleepFormatted.Should().Be("7h 45m");
    }

    [Fact]
    public async Task GetLatestVitals_WhenIntruder_Returns403()
    {
        var req = Build("GET", "vitals/latest", Intruder);
        var res = await _host.Client.SendAsync(req);

        res.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task GetRecentVitals_WhenOwner_Returns200WithList()
    {
        var vitals = new List<VitalSignsDto>
        {
            new(Guid.NewGuid(), _patientId, null, null, DateTime.UtcNow, 70m, 175m, 22.86m, 120, 80, 72, 36.8m, 98.5m, 16, 94m, null, null, DateTime.UtcNow, null, 94m, 8m)
        };

        _host.Sender.Send(Arg.Is<GetPatientVitalsQuery>(q => q.PatientId == _patientId), Arg.Any<CancellationToken>())
            .Returns(vitals);

        var req = Build("GET", "vitals?take=10", Owner);
        var res = await _host.Client.SendAsync(req);

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var payload = await res.Content.ReadFromJsonAsync<ApiResponse<IReadOnlyList<VitalSignsDto>>>();
        payload.Should().NotBeNull();
        payload!.Succeeded.Should().BeTrue();
        payload.Data.Should().HaveCount(1);
    }

    [Fact]
    public async Task RecordVitals_WhenOwner_Returns201Created()
    {
        var request = new RecordPatientVitalsRequest(
            null, null, DateTime.UtcNow, null, null, null, 118, 76, 72, null, null, null, null, null, null, 94m, 7.75m);

        var created = new VitalSignsDto(
            Guid.NewGuid(), _patientId, null, null, DateTime.UtcNow, null, null, null, 118, 76, 72, null, null, null, 94m, null, null, DateTime.UtcNow, null, 94m, 7.75m);

        _host.Sender.Send(Arg.Is<RecordPatientVitalsCommand>(c => c.PatientId == _patientId), Arg.Any<CancellationToken>())
            .Returns(created);

        var req = Build("POST", "vitals", Owner, JsonContent.Create(request));
        var res = await _host.Client.SendAsync(req);

        res.StatusCode.Should().Be(HttpStatusCode.Created);
        var payload = await res.Content.ReadFromJsonAsync<ApiResponse<VitalSignsDto>>();
        payload.Should().NotBeNull();
        payload!.Succeeded.Should().BeTrue();
        payload.Data!.HeartRateBpm.Should().Be(72);
    }
}
