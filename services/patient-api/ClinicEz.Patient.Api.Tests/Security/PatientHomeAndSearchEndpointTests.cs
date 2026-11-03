using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using NSubstitute;
using ClinicEz.Patient.Api.Tests.Infrastructure;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Features.Home;

namespace ClinicEz.Patient.Api.Tests.Security;

public sealed class PatientHomeAndSearchEndpointTests : IAsyncLifetime
{
    private PatientApiTestHost _host = null!;

    public async Task InitializeAsync() => _host = await PatientApiTestHost.StartAsync();

    public async Task DisposeAsync() => await _host.DisposeAsync();

    [Fact]
    public async Task HomeAndSearchRoutes_EnforceAuthentication_AndPatientOwnership()
    {
        var ownedPatientId = Guid.NewGuid();
        var foreignPatientId = Guid.NewGuid();

        _host.Patients.IsOwnedByAsync(ownedPatientId, "clerk_owner", Arg.Any<CancellationToken>())
            .Returns(true);
        _host.Patients.IsOwnedByAsync(foreignPatientId, "clerk_owner", Arg.Any<CancellationToken>())
            .Returns(false);

        // 1. Unauthenticated -> 401
        var unauthResp = await _host.Client.GetAsync($"/api/v1/patients/{ownedPatientId}/home-dashboard");
        unauthResp.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        // 2. Foreign patient -> 403 across all new Home & Search endpoints
        using var foreignDashboardReq = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/patients/{foreignPatientId}/home-dashboard");
        foreignDashboardReq.Headers.Add(PatientApiTestHost.UserHeader, "clerk_owner");
        (await _host.Client.SendAsync(foreignDashboardReq)).StatusCode.Should().Be(HttpStatusCode.Forbidden);

        using var foreignSearchReq = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/patients/{foreignPatientId}/search?q=cardio");
        foreignSearchReq.Headers.Add(PatientApiTestHost.UserHeader, "clerk_owner");
        (await _host.Client.SendAsync(foreignSearchReq)).StatusCode.Should().Be(HttpStatusCode.Forbidden);

        using var foreignStepReq = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/patients/{foreignPatientId}/welcome-steps/complete_profile");
        foreignStepReq.Headers.Add(PatientApiTestHost.UserHeader, "clerk_owner");
        (await _host.Client.SendAsync(foreignStepReq)).StatusCode.Should().Be(HttpStatusCode.Forbidden);

        // 3. Owned patient -> 200 OK and dispatches MediatR query
        _host.Sender.Send(Arg.Any<SearchPatientCatalogQuery>(), Arg.Any<CancellationToken>())
            .Returns(new PatientSearchResponseDto(
                "cardio",
                "all",
                new PatientSearchCountsDto(0, 0, 0, 0),
                [],
                [],
                []));

        using var ownedSearchReq = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/patients/{ownedPatientId}/search?q=cardio&category=all");
        ownedSearchReq.Headers.Add(PatientApiTestHost.UserHeader, "clerk_owner");
        var okResp = await _host.Client.SendAsync(ownedSearchReq);
        okResp.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task OwnedPatient_CanPostVitals_MedicationLog_WelcomeStep_AndAppointmentCheckIn()
    {
        var patientId = Guid.NewGuid();
        var medId = Guid.NewGuid();
        var apptId = Guid.NewGuid();

        _host.Patients.IsOwnedByAsync(patientId, "clerk_owner", Arg.Any<CancellationToken>())
            .Returns(true);

        _host.Sender.Send(Arg.Any<LogPatientVitalsCommand>(), Arg.Any<CancellationToken>())
            .Returns(new VitalSignsEntryDto(Guid.NewGuid(), DateTime.UtcNow, 72, 118, 76, 94m, 465, 130, "SelfLogged"));

        _host.Sender.Send(Arg.Any<LogMedicationIntakeCommand>(), Arg.Any<CancellationToken>())
            .Returns(new TodayMedicationScheduleItemDto(
                medId, "Lisinopril", "10mg", "Once daily", "Oral", "1 tablet with breakfast", "8:00 AM", true, DateTime.UtcNow, Guid.NewGuid()));

        _host.Sender.Send(Arg.Any<MarkWelcomeStepVisitedCommand>(), Arg.Any<CancellationToken>())
            .Returns(new WelcomeChecklistDto(["complete_profile"], 1, 2, false, true, false, false));

        _host.Sender.Send(Arg.Any<CheckInAppointmentCommand>(), Arg.Any<CancellationToken>())
            .Returns(new AppointmentCheckInResponseDto(apptId, DateTime.UtcNow, "Confirmed", "Metro Cardiology Center", "Dr. Evelyn Reed, MD"));

        using var vitalsReq = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/patients/{patientId}/vitals")
        {
            Content = JsonContent.Create(new LogPatientVitalsRequestDto(72, 118, 76, 94m, 465, 130, "SelfLogged", null))
        };
        vitalsReq.Headers.Add(PatientApiTestHost.UserHeader, "clerk_owner");
        (await _host.Client.SendAsync(vitalsReq)).StatusCode.Should().Be(HttpStatusCode.Created);

        using var medLogReq = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/patients/{patientId}/medications/{medId}/log")
        {
            Content = JsonContent.Create(new LogMedicationIntakeRequestDto("8:00 AM", null, null))
        };
        medLogReq.Headers.Add(PatientApiTestHost.UserHeader, "clerk_owner");
        (await _host.Client.SendAsync(medLogReq)).StatusCode.Should().Be(HttpStatusCode.OK);

        using var stepReq = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/patients/{patientId}/welcome-steps/complete_profile");
        stepReq.Headers.Add(PatientApiTestHost.UserHeader, "clerk_owner");
        (await _host.Client.SendAsync(stepReq)).StatusCode.Should().Be(HttpStatusCode.OK);

        using var checkInReq = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/patients/{patientId}/appointments/{apptId}/check-in");
        checkInReq.Headers.Add(PatientApiTestHost.UserHeader, "clerk_owner");
        (await _host.Client.SendAsync(checkInReq)).StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
