using System.Net;
using FluentAssertions;
using NSubstitute;
using ClinicEz.PhilHealthProxy.Api.Tests.Infrastructure;
using ClinicEz.PhilHealthProxy.Domain.Models;
using Xunit;

namespace ClinicEz.PhilHealthProxy.Api.Tests.Endpoints;

public sealed class RegistrationEndpointTests(KonsultaWebApplicationFactory factory)
    : IClassFixture<KonsultaWebApplicationFactory>
{
    private readonly HttpClient _client = factory.CreateClient();
    private static readonly Guid TenantId = Guid.NewGuid();

    private const string ValidUrl =
        "/api/konsulta/registration?startDate=2025-01-01&endDate=2025-01-31";

    [Fact]
    public async Task GET_registration_returns_200_on_success()
    {
        factory.MockSoapClient
            .ExtractRegistrationListAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new SoapResult(true, "<return><list/></return>", null, null));

        var response = await _client.SendAsync(
            new HttpRequestMessage(HttpMethod.Get, ValidUrl).WithTenantId(TenantId));

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.ReadAsAsync<ApiResult<KonsultaResult>>();
        body!.Succeeded.Should().BeTrue();
        body.Data!.RawReturn.Should().Contain("<list/>");
    }

    [Fact]
    public async Task GET_registration_returns_401_when_tenant_header_missing()
    {
        var response = await _client.GetAsync(ValidUrl);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task GET_registration_returns_400_when_end_date_before_start_date()
    {
        var url = "/api/konsulta/registration?startDate=2025-03-01&endDate=2025-01-01";

        var response = await _client.SendAsync(
            new HttpRequestMessage(HttpMethod.Get, url).WithTenantId(TenantId));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task GET_registration_returns_400_when_start_date_missing()
    {
        var url = "/api/konsulta/registration?endDate=2025-01-31";

        var response = await _client.SendAsync(
            new HttpRequestMessage(HttpMethod.Get, url).WithTenantId(TenantId));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task GET_registration_returns_503_when_SOAP_fails()
    {
        factory.MockSoapClient
            .ExtractRegistrationListAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new SoapResult(false, null, "TRANSPORT_ERROR", "Cannot reach PhilHealth."));

        var response = await _client.SendAsync(
            new HttpRequestMessage(HttpMethod.Get, ValidUrl).WithTenantId(TenantId));

        response.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
    }
}
