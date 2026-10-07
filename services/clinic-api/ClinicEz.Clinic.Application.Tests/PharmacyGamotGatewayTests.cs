using System.Net;
using System.Text;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Services;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;

namespace ClinicEz.Clinic.Application.Tests;

public class PharmacyGamotGatewayTests
{
    private sealed class StubHandler : HttpMessageHandler
    {
        public HttpRequestMessage? Seen { get; private set; }
        public string? SeenBody { get; private set; }
        public Func<HttpResponseMessage> Respond { get; set; } =
            () => new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{\"succeeded\":true}", Encoding.UTF8, "application/json") };

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Seen = request;
            SeenBody = request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken);
            return Respond();
        }
    }

    private static PharmacyGamotGateway Create(StubHandler handler, Dictionary<string, string?> settings)
    {
        var clinic = Substitute.For<IClinicContext>();
        clinic.TenantId.Returns("tenant-a");
        var config = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();
        return new PharmacyGamotGateway(new HttpClient(handler), config, clinic, NullLogger<PharmacyGamotGateway>.Instance);
    }

    private static readonly Dictionary<string, string?> Configured = new()
    {
        ["Services:PharmacyApiUrl"] = "http://pharmacy.test:8080/",
        ["Internal:ApiKey"] = "shared-secret",
    };

    [Fact]
    public async Task Forwards_to_the_gamot_route_with_the_internal_key_and_the_clinic_tenant()
    {
        var handler = new StubHandler();
        var result = await Create(handler, Configured).SendAsync("GET", "formulary", "?search=para", null, CancellationToken.None);

        result.StatusCode.Should().Be(200);
        result.Body.Should().Contain("succeeded");
        handler.Seen!.RequestUri!.ToString().Should().Be("http://pharmacy.test:8080/api/v1/gamot/formulary?search=para");
        handler.Seen.Headers.GetValues("X-Internal-Key").Should().ContainSingle("shared-secret");
        handler.Seen.Headers.GetValues("X-Tenant-Id").Should().ContainSingle("tenant-a");
        handler.Seen.Headers.Authorization.Should().BeNull("the caller's own credentials are never forwarded");
    }

    [Fact]
    public async Task Posts_the_json_body_unchanged()
    {
        var handler = new StubHandler();
        await Create(handler, Configured).SendAsync("POST", "dispense", "", "{\"pin\":\"1\"}", CancellationToken.None);

        handler.Seen!.Method.Should().Be(HttpMethod.Post);
        handler.SeenBody.Should().Be("{\"pin\":\"1\"}");
    }

    [Fact]
    public async Task A_dedicated_pharmacy_key_wins_over_the_shared_one()
    {
        var handler = new StubHandler();
        var settings = new Dictionary<string, string?>(Configured) { ["Services:PharmacyApiKey"] = "pharmacy-only" };
        await Create(handler, settings).SendAsync("GET", "formulary", "", null, CancellationToken.None);

        handler.Seen!.Headers.GetValues("X-Internal-Key").Should().ContainSingle("pharmacy-only");
    }

    [Fact]
    public async Task Relays_pharmacy_errors_as_they_are()
    {
        var handler = new StubHandler
        {
            Respond = () => new HttpResponseMessage(HttpStatusCode.Conflict) { Content = new StringContent("{\"succeeded\":false,\"message\":\"Already dispensed\"}", Encoding.UTF8, "application/json") },
        };
        var result = await Create(handler, Configured).SendAsync("POST", "dispense", "", "{}", CancellationToken.None);

        result.StatusCode.Should().Be(409);
        result.Body.Should().Contain("Already dispensed");
    }

    [Fact]
    public async Task Is_unavailable_when_the_pharmacy_is_not_configured()
    {
        var handler = new StubHandler();
        var result = await Create(handler, new Dictionary<string, string?>()).SendAsync("GET", "formulary", "", null, CancellationToken.None);

        result.StatusCode.Should().Be(503);
        handler.Seen.Should().BeNull("nothing may be sent without an address and a key");
    }

    [Fact]
    public async Task Is_unavailable_when_the_pharmacy_cannot_be_reached()
    {
        var handler = new StubHandler { Respond = () => throw new HttpRequestException("connection refused") };
        var result = await Create(handler, Configured).SendAsync("GET", "formulary", "", null, CancellationToken.None);

        result.StatusCode.Should().Be(503);
        result.Body.Should().Contain("could not be reached");
    }
}
