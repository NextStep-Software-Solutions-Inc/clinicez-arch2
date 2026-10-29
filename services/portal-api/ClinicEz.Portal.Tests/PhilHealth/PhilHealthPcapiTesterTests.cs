using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Infrastructure.PhilHealth;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ClinicEz.Portal.Tests.PhilHealth;

public sealed class PhilHealthPcapiTesterTests
{
    private sealed class FakeEnvironment(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "ClinicEz.Portal";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = null!;
    }

    private sealed class MockHttpHandler(HttpResponseMessage response) : HttpMessageHandler
    {
        public HttpRequestMessage? LastRequest { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            LastRequest = request;
            return Task.FromResult(response);
        }
    }

    [Fact]
    public async Task TestConnectionAsync_WithSimulationSandbox_ReturnsSimulatedTokenWithoutNetwork()
    {
        var handler = new MockHttpHandler(new HttpResponseMessage(HttpStatusCode.InternalServerError));
        var client = new HttpClient(handler);
        var env = new FakeEnvironment("Development");
        var tester = new PhilHealthPcapiTester(client, NullLogger<PhilHealthPcapiTester>.Instance, env);

        var result = await tester.TestConnectionAsync(
            accreditationNumber: "P10038831",
            secretKey: "any-secret",
            softwareCertificateId: "CERT-001",
            baseUrl: "https://staging.philhealth.gov.ph/api/v1/auth/token");

        Assert.True(result.Success);
        Assert.NotNull(result.Token);
        Assert.StartsWith("PKA-SIM-P10038831", result.Token);
        Assert.Contains("Simulation Sandbox Verified", result.Message);
        Assert.Null(handler.LastRequest); // Did not make network call
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public async Task TestConnectionAsync_MissingAccreditationNumber_ReturnsFailure(string? accreditationNumber)
    {
        var client = new HttpClient(new MockHttpHandler(new HttpResponseMessage(HttpStatusCode.OK)));
        var tester = new PhilHealthPcapiTester(client, NullLogger<PhilHealthPcapiTester>.Instance);

        var result = await tester.TestConnectionAsync(
            accreditationNumber: accreditationNumber!,
            secretKey: "some-key");

        Assert.False(result.Success);
        Assert.Contains("Accreditation Number", result.Message);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public async Task TestConnectionAsync_InProduction_MissingSecretKey_ReturnsFailure(string? secretKey)
    {
        var client = new HttpClient(new MockHttpHandler(new HttpResponseMessage(HttpStatusCode.OK)));
        var env = new FakeEnvironment("Production");
        var tester = new PhilHealthPcapiTester(client, NullLogger<PhilHealthPcapiTester>.Instance, env);

        var result = await tester.TestConnectionAsync(
            accreditationNumber: "H91001234",
            secretKey: secretKey!,
            baseUrl: "https://pcapi.philhealth.gov.ph");

        Assert.False(result.Success);
        Assert.Contains("Secret Key is required", result.Message);
    }

    [Fact]
    public async Task TestConnectionAsync_InProduction_HttpEndpoint_RejectsWithHttpsRequired()
    {
        var client = new HttpClient(new MockHttpHandler(new HttpResponseMessage(HttpStatusCode.OK)));
        var env = new FakeEnvironment("Production");
        var tester = new PhilHealthPcapiTester(client, NullLogger<PhilHealthPcapiTester>.Instance, env);

        var result = await tester.TestConnectionAsync(
            accreditationNumber: "H91001234",
            secretKey: "valid-secret-key-12345",
            baseUrl: "http://pcapi.philhealth.gov.ph");

        Assert.False(result.Success);
        Assert.Contains("HTTPS in production", result.Message);
    }

    [Theory]
    [InlineData("http://127.0.0.1:8080")]
    [InlineData("http://localhost:5000")]
    [InlineData("http://169.254.169.254/latest/meta-data")]
    [InlineData("http://10.0.0.1:8080")]
    [InlineData("http://192.168.1.1:8080")]
    [InlineData("http://172.16.0.1:8080")]
    [InlineData("http://my-service.internal:8080")]
    [InlineData("http://my-service.local:8080")]
    public async Task TestConnectionAsync_Ssrf_RejectsPrivateAndLoopbackAddresses(string endpoint)
    {
        var client = new HttpClient(new MockHttpHandler(new HttpResponseMessage(HttpStatusCode.OK)));
        var env = new FakeEnvironment("Production");
        var tester = new PhilHealthPcapiTester(client, NullLogger<PhilHealthPcapiTester>.Instance, env);

        var result = await tester.TestConnectionAsync(
            accreditationNumber: "H91001234",
            secretKey: "valid-secret",
            baseUrl: endpoint);

        Assert.False(result.Success);
        Assert.True(
            result.Message.Contains("not permitted") ||
            result.Message.Contains("HTTPS in production"),
            $"Expected SSRF / HTTPS rejection but got: {result.Message}");
    }

    [Fact]
    public async Task TestConnectionAsync_SuccessfulAuthTokenResponse_ReturnsTokenAndSuccess()
    {
        var jsonResponse = "{\"token\": \"PHILHEALTH_BEARER_TOKEN_999\"}";
        var response = new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(jsonResponse, Encoding.UTF8, "application/json")
        };
        var handler = new MockHttpHandler(response);
        var client = new HttpClient(handler);
        var env = new FakeEnvironment("Production");
        var tester = new PhilHealthPcapiTester(client, NullLogger<PhilHealthPcapiTester>.Instance, env);

        var result = await tester.TestConnectionAsync(
            accreditationNumber: "H91001234",
            secretKey: "prod-secret-key",
            softwareCertificateId: "CERT-PROD-01",
            baseUrl: "https://pcapi.philhealth.gov.ph");

        Assert.True(result.Success);
        Assert.Equal("PHILHEALTH_BEARER_TOKEN_999", result.Token);
        Assert.Contains("accepted facility credentials", result.Message);
        Assert.NotNull(handler.LastRequest);
        Assert.Equal(HttpMethod.Post, handler.LastRequest.Method);
        Assert.Equal("https://pcapi.philhealth.gov.ph/api/v1/auth/token", handler.LastRequest.RequestUri?.ToString());
    }

    [Fact]
    public async Task TestConnectionAsync_GatewayReturns401_ReturnsFailureWithErrorMessage()
    {
        var jsonResponse = "{\"message\": \"Invalid certificate or secret key supplied.\"}";
        var response = new HttpResponseMessage(HttpStatusCode.Unauthorized)
        {
            Content = new StringContent(jsonResponse, Encoding.UTF8, "application/json")
        };
        var handler = new MockHttpHandler(response);
        var client = new HttpClient(handler);
        var env = new FakeEnvironment("Production");
        var tester = new PhilHealthPcapiTester(client, NullLogger<PhilHealthPcapiTester>.Instance, env);

        var result = await tester.TestConnectionAsync(
            accreditationNumber: "H91001234",
            secretKey: "wrong-secret",
            softwareCertificateId: "CERT-PROD-01",
            baseUrl: "https://pcapi.philhealth.gov.ph");

        Assert.False(result.Success);
        Assert.Null(result.Token);
        Assert.Contains("HTTP 401", result.Message);
        Assert.Contains("Invalid certificate or secret key supplied", result.Message);
    }

    [Fact]
    public void IsSandbox_IdentifiesSandboxAndStagingEndpointsAccurately()
    {
        Assert.True(PhilHealthPcapiTester.IsSandbox(null));
        Assert.True(PhilHealthPcapiTester.IsSandbox(""));
        Assert.True(PhilHealthPcapiTester.IsSandbox("/api/v1/auth/token"));
        Assert.True(PhilHealthPcapiTester.IsSandbox("https://staging.philhealth.gov.ph/api/v1/auth/token"));
        Assert.True(PhilHealthPcapiTester.IsSandbox("https://sandbox.philhealth.gov.ph"));
        Assert.True(PhilHealthPcapiTester.IsSandbox("https://simulator.philhealth.gov.ph"));

        Assert.False(PhilHealthPcapiTester.IsSandbox("https://pcapi.philhealth.gov.ph"));
        Assert.False(PhilHealthPcapiTester.IsSandbox("https://api.philhealth.gov.ph"));
        Assert.False(PhilHealthPcapiTester.IsSandbox("https://my-mock-server.test/api/v1/auth/token"));
        Assert.False(PhilHealthPcapiTester.IsSandbox("https://external-gateway.com/api/v1/auth/token"));
    }
}
