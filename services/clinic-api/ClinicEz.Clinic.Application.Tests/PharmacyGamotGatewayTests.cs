using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Requests;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;

namespace ClinicEz.Clinic.Application.Tests;

public class PharmacyGamotGatewayTests
{
    private const string Tenant = "tenant-a";
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly Guid _pharmacyId = Guid.NewGuid();

    private static GamotLookupRespondedPayload Answer(int status = 200, string body = "{\"succeeded\":true}") =>
        new() { StatusCode = status, ContentType = "application/json", Body = body };

    private PharmacyGamotGateway Create(StubInteropRequestClient hub, bool configured = true, bool provisioned = true)
    {
        var settings = new Dictionary<string, string?>();
        if (configured) settings["Gamot:PharmacyFacilityId"] = _pharmacyId.ToString();
        var identity = provisioned ? Phase3TestKit.Identity(_clinicId, Tenant) : Substitute.For<IClinicIdentityProvider>();
        return new PharmacyGamotGateway(
            hub, identity, new ConfigurationBuilder().AddInMemoryCollection(settings).Build(), NullLogger<PharmacyGamotGateway>.Instance);
    }

    [Fact]
    public async Task Asks_the_tenants_pharmacy_through_the_hub_from_this_clinic()
    {
        var hub = new StubInteropRequestClient(_ => Answer());

        var result = await Create(hub).SendAsync("GET", "formulary", "?search=para", null, CancellationToken.None);

        result.StatusCode.Should().Be(200);
        result.Body.Should().Contain("succeeded");
        var call = hub.Calls.Should().ContainSingle().Subject;
        call.RequestType.Should().Be(InteropTypes.GamotLookupRequested);
        call.ReplyType.Should().Be(InteropTypes.GamotLookupResponded);
        call.From.Should().Be(Party.ForFacility(Tenant, _clinicId.ToString(), FacilityType.Clinic));
        call.To.Should().Be(Party.ForFacility(Tenant, _pharmacyId.ToString(), FacilityType.Pharmacy));
        var payload = (GamotLookupRequestedPayload)call.Payload;
        payload.Method.Should().Be("GET");
        payload.Path.Should().Be("formulary");
        payload.Query.Should().Be("search=para", "the leading question mark is not part of the query");
        payload.Body.Should().BeNull();
    }

    [Fact]
    public async Task Sends_the_json_body_unchanged_and_no_query_when_there_is_none()
    {
        var hub = new StubInteropRequestClient(_ => Answer());

        await Create(hub).SendAsync("post", "/dispense", "", "{\"pin\":\"1\"}", CancellationToken.None);

        var payload = (GamotLookupRequestedPayload)hub.Calls.Single().Payload;
        payload.Method.Should().Be("POST");
        payload.Path.Should().Be("dispense");
        payload.Query.Should().BeNull();
        payload.Body.Should().Be("{\"pin\":\"1\"}");
    }

    [Fact]
    public async Task Relays_pharmacy_errors_as_they_are()
    {
        var hub = new StubInteropRequestClient(_ => Answer(409, "{\"succeeded\":false,\"message\":\"Already dispensed\"}"));

        var result = await Create(hub).SendAsync("POST", "dispense", "", "{}", CancellationToken.None);

        result.StatusCode.Should().Be(409);
        result.Body.Should().Contain("Already dispensed");
    }

    [Fact]
    public async Task Is_unavailable_when_no_pharmacy_is_configured()
    {
        var hub = new StubInteropRequestClient(_ => Answer());

        var result = await Create(hub, configured: false).SendAsync("GET", "formulary", "", null, CancellationToken.None);

        result.StatusCode.Should().Be(503);
        result.Body.Should().Contain("no pharmacy is configured");
        hub.Calls.Should().BeEmpty("nothing may be sent without a pharmacy to address");
    }

    [Fact]
    public async Task Is_unavailable_when_the_clinic_is_not_provisioned()
    {
        var hub = new StubInteropRequestClient(_ => Answer());

        var result = await Create(hub, provisioned: false).SendAsync("GET", "formulary", "", null, CancellationToken.None);

        result.StatusCode.Should().Be(503);
        hub.Calls.Should().BeEmpty();
    }

    [Fact]
    public async Task Times_out_with_a_clear_gateway_timeout_when_the_pharmacy_does_not_answer()
    {
        var hub = new StubInteropRequestClient(_ => Answer())
        {
            Failure = new InteropRequestTimeoutException(InteropTypes.GamotLookupRequested, Guid.NewGuid(), TimeSpan.FromSeconds(45))
        };

        var result = await Create(hub).SendAsync("GET", "formulary", "", null, CancellationToken.None);

        result.StatusCode.Should().Be(504);
        result.Body.Should().Contain("did not answer in time");
    }
}
