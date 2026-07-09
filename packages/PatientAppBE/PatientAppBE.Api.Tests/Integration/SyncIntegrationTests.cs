using System.Net;
using System.Net.Http.Json;
using Clinic EZ.Shared.Common;
using FluentAssertions;
using PatientAppBE.Api.Tests.Infrastructure;
using PatientAppBE.Application.Common.DTOs;
using PatientAppBE.Domain.Enums;

namespace PatientAppBE.Api.Tests.Integration;

public sealed class SyncIntegrationTests : IClassFixture<PatientAppWebApplicationFactory>
{
    private readonly HttpClient _client;

    public SyncIntegrationTests(PatientAppWebApplicationFactory factory)
        => _client = factory.CreateClient();

    // ── Helpers ───────────────────────────────────────────────────────────────

    private async Task<Guid> CreatePatientAsync()
    {
        var payload = new
        {
            ClerkUserId = $"clerk_sync_{Guid.NewGuid():N}",
            FirstName = "Sync",
            LastName = "Tester",
        };

        var res = await _client.PostAsJsonAsync("/api/v1/patients", payload);
        res.EnsureSuccessStatusCode();

        var body = await res.Content.ReadFromJsonAsync<ApiResponse<Guid>>();
        return body!.Data;
    }

    private static object BuildSyncPayload(Guid patientId, Guid? idempotencyKey = null) => new
    {
        Items = new[]
        {
            new
            {
                IdempotencyKey = idempotencyKey ?? Guid.NewGuid(),
                EntityType = "Patient",
                Operation = (int)SyncOperation.Update,
                ClientTimestamp = DateTime.UtcNow.AddSeconds(-10),
                PayloadJson = $$"""{"clientId":"{{patientId}}","firstName":"Updated","lastName":"Name","updatedAt":"{{DateTime.UtcNow.AddSeconds(-10):O}}"}""",
            },
        },
    };

    // ── Tests ─────────────────────────────────────────────────────────────────

    [Fact]
    public async Task PushSync_WithNewItems_Returns202AndAcceptsAll()
    {
        var patientId = await CreatePatientAsync();

        var response = await _client.PostAsJsonAsync(
            $"/api/v1/patients/{patientId}/sync",
            BuildSyncPayload(patientId));

        response.StatusCode.Should().Be(HttpStatusCode.Accepted);

        var body = await response.Content.ReadFromJsonAsync<ApiResponse<PushSyncAckDto>>();
        body!.Succeeded.Should().BeTrue();
        body.Data!.Accepted.Should().Be(1);
        body.Data.AlreadyProcessed.Should().Be(0);
        body.Data.AcknowledgedAt.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromSeconds(5));
    }

    [Fact]
    public async Task PushSync_WithDuplicateIdempotencyKey_ReturnsAlreadyProcessed()
    {
        var patientId = await CreatePatientAsync();
        var idempotencyKey = Guid.NewGuid();

        // First push — accepted
        await _client.PostAsJsonAsync(
            $"/api/v1/patients/{patientId}/sync",
            BuildSyncPayload(patientId, idempotencyKey));

        // Second push with the same IdempotencyKey — should be idempotent
        var response = await _client.PostAsJsonAsync(
            $"/api/v1/patients/{patientId}/sync",
            BuildSyncPayload(patientId, idempotencyKey));

        response.StatusCode.Should().Be(HttpStatusCode.Accepted);

        var body = await response.Content.ReadFromJsonAsync<ApiResponse<PushSyncAckDto>>();
        body!.Data!.Accepted.Should().Be(0);
        body.Data.AlreadyProcessed.Should().Be(1);
    }

    [Fact]
    public async Task GetSyncStatus_AfterPush_Returns200WithCounts()
    {
        var patientId = await CreatePatientAsync();

        await _client.PostAsJsonAsync(
            $"/api/v1/patients/{patientId}/sync",
            BuildSyncPayload(patientId));

        var response = await _client.GetAsync(
            $"/api/v1/patients/{patientId}/sync/status?take=10");

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<ApiResponse<SyncStatusDto>>();
        body!.Succeeded.Should().BeTrue();
        body.Data!.RecentItems.Should().HaveCount(1);
    }
}
