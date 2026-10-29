using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.PhilHealth;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.PhilHealth;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ClinicEz.Portal.Tests.Branches;

public sealed class ChallengerMilestone1TesterTests
{
    private sealed class FakeEnvironment(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "ClinicEz.Portal";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = null!;
    }

    private sealed class CapturingProbeHandler : HttpMessageHandler
    {
        public HttpRequestMessage? LastRequest { get; private set; }
        public string? LastRequestBody { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            LastRequest = request;
            if (request.Content != null)
            {
                LastRequestBody = await request.Content.ReadAsStringAsync(cancellationToken);
            }

            var tokenJson = "{\"token\":\"PROBE_TOKEN_12345\",\"expires_in\":3600}";

            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(tokenJson, Encoding.UTF8, "application/json")
            };
        }
    }

    [Theory]
    [InlineData(null, true)]
    [InlineData("", true)]
    [InlineData("   ", true)]
    [InlineData("https://staging.philhealth.gov.ph/pcapi", true)]
    [InlineData("https://staging.philhealth.gov.ph/pcapi/", true)]
    [InlineData("https://staging.philhealth.gov.ph/api", true)]
    [InlineData("https://staging.philhealth.gov.ph/api/", true)]
    [InlineData("https://sandbox.philhealth.gov.ph/api", true)]
    [InlineData("https://simulator.philhealth.gov.ph/api", true)]
    [InlineData("https://sandbox.example.com/api", true)]
    [InlineData("https://simulator.example.com/api", true)]
    [InlineData("/api/v1/auth/token", true)]
    [InlineData("/api/v1/auth/token/", true)]
    [InlineData("https://pcapi.philhealth.gov.ph/api/v1", false)]
    [InlineData("https://pcapi.philhealth.gov.ph/api/v1/", false)]
    [InlineData("https://claims.philhealth.gov.ph/pcapi/gateway", false)]
    [InlineData("https://claims.philhealth.gov.ph/pcapi/gateway/", false)]
    [InlineData("https://prod.philhealth.gov.ph/api", false)]
    [InlineData("https://prod.philhealth.gov.ph/api/", false)]
    [InlineData("https://production.philhealth.gov.ph", false)]
    [InlineData("https://production.philhealth.gov.ph/", false)]
    [InlineData("https://custom.philhealth.gov.ph/pcapi/probe", false)]
    [InlineData("  https://staging.philhealth.gov.ph/pcapi/  ", true)]
    [InlineData("  https://pcapi.philhealth.gov.ph/api/  ", false)]
    public void IsStagingOrSandbox_EvaluatesEndpointsAccurately(string? endpoint, bool expected)
    {
        var actual = PhilHealthPcapiTester.IsStagingOrSandbox(endpoint);
        Assert.Equal(expected, actual);
    }

    [Fact]
    public async Task PhilHealthPcapiTester_InProduction_RejectsBlankCredentialsOnTrailingSlashProductionEndpointWithoutNetworkCall()
    {
        var handler = new CapturingProbeHandler();
        var httpClient = new HttpClient(handler);
        var env = new FakeEnvironment("Production");
        var tester = new PhilHealthPcapiTester(httpClient, NullLogger<PhilHealthPcapiTester>.Instance, env);

        var result = await tester.TestConnectionAsync(
            accreditationNumber: "H91001234",
            secretKey: "",
            softwareCertificateId: "CERT-2026",
            baseUrl: "https://pcapi.philhealth.gov.ph/");

        Assert.False(result.Success);
        Assert.Contains("Secret Key is required", result.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Null(handler.LastRequest);
    }

    [Fact]
    public async Task PhilHealthPcapiTester_InProduction_AllowsBlankCredentialsOnStagingEndpoint()
    {
        var handler = new CapturingProbeHandler();
        var httpClient = new HttpClient(handler);
        var env = new FakeEnvironment("Production");
        var tester = new PhilHealthPcapiTester(httpClient, NullLogger<PhilHealthPcapiTester>.Instance, env);

        var result = await tester.TestConnectionAsync(
            accreditationNumber: "P10038831",
            secretKey: "",
            softwareCertificateId: "KON-DUMMYCERTS-Z15445",
            baseUrl: "https://staging.philhealth.gov.ph/api/v1/auth/token");

        Assert.True(result.Success);
        Assert.Equal("PROBE_TOKEN_12345", result.Token);

        Assert.NotNull(handler.LastRequestBody);
        var doc = JsonDocument.Parse(handler.LastRequestBody!);
        Assert.Equal("P10038831", doc.RootElement.GetProperty("accreditationNumber").GetString());
        Assert.Equal("", doc.RootElement.GetProperty("secretKey").GetString());
    }

    [Theory]
    [InlineData("", "Secret key is required")]
    [InlineData("   ", "Secret key is required")]
    [InlineData(null, "Secret key is required")]
    public async Task PhilHealthPcapiTester_InProduction_RejectsBlankOrWhitespaceCredentialsOnProductionEndpoint(
        string? secretKey,
        string expectedError)
    {
        var handler = new CapturingProbeHandler();
        var httpClient = new HttpClient(handler);
        var env = new FakeEnvironment("Production");
        var tester = new PhilHealthPcapiTester(httpClient, NullLogger<PhilHealthPcapiTester>.Instance, env);

        var result = await tester.TestConnectionAsync(
            accreditationNumber: "H91001234",
            secretKey: secretKey!,
            softwareCertificateId: "CERT-2026",
            baseUrl: "https://pcapi.philhealth.gov.ph");

        Assert.False(result.Success);
        Assert.Contains(expectedError, result.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData("", "PhilHealth Accreditation Number")]
    [InlineData("   ", "PhilHealth Accreditation Number")]
    [InlineData(null, "PhilHealth Accreditation Number")]
    public async Task PhilHealthPcapiTester_AlwaysRequiresAccreditationNumber(
        string? accreditation,
        string expectedError)
    {
        var httpClient = new HttpClient();
        var env = new FakeEnvironment("Production");
        var tester = new PhilHealthPcapiTester(httpClient, NullLogger<PhilHealthPcapiTester>.Instance, env);

        var result = await tester.TestConnectionAsync(
            accreditationNumber: accreditation!,
            secretKey: "",
            softwareCertificateId: null,
            baseUrl: "https://staging.philhealth.gov.ph/api/v1/auth/token");

        Assert.False(result.Success);
        Assert.Contains(expectedError, result.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task PhilHealthPcapiTester_WithSpecialCharactersInCredentials_EscapesSafely()
    {
        var handler = new CapturingProbeHandler();
        var httpClient = new HttpClient(handler);
        var env = new FakeEnvironment("Production");
        var tester = new PhilHealthPcapiTester(httpClient, NullLogger<PhilHealthPcapiTester>.Instance, env);

        var result = await tester.TestConnectionAsync(
            accreditationNumber: "P10038831",
            secretKey: "secret\"key<>&",
            softwareCertificateId: "CERT<1>&",
            baseUrl: "https://staging.philhealth.gov.ph/api/v1/auth/token");

        Assert.True(result.Success);
        Assert.NotNull(handler.LastRequestBody);

        var doc = JsonDocument.Parse(handler.LastRequestBody!);
        Assert.Equal("P10038831", doc.RootElement.GetProperty("accreditationNumber").GetString());
        Assert.Equal("secret\"key<>&", doc.RootElement.GetProperty("secretKey").GetString());
        Assert.Equal("CERT<1>&", doc.RootElement.GetProperty("softwareCertificateId").GetString());
    }

    [Fact]
    public void PhilHealthSecretProtector_UnprotectWithCorruptCiphertext_ReturnsStoredValueWithoutCrashing()
    {
        var dataProtection = new EphemeralDataProtectionProvider();
        var protector = new PhilHealthSecretProtector(dataProtection);

        // When stored value is not valid protected ciphertext
        var corruptInput = "corrupt-non-dpapi-string-12345";
        var result = protector.Unprotect(corruptInput);

        // Does not throw CryptographicException; returns raw stored string as fallback
        Assert.Equal(corruptInput, result);
    }
}
