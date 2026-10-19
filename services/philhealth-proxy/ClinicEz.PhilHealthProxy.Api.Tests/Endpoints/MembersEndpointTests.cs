using System.Net;
using FluentAssertions;
using NSubstitute;
using ClinicEz.PhilHealthProxy.Api.Tests.Infrastructure;
using ClinicEz.PhilHealthProxy.Domain.Models;
using Xunit;

namespace ClinicEz.PhilHealthProxy.Api.Tests.Endpoints;

public sealed class MembersEndpointTests(KonsultaWebApplicationFactory factory)
    : IClassFixture<KonsultaWebApplicationFactory>
{
    private readonly HttpClient _client = factory.CreateClient();
    private static readonly Guid TenantId = Guid.NewGuid();

    [Fact]
    public async Task GET_is_registered_returns_200_on_success()
    {
        factory.MockSoapClient
            .IsMemberDependentRegisteredAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new SoapResult(true, "<return>true</return>", null, null));

        var response = await _client.SendAsync(
            new HttpRequestMessage(HttpMethod.Get, "/api/konsulta/members/is-registered?pin=010000000001&type=MM")
                .WithTenantId(TenantId));

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.ReadAsAsync<ApiResult<KonsultaResult>>();
        body!.Succeeded.Should().BeTrue();
        body.Data!.RawReturn.Should().Be("<return>true</return>");
    }

    [Fact]
    public async Task GET_is_registered_returns_401_when_tenant_header_missing()
    {
        var response = await _client.GetAsync("/api/konsulta/members/is-registered?pin=010000000001&type=MM");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task GET_is_registered_returns_400_when_pin_is_missing()
    {
        // Empty pin hits the validator → 400
        var response = await _client.SendAsync(
            new HttpRequestMessage(HttpMethod.Get, "/api/konsulta/members/is-registered?pin=&type=MM")
                .WithTenantId(TenantId));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task GET_is_registered_returns_503_when_SOAP_fails()
    {
        factory.MockSoapClient
            .IsMemberDependentRegisteredAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new SoapResult(false, null, "SOAP_FAULT", "Service error."));

        var response = await _client.SendAsync(
            new HttpRequestMessage(HttpMethod.Get, "/api/konsulta/members/is-registered?pin=010000000001&type=MM")
                .WithTenantId(TenantId));

        response.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
    }
}
