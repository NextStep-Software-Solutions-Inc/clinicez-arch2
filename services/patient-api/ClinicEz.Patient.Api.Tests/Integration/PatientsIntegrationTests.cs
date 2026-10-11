using System.Net;
using System.Net.Http.Json;
using ClinicEz.Shared.Common;
using FluentAssertions;
using ClinicEz.Patient.Api.Tests.Infrastructure;
using ClinicEz.Patient.Application.Common.DTOs;

namespace ClinicEz.Patient.Api.Tests.Integration;

public sealed class PatientsIntegrationTests : IClassFixture<PatientAppWebApplicationFactory>
{
    private readonly HttpClient _client;

    public PatientsIntegrationTests(PatientAppWebApplicationFactory factory)
        => _client = factory.CreateClient();

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static object CreatePatientPayload() => new
    {
        ClerkUserId = TestJwtAuthHandler.TestClerkUserId,
        FirstName = "Juan",
        MiddleName = (string?)null,
        LastName = "Dela Cruz",
        Suffix = (string?)null,
        Sex = "Male",
        DateOfBirth = (DateOnly?)null,
        Nationality = "Filipino",
    };

    private async Task<Guid> CreateTestPatientAsync()
    {
        var response = await _client.PostAsJsonAsync("/api/v1/patients", CreatePatientPayload());
        response.StatusCode.Should().Be(HttpStatusCode.Created);

        var body = await response.Content.ReadFromJsonAsync<ApiResponse<Guid>>();
        return body!.Data;
    }

    // ── Tests ─────────────────────────────────────────────────────────────────

    [DockerAvailableFact]
    public async Task CreatePatient_Returns201_WithPatientId()
    {
        var response = await _client.PostAsJsonAsync("/api/v1/patients", CreatePatientPayload());

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        response.Headers.Location.Should().NotBeNull();

        var body = await response.Content.ReadFromJsonAsync<ApiResponse<Guid>>();
        body!.Succeeded.Should().BeTrue();
        body.Data.Should().NotBeEmpty();
    }

    [DockerAvailableFact]
    public async Task CreatePatient_WhenDuplicateClerkId_ReturnsIdempotentSuccess()
    {
        // First creation succeeds
        var firstId = await CreateTestPatientAsync();

        // Second creation with same Clerk ID must return existing patient ID (idempotent)
        var response = await _client.PostAsJsonAsync("/api/v1/patients", CreatePatientPayload());
        response.StatusCode.Should().Be(HttpStatusCode.Created);

        var body = await response.Content.ReadFromJsonAsync<ApiResponse<Guid>>();
        body!.Data.Should().Be(firstId);
    }

    [DockerAvailableFact]
    public async Task GetPatientProfile_WhenPatientExists_Returns200WithProfile()
    {
        var patientId = await CreateTestPatientAsync();

        var response = await _client.GetAsync($"/api/v1/patients/{patientId}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<ApiResponse<PatientProfileDto>>();
        body!.Succeeded.Should().BeTrue();
        body.Data!.Demographics.FirstName.Should().Be("Juan");
        body.Data.Demographics.LastName.Should().Be("Dela Cruz");
        body.Data.Addresses.Should().BeEmpty();
        body.Data.EmergencyContacts.Should().BeEmpty();
    }

    [DockerAvailableFact]
    public async Task GetPatientProfile_WhenPatientIsNotTheCallers_Returns403()
    {
        var unknownOrForeignId = Guid.NewGuid();

        var response = await _client.GetAsync($"/api/v1/patients/{unknownOrForeignId}");

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);

        var body = await response.Content.ReadFromJsonAsync<ApiResponse<object>>();
        body!.Succeeded.Should().BeFalse();
    }

    [DockerAvailableFact]
    public async Task GetPatientByClerkId_WhenPatientExists_Returns200()
    {
        await CreateTestPatientAsync();

        var response = await _client.GetAsync($"/api/v1/patients/by-clerk/{TestJwtAuthHandler.TestClerkUserId}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<ApiResponse<PatientSummaryDto>>();
        body!.Succeeded.Should().BeTrue();
        body.Data!.FirstName.Should().Be("Juan");
    }
}
