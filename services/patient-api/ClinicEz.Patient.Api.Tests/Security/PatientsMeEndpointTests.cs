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

public sealed class PatientsMeEndpointTests : IAsyncLifetime
{
    private PatientApiTestHost _host = null!;

    public async Task InitializeAsync()
    {
        _host = await PatientApiTestHost.StartAsync();
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    private Task<HttpResponseMessage> GetAsync(string path, string? user)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        if (user is not null)
            request.Headers.Add(PatientApiTestHost.UserHeader, user);

        return _host.Client.SendAsync(request);
    }

    [Fact]
    public async Task GetPatientsMe_WhenUnauthenticated_ReturnsUnauthorized()
    {
        var response = await GetAsync("/api/v1/patients/me", user: null);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        _host.Sender.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task GetPatientsMe_WhenNoLinkedPatient_ReturnsNotFound()
    {
        _host.Sender.Send(Arg.Any<GetPatientMeQuery>(), Arg.Any<CancellationToken>())
            .Returns((PatientMeDto?)null);

        var response = await GetAsync("/api/v1/patients/me", user: "user_unlinked");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        await _host.Sender.Received(1).Send(
            Arg.Is<GetPatientMeQuery>(q => q.ClerkUserId == "user_unlinked"),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task GetPatientsMe_WhenLinkedPatient_Returns200WithDataMinimizedAutofill()
    {
        var expectedDto = new PatientMeDto(
            Id: Guid.NewGuid(),
            ClinicEzId: "CE-AUTO-FILL",
            FirstName: "Maria",
            MiddleName: "Clara",
            LastName: "Santos",
            Suffix: null,
            Sex: "Female",
            DateOfBirth: new DateOnly(1995, 5, 12),
            CivilStatus: "Single",
            ContactNumber: "+639170001122",
            Mobile: "+639170001122",
            Email: "maria.clara@example.com",
            Address: "123 Mabini St, Malate, Manila, Metro Manila, 1004",
            Addresses: new List<PatientAddressDto>
            {
                new(Guid.NewGuid(), Guid.NewGuid(), "Home", "123 Mabini St", "Malate", "Manila", "Metro Manila", "NCR", "1004", "Philippines", true, DateTime.UtcNow)
            },
            PhilHealthPin: "12-345678901-2",
            GovernmentIds: new List<PatientGovernmentIdDto>
            {
                new(Guid.NewGuid(), Guid.NewGuid(), "PHILHEALTH", "12-345678901-2", null, null, DateTime.UtcNow)
            },
            Allergies: new List<PatientAllergyDto>
            {
                new(Guid.NewGuid(), Guid.NewGuid(), "Amoxicillin", "Medication", "Severe", "Rash", null, null, DateTime.UtcNow)
            }
        );

        _host.Sender.Send(Arg.Any<GetPatientMeQuery>(), Arg.Any<CancellationToken>())
            .Returns(expectedDto);

        var response = await GetAsync("/api/v1/patients/me", user: "user_linked_123");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var envelope = await response.Content.ReadFromJsonAsync<ApiResponse<PatientMeDto>>();
        envelope.Should().NotBeNull();
        envelope!.Succeeded.Should().BeTrue();
        envelope.Data.Should().NotBeNull();
        envelope.Data!.ClinicEzId.Should().Be("CE-AUTO-FILL");
        envelope.Data.FirstName.Should().Be("Maria");
        envelope.Data.LastName.Should().Be("Santos");
        envelope.Data.Address.Should().Be("123 Mabini St, Malate, Manila, Metro Manila, 1004");
        envelope.Data.PhilHealthPin.Should().Be("12-345678901-2");
        envelope.Data.Allergies.Should().HaveCount(1);
    }
}
