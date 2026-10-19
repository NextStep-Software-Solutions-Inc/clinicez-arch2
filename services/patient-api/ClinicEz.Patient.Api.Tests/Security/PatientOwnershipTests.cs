using System.Net;
using System.Net.Http.Json;
using ClinicEz.Patient.Api.Tests.Infrastructure;
using ClinicEz.Patient.Application.Features.Appointments.Queries.GetAvailableSlots;
using FluentAssertions;
using NSubstitute;

namespace ClinicEz.Patient.Api.Tests.Security;

/// <summary>Object-level authorisation: a caller can only reach their own patient record.</summary>
public sealed class PatientOwnershipTests : IAsyncLifetime
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

    private Task<HttpResponseMessage> GetAsync(string path, string? user)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        if (user is not null) request.Headers.Add(PatientApiTestHost.UserHeader, user);
        return _host.Client.SendAsync(request);
    }

    [Fact]
    public async Task FullRecord_ForOwner_IsServed()
    {
        var response = await GetAsync($"/api/v1/patients/{_patientId}/full-record", Owner);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task FullRecord_ForAnotherUser_IsForbiddenAndNeverQueried()
    {
        var response = await GetAsync($"/api/v1/patients/{_patientId}/full-record", Intruder);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        _host.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task FullRecord_ForUnknownPatient_IsForbiddenLikeAForeignOne()
    {
        var response = await GetAsync($"/api/v1/patients/{Guid.NewGuid()}/full-record", Owner);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        _host.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task FullRecord_WithoutAuthentication_IsUnauthorized()
    {
        var response = await GetAsync($"/api/v1/patients/{_patientId}/full-record", user: null);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        _host.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Theory]
    [InlineData("/api/v1/patients/{0}/appointments")]
    [InlineData("/api/v1/patients/{0}/files/config")]
    public async Task PatientIdInRoute_ForAnotherUser_IsForbidden(string template)
    {
        var path = string.Format(template, _patientId);

        (await GetAsync(path, Intruder)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await GetAsync(path, Owner)).StatusCode.Should().NotBe(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task DatabaseBackedPatientRoute_ForAnotherUser_IsForbiddenBeforeTheDatabaseIsTouched()
    {
        var response = await GetAsync($"/api/v1/patients/{_patientId}/addresses", Intruder);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task PostWithPatientIdInRoute_ForAnotherUser_IsForbidden()
    {
        var request = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/patients/{_patientId}/booking-drafts/{Guid.NewGuid()}/submit");
        request.Headers.Add(PatientApiTestHost.UserHeader, Intruder);

        var response = await _host.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        _host.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task ByClerk_OwnIdentity_IsAllowed()
    {
        var response = await GetAsync($"/api/v1/patients/by-clerk/{Owner}", Owner);

        response.StatusCode.Should().NotBe(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task ByClerk_OtherIdentity_IsForbidden()
    {
        var response = await GetAsync($"/api/v1/patients/by-clerk/{Owner}", Intruder);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        _host.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task ClinicSearch_ForeignForPatientId_IsForbidden()
    {
        var response = await GetAsync($"/api/v1/clinics?forPatientId={_patientId}", Intruder);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        _host.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task ClinicSearch_OwnForPatientId_IsAllowed()
    {
        var response = await GetAsync($"/api/v1/clinics?forPatientId={_patientId}", Owner);

        response.StatusCode.Should().NotBe(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task CreatePatient_ForADifferentClerkUser_IsForbidden()
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/patients")
        {
            Content = JsonContent.Create(new { clerkUserId = Owner, firstName = "Ana", lastName = "Cruz" })
        };
        request.Headers.Add(PatientApiTestHost.UserHeader, Intruder);

        var response = await _host.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        _host.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task GetAvailableSlots_WithOwnForPatientId_BindsParameterAndDispatchesQuery()
    {
        var clinicId = Guid.NewGuid();
        var providerId = Guid.NewGuid();
        var date = new DateOnly(2026, 10, 20);

        var response = await GetAsync(
            $"/api/v1/clinics/{clinicId}/providers/{providerId}/slots?date={date:yyyy-MM-dd}&forPatientId={_patientId}", Owner);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        await _host.Sender.Received(1).Send(
            Arg.Is<GetAvailableSlotsQuery>(q =>
                q.ClinicId == clinicId &&
                q.ProviderId == providerId &&
                q.Date == date &&
                q.ForPatientId == _patientId),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task GetAvailableSlots_WithForeignForPatientId_IsForbiddenAndNeverQueried()
    {
        var clinicId = Guid.NewGuid();
        var providerId = Guid.NewGuid();
        var date = new DateOnly(2026, 10, 20);

        var response = await GetAsync(
            $"/api/v1/clinics/{clinicId}/providers/{providerId}/slots?date={date:yyyy-MM-dd}&forPatientId={_patientId}", Intruder);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        _host.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task GetAvailableSlots_WithoutForPatientId_DispatchesQueryWithNullPatientId()
    {
        var clinicId = Guid.NewGuid();
        var providerId = Guid.NewGuid();
        var date = new DateOnly(2026, 10, 20);

        var response = await GetAsync(
            $"/api/v1/clinics/{clinicId}/providers/{providerId}/slots?date={date:yyyy-MM-dd}", Owner);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        await _host.Sender.Received(1).Send(
            Arg.Is<GetAvailableSlotsQuery>(q =>
                q.ClinicId == clinicId &&
                q.ProviderId == providerId &&
                q.Date == date &&
                q.ForPatientId == null),
            Arg.Any<CancellationToken>());
    }
}
