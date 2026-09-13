using System.Net;
using FluentAssertions;
using NSubstitute;
using ClinicEz.PhilHealthProxy.Api.Tests.Infrastructure;
using ClinicEz.PhilHealthProxy.Domain.Models;
using Xunit;

namespace ClinicEz.PhilHealthProxy.Api.Tests.Endpoints;

public sealed class TokenEndpointTests(KonsultaWebApplicationFactory factory)
    : IClassFixture<KonsultaWebApplicationFactory>
{
    private readonly HttpClient _client = factory.CreateClient();
    private static readonly Guid TenantId = Guid.NewGuid();

    [Fact]
    public async Task GET_token_returns_200_with_raw_return_on_success()
    {
        factory.MockSoapClient.GetTokenAsync(Arg.Any<CancellationToken>())
            .Returns(new SoapResult(true, "<return>TOKEN123</return>", null, null));

        var response = await _client.SendAsync(
            new HttpRequestMessage(HttpMethod.Get, "/api/konsulta/token")
                .WithTenantId(TenantId));

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.ReadAsAsync<ApiResult<KonsultaResult>>();
        body!.Succeeded.Should().BeTrue();
        body.Data!.RawReturn.Should().Be("<return>TOKEN123</return>");
    }

    [Fact]
    public async Task GET_token_returns_401_when_X_Tenant_Id_header_is_absent()
    {
        var response = await _client.GetAsync("/api/konsulta/token");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task GET_token_returns_503_when_SOAP_fails()
    {
        factory.MockSoapClient.GetTokenAsync(Arg.Any<CancellationToken>())
            .Returns(new SoapResult(false, null, "AUTH_FAILED", "Invalid credentials."));

        var response = await _client.SendAsync(
            new HttpRequestMessage(HttpMethod.Get, "/api/konsulta/token")
                .WithTenantId(TenantId));

        response.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
    }
}
