using System;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Threading.Tasks;
using ClinicEz.Patient.Api.Tests.Infrastructure;
using FluentAssertions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Routing;
using Xunit;

namespace ClinicEz.Patient.Api.Tests.Integration;

public sealed class GetTeleconsultCallEndpointTests : IAsyncLifetime
{
    private PatientApiTestHost _host = null!;

    public async Task InitializeAsync()
    {
        _host = await PatientApiTestHost.StartAsync();
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    [Fact]
    public void Endpoint_IsRegisteredUnderApiV1_WithExactRouteAndMetadata()
    {
        var endpoints = _host.EndpointSources
            .SelectMany(s => s.Endpoints)
            .OfType<RouteEndpoint>()
            .ToList();

        var teleconsultEndpoint = endpoints.FirstOrDefault(e =>
            e.RoutePattern.RawText == "/api/v1/patient/teleconsult/calls/{callId:guid}");

        teleconsultEndpoint.Should().NotBeNull("GET /api/v1/patient/teleconsult/calls/{callId:guid} must be registered");
        var nameMetadata = teleconsultEndpoint!.Metadata.GetMetadata<IEndpointNameMetadata>();
        nameMetadata.Should().NotBeNull();
        nameMetadata!.EndpointName.Should().Be("GetPatientTeleconsultCall");

        // Verify RequireAuthorization metadata
        var authData = teleconsultEndpoint.Metadata.GetMetadata<IAuthorizeData>();
        authData.Should().NotBeNull("endpoint must require authenticated caller");
    }

    [Fact]
    public async Task GetPatientTeleconsultCall_WhenUnauthenticated_ReturnsUnauthorized()
    {
        var callId = Guid.NewGuid();
        var response = await _host.Client.GetAsync($"/api/v1/patient/teleconsult/calls/{callId}");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
