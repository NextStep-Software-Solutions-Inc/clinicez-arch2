using System.Net;
using FluentAssertions;
using NSubstitute;
using PhilHealthProxy.Api.Tests.Infrastructure;
using PhilHealthProxy.Domain.Models;
using Xunit;

namespace PhilHealthProxy.Api.Tests.Endpoints;

public sealed class UploadStatusEndpointTests(KonsultaWebApplicationFactory factory)
    : IClassFixture<KonsultaWebApplicationFactory>
{
    private readonly HttpClient _client = factory.CreateClient();
    private static readonly Guid TenantId = Guid.NewGuid();

    private const string ValidUrl =
        "/api/konsulta/upload-status?startDate=2025-01-01&endDate=2025-01-31";

    [Fact]
    public async Task GET_upload_status_returns_200_on_success()
    {
        factory.MockSoapClient
            .CheckUploadStatusAsync(
                Arg.Any<string?>(), Arg.Any<string?>(), Arg.Any<string?>(), Arg.Any<string?>(),
                Arg.Any<CancellationToken>())
            .Returns(new SoapResult(true, "<return>PENDING</return>", null, null));

        var response = await _client.SendAsync(
            new HttpRequestMessage(HttpMethod.Get, ValidUrl).WithTenantId(TenantId));

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.ReadAsAsync<ApiResult<KonsultaResult>>();
        body!.Succeeded.Should().BeTrue();
        body.Data!.RawReturn.Should().Be("<return>PENDING</return>");
    }

    [Fact]
    public async Task GET_upload_status_returns_401_when_tenant_header_missing()
    {
        var response = await _client.GetAsync(ValidUrl);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task GET_upload_status_returns_400_when_dates_are_missing()
    {
        var response = await _client.SendAsync(
            new HttpRequestMessage(HttpMethod.Get, "/api/konsulta/upload-status")
                .WithTenantId(TenantId));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task GET_upload_status_returns_400_when_end_before_start()
    {
        var url = "/api/konsulta/upload-status?startDate=2025-06-01&endDate=2025-01-01";

        var response = await _client.SendAsync(
            new HttpRequestMessage(HttpMethod.Get, url).WithTenantId(TenantId));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task GET_upload_status_passes_optional_filters_through()
    {
        factory.MockSoapClient
            .CheckUploadStatusAsync(
                "2025-01-01", "2025-01-31", "TX-99", "RPT",
                Arg.Any<CancellationToken>())
            .Returns(new SoapResult(true, "<return/>", null, null));

        var url = "/api/konsulta/upload-status?startDate=2025-01-01&endDate=2025-01-31&transmittalId=TX-99&report=RPT";

        var response = await _client.SendAsync(
            new HttpRequestMessage(HttpMethod.Get, url).WithTenantId(TenantId));

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        await factory.MockSoapClient.Received(1)
            .CheckUploadStatusAsync("2025-01-01", "2025-01-31", "TX-99", "RPT", Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task GET_upload_status_returns_503_when_SOAP_fails()
    {
        factory.MockSoapClient
            .CheckUploadStatusAsync(
                Arg.Any<string?>(), Arg.Any<string?>(), Arg.Any<string?>(), Arg.Any<string?>(),
                Arg.Any<CancellationToken>())
            .Returns(new SoapResult(false, null, "TIMEOUT", "Request timed out."));

        var response = await _client.SendAsync(
            new HttpRequestMessage(HttpMethod.Get, ValidUrl).WithTenantId(TenantId));

        response.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
    }
}
