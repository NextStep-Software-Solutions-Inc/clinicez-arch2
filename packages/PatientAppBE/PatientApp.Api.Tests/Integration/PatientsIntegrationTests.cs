using System.Net;
using System.Net.Http.Json;
using CLINICEZ.Shared.Common;
using FluentAssertions;
using PatientApp.Api.Tests.Infrastructure;
using PatientApp.Application.Common.DTOs;

namespace PatientApp.Api.Tests.Integration;

public sealed class PatientsIntegrationTests : IClassFixture<PatientAppWebApplicationFactory>
{
    private readonly HttpClient _client;

    public PatientsIntegrationTests(PatientAppWebApplicationFactory factory)
        => _client = factory.CreateClient();

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static object CreatePatientPayload(string? clerkId = null) => new
    {
        ClerkUserId = clerkId ?? $"clerk_{Guid.NewGuid():N}",
        FirstName = "Juan",
        MiddleName = (string?)null,
        LastName = "Dela Cruz",
        Suffix = (string?)null,
        Sex = "Male",
        DateOfBirth = (DateOnly?)null,
        Nationality = "Filipino",
    };

    private async Task<Guid> CreateTestPatientAsync(string? clerkId = null)
    {
        var response = await _client.PostAsJsonAsync("/api/v1/patients", CreatePatientPayload(clerkId));
        response.StatusCode.Should().Be(HttpStatusCode.Created);

        var body = await response.Content.ReadFromJsonAsync<ApiResponse<Guid>>();
        return body!.Data;
    }

    // ── Tests ─────────────────────────────────────────────────────────────────

    [Fact]
    public async Task CreatePatient_Returns201_WithPatientId()
    {
        var response = await _client.PostAsJsonAsync("/api/v1/patients", CreatePatientPayload());

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        response.Headers.Location.Should().NotBeNull();

        var body = await response.Content.ReadFromJsonAsync<ApiResponse<Guid>>();
        body!.Succeeded.Should().BeTrue();
        body.Data.Should().NotBeEmpty();
    }

    [Fact]
    public async Task CreatePatient_WhenDuplicateClerkId_Returns409()
    {
        var clerkId = $"clerk_dup_{Guid.NewGuid():N}";

        // First creation succeeds
        await CreateTestPatientAsync(clerkId);

        // Second creation with same Clerk ID must conflict
        var response = await _client.PostAsJsonAsync("/api/v1/patients", CreatePatientPayload(clerkId));
        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
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

    [Fact]
    public async Task GetPatientProfile_WhenPatientDoesNotExist_Returns404()
    {
        var nonExistentId = Guid.NewGuid();

        var response = await _client.GetAsync($"/api/v1/patients/{nonExistentId}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);

        var body = await response.Content.ReadFromJsonAsync<ApiResponse<object>>();
        body!.Succeeded.Should().BeFalse();
    }

    [Fact]
    public async Task GetPatientByClerkId_WhenPatientExists_Returns200()
    {
        var clerkId = $"clerk_gcbi_{Guid.NewGuid():N}";
        await CreateTestPatientAsync(clerkId);

        var response = await _client.GetAsync($"/api/v1/patients/by-clerk/{clerkId}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<ApiResponse<PatientSummaryDto>>();
        body!.Succeeded.Should().BeTrue();
        body.Data!.FirstName.Should().Be("Juan");
    }
}
