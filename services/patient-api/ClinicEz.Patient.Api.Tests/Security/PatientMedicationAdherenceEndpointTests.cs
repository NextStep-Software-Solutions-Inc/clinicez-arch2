using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Api.Tests.Infrastructure;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Features.Patients.Commands.LogMedicationAdherence;
using ClinicEz.Patient.Application.Features.Patients.Queries.GetTodayMedications;
using ClinicEz.Shared.Common;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Patient.Api.Tests.Security;

public sealed class PatientMedicationAdherenceEndpointTests : IAsyncLifetime
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
    public async Task GetTodayMedications_WhenOwner_Returns200WithMedications()
    {
        var meds = new List<TodayMedicationDto>
        {
            new(Guid.NewGuid(), "Lisinopril", "10mg", "1 tablet with breakfast", "8:00 AM", true, DateTime.UtcNow),
            new(Guid.NewGuid(), "Omega-3 DHA", "1000mg", "1 softgel after dinner", "7:00 PM", false, null)
        };

        _host.Sender.Send(Arg.Is<GetTodayMedicationsQuery>(q => q.PatientId == _patientId), Arg.Any<CancellationToken>())
            .Returns(meds);

        var req = Build("GET", "medications/today", Owner);
        var res = await _host.Client.SendAsync(req);

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var payload = await res.Content.ReadFromJsonAsync<ApiResponse<IReadOnlyList<TodayMedicationDto>>>();
        payload.Should().NotBeNull();
        payload!.Succeeded.Should().BeTrue();
        payload.Data.Should().HaveCount(2);
        payload.Data![0].MedicationName.Should().Be("Lisinopril");
        payload.Data[0].IsTaken.Should().BeTrue();
        payload.Data[1].IsTaken.Should().BeFalse();
    }

    [Fact]
    public async Task GetTodayMedications_WhenIntruder_Returns403()
    {
        var req = Build("GET", "medications/today", Intruder);
        var res = await _host.Client.SendAsync(req);

        res.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task LogMedication_WhenOwner_Returns200Success()
    {
        var medicationId = Guid.NewGuid();
        _host.Sender.Send(
            Arg.Is<LogMedicationAdherenceCommand>(c => c.PatientId == _patientId && c.MedicationId == medicationId),
            Arg.Any<CancellationToken>())
            .Returns(true);

        var logReq = new LogMedicationAdherenceRequest(DateTime.UtcNow, "Taken with breakfast");
        var req = Build("POST", $"medications/{medicationId}/log", Owner, JsonContent.Create(logReq));
        var res = await _host.Client.SendAsync(req);

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var payload = await res.Content.ReadFromJsonAsync<ApiResponse<bool>>();
        payload.Should().NotBeNull();
        payload!.Succeeded.Should().BeTrue();
        payload.Data.Should().BeTrue();
    }

    [Fact]
    public async Task LogMedication_WhenIntruder_Returns403()
    {
        var medicationId = Guid.NewGuid();
        var req = Build("POST", $"medications/{medicationId}/log", Intruder, JsonContent.Create(new LogMedicationAdherenceRequest()));
        var res = await _host.Client.SendAsync(req);

        res.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
}
