using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using NSubstitute;
using ClinicEz.PhilHealthProxy.Api.Tests.Infrastructure;
using ClinicEz.PhilHealthProxy.Domain.Models;
using Xunit;

namespace ClinicEz.PhilHealthProxy.Api.Tests.Endpoints;

public sealed class ReportsEndpointTests(KonsultaWebApplicationFactory factory)
    : IClassFixture<KonsultaWebApplicationFactory>
{
    private readonly HttpClient _client = factory.CreateClient();
    private static readonly Guid TenantId = Guid.NewGuid();

    // ── POST /api/konsulta/reports/validate ───────────────────────────────────

    [Fact]
    public async Task POST_validate_returns_200_on_success()
    {
        factory.MockSoapClient
            .ValidateReportAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new SoapResult(true, "<return>VALID</return>", null, null));

        var response = await _client.SendAsync(
            new HttpRequestMessage(HttpMethod.Post, "/api/konsulta/reports/validate")
            {
                Content = JsonContent.Create(new { reportTagging = "1", report = "<xml/>" })
            }.WithTenantId(TenantId));

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.ReadAsAsync<ApiResult<KonsultaResult>>();
        body!.Succeeded.Should().BeTrue();
        body.Data!.RawReturn.Should().Be("<return>VALID</return>");
    }

    [Fact]
    public async Task POST_validate_returns_401_when_tenant_header_missing()
    {
        var response = await _client.PostAsJsonAsync(
            "/api/konsulta/reports/validate",
            new { reportTagging = "1", report = "<xml/>" });

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task POST_validate_returns_400_when_report_is_empty()
    {
        var response = await _client.SendAsync(
            new HttpRequestMessage(HttpMethod.Post, "/api/konsulta/reports/validate")
            {
                Content = JsonContent.Create(new { reportTagging = "1", report = "" })
            }.WithTenantId(TenantId));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task POST_validate_returns_503_when_SOAP_fails()
    {
        factory.MockSoapClient
            .ValidateReportAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new SoapResult(false, null, "INVALID", "Server-side validation failed."));

        var response = await _client.SendAsync(
            new HttpRequestMessage(HttpMethod.Post, "/api/konsulta/reports/validate")
            {
                Content = JsonContent.Create(new { reportTagging = "1", report = "<xml/>" })
            }.WithTenantId(TenantId));

        response.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
    }

    // ── POST /api/konsulta/reports/submit ─────────────────────────────────────

    // Valid transmittal ID: R + 9-char accreditation + 6-digit yyyymm + 5-digit seq = 21 chars
    private const string ValidTransmittalId = "RH9000000120230100001";

    [Fact]
    public async Task POST_submit_returns_200_on_success()
    {
        factory.MockSoapClient
            .SubmitReportAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new SoapResult(true, "<return>SUBMITTED</return>", null, null));

        var response = await _client.SendAsync(
            new HttpRequestMessage(HttpMethod.Post, "/api/konsulta/reports/submit")
            {
                Content = JsonContent.Create(new { transmittalId = ValidTransmittalId, report = "<xml/>", reportTagging = "1" })
            }.WithTenantId(TenantId));

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.ReadAsAsync<ApiResult<KonsultaResult>>();
        body!.Succeeded.Should().BeTrue();
        body.Data!.RawReturn.Should().Be("<return>SUBMITTED</return>");
    }

    [Fact]
    public async Task POST_submit_returns_401_when_tenant_header_missing()
    {
        var response = await _client.PostAsJsonAsync(
            "/api/konsulta/reports/submit",
            new { transmittalId = ValidTransmittalId, report = "<xml/>", reportTagging = "1" });

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task POST_submit_returns_400_when_transmittal_id_is_empty()
    {
        var response = await _client.SendAsync(
            new HttpRequestMessage(HttpMethod.Post, "/api/konsulta/reports/submit")
            {
                Content = JsonContent.Create(new { transmittalId = "", report = "<xml/>", reportTagging = "1" })
            }.WithTenantId(TenantId));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task POST_submit_returns_503_when_SOAP_fails()
    {
        factory.MockSoapClient
            .SubmitReportAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new SoapResult(false, null, "REJECTED", "Submission rejected by PhilHealth."));

        var response = await _client.SendAsync(
            new HttpRequestMessage(HttpMethod.Post, "/api/konsulta/reports/submit")
            {
                Content = JsonContent.Create(new { transmittalId = ValidTransmittalId, report = "<xml/>", reportTagging = "1" })
            }.WithTenantId(TenantId));

        response.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
    }
}
