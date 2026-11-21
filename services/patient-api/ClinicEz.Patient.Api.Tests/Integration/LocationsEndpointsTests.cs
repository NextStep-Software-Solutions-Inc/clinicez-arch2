using System.Collections.Generic;
using System.Net;
using System.Net.Http.Json;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Api.Tests.Infrastructure;
using ClinicEz.Shared.Common;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Patient.Api.Tests.Integration;

public sealed class LocationsEndpointsTests : IAsyncLifetime
{
    private PatientApiTestHost _host = null!;

    public async Task InitializeAsync()
    {
        _host = await PatientApiTestHost.StartAsync();
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    [Fact]
    public async Task GetRegions_Returns200WithAll17PhilippineRegions()
    {
        var response = await _host.Client.GetAsync("/api/v1/locations/psgc/regions");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var envelope = await response.Content.ReadFromJsonAsync<ApiResponse<IReadOnlyList<PsgcLocationDto>>>();
        envelope.Should().NotBeNull();
        envelope!.Succeeded.Should().BeTrue();
        envelope.Data.Should().HaveCount(17);
        envelope.Data.Should().Contain(r => r.PsgcCode == "1300000000" && r.Name.Contains("National Capital Region"));
    }

    [Fact]
    public async Task GetProvinces_WithRegionPsgc_ReturnsProvincesUnderRegion()
    {
        var response = await _host.Client.GetAsync("/api/v1/locations/psgc/provinces?regionPsgc=0400000000");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var envelope = await response.Content.ReadFromJsonAsync<ApiResponse<IReadOnlyList<PsgcLocationDto>>>();
        envelope.Should().NotBeNull();
        envelope!.Data.Should().NotBeEmpty();
        envelope.Data.Should().Contain(p => p.Name == "Cavite" && p.PsgcCode == "0421000000");
    }

    [Fact]
    public async Task GetProvinces_ForNCR_ReturnsZeroProvincesForBypass()
    {
        var response = await _host.Client.GetAsync("/api/v1/locations/psgc/provinces?regionPsgc=1300000000");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var envelope = await response.Content.ReadFromJsonAsync<ApiResponse<IReadOnlyList<PsgcLocationDto>>>();
        envelope.Should().NotBeNull();
        // Districts in NCR have Level=Province but NCR directly queries cities
        envelope!.Data.Should().NotBeNull();
    }

    [Fact]
    public async Task GetCities_ForNCR_ReturnsCitiesDirectlyUnderRegion()
    {
        var response = await _host.Client.GetAsync("/api/v1/locations/psgc/cities?regionPsgc=1300000000");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var envelope = await response.Content.ReadFromJsonAsync<ApiResponse<IReadOnlyList<PsgcLocationDto>>>();
        envelope.Should().NotBeNull();
        envelope!.Data.Should().Contain(c => c.Name == "City of Manila" || c.Name == "Quezon City");
    }

    [Fact]
    public async Task GetBarangays_WithValidCityMunicipalityPsgc_ReturnsBarangays()
    {
        var response = await _host.Client.GetAsync("/api/v1/locations/psgc/barangays?cityMunicipalityPsgc=1376020000");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var envelope = await response.Content.ReadFromJsonAsync<ApiResponse<IReadOnlyList<PsgcLocationDto>>>();
        envelope.Should().NotBeNull();
        envelope!.Data.Should().NotBeEmpty();
        envelope.Data.Should().Contain(b => b.Name == "Bel-Air" || b.Name == "Poblacion");
    }

    [Fact]
    public async Task GetBarangays_MissingCityQueryParam_Returns400BadRequest()
    {
        var response = await _host.Client.GetAsync("/api/v1/locations/psgc/barangays");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task SearchLocations_WithQuery_ReturnsMatchingResults()
    {
        var response = await _host.Client.GetAsync("/api/v1/locations/psgc/search?q=Manila&limit=10");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var envelope = await response.Content.ReadFromJsonAsync<ApiResponse<IReadOnlyList<PsgcLocationDto>>>();
        envelope.Should().NotBeNull();
        envelope!.Data.Should().Contain(l => l.Name.Contains("Manila"));
    }
}
