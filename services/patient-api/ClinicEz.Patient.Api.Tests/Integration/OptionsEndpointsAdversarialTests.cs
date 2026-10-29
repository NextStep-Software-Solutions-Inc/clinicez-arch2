using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http.Json;
using System.Threading.Tasks;
using ClinicEz.Patient.Api.Endpoints.Options;
using ClinicEz.Patient.Api.Tests.Infrastructure;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Options;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Patient.Api.Tests.Integration;

public sealed class OptionsEndpointsAdversarialTests : IAsyncLifetime
{
    private PatientApiTestHost _host = null!;

    public async Task InitializeAsync()
    {
        _host = await PatientApiTestHost.StartAsync();
    }

    public async Task DisposeAsync() => await _host.DisposeAsync();

    // ── 1. Options Manifest & ETag 304 Caching Tests ──────────────────────────

    [Fact]
    public async Task GetManifest_Returns200WithSha256ETagAndCacheControl()
    {
        var response = await _host.Client.GetAsync("/api/v1/options/manifest");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Headers.ETag.Should().NotBeNull();
        
        var etag = response.Headers.ETag!.ToString();
        etag.Should().StartWith("\"").And.EndWith("\"");
        etag.Trim('"').Should().HaveLength(64, "SHA-256 hex string should be 64 characters");

        response.Headers.CacheControl.Should().NotBeNull();
        response.Headers.CacheControl!.Public.Should().BeTrue();

        var body = await response.Content.ReadFromJsonAsync<ApiResponse<OptionsManifestResponse>>();
        body.Should().NotBeNull();
        body!.Succeeded.Should().BeTrue();
        body.Data.Should().NotBeNull();
        body.Data!.ManifestVersion.Should().Be(etag.Trim('"'));
        body.Data.OptionSets.Should().NotBeEmpty();
        body.Data.OptionSets.Should().ContainKey("sex");
        body.Data.OptionSets.Should().ContainKey("civil_status");
        body.Data.OptionSets.Should().ContainKey("blood_type");
    }

    [Fact]
    public async Task GetManifest_WithMatchingIfNoneMatch_Returns304NotModifiedWithEmptyBody()
    {
        // 1. Initial request to obtain valid ETag
        var initial = await _host.Client.GetAsync("/api/v1/options/manifest");
        initial.StatusCode.Should().Be(HttpStatusCode.OK);
        var etag = initial.Headers.ETag!.ToString();

        // 2. Conditional request with matching If-None-Match
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/options/manifest");
        request.Headers.TryAddWithoutValidation("If-None-Match", etag);

        var conditional = await _host.Client.SendAsync(request);

        conditional.StatusCode.Should().Be(HttpStatusCode.NotModified);
        var content = await conditional.Content.ReadAsStringAsync();
        content.Should().BeEmpty("HTTP 304 response body must be empty per RFC 7232");
    }

    [Fact]
    public async Task GetManifest_WithStaleETag_Returns200WithFullBodyAndFreshETag()
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/options/manifest");
        request.Headers.TryAddWithoutValidation("If-None-Match", "\"stale_etag_deadbeefcafebabedeadbeefcafebabedeadbeefcafebabe0123456789\"");

        var response = await _host.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Headers.ETag.Should().NotBeNull();
        var etag = response.Headers.ETag!.ToString();
        etag.Should().NotContain("stale_etag");

        var body = await response.Content.ReadFromJsonAsync<ApiResponse<OptionsManifestResponse>>();
        body.Should().NotBeNull();
        body!.Succeeded.Should().BeTrue();
        body.Data.Should().NotBeNull();
        body.Data!.OptionSets.Should().NotBeEmpty();
    }

    [Fact]
    public async Task GetManifest_WithWeakETag_Returns304NotModified()
    {
        var initial = await _host.Client.GetAsync("/api/v1/options/manifest");
        var etag = initial.Headers.ETag!.ToString();
        var weakETag = $"W/{etag}";

        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/options/manifest");
        request.Headers.TryAddWithoutValidation("If-None-Match", weakETag);

        var response = await _host.Client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.NotModified);
    }

    [Fact]
    public async Task GetManifest_WithWildcardIfNoneMatch_Returns304NotModified()
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/options/manifest");
        request.Headers.TryAddWithoutValidation("If-None-Match", "*");

        var response = await _host.Client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.NotModified);
    }

    [Fact]
    public async Task GetManifest_WithMultiTokenIfNoneMatch_Returns304NotModifiedWhenOneMatches()
    {
        var initial = await _host.Client.GetAsync("/api/v1/options/manifest");
        var etag = initial.Headers.ETag!.ToString();

        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/options/manifest");
        request.Headers.TryAddWithoutValidation("If-None-Match", $"\"other-etag-1\", {etag}, \"other-etag-2\"");

        var response = await _host.Client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.NotModified);
    }

    // ── 2. Option Set Endpoints & Error Handling Tests ────────────────────────

    [Theory]
    [InlineData("sex")]
    [InlineData("gender_identity")]
    [InlineData("patient_type")]
    [InlineData("civil_status")]
    [InlineData("blood_type")]
    [InlineData("education_level")]
    [InlineData("guardian_relationship")]
    [InlineData("valid_id_type")]
    [InlineData("medicine_route")]
    [InlineData("medicine_frequency")]
    public async Task GetOptionSet_ForStandardSets_Returns200WithDescriptorsAndETag(string optionSet)
    {
        var response = await _host.Client.GetAsync($"/api/v1/options/{optionSet}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Headers.ETag.Should().NotBeNull();
        response.Headers.ETag!.ToString().Trim('"').Should().HaveLength(64);

        var body = await response.Content.ReadFromJsonAsync<ApiResponse<IReadOnlyList<EhrOptionDescriptor>>>();
        body.Should().NotBeNull();
        body!.Succeeded.Should().BeTrue();
        body.Data.Should().NotBeNull();
        body.Data.Should().NotBeEmpty();

        foreach (var opt in body.Data!)
        {
            opt.Code.Should().NotBeNullOrWhiteSpace();
            opt.Label.Should().NotBeNullOrWhiteSpace();
            opt.IsActive.Should().BeTrue();
        }

        // Test conditional 304 for specific set
        using var condRequest = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/options/{optionSet}");
        condRequest.Headers.TryAddWithoutValidation("If-None-Match", response.Headers.ETag!.ToString());
        var condResponse = await _host.Client.SendAsync(condRequest);
        condResponse.StatusCode.Should().Be(HttpStatusCode.NotModified);
    }

    [Theory]
    [InlineData("non_existent_set_9999")]
    [InlineData("unknown_clinical_option_xyz")]
    [InlineData("invalid-hyphenated-option-set")]
    [InlineData("UPPERCASE_UNKNOWN_SET")]
    [InlineData("!@#$%^&*()")]
    [InlineData("SELECT * FROM Options")]
    [InlineData("../../etc/passwd")]
    public async Task GetOptionSet_ForUnknownOrAdversarialInput_Returns404NotFoundNever500(string invalidOptionSet)
    {
        var response = await _host.Client.GetAsync($"/api/v1/options/{Uri.EscapeDataString(invalidOptionSet)}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound, "Unknown option sets must return 404, never 500");
        
        var body = await response.Content.ReadFromJsonAsync<ApiResponse<object>>();
        body.Should().NotBeNull();
        body!.Succeeded.Should().BeFalse();
        body.Message.Should().Contain("not found");
    }

    // ── 3. All Options Endpoint Tests ─────────────────────────────────────────

    [Fact]
    public async Task GetAllOptions_Returns200WithAllRegisteredOptionSets()
    {
        var response = await _host.Client.GetAsync("/api/v1/options");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Headers.ETag.Should().NotBeNull();

        var body = await response.Content.ReadFromJsonAsync<ApiResponse<Dictionary<string, List<EhrOptionDescriptor>>>>();
        body.Should().NotBeNull();
        body!.Succeeded.Should().BeTrue();
        body.Data.Should().NotBeNull();
        body.Data.Count.Should().BeGreaterThanOrEqualTo(10);
        body.Data.Should().ContainKey("sex");
        body.Data.Should().ContainKey("civil_status");

        // Verify 304 conditional request
        using var condRequest = new HttpRequestMessage(HttpMethod.Get, "/api/v1/options");
        condRequest.Headers.TryAddWithoutValidation("If-None-Match", response.Headers.ETag!.ToString());
        var condResponse = await _host.Client.SendAsync(condRequest);
        condResponse.StatusCode.Should().Be(HttpStatusCode.NotModified);
    }

    // ── 4. Concurrency Stress Test ────────────────────────────────────────────

    [Fact]
    public async Task ConcurrentOptionsRequests_ShouldHandleHighConcurrencyGracefully()
    {
        const int concurrentRequests = 60;
        var endpoints = new[]
        {
            "/api/v1/options/manifest",
            "/api/v1/options/sex",
            "/api/v1/options/civil_status",
            "/api/v1/options/blood_type",
            "/api/v1/options/education_level",
            "/api/v1/options/medicine_route",
            "/api/v1/options",
            "/api/v1/options/invalid_set_for_concurrency"
        };

        var tasks = Enumerable.Range(0, concurrentRequests).Select(async i =>
        {
            var endpoint = endpoints[i % endpoints.Length];
            var response = await _host.Client.GetAsync(endpoint);

            if (endpoint.Contains("invalid"))
            {
                response.StatusCode.Should().Be(HttpStatusCode.NotFound);
            }
            else
            {
                response.StatusCode.Should().Be(HttpStatusCode.OK);
                response.Headers.ETag.Should().NotBeNull();
            }
        });

        await Task.WhenAll(tasks);
    }
}
