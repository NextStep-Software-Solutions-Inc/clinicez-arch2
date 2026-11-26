using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Api.Endpoints.Clinics;
using ClinicEz.Patient.Api.Tests.Infrastructure;
using ClinicEz.Patient.Application.Features.Clinics.Commands.RequestClinicLink;
using ClinicEz.Shared.Common;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Patient.Api.Tests.Security;

using PatientEntity = ClinicEz.Patient.Domain.Entities.Patient;

public sealed class RequestClinicLinkEndpointTests : IAsyncLifetime
{
    private PatientApiTestHost _host = null!;

    public async Task InitializeAsync()
    {
        _host = await PatientApiTestHost.StartAsync();
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    [Fact]
    public async Task RequestClinicLink_WhenPatientProfileNotFound_Returns404FailEnvelope()
    {
        var clinicId = Guid.NewGuid();
        _host.Patients.GetByClerkUserIdAsync("user_no_profile", Arg.Any<CancellationToken>())
            .Returns((PatientEntity?)null);

        var req = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/clinics/{clinicId}/link-request")
        {
            Content = JsonContent.Create(new RequestClinicLinkRequest(true, true, true))
        };
        req.Headers.Add(PatientApiTestHost.UserHeader, "user_no_profile");

        var response = await _host.Client.SendAsync(req);

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        var envelope = await response.Content.ReadFromJsonAsync<ApiResponse<object>>();
        envelope.Should().NotBeNull();
        envelope!.Succeeded.Should().BeFalse();
        envelope.Message.Should().Contain("Patient profile not found");
        await _host.Sender.DidNotReceiveWithAnyArgs().Send(Arg.Any<RequestClinicLinkCommand>(), default);
    }

    [Fact]
    public async Task RequestClinicLink_WhenPatientExists_Returns202AcceptedWithLinkRequestId()
    {
        var clinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var linkReqId = Guid.NewGuid();

        _host.Patients.GetByClerkUserIdAsync("user_valid_link", Arg.Any<CancellationToken>())
            .Returns(new PatientEntity
            {
                Id = patientId,
                ClerkUserId = "user_valid_link",
                FirstName = "Ana",
                LastName = "Reyes"
            });
        _host.Sender.Send(Arg.Any<RequestClinicLinkCommand>(), Arg.Any<CancellationToken>())
            .Returns(linkReqId);

        var req = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/clinics/{clinicId}/link-request")
        {
            Content = JsonContent.Create(new RequestClinicLinkRequest(
                true, true, true,
                new Dictionary<string, string> { ["student_id"] = "2024-001122" }))
        };
        req.Headers.Add(PatientApiTestHost.UserHeader, "user_valid_link");

        var response = await _host.Client.SendAsync(req);

        response.StatusCode.Should().Be(HttpStatusCode.Accepted);
        var envelope = await response.Content.ReadFromJsonAsync<ApiResponse<Guid>>();
        envelope.Should().NotBeNull();
        envelope!.Succeeded.Should().BeTrue();
        envelope.Data.Should().Be(linkReqId);
    }
}
