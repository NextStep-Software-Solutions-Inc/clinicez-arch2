using System;
using System.Net;
using System.Net.Http.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Api.Tests.Infrastructure;
using ClinicEz.PhilHealthProxy.Domain.Entities;
using ClinicEz.PhilHealthProxy.Domain.Models;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.PhilHealthProxy.Api.Tests.Endpoints;

public sealed class TokenEndpointTests(KonsultaWebApplicationFactory factory)
    : IClassFixture<KonsultaWebApplicationFactory>
{
    private readonly HttpClient _client = factory.CreateClient();
    private static readonly Guid TenantId = Guid.NewGuid();

    [Fact]
    public async Task GET_token_returns_200_with_token_data_on_success()
    {
        factory.MockTenantRepository.GetByTenantIdAsync(TenantId, Arg.Any<CancellationToken>())
            .Returns(new PhilHealthTenant
            {
                TenantId = TenantId,
                AccreditationNumber = "H10000001",
                SoftwareCertificateId = "KON-DUMMYCERTS-Z15445",
                BaseUrl = "https://staging.philhealth.gov.ph"
            });

        factory.MockPcapiClient.AuthenticateAsync(Arg.Any<PhilHealthTenant>(), Arg.Any<CancellationToken>())
            .Returns(new PcapiTokenData("TOKEN_PCAPI_123", "Bearer", 3600));

        var response = await _client.SendAsync(
            new HttpRequestMessage(HttpMethod.Get, "/api/v1/auth/token")
                .WithTenantId(TenantId));

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.ReadAsAsync<PcapiTokenResponse>();
        body.Should().NotBeNull();
        body!.Status.Should().Be("success");
        body.Code.Should().Be(200);
        body.Data.Should().NotBeNull();
        body.Data!.AccessToken.Should().Be("TOKEN_PCAPI_123");
        body.Data.TokenType.Should().Be("Bearer");
        body.Data.ExpiresIn.Should().Be(3600);
    }

    [Fact]
    public async Task GET_token_returns_401_when_X_Tenant_Id_header_is_absent()
    {
        var response = await _client.GetAsync("/api/v1/auth/token");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task POST_token_returns_200_with_direct_credentials()
    {
        factory.MockPcapiClient.AuthenticateAsync(Arg.Any<PhilHealthTenant>(), Arg.Any<CancellationToken>())
            .Returns(new PcapiTokenData("TOKEN_POST_456", "Bearer", 3600));

        var request = new PcapiTokenRequest("KON-DUMMYCERTS-Z15445", "H10000001", "my_secret_key");
        var response = await _client.PostAsJsonAsync("/api/v1/auth/token", request);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.ReadAsAsync<PcapiTokenResponse>();
        body.Should().NotBeNull();
        body!.Status.Should().Be("success");
        body.Code.Should().Be(200);
        body.Data!.AccessToken.Should().Be("TOKEN_POST_456");
    }
}
