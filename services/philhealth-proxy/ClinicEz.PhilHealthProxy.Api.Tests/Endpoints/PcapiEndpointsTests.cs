using System;
using System.Net;
using System.Net.Http.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Api.Tests.Infrastructure;
using ClinicEz.PhilHealthProxy.Domain.Entities;
using ClinicEz.PhilHealthProxy.Domain.Models;
using ClinicEz.Shared.Common;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.PhilHealthProxy.Api.Tests.Endpoints;

public sealed class PcapiEndpointsTests(KonsultaWebApplicationFactory factory)
    : IClassFixture<KonsultaWebApplicationFactory>
{
    private readonly HttpClient _client = factory.CreateClient();
    private static readonly Guid TenantId = Guid.NewGuid();

    private void SetupMockTenant()
    {
        factory.MockTenantRepository.GetByTenantIdAsync(TenantId, Arg.Any<CancellationToken>())
            .Returns(new PhilHealthTenant
            {
                TenantId = TenantId,
                AccreditationNumber = "H10000001",
                SoftwareCertificateId = "KON-DUMMYCERTS-Z15445",
                BaseUrl = "https://staging.philhealth.gov.ph"
            });
    }

    [Fact]
    public async Task PcuStart_Returns200_WithSdkUrl()
    {
        SetupMockTenant();
        factory.MockPcapiClient.StartPcuAsync(Arg.Any<PcuStartRequest>(), Arg.Any<PhilHealthTenant>(), Arg.Any<CancellationToken>())
            .Returns(new PcuStartResponse("https://pcu.philhealth.gov.ph/sdk", "AUTH123", "PENDING", 900));

        var request = new PcuStartRequest("12-345678901-2", "JUAN", null, "DELA CRUZ", null, "01/15/1990");
        var response = await _client.SendAsync(
            new HttpRequestMessage(HttpMethod.Post, "/api/v1/pcu/start")
            {
                Content = JsonContent.Create(request)
            }.WithTenantId(TenantId));

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.ReadAsAsync<ApiResponse<PcuStartResponse>>();
        body.Should().NotBeNull();
        body!.Succeeded.Should().BeTrue();
        body.Data!.SdkUrl.Should().Be("https://pcu.philhealth.gov.ph/sdk");
        body.Data.LivenessAuthorizationId.Should().Be("AUTH123");
    }

    [Fact]
    public async Task PcuVerify_Returns200_WithVerifiedStatus()
    {
        SetupMockTenant();
        factory.MockPcapiClient.VerifyPcuAsync(Arg.Any<PcuVerifyRequest>(), Arg.Any<PhilHealthTenant>(), Arg.Any<CancellationToken>())
            .Returns(new PcuVerifyResponse("TX-12345", true, "VERIFIED"));

        var request = new PcuVerifyRequest("AUTH123");
        var response = await _client.SendAsync(
            new HttpRequestMessage(HttpMethod.Post, "/api/v1/pcu/verify")
            {
                Content = JsonContent.Create(request)
            }.WithTenantId(TenantId));

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.ReadAsAsync<ApiResponse<PcuVerifyResponse>>();
        body.Should().NotBeNull();
        body!.Succeeded.Should().BeTrue();
        body.Data!.PinMatched.Should().BeTrue();
        body.Data.Status.Should().Be("VERIFIED");
    }

    [Fact]
    public async Task YakapValidator_Returns200_WithStandingResponse()
    {
        SetupMockTenant();
        factory.MockPcapiClient.ValidateStandingAsync(Arg.Any<YakapValidateStandingRequest>(), Arg.Any<PhilHealthTenant>(), Arg.Any<CancellationToken>())
            .Returns(new YakapValidatorResponse(
                "12-345678901-2",
                "DELA CRUZ",
                "JUAN",
                null,
                null,
                new PcuStatusInfo("VERIFIED", "TX-123"),
                new SelectionStatusInfo("ASSIGNED", "SEL-001", "10/28/2026"),
                new EmpanelmentStatusInfo("Y", "MCA-001"),
                new FpeStatusInfo("N"),
                new ConsultationStatusInfo("N")));

        var request = new YakapValidateStandingRequest("12-345678901-2", "2026");
        var response = await _client.SendAsync(
            new HttpRequestMessage(HttpMethod.Post, "/api/v1/philhealth-yakap-validator")
            {
                Content = JsonContent.Create(request)
            }.WithTenantId(TenantId));

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.ReadAsAsync<ApiResponse<YakapValidatorResponse>>();
        body.Should().NotBeNull();
        body!.Succeeded.Should().BeTrue();
        body.Data!.PatientPin.Should().Be("12-345678901-2");
        body.Data.Pcu!.Status.Should().Be("VERIFIED");
        body.Data.Selection!.Status.Should().Be("ASSIGNED");
    }

    [Fact]
    public async Task Empanelment_Returns200_WithYesReferenceNo()
    {
        SetupMockTenant();
        factory.MockPcapiClient.SubmitEmpanelmentAsync(Arg.Any<YakapEmpanelmentRequest>(), Arg.Any<PhilHealthTenant>(), Arg.Any<CancellationToken>())
            .Returns(new YakapEmpanelmentResponse(
                "MCA-2026-0001",
                "12-345678901-2",
                "H10000001",
                "2026",
                true,
                false,
                null,
                null));

        var request = new YakapEmpanelmentRequest("12-345678901-2", true, "PCU", "TX-123");
        var response = await _client.SendAsync(
            new HttpRequestMessage(HttpMethod.Post, "/api/v1/yakap-empanelment")
            {
                Content = JsonContent.Create(request)
            }.WithTenantId(TenantId));

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.ReadAsAsync<ApiResponse<YakapEmpanelmentResponse>>();
        body.Should().NotBeNull();
        body!.Succeeded.Should().BeTrue();
        body.Data!.YesReferenceNo.Should().Be("MCA-2026-0001");
    }

    [Fact]
    public async Task Selection_Returns200_WithAssignedStatus()
    {
        SetupMockTenant();
        factory.MockPcapiClient.SubmitSelectionAsync(Arg.Any<YakapSelectionRequest>(), Arg.Any<PhilHealthTenant>(), Arg.Any<CancellationToken>())
            .Returns(new YakapSelectionResponse(
                "12-345678901-2",
                "H10000001",
                new SelectionDetails("ASSIGNED", "SEL-2026-0001", "10/28/2026")));

        var request = new YakapSelectionRequest("12-345678901-2", "10/28/2026", true);
        var response = await _client.SendAsync(
            new HttpRequestMessage(HttpMethod.Post, "/api/v1/yakap-selection")
            {
                Content = JsonContent.Create(request)
            }.WithTenantId(TenantId));

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.ReadAsAsync<ApiResponse<YakapSelectionResponse>>();
        body.Should().NotBeNull();
        body!.Succeeded.Should().BeTrue();
        body.Data!.Selection.Status.Should().Be("ASSIGNED");
        body.Data.Selection.TransactionNo.Should().Be("SEL-2026-0001");
    }

    [Fact]
    public async Task DataUpload_Returns200_WithUploadTransactionNo()
    {
        SetupMockTenant();
        factory.MockPcapiClient.UploadDataAsync(Arg.Any<string>(), Arg.Any<PhilHealthEncryptedPayload>(), Arg.Any<PhilHealthTenant>(), Arg.Any<CancellationToken>())
            .Returns(new DataUploadResponse("U10000001202610280001", "fpe", "queued", "CASE-001", DateTime.UtcNow));

        var payload = new PhilHealthEncryptedPayload
        {
            DocMimeType = "application/json",
            Hash = "hash123",
            Iv = "iv123",
            Doc = "doc123"
        };

        var response = await _client.SendAsync(
            new HttpRequestMessage(HttpMethod.Post, "/api/v1/yakap-data-upload/fpe")
            {
                Content = JsonContent.Create(payload)
            }.WithTenantId(TenantId));

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.ReadAsAsync<ApiResponse<DataUploadResponse>>();
        body.Should().NotBeNull();
        body!.Succeeded.Should().BeTrue();
        body.Data!.UploadTransactionNo.Should().Be("U10000001202610280001");
        body.Data.ProcessingStatus.Should().Be("queued");
    }

    [Fact]
    public async Task DataUpload_InvalidForm_ReturnsBadRequest()
    {
        var payload = new PhilHealthEncryptedPayload
        {
            DocMimeType = "application/json",
            Hash = "hash123",
            Iv = "iv123",
            Doc = "doc123"
        };

        var response = await _client.SendAsync(
            new HttpRequestMessage(HttpMethod.Post, "/api/v1/yakap-data-upload/unknown-form-xyz")
            {
                Content = JsonContent.Create(payload)
            }.WithTenantId(TenantId));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task GetUploadStatus_Returns200_WithProcessingStatus()
    {
        SetupMockTenant();
        factory.MockPcapiClient.GetUploadStatusAsync("U10000001202610280001", Arg.Any<PhilHealthTenant>(), Arg.Any<CancellationToken>())
            .Returns(new DataUploadStatusResponse("U10000001202610280001", "fpe", "accepted", DateTime.UtcNow, null));

        var response = await _client.SendAsync(
            new HttpRequestMessage(HttpMethod.Get, "/api/v1/yakap-data-upload/status/U10000001202610280001")
                .WithTenantId(TenantId));

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.ReadAsAsync<ApiResponse<DataUploadStatusResponse>>();
        body.Should().NotBeNull();
        body!.Succeeded.Should().BeTrue();
        body.Data!.ProcessingStatus.Should().Be("accepted");
    }

    [Fact]
    public async Task Sandbox_Status_And_SetScenario_Endpoints()
    {
        var statusResponse = await _client.GetAsync("/api/v1/sandbox/status");
        statusResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var statusBody = await statusResponse.ReadAsAsync<ApiResponse<SandboxStatus>>();
        statusBody.Should().NotBeNull();
        statusBody!.Succeeded.Should().BeTrue();

        var setReq = new SetSandboxScenarioRequest(nameof(PcapiFaultScenario.ValidationError));
        var setResponse = await _client.PostAsJsonAsync("/api/v1/sandbox/scenario", setReq);
        setResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var setBody = await setResponse.ReadAsAsync<ApiResponse<SandboxStatus>>();
        setBody!.Succeeded.Should().BeTrue();
        setBody.Data!.CurrentScenario.Should().Be(nameof(PcapiFaultScenario.ValidationError));

        // Reset
        var resetResponse = await _client.PostAsync("/api/v1/sandbox/reset", null);
        resetResponse.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
