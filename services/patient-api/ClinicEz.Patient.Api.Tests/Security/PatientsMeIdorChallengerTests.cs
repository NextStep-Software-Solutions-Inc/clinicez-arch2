using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http.Json;
using System.Threading;
using System.Threading.Tasks;
using FluentAssertions;
using NSubstitute;
using Xunit;
using ClinicEz.Patient.Api.Tests.Infrastructure;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Features.Patients.Queries.GetPatientMe;
using ClinicEz.Shared.Common;

namespace ClinicEz.Patient.Api.Tests.Security;

public sealed class PatientsMeIdorChallengerTests : IAsyncLifetime
{
    private PatientApiTestHost _host = null!;

    public async Task InitializeAsync()
    {
        _host = await PatientApiTestHost.StartAsync();
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    [Fact]
    public async Task GetPatientsMe_WhenAttackerInjectsVictimPatientIdOrClerkIdInQueryParams_StrictlyResolvesCallersIdentity()
    {
        // An attacker (user_attacker) tries to read victim's data by appending victimId or victimClerkId to query string
        var victimId = Guid.NewGuid();
        var victimClerkId = "user_victim_999";

        var attackerDto = new PatientMeDto(
            Id: Guid.NewGuid(),
            ClinicEzId: "CE-ATTACKER",
            FirstName: "Attacker",
            MiddleName: null,
            LastName: "User",
            Suffix: null,
            Sex: "Male",
            DateOfBirth: new DateOnly(1990, 1, 1),
            CivilStatus: "Single",
            ContactNumber: "+639171112233",
            Mobile: "+639171112233",
            Email: "attacker@example.com",
            Address: "Attacker Address",
            Addresses: new List<PatientAddressDto>(),
            PhilHealthPin: null,
            GovernmentIds: new List<PatientGovernmentIdDto>(),
            Allergies: new List<PatientAllergyDto>()
        );

        _host.Sender.Send(Arg.Is<GetPatientMeQuery>(q => q.ClerkUserId == "user_attacker"), Arg.Any<CancellationToken>())
            .Returns(attackerDto);

        var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"/api/v1/patients/me?patientId={victimId}&clerkUserId={victimClerkId}&id={victimId}");
        request.Headers.Add(PatientApiTestHost.UserHeader, "user_attacker");

        var response = await _host.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var envelope = await response.Content.ReadFromJsonAsync<ApiResponse<PatientMeDto>>();
        envelope.Should().NotBeNull();
        envelope!.Data!.ClinicEzId.Should().Be("CE-ATTACKER");

        // The query handler MUST have been called with user_attacker and NEVER with victim's identifiers
        await _host.Sender.Received(1).Send(
            Arg.Is<GetPatientMeQuery>(q => q.ClerkUserId == "user_attacker"),
            Arg.Any<CancellationToken>());
        await _host.Sender.DidNotReceive().Send(
            Arg.Is<GetPatientMeQuery>(q => q.ClerkUserId == victimClerkId),
            Arg.Any<CancellationToken>());
    }
}
