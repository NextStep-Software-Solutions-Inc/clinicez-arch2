using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Xml.Linq;
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

            var soapResponseXml = @"<soapenv:Envelope xmlns:soapenv=""http://schemas.xmlsoap.org/soap/envelope/"" xmlns:phi=""http://philhealth.gov.ph/"">
   <soapenv:Body>
      <phi:getTokenResponse>
         <return>PROBE_TOKEN_12345</return>
      </phi:getTokenResponse>
   </soapenv:Body>
</soapenv:Envelope>";

            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(soapResponseXml, Encoding.UTF8, "text/xml")
            };
        }
    }

    [Theory]
    [InlineData(null, true)]
    [InlineData("", true)]
    [InlineData("   ", true)]
    [InlineData("https://staging.philhealth.gov.ph/KONSULTA/SOAP", true)]
    [InlineData("https://staging.philhealth.gov.ph/KONSULTA/SOAP/", true)]
    [InlineData("https://staging.philhealth.gov.ph/soap", true)]
    [InlineData("https://staging.philhealth.gov.ph/soap/", true)]
    [InlineData("https://sandbox.philhealth.gov.ph/soap", false)]
    [InlineData("https://simulator.philhealth.gov.ph/soap", false)]
    [InlineData("https://sandbox.example.com/soap", true)]
    [InlineData("https://simulator.example.com/soap", true)]
    [InlineData("/soap/konsulta", true)]
    [InlineData("/soap/konsulta/", true)]
    [InlineData("https://konsulta.philhealth.gov.ph/KONSULTA/SOAP", false)]
    [InlineData("https://konsulta.philhealth.gov.ph/KONSULTA/SOAP/", false)]
    [InlineData("https://claims.philhealth.gov.ph/soap/gateway", false)]
    [InlineData("https://claims.philhealth.gov.ph/soap/gateway/", false)]
    [InlineData("https://prod.philhealth.gov.ph/KONSULTA/SOAP", false)]
    [InlineData("https://prod.philhealth.gov.ph/KONSULTA/SOAP/", false)]
    [InlineData("https://production.philhealth.gov.ph", false)]
    [InlineData("https://production.philhealth.gov.ph/", false)]
    [InlineData("https://custom.philhealth.gov.ph/soap/probe", false)]
    [InlineData("  https://staging.philhealth.gov.ph/KONSULTA/SOAP/  ", true)]
    [InlineData("  https://konsulta.philhealth.gov.ph/KONSULTA/SOAP/  ", false)]
    public void IsStagingOrSandbox_EvaluatesEndpointsAccurately(string? endpoint, bool expected)
    {
        var actual = PhilHealthSoapTester.IsStagingOrSandbox(endpoint);
        Assert.Equal(expected, actual);
    }

    [Fact]
    public async Task PhilHealthSoapTester_InProduction_RejectsBlankCredentialsOnTrailingSlashProductionEndpointWithoutNetworkCall()
    {
        var handler = new CapturingProbeHandler();
        var httpClient = new HttpClient(handler);
        var env = new FakeEnvironment("Production");
        var tester = new PhilHealthSoapTester(httpClient, NullLogger<PhilHealthSoapTester>.Instance, env);

        var result = await tester.TestConnectionAsync(
            accreditationNumber: "H91001234",
            username: "",
            password: "",
            softwareCertificateId: "CERT-2026",
            endpoint: "https://konsulta.philhealth.gov.ph/KONSULTA/SOAP/");

        Assert.False(result.Success);
        Assert.Contains("SOAP Username is required", result.Message);
        Assert.Null(handler.LastRequest);
    }

    [Fact]
    public async Task PhilHealthSoapTester_InProduction_AllowsBlankCredentialsOnStagingEndpoint()
    {
        var handler = new CapturingProbeHandler();
        var httpClient = new HttpClient(handler);
        var env = new FakeEnvironment("Production");
        var tester = new PhilHealthSoapTester(httpClient, NullLogger<PhilHealthSoapTester>.Instance, env);

        var result = await tester.TestConnectionAsync(
            accreditationNumber: "P10038831",
            username: "",
            password: "",
            softwareCertificateId: "KON-DUMMYCERTS-Z15445",
            endpoint: "https://staging.philhealth.gov.ph/KONSULTA/SOAP");

        Assert.True(result.Success);
        Assert.Equal("PROBE_TOKEN_12345", result.Token);

        Assert.NotNull(handler.LastRequestBody);
        var xml = XDocument.Parse(handler.LastRequestBody!);
        XNamespace phiNs = "http://philhealth.gov.ph/";
        var usernameElem = xml.Descendants(phiNs + "pUsername").FirstOrDefault();
        var passwordElem = xml.Descendants(phiNs + "pUserPassword").FirstOrDefault();

        Assert.NotNull(usernameElem);
        Assert.Empty(usernameElem!.Value);

        Assert.NotNull(passwordElem);
        Assert.Empty(passwordElem!.Value);
    }

    [Theory]
    [InlineData("", "pass", "SOAP Username is required")]
    [InlineData("   ", "pass", "SOAP Username is required")]
    [InlineData(null, "pass", "SOAP Username is required")]
    [InlineData("user", "", "SOAP Password is required")]
    [InlineData("user", "   ", "SOAP Password is required")]
    [InlineData("user", null, "SOAP Password is required")]
    public async Task PhilHealthSoapTester_InProduction_RejectsBlankOrWhitespaceCredentialsOnProductionEndpoint(
        string? user,
        string? pass,
        string expectedError)
    {
        var handler = new CapturingProbeHandler();
        var httpClient = new HttpClient(handler);
        var env = new FakeEnvironment("Production");
        var tester = new PhilHealthSoapTester(httpClient, NullLogger<PhilHealthSoapTester>.Instance, env);

        var result = await tester.TestConnectionAsync(
            accreditationNumber: "H91001234",
            username: user!,
            password: pass!,
            softwareCertificateId: "CERT-2026",
            endpoint: "https://konsulta.philhealth.gov.ph/KONSULTA/SOAP");

        Assert.False(result.Success);
        Assert.Contains(expectedError, result.Message);
    }

    [Theory]
    [InlineData("", "PhilHealth Accreditation Number")]
    [InlineData("   ", "PhilHealth Accreditation Number")]
    [InlineData(null, "PhilHealth Accreditation Number")]
    public async Task PhilHealthSoapTester_AlwaysRequiresAccreditationNumber(
        string? accreditation,
        string expectedError)
    {
        var httpClient = new HttpClient();
        var env = new FakeEnvironment("Production");
        var tester = new PhilHealthSoapTester(httpClient, NullLogger<PhilHealthSoapTester>.Instance, env);

        var result = await tester.TestConnectionAsync(
            accreditationNumber: accreditation!,
            username: "",
            password: "",
            softwareCertificateId: null,
            endpoint: "https://staging.philhealth.gov.ph/KONSULTA/SOAP");

        Assert.False(result.Success);
        Assert.Contains(expectedError, result.Message);
    }

    [Fact]
    public async Task PhilHealthSoapTester_WithSpecialXmlCharactersInCredentials_EscapesSafely()
    {
        var handler = new CapturingProbeHandler();
        var httpClient = new HttpClient(handler);
        var env = new FakeEnvironment("Production");
        var tester = new PhilHealthSoapTester(httpClient, NullLogger<PhilHealthSoapTester>.Instance, env);

        var result = await tester.TestConnectionAsync(
            accreditationNumber: "P10038831",
            username: "user<name>&'\"test",
            password: "pass<word>&'\"secret",
            softwareCertificateId: "CERT<1>&",
            endpoint: "https://staging.philhealth.gov.ph/KONSULTA/SOAP");

        Assert.True(result.Success);
        Assert.NotNull(handler.LastRequestBody);

        // Must parse as valid XML without syntax exception
        var xml = XDocument.Parse(handler.LastRequestBody!);
        XNamespace phiNs = "http://philhealth.gov.ph/";
        Assert.Equal("user<name>&'\"test", xml.Descendants(phiNs + "pUsername").First().Value);
        Assert.Equal("pass<word>&'\"secret", xml.Descendants(phiNs + "pUserPassword").First().Value);
        Assert.Equal("CERT<1>&", xml.Descendants(phiNs + "pSoftwareCertificationId").First().Value);
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
