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

namespace ClinicEz.Portal.Tests.Adversarial;

/// <summary>
/// Empirical Challenger Verification Suite (Iteration 2) for Milestone M2-C:
/// 1. Comprehensive SSRF stress testing of IPv4-mapped IPv6 unwrapping and blocking.
/// 2. Verification of RFC 4193 IPv6 Unique Local Addresses (ULA: fc00::/7, fd00::/8).
/// 3. Verification of IPv6 and IPv4 loopback, link-local, site-local, multicast.
/// 4. Verification that valid public IP addresses (IPv4, IPv6, IPv4-mapped IPv6) are NOT erroneously blocked.
/// 5. BaseUrl path normalization across diverse casing, slashes, and prefixes.
/// 6. Simulation sandbox classification accuracy between PhilHealth sandboxes, localhost, and external custom mock servers.
/// 7. Development vs Production network dispatch vs synthetic token behavior.
/// </summary>
public sealed class ChallengerM2CIt2EmpiricalVerificationTests
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
        private readonly HttpResponseMessage _response;

        public CapturingProbeHandler(HttpResponseMessage? response = null)
        {
            _response = response ?? new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("{\"token\":\"GENUINE_MOCK_PROBE_TOKEN_12345\"}", Encoding.UTF8, "application/json")
            };
        }

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            LastRequest = request;
            if (request.Content != null)
            {
                LastRequestBody = await request.Content.ReadAsStringAsync(cancellationToken);
            }
            return _response;
        }
    }

    #region 1. SSRF Defense: IPv4-Mapped IPv6 Unwrapping & Blocking

    [Theory]
    // Cloud Instance Metadata Service via mapped IPv6
    [InlineData("https://[::ffff:169.254.169.254]:8080")]
    [InlineData("https://[::ffff:169.254.1.1]:8080")]
    [InlineData("https://[::ffff:169.254.255.255]:8080")]
    [InlineData("https://[0:0:0:0:0:ffff:169.254.169.254]:8080")]
    // RFC 1918 Class A (10.0.0.0/8) via mapped IPv6
    [InlineData("https://[::ffff:10.0.0.1]:8080")]
    [InlineData("https://[::ffff:10.254.1.1]:8080")]
    [InlineData("https://[::ffff:10.255.255.255]:8080")]
    [InlineData("https://[0:0:0:0:0:ffff:10.0.0.1]:8080")]
    // RFC 1918 Class B (172.16.0.0/12) via mapped IPv6
    [InlineData("https://[::ffff:172.16.0.1]:8080")]
    [InlineData("https://[::ffff:172.24.1.1]:8080")]
    [InlineData("https://[::ffff:172.31.255.255]:8080")]
    // RFC 1918 Class C (192.168.0.0/16) via mapped IPv6
    [InlineData("https://[::ffff:192.168.0.1]:8080")]
    [InlineData("https://[::ffff:192.168.1.1]:8080")]
    [InlineData("https://[::ffff:192.168.255.255]:8080")]
    // Loopback & Zero via mapped IPv6
    [InlineData("https://[::ffff:127.0.0.1]:8080")]
    [InlineData("https://[::ffff:127.128.0.1]:8080")]
    [InlineData("https://[::ffff:127.255.255.255]:8080")]
    [InlineData("https://[::ffff:0.0.0.0]:8080")]
    public async Task Ssrf_Ipv4MappedIpv6_PrivateAndLinkLocalAddresses_StrictlyBlockedWithoutNetworkDispatch(string endpoint)
    {
        var handler = new CapturingProbeHandler();
        var client = new HttpClient(handler);
        var env = new FakeEnvironment("Production");
        var tester = new PhilHealthPcapiTester(client, NullLogger<PhilHealthPcapiTester>.Instance, env);

        var result = await tester.TestConnectionAsync(
            accreditationNumber: "H91001234",
            secretKey: "secret-key",
            baseUrl: endpoint);

        Assert.False(result.Success);
        Assert.Null(handler.LastRequest); // Zero outbound network requests allowed
        Assert.Contains("not permitted", result.Message, StringComparison.OrdinalIgnoreCase);
    }

    #endregion

    #region 2. SSRF Defense: IPv6 Unique Local Addresses (ULA: fc00::/7)

    [Theory]
    [InlineData("https://[fc00::1]:8080")]
    [InlineData("https://[fc00:1234:5678::1]:8080")]
    [InlineData("https://[fd00::1]:8080")]
    [InlineData("https://[fd12:3456:789a:bcde::1]:8080")]
    [InlineData("https://[fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff]:8080")]
    public async Task Ssrf_Ipv6_UniqueLocalAddresses_StrictlyBlockedWithoutNetworkDispatch(string endpoint)
    {
        var handler = new CapturingProbeHandler();
        var client = new HttpClient(handler);
        var env = new FakeEnvironment("Production");
        var tester = new PhilHealthPcapiTester(client, NullLogger<PhilHealthPcapiTester>.Instance, env);

        var result = await tester.TestConnectionAsync(
            accreditationNumber: "H91001234",
            secretKey: "secret-key",
            baseUrl: endpoint);

        Assert.False(result.Success);
        Assert.Null(handler.LastRequest);
        Assert.Contains("not permitted", result.Message, StringComparison.OrdinalIgnoreCase);
    }

    #endregion

    #region 3. SSRF Defense: Link-Local, Site-Local, Multicast, Loopback

    [Theory]
    // IPv6 Loopback
    [InlineData("https://[::1]:8080")]
    [InlineData("https://[0:0:0:0:0:0:0:1]:8080")]
    // IPv6 Link-Local
    [InlineData("https://[fe80::1]:8080")]
    [InlineData("https://[febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff]:8080")]
    // IPv6 Site-Local
    [InlineData("https://[fec0::1]:8080")]
    // IPv6 Multicast
    [InlineData("https://[ff01::1]:8080")]
    [InlineData("https://[ff02::1]:8080")]
    [InlineData("https://[ff05::2]:8080")]
    // Standard IPv4 Loopback and Link-Local
    [InlineData("https://127.0.0.1:8080")]
    [InlineData("https://127.255.0.1:8080")]
    [InlineData("https://169.254.169.254:8080")]
    [InlineData("https://169.254.1.1:8080")]
    public async Task Ssrf_StandardLoopbackLinkLocalSiteLocalMulticast_StrictlyBlocked(string endpoint)
    {
        var handler = new CapturingProbeHandler();
        var client = new HttpClient(handler);
        var env = new FakeEnvironment("Production");
        var tester = new PhilHealthPcapiTester(client, NullLogger<PhilHealthPcapiTester>.Instance, env);

        var result = await tester.TestConnectionAsync(
            accreditationNumber: "H91001234",
            secretKey: "secret-key",
            baseUrl: endpoint);

        Assert.False(result.Success);
        Assert.Null(handler.LastRequest);
        Assert.Contains("not permitted", result.Message, StringComparison.OrdinalIgnoreCase);
    }

    #endregion

    #region 4. SSRF Defense: Public IP Addresses Are Allowed To Probe

    [Theory]
    [InlineData("https://[::ffff:8.8.8.8]:8080", "https://[::ffff:8.8.8.8]:8080/api/v1/auth/token")]
    [InlineData("https://[::ffff:1.1.1.1]:8080", "https://[::ffff:1.1.1.1]:8080/api/v1/auth/token")]
    [InlineData("https://93.184.216.34:8080", "https://93.184.216.34:8080/api/v1/auth/token")]
    [InlineData("https://172.15.255.254:8080", "https://172.15.255.254:8080/api/v1/auth/token")]
    [InlineData("https://172.32.0.1:8080", "https://172.32.0.1:8080/api/v1/auth/token")]
    [InlineData("https://169.253.255.254:8080", "https://169.253.255.254:8080/api/v1/auth/token")]
    [InlineData("https://169.255.0.1:8080", "https://169.255.0.1:8080/api/v1/auth/token")]
    public async Task Ssrf_PublicIps_ArePermittedThroughGuard(string endpoint, string expectedTarget)
    {
        var handler = new CapturingProbeHandler();
        var client = new HttpClient(handler);
        var env = new FakeEnvironment("Production");
        var tester = new PhilHealthPcapiTester(client, NullLogger<PhilHealthPcapiTester>.Instance, env);

        var result = await tester.TestConnectionAsync(
            accreditationNumber: "H91001234",
            secretKey: "secret-key",
            baseUrl: endpoint);

        // Not blocked by SSRF; outbound probe request is dispatched
        Assert.NotNull(handler.LastRequest);
        Assert.Equal(expectedTarget, handler.LastRequest.RequestUri?.ToString());
        Assert.True(result.Success);
    }

    #endregion

    #region 5. BaseUrl Normalization

    [Theory]
    // Base URL without auth path
    [InlineData("https://pcapi.philhealth.gov.ph", "https://pcapi.philhealth.gov.ph/api/v1/auth/token")]
    [InlineData("https://pcapi.philhealth.gov.ph/", "https://pcapi.philhealth.gov.ph/api/v1/auth/token")]
    // Base URL already containing auth path
    [InlineData("https://pcapi.philhealth.gov.ph/api/v1/auth/token", "https://pcapi.philhealth.gov.ph/api/v1/auth/token")]
    [InlineData("https://pcapi.philhealth.gov.ph/api/v1/auth/token/", "https://pcapi.philhealth.gov.ph/api/v1/auth/token")]
    // Case-insensitive auth path
    [InlineData("https://pcapi.philhealth.gov.ph/API/V1/AUTH/TOKEN", "https://pcapi.philhealth.gov.ph/API/V1/AUTH/TOKEN")]
    [InlineData("https://pcapi.philhealth.gov.ph/API/V1/AUTH/TOKEN/", "https://pcapi.philhealth.gov.ph/API/V1/AUTH/TOKEN")]
    // Sub-path / reverse proxy prefixes
    [InlineData("https://gateway.philhealth.gov.ph/proxy", "https://gateway.philhealth.gov.ph/proxy/api/v1/auth/token")]
    [InlineData("https://gateway.philhealth.gov.ph/proxy/api/v1/auth/token", "https://gateway.philhealth.gov.ph/proxy/api/v1/auth/token")]
    public async Task BaseUrlNormalization_NeverAppendsDuplicateTokenPath(string inputUrl, string expectedTarget)
    {
        var handler = new CapturingProbeHandler();
        var client = new HttpClient(handler);
        var env = new FakeEnvironment("Production");
        var tester = new PhilHealthPcapiTester(client, NullLogger<PhilHealthPcapiTester>.Instance, env);

        var result = await tester.TestConnectionAsync(
            accreditationNumber: "H91001234",
            secretKey: "secret-key",
            baseUrl: inputUrl);

        Assert.NotNull(handler.LastRequest);
        Assert.Equal(expectedTarget, handler.LastRequest.RequestUri?.ToString());
        Assert.False(
            handler.LastRequest.RequestUri?.ToString().Contains("/api/v1/auth/token/api/v1/auth/token", StringComparison.OrdinalIgnoreCase),
            "Detected duplicate /api/v1/auth/token/api/v1/auth/token concatenation!");
        Assert.True(result.Success);
    }

    #endregion

    #region 6. Simulation Sandbox Classification & Environment Logic

    [Theory]
    // PhilHealth Staging / Sandbox / Simulator Domains -> true
    [InlineData("https://staging.philhealth.gov.ph", true)]
    [InlineData("https://staging.philhealth.gov.ph/api/v1/auth/token", true)]
    [InlineData("https://hims-staging.philhealth.gov.ph/api/v1/auth/token", true)]
    [InlineData("https://sandbox.philhealth.gov.ph/api/v1/auth/token", true)]
    [InlineData("https://simulator.philhealth.gov.ph/api/v1/auth/token", true)]
    // Localhost / Relative paths -> true
    [InlineData("https://localhost:8080/api/v1/auth/token", true)]
    [InlineData("/api/v1/auth/token", true)]
    [InlineData("/soap/konsulta", true)]
    [InlineData("https://vendor-sandbox.com/api/v1/auth/token", true)] // contains 'sandbox'
    [InlineData("https://vendor-simulator.org/api/v1/auth/token", true)] // contains 'simulator'
    // External Custom Mock Servers -> FALSE (must NOT be classified as sandbox)
    [InlineData("https://my-mock.test/api/v1/auth/token", false)]
    [InlineData("https://mock-server.example.org/api/v1/auth/token", false)]
    [InlineData("https://custom-gateway.health.io/api/v1/auth/token", false)]
    [InlineData("https://api.thirdpartymock.com/v1/auth", false)]
    // Production PhilHealth Gateways -> FALSE
    [InlineData("https://pcapi.philhealth.gov.ph", false)]
    [InlineData("https://pcapi.philhealth.gov.ph/api/v1/auth/token", false)]
    public void IsSandbox_ClassificationAccuracy_DistinguishesCustomMockFromSandbox(string endpoint, bool expectedSandbox)
    {
        Assert.Equal(expectedSandbox, PhilHealthPcapiTester.IsSandbox(endpoint));
    }

    [Fact]
    public async Task Development_ExternalCustomMockDomain_DispatchesRealProbeAndDoesNotReturnSyntheticToken()
    {
        // When developing against a custom mock server (e.g. wiremock or custom API mock),
        // the tester should NOT return a simulated PKA-SIM- token; it must dispatch a real HTTP POST!
        var handler = new CapturingProbeHandler(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("{\"token\":\"GENUINE_DEV_MOCK_TOKEN\"}", Encoding.UTF8, "application/json")
        });
        var client = new HttpClient(handler);
        var env = new FakeEnvironment("Development");
        var tester = new PhilHealthPcapiTester(client, NullLogger<PhilHealthPcapiTester>.Instance, env);

        var result = await tester.TestConnectionAsync(
            accreditationNumber: "H91001234",
            secretKey: "dev-secret",
            baseUrl: "https://my-mock.test/api/v1/auth/token");

        // Real network dispatch happened:
        Assert.NotNull(handler.LastRequest);
        Assert.Equal("https://my-mock.test/api/v1/auth/token", handler.LastRequest.RequestUri?.ToString());
        Assert.True(result.Success);
        // Genuine token from server returned, NOT synthetic PKA-SIM-*:
        Assert.Equal("GENUINE_DEV_MOCK_TOKEN", result.Token);
        Assert.DoesNotContain("Simulation Sandbox", result.Message);
    }

    [Fact]
    public async Task Development_PhilHealthSandboxDomain_ReturnsSyntheticTokenWithoutNetworkDispatch()
    {
        // When pointing to sandbox.philhealth.gov.ph in development, simulation sandbox returns PKA-SIM- token:
        var handler = new CapturingProbeHandler();
        var client = new HttpClient(handler);
        var env = new FakeEnvironment("Development");
        var tester = new PhilHealthPcapiTester(client, NullLogger<PhilHealthPcapiTester>.Instance, env);

        var result = await tester.TestConnectionAsync(
            accreditationNumber: "H91001234",
            secretKey: "dev-secret",
            baseUrl: "https://sandbox.philhealth.gov.ph/api/v1/auth/token");

        // Zero network calls in development sandbox:
        Assert.Null(handler.LastRequest);
        Assert.True(result.Success);
        Assert.NotNull(result.Token);
        Assert.StartsWith("PKA-SIM-H91001234", result.Token);
        Assert.Contains("Simulation Sandbox Verified", result.Message);
    }

    #endregion
}
