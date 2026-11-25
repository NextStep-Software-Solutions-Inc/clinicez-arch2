using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using ClinicEz.Patient.Api.Tests.Infrastructure;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Features.BookingDrafts.Commands.CreateBookingDraft;
using ClinicEz.Patient.Application.Features.BookingDrafts.Commands.SubmitBookingDraft;
using ClinicEz.Patient.Application.Features.Home;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;

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
            .Returns(new DirectorySearchResponseDto(
                "cardio",
                "all",
                new DirectorySearchCountsDto(0, 0, 0, 0),
                [],
                [],
                []));

        using var ownedSearchReq = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/patients/{ownedPatientId}/search?q=cardio&category=all");
        ownedSearchReq.Headers.Add(PatientApiTestHost.UserHeader, "clerk_owner");
        var okResp = await _host.Client.SendAsync(ownedSearchReq);
        okResp.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task DirectorySearch_And_PractitionerProfile_SupportAnonymousPublicQueries_AndGuardForPatientId()
    {
        var ownedPatientId = Guid.NewGuid();
        var foreignPatientId = Guid.NewGuid();
        var practitionerId = Guid.NewGuid();

        _host.Patients.IsOwnedByAsync(ownedPatientId, "clerk_owner", Arg.Any<CancellationToken>())
            .Returns(true);
        _host.Patients.IsOwnedByAsync(foreignPatientId, "clerk_owner", Arg.Any<CancellationToken>())
            .Returns(false);

        _host.Sender.Send(Arg.Any<SearchDirectoryQuery>(), Arg.Any<CancellationToken>())
            .Returns(new DirectorySearchResponseDto(
                "cardio",
                "all",
                new DirectorySearchCountsDto(0, 0, 0, 0),
                [],
                [],
                []));

        // Anonymous public directory search -> 200 OK
        var anonSearch = await _host.Client.GetAsync("/api/v1/directory/search?q=cardio&category=all");
        anonSearch.StatusCode.Should().Be(HttpStatusCode.OK);

        // forPatientId without auth -> 401
        var unauthForPatient = await _host.Client.GetAsync($"/api/v1/directory/search?forPatientId={ownedPatientId}");
        unauthForPatient.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        // forPatientId foreign -> 403
        using var foreignForPatientReq = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/directory/search?forPatientId={foreignPatientId}");
        foreignForPatientReq.Headers.Add(PatientApiTestHost.UserHeader, "clerk_owner");
        (await _host.Client.SendAsync(foreignForPatientReq)).StatusCode.Should().Be(HttpStatusCode.Forbidden);

        // forPatientId owned -> 200 OK
        using var ownedForPatientReq = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/directory/search?forPatientId={ownedPatientId}");
        ownedForPatientReq.Headers.Add(PatientApiTestHost.UserHeader, "clerk_owner");
        (await _host.Client.SendAsync(ownedForPatientReq)).StatusCode.Should().Be(HttpStatusCode.OK);

        // Practitioner profile found -> 200 OK; missing -> 404 NotFound
        _host.Sender.Send(Arg.Is<GetPractitionerProfileQuery>(q => q.Id == practitionerId), Arg.Any<CancellationToken>())
            .Returns(new PractitionerProfileDto(
                practitionerId,
                practitionerId,
                "Dr. Maria Santos",
                "Maria",
                "Santos",
                "Doctor",
                "Cardiology",
                "Fellow",
                null,
                "PRC-0012345",
                null,
                PractitionerVerificationLevel.Verified,
                true,
                DateTime.UtcNow,
                []));

        var profileOk = await _host.Client.GetAsync($"/api/v1/practitioners/{practitionerId}");
        profileOk.StatusCode.Should().Be(HttpStatusCode.OK);

        var missingId = Guid.NewGuid();
        _host.Sender.Send(Arg.Is<GetPractitionerProfileQuery>(q => q.Id == missingId), Arg.Any<CancellationToken>())
            .Returns((PractitionerProfileDto?)null);
        var profileNotFound = await _host.Client.GetAsync($"/api/v1/practitioners/{missingId}");
        profileNotFound.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task BookingDraftEndpoints_BindProviderId_AndReturn409WhenBookingPaused()
    {
        var patientId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        var providerId = Guid.NewGuid();
        var draftId = Guid.NewGuid();

        _host.Patients.IsOwnedByAsync(patientId, "clerk_owner", Arg.Any<CancellationToken>())
            .Returns(true);

        _host.Sender.Send(
                Arg.Is<CreateBookingDraftCommand>(c => c.ProviderId == providerId && c.ProviderName == "Dr. Maria Santos"),
                Arg.Any<CancellationToken>())
            .Returns(draftId);

        using var createOkReq = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/patients/{patientId}/booking-drafts")
        {
            Content = JsonContent.Create(new
            {
                clinicId,
                shareFieldsJson = "[]",
                attachedFileIdsJson = "[]",
                providerId,
                providerName = "Dr. Maria Santos"
            })
        };
        createOkReq.Headers.Add(PatientApiTestHost.UserHeader, "clerk_owner");
        (await _host.Client.SendAsync(createOkReq)).StatusCode.Should().Be(HttpStatusCode.Created);

        // Booking paused ConflictException -> HTTP 409
        var pausedClinicId = Guid.NewGuid();
        _host.Sender.Send(
                Arg.Is<CreateBookingDraftCommand>(c => c.ClinicId == pausedClinicId),
                Arg.Any<CancellationToken>())
            .ThrowsAsync(new ConflictException("Online booking is currently paused for this clinic."));

        using var createPausedReq = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/patients/{patientId}/booking-drafts")
        {
            Content = JsonContent.Create(new
            {
                clinicId = pausedClinicId,
                shareFieldsJson = "[]",
                attachedFileIdsJson = "[]"
            })
        };
        createPausedReq.Headers.Add(PatientApiTestHost.UserHeader, "clerk_owner");
        var createPausedResp = await _host.Client.SendAsync(createPausedReq);
        createPausedResp.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await createPausedResp.Content.ReadAsStringAsync()).Should().Contain("Online booking is currently paused for this clinic.");

        _host.Sender.Send(
                Arg.Is<SubmitBookingDraftCommand>(c => c.DraftId == draftId),
                Arg.Any<CancellationToken>())
            .ThrowsAsync(new ConflictException("Online booking is currently paused for this clinic."));

        using var submitPausedReq = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/patients/{patientId}/booking-drafts/{draftId}/submit");
        submitPausedReq.Headers.Add(PatientApiTestHost.UserHeader, "clerk_owner");
        var submitPausedResp = await _host.Client.SendAsync(submitPausedReq);
        submitPausedResp.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await submitPausedResp.Content.ReadAsStringAsync()).Should().Contain("Online booking is currently paused for this clinic.");

        // Past-schedule ValidationException -> HTTP 400
        var pastClinicId = Guid.NewGuid();
        _host.Sender.Send(
                Arg.Is<CreateBookingDraftCommand>(c => c.ClinicId == pastClinicId),
                Arg.Any<CancellationToken>())
            .ThrowsAsync(new ValidationException(
                "Cannot schedule an appointment for a time that has already passed.",
                new Dictionary<string, string[]>
                {
                    ["ScheduledAt"] = ["Cannot schedule an appointment for a time that has already passed."]
                }));

        using var createPastReq = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/patients/{patientId}/booking-drafts")
        {
            Content = JsonContent.Create(new
            {
                clinicId = pastClinicId,
                preferredDate = "2026-11-25",
                preferredTime = "09:00",
                shareFieldsJson = "[]",
                attachedFileIdsJson = "[]"
            })
        };
        createPastReq.Headers.Add(PatientApiTestHost.UserHeader, "clerk_owner");
        var createPastResp = await _host.Client.SendAsync(createPastReq);
        createPastResp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await createPastResp.Content.ReadAsStringAsync()).Should().Contain("Cannot schedule an appointment for a time that has already passed.");

        var expiredDraftId = Guid.NewGuid();
        _host.Sender.Send(
                Arg.Is<SubmitBookingDraftCommand>(c => c.DraftId == expiredDraftId),
                Arg.Any<CancellationToken>())
            .ThrowsAsync(new ValidationException(
                "Cannot schedule an appointment for a time that has already passed.",
                new Dictionary<string, string[]>
                {
                    ["ScheduledAt"] = ["Cannot schedule an appointment for a time that has already passed."]
                }));

        using var submitPastReq = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/patients/{patientId}/booking-drafts/{expiredDraftId}/submit");
        submitPastReq.Headers.Add(PatientApiTestHost.UserHeader, "clerk_owner");
        var submitPastResp = await _host.Client.SendAsync(submitPastReq);
        submitPastResp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await submitPastResp.Content.ReadAsStringAsync()).Should().Contain("Cannot schedule an appointment for a time that has already passed.");
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
