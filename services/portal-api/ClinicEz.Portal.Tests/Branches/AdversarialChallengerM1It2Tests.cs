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
using ClinicEz.Portal.Infrastructure.PhilHealth;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ClinicEz.Portal.Tests.Branches;

public sealed class AdversarialChallengerM1It2Tests
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
        public int CallCount { get; private set; }
        public HttpRequestMessage? LastRequest { get; private set; }
        public string? LastRequestBody { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            CallCount++;
            LastRequest = request;
            if (request.Content != null)
            {
                LastRequestBody = await request.Content.ReadAsStringAsync(cancellationToken);
            }

            var tokenJson = "{\"token\":\"ADVERSARIAL_PROBE_TOKEN\",\"expires_in\":3600}";

            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(tokenJson, Encoding.UTF8, "application/json")
            };
        }
    }

    [Theory]
    // 1. Trailing slash variants on staging
    [InlineData("https://staging.philhealth.gov.ph/", true)]
    [InlineData("https://staging.philhealth.gov.ph///", true)]
    [InlineData("https://staging.philhealth.gov.ph/KONSULTA/SOAP/", true)]
    [InlineData("https://staging.philhealth.gov.ph/KONSULTA/SOAP///", true)]
    [InlineData("https://staging.philhealth.gov.ph/soap/", true)]
    [InlineData("https://staging.philhealth.gov.ph/soap///", true)]
    [InlineData("/soap/konsulta", true)]
    [InlineData("/soap/konsulta/", true)]
    [InlineData("/soap/konsulta///", true)]
    // 2. Trailing slash variants on production (MUST BE FALSE)
    [InlineData("https://konsulta.philhealth.gov.ph/", false)]
    [InlineData("https://konsulta.philhealth.gov.ph///", false)]
    [InlineData("https://konsulta.philhealth.gov.ph/KONSULTA/SOAP/", false)]
    [InlineData("https://konsulta.philhealth.gov.ph/KONSULTA/SOAP///", false)]
    [InlineData("https://claims.philhealth.gov.ph/soap/gateway/", false)]
    [InlineData("https://claims.philhealth.gov.ph/soap/gateway///", false)]
    // 3. Whitespace trimming variants
    [InlineData("   https://staging.philhealth.gov.ph/KONSULTA/SOAP/   ", true)]
    [InlineData("\t\r\nhttps://staging.philhealth.gov.ph/soap/\r\n", true)]
    [InlineData("   https://konsulta.philhealth.gov.ph/KONSULTA/SOAP/   ", false)]
    [InlineData("\t\r\nhttps://claims.philhealth.gov.ph/soap/gateway/\r\n", false)]
    [InlineData("   ", true)]
    [InlineData("", true)]
    [InlineData(null, true)]
    // 4. Subdomain variants of philhealth.gov.ph
    [InlineData("https://staging.philhealth.gov.ph", true)]
    [InlineData("https://uat.staging.philhealth.gov.ph", true)]
    [InlineData("https://dev-staging.philhealth.gov.ph", true)]
    [InlineData("https://konsulta.philhealth.gov.ph", false)]
    [InlineData("https://claims.philhealth.gov.ph", false)]
    [InlineData("https://prod.philhealth.gov.ph", false)]
    [InlineData("https://api.philhealth.gov.ph", false)]
    [InlineData("https://portal.philhealth.gov.ph", false)]
    [InlineData("https://members.philhealth.gov.ph", false)]
    [InlineData("https://philhealth.gov.ph", false)]
    [InlineData("https://notstaging.philhealth.gov.ph", false)]
    [InlineData("https://philhealth.gov.ph.attacker.com", false)]
    // 5. Sandbox routes & custom sandbox endpoints
    [InlineData("https://sandbox.externalprovider.com/soap", true)]
    [InlineData("https://simulator.externalprovider.com/soap", true)]
    [InlineData("https://proxy.internal/soap/konsulta", true)]
    [InlineData("https://proxy.internal/soap/konsulta/", true)]
    [InlineData("https://proxy.internal/soap/konsulta///", true)]
    [InlineData("https://proxy.internal/KONSULTA/SOAP", false)]
    [InlineData("https://proxy.internal/SOAP/", false)]
    [InlineData("https://proxy.internal/soap/", false)]
    public void IsStagingOrSandbox_AdversarialStressTest_EvaluatesAccurately(string? endpoint, bool expected)
    {
        var actual = PhilHealthPcapiTester.IsStagingOrSandbox(endpoint);
        Assert.Equal(expected, actual);
    }

    [Theory]
    [InlineData("https://konsulta.philhealth.gov.ph/KONSULTA/SOAP/")]
    [InlineData("https://konsulta.philhealth.gov.ph/KONSULTA/SOAP///")]
    [InlineData("  https://konsulta.philhealth.gov.ph/KONSULTA/SOAP/  ")]
    [InlineData("https://claims.philhealth.gov.ph/soap/gateway/")]
    [InlineData("https://claims.philhealth.gov.ph/soap/gateway///")]
    [InlineData("https://prod.philhealth.gov.ph/KONSULTA/SOAP/")]
    public async Task PhilHealthPcapiTester_AdversarialProductionEndpoints_StrictlyBlocksBlankCredentials(string endpoint)
    {
        var handler = new CapturingProbeHandler();
        var httpClient = new HttpClient(handler);
        var env = new FakeEnvironment("Production");
        var tester = new PhilHealthPcapiTester(httpClient, NullLogger<PhilHealthPcapiTester>.Instance, env);

        var result = await tester.TestConnectionAsync(
            accreditationNumber: "H91001234",
            secretKey: "",
            softwareCertificateId: "CERT-PROD",
            baseUrl: endpoint);

        Assert.False(result.Success);
        Assert.Contains("Secret Key is required", result.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(0, handler.CallCount);
        Assert.Null(handler.LastRequest);
    }

    [Theory]
    [InlineData("https://staging.philhealth.gov.ph/KONSULTA/SOAP/")]
    [InlineData("https://staging.philhealth.gov.ph/KONSULTA/SOAP///")]
    [InlineData("  https://staging.philhealth.gov.ph/KONSULTA/SOAP/  ")]
    [InlineData("https://staging.philhealth.gov.ph/soap/")]
    [InlineData("https://staging.philhealth.gov.ph/soap///")]
    public async Task PhilHealthPcapiTester_AdversarialStagingEndpoints_AllowsBlankCredentialsAndSendsXml(string endpoint)
    {
        var handler = new CapturingProbeHandler();
        var httpClient = new HttpClient(handler);
        var env = new FakeEnvironment("Production");
        var tester = new PhilHealthPcapiTester(httpClient, NullLogger<PhilHealthPcapiTester>.Instance, env);

        var result = await tester.TestConnectionAsync(
            accreditationNumber: "P10038831",
            secretKey: "",
            softwareCertificateId: "CERT-STAGING",
            baseUrl: endpoint);

        Assert.True(result.Success);
        Assert.Equal(1, handler.CallCount);
        Assert.NotNull(handler.LastRequestBody);

        var doc = JsonDocument.Parse(handler.LastRequestBody!);
        Assert.Equal("P10038831", doc.RootElement.GetProperty("accreditationNumber").GetString());
        Assert.Equal("", doc.RootElement.GetProperty("secretKey").GetString());
    }

    [Theory]
    [InlineData("https://konsulta.philhealth.gov.ph/KONSULTA/SOAP/?target=staging.philhealth.gov.ph")]
    [InlineData("https://konsulta.philhealth.gov.ph/staging.philhealth.gov.ph/SOAP/")]
    [InlineData("https://notstaging.philhealth.gov.ph/soap/")]
    [InlineData("https://teststaging.philhealth.gov.ph/soap/")]
    public async Task PhilHealthPcapiTester_AdversarialProductionBypassAttempts_MustBeRejected(string endpoint)
    {
        var handler = new CapturingProbeHandler();
        var httpClient = new HttpClient(handler);
        var env = new FakeEnvironment("Production");
        var tester = new PhilHealthPcapiTester(httpClient, NullLogger<PhilHealthPcapiTester>.Instance, env);

        var result = await tester.TestConnectionAsync(
            accreditationNumber: "H91001234",
            secretKey: "",
            softwareCertificateId: "CERT-PROD",
            baseUrl: endpoint);

        Assert.False(result.Success);
        Assert.Contains("Secret Key is required", result.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(0, handler.CallCount);
        Assert.Null(handler.LastRequest);
    }
}
