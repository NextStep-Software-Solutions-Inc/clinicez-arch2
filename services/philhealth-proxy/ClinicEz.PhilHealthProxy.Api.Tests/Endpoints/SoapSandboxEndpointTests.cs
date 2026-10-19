using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using ClinicEz.PhilHealthProxy.Api.Controllers;
using ClinicEz.PhilHealthProxy.Api.Tests.Infrastructure;
using ClinicEz.PhilHealthProxy.Domain.Models.SoapSandbox;
using ClinicEz.Shared.Common;
using Xunit;

namespace ClinicEz.PhilHealthProxy.Api.Tests.Endpoints;

public sealed class SoapSandboxEndpointTests(KonsultaWebApplicationFactory factory)
    : IClassFixture<KonsultaWebApplicationFactory>
{
    private readonly HttpClient _client = factory.CreateClient();
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };

    [Fact]
    public async Task GET_Status_Returns200WithSandboxStatus()
    {
        var response = await _client.GetAsync("/api/soap-sandbox/status");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<ApiResponse<SoapSandboxStatus>>(JsonOpts);
        body.Should().NotBeNull();
        body!.Data.Should().NotBeNull();
        body.Data!.IsActive.Should().BeTrue();
        body.Data.AvailableScenarios.Should().Contain("HappyPath");
    }

    [Fact]
    public async Task POST_Scenario_UpdatesActiveScenario()
    {
        var request = new SetScenarioRequest(SoapSimulationScenario.SoapFault500);
        var response = await _client.PostAsJsonAsync("/api/soap-sandbox/scenario", request);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<ApiResponse<SoapSandboxStatus>>(JsonOpts);
        body.Should().NotBeNull();
        body!.Data!.ActiveScenario.Should().Be(SoapSimulationScenario.SoapFault500);

        // Reset back to HappyPath for other tests
        await _client.PostAsync("/api/soap-sandbox/reset", null);
    }

    [Fact]
    public async Task POST_SoapKonsulta_RawEnvelope_ReturnsSoapXmlResponse()
    {
        var envelope = """
            <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:pka="http://philhealth.gov.ph/">
               <soapenv:Header/>
               <soapenv:Body>
                  <pka:getToken>
                     <pUsername>TEST_USER</pUsername>
                     <pUserPassword>TEST_PASS</pUserPassword>
                     <pSoftwareCertificationId>CERT1</pSoftwareCertificationId>
                     <pHospitalCode>HCI-NCR-00921</pHospitalCode>
                  </pka:getToken>
               </soapenv:Body>
            </soapenv:Envelope>
            """;

        using var content = new StringContent(envelope, Encoding.UTF8, "text/xml");
        content.Headers.Add("SOAPAction", "\"http://philhealth.gov.ph/getToken\"");

        var response = await _client.PostAsync("/soap/konsulta", content);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var xml = await response.Content.ReadAsStringAsync();
        xml.Should().Contain("getTokenResponse");
        xml.Should().Contain("PKA-SIM-HCI-NCR-00921-");
    }

    [Fact]
    public async Task POST_RunE2e_ExecutesAll7StepsAndReturnsReport()
    {
        var request = new RunSoapSimulationRequest("HCI-NCR-00921", "CLINICEZ-YAKAP-DEV-KEY-32BYTES!");
        var response = await _client.PostAsJsonAsync("/api/soap-sandbox/run-e2e", request);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<ApiResponse<SoapSimulationReport>>(JsonOpts);
        body.Should().NotBeNull();
        body!.Data.Should().NotBeNull();
        body.Data!.Passed.Should().BeTrue();
        body.Data.TotalSteps.Should().Be(7);
        body.Data.PassedSteps.Should().Be(7);
        body.Data.Steps.Should().HaveCount(7);
    }

    [Fact]
    public async Task POST_Reset_RestoresHappyPathAndZeroCounters()
    {
        var response = await _client.PostAsync("/api/soap-sandbox/reset", null);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<ApiResponse<SoapSandboxStatus>>(JsonOpts);
        body.Should().NotBeNull();
        body!.Data!.ActiveScenario.Should().Be(SoapSimulationScenario.HappyPath);
        body.Data.TotalSimulatedCalls.Should().Be(0);
    }
}
