using System.Net;
using System.Net.Http.Json;
using ClinicEz.PhilHealthProxy.Api.Tests.Infrastructure;
using ClinicEz.PhilHealthProxy.Domain.Catalogs;
using FluentAssertions;
using Xunit;

namespace ClinicEz.PhilHealthProxy.Api.Tests.Endpoints;

public sealed class YakapEndpointTests(KonsultaWebApplicationFactory factory)
    : IClassFixture<KonsultaWebApplicationFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task ValidatePin_ReturnsTrue_ForValidPhilHealthPin()
    {
        var response = await _client.GetAsync("/api/yakap/pin/030263078507/validate");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<ApiResult<bool>>();
        body.Should().NotBeNull();
        body!.Succeeded.Should().BeTrue();
        body.Data.Should().BeTrue();
    }

    [Fact]
    public async Task ValidatePin_ReturnsFalse_ForInvalidPhilHealthPin()
    {
        var response = await _client.GetAsync("/api/yakap/pin/111111111111/validate");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<ApiResult<bool>>();
        body.Should().NotBeNull();
        body!.Succeeded.Should().BeTrue();
        body.Data.Should().BeFalse();
    }

    [Fact]
    public async Task GetDiseasesCatalog_ReturnsStandardLookupList()
    {
        var response = await _client.GetAsync("/api/yakap/catalogs/diseases");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<ApiResult<List<CatalogItem>>>();
        body.Should().NotBeNull();
        body!.Succeeded.Should().BeTrue();
        body.Data.Should().Contain(d => d.Code == "001" && d.Description == "Allergy");
        body.Data.Should().Contain(d => d.Code == "011" && d.Description == "Hypertension");
    }

    [Fact]
    public async Task GetGamotCatalog_ReturnsEssentialMedicinesFormulary()
    {
        var response = await _client.GetAsync("/api/yakap/catalogs/gamot");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<ApiResult<List<CatalogItem>>>();
        body.Should().NotBeNull();
        body!.Succeeded.Should().BeTrue();
        body.Data.Should().Contain(m => m.Description.Contains("Amlodipine"));
        body.Data.Should().Contain(m => m.Description.Contains("Metformin"));
    }

    [Fact]
    public async Task GetDiagnosticsCatalog_Returns16DiagnosticServices()
    {
        var response = await _client.GetAsync("/api/yakap/catalogs/diagnostics");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<ApiResult<List<CatalogItem>>>();
        body.Should().NotBeNull();
        body!.Succeeded.Should().BeTrue();
        body.Data.Should().HaveCount(16);
        body.Data.Should().Contain(d => d.Code == "1" && d.Description.Contains("CBC"));
    }

    [Fact]
    public async Task GetSymptomsCatalog_ReturnsPertinentSignsAndSymptoms()
    {
        var response = await _client.GetAsync("/api/yakap/catalogs/symptoms");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<ApiResult<List<CatalogItem>>>();
        body.Should().NotBeNull();
        body!.Succeeded.Should().BeTrue();
        body.Data.Should().Contain(s => s.Code == "37");
        body.Data.Should().Contain(s => s.Code == "38");
    }

    [Fact]
    public async Task GetManagementCatalog_ReturnsPrimaryCareActions()
    {
        var response = await _client.GetAsync("/api/yakap/catalogs/management");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<ApiResult<List<CatalogItem>>>();
        body.Should().NotBeNull();
        body!.Succeeded.Should().BeTrue();
        body.Data.Should().Contain(m => m.Code == "1");
        body.Data.Should().Contain(m => m.Code == "3");
    }
}
