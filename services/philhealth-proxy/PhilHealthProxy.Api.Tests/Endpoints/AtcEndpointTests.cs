using System.Net;
using FluentAssertions;
using NSubstitute;
using PhilHealthProxy.Api.Tests.Infrastructure;
using PhilHealthProxy.Domain.Models;
using Xunit;

namespace PhilHealthProxy.Api.Tests.Endpoints;

public sealed class AtcEndpointTests(KonsultaWebApplicationFactory factory)
    : IClassFixture<KonsultaWebApplicationFactory>
{
    private readonly HttpClient _client = factory.CreateClient();
    private static readonly Guid TenantId = Guid.NewGuid();

    private const string ValidUrl =
        "/api/konsulta/atc/is-valid?pin=010000000001&atc=ATC00000001&effectivityDate=2025-06-01";

    [Fact]
    public async Task GET_is_valid_returns_200_on_success()
    {
        factory.MockSoapClient
            .IsAtcValidAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new SoapResult(true, "<return>VALID</return>", null, null));

        var response = await _client.SendAsync(
            new HttpRequestMessage(HttpMethod.Get, ValidUrl).WithTenantId(TenantId));

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.ReadAsAsync<ApiResult<KonsultaResult>>();
        body!.Succeeded.Should().BeTrue();
    }

    [Fact]
    public async Task GET_is_valid_returns_401_when_tenant_header_missing()
    {
        var response = await _client.GetAsync(ValidUrl);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task GET_is_valid_returns_400_for_invalid_date_format()
    {
        var url = "/api/konsulta/atc/is-valid?pin=010000000001&atc=ATC00000001&effectivityDate=06-01-2025";

        var response = await _client.SendAsync(
            new HttpRequestMessage(HttpMethod.Get, url).WithTenantId(TenantId));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task GET_is_valid_returns_503_when_SOAP_fails()
    {
        factory.MockSoapClient
            .IsAtcValidAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new SoapResult(false, null, "INVALID_ATC", "ATC not found."));

        var response = await _client.SendAsync(
            new HttpRequestMessage(HttpMethod.Get, ValidUrl).WithTenantId(TenantId));

        response.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
    }
}
