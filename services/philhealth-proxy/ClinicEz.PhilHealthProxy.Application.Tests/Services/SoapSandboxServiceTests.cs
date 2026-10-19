using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Domain.Models.SoapSandbox;
using ClinicEz.PhilHealthProxy.Infrastructure.Services;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ClinicEz.PhilHealthProxy.Application.Tests.Services;

public sealed class SoapSandboxServiceTests
{
    private readonly SoapSandboxService _sandboxService;
    private readonly PhilHealthPayloadEncryptor _encryptor = new();
    private readonly KonsultaXmlValidator _validator = new();
    private readonly KonsultaMasterlistParser _masterlistParser = new();

    public SoapSandboxServiceTests()
    {
        _sandboxService = new SoapSandboxService(
            _encryptor,
            _validator,
            _masterlistParser,
            NullLogger<SoapSandboxService>.Instance);
    }

    [Fact]
    public async Task HandleSoapAction_GetToken_ReturnsValidTokenEnvelope()
    {
        var requestXml = "<pka:getToken xmlns:pka=\"http://philhealth.gov.ph/\"><pUsername>DEMO</pUsername><pUserPassword>Pass123</pUserPassword><pSoftwareCertificationId>CERT</pSoftwareCertificationId><pHospitalCode>HCI-001</pHospitalCode></pka:getToken>";

        var result = await _sandboxService.HandleSoapActionAsync("getToken", requestXml);

        result.IsSuccess.Should().BeTrue();
        result.ResponseXml.Should().NotBeNullOrEmpty();
        result.ResponseXml.Should().Contain("getTokenResponse");
        result.ResponseXml.Should().Contain("PKA-SIM-HCI-001-");
    }

    [Fact]
    public async Task HandleSoapAction_IsMemberDependentRegistered_ValidMod11Pin_ReturnsRegistered()
    {
        // 030263078507 is valid Mod-11 PIN
        var requestXml = "<pka:isMemberDependentRegistered xmlns:pka=\"http://philhealth.gov.ph/\"><pPIN>030263078507</pPIN><pType>MM</pType></pka:isMemberDependentRegistered>";

        var result = await _sandboxService.HandleSoapActionAsync("isMemberDependentRegistered", requestXml);

        result.IsSuccess.Should().BeTrue();
        result.ResponseXml.Should().Contain("REGISTERED");
    }

    [Fact]
    public async Task HandleSoapAction_IsMemberDependentRegistered_InvalidMod11Pin_ReturnsNotRegistered()
    {
        // 123456789012 is invalid PIN
        var requestXml = "<pka:isMemberDependentRegistered xmlns:pka=\"http://philhealth.gov.ph/\"><pPIN>123456789012</pPIN><pType>MM</pType></pka:isMemberDependentRegistered>";

        var result = await _sandboxService.HandleSoapActionAsync("isMemberDependentRegistered", requestXml);

        result.IsSuccess.Should().BeTrue();
        result.ResponseXml.Should().Contain("NOT_REGISTERED");
    }

    [Fact]
    public async Task HandleSoapAction_IsAtcValid_ValidAtc_ReturnsValid()
    {
        var requestXml = "<pka:isATCValid xmlns:pka=\"http://philhealth.gov.ph/\"><pPIN>030263078507</pPIN><pATC>ATC-2026-0001</pATC><pEffectivityDate>10/01/2026</pEffectivityDate></pka:isATCValid>";

        var result = await _sandboxService.HandleSoapActionAsync("isATCValid", requestXml);

        result.IsSuccess.Should().BeTrue();
        result.ResponseXml.Should().Contain("VALID");
    }

    [Fact]
    public async Task HandleSoapAction_IsAtcValid_ExpiredAtc_ReturnsExpired()
    {
        var requestXml = "<pka:isATCValid xmlns:pka=\"http://philhealth.gov.ph/\"><pPIN>030263078507</pPIN><pATC>ATC-EXPIRED-99</pATC><pEffectivityDate>10/01/2026</pEffectivityDate></pka:isATCValid>";

        var result = await _sandboxService.HandleSoapActionAsync("isATCValid", requestXml);

        result.IsSuccess.Should().BeTrue();
        result.ResponseXml.Should().Contain("EXPIRED");
    }

    [Fact]
    public async Task HandleSoapAction_ExtractRegistrationList_ReturnsEncryptedPayload()
    {
        var requestXml = "<pka:extractRegistrationList xmlns:pka=\"http://philhealth.gov.ph/\"><pStartDate>10/01/2026</pStartDate><pEndDate>10/31/2026</pEndDate></pka:extractRegistrationList>";

        var result = await _sandboxService.HandleSoapActionAsync("extractRegistrationList", requestXml);

        result.IsSuccess.Should().BeTrue();
        result.ResponseXml.Should().Contain("extractRegistrationListResponse");
    }

    [Fact]
    public async Task HandleSoapAction_SubmitReport_ReturnsSubmissionReceipt()
    {
        var requestXml = "<pka:submitReport xmlns:pka=\"http://philhealth.gov.ph/\"><pTransmittalID>RHCI-001</pTransmittalID><pReport>encrypted</pReport><pReportTagging>2</pReportTagging></pka:submitReport>";

        var result = await _sandboxService.HandleSoapActionAsync("submitReport", requestXml);

        result.IsSuccess.Should().BeTrue();
        result.ResponseXml.Should().Contain("submitReportResponse");
    }

    [Fact]
    public async Task HandleSoapAction_CheckUploadStatus_ReturnsProcessed()
    {
        var requestXml = "<pka:checkUploadStatus xmlns:pka=\"http://philhealth.gov.ph/\"><pTransmittalID>RHCI-001</pTransmittalID></pka:checkUploadStatus>";

        var result = await _sandboxService.HandleSoapActionAsync("checkUploadStatus", requestXml);

        result.IsSuccess.Should().BeTrue();
        result.ResponseXml.Should().Contain("PROCESSED");
    }

    [Fact]
    public async Task FaultInjection_SoapFault500_ReturnsFaultEnvelope()
    {
        _sandboxService.SetScenario(SoapSimulationScenario.SoapFault500);

        var result = await _sandboxService.HandleSoapActionAsync("getToken", "<getToken/>");

        result.IsSuccess.Should().BeFalse();
        result.ErrorCode.Should().Be("SERVER_ERROR");
        result.ResponseXml.Should().Contain("soapenv:Fault");
        result.ResponseXml.Should().Contain("Simulated PhilHealth SOAP service internal failure");
    }

    [Fact]
    public async Task FaultInjection_ExpiredToken_ReturnsFaultEnvelope()
    {
        _sandboxService.SetScenario(SoapSimulationScenario.ExpiredToken);

        var result = await _sandboxService.HandleSoapActionAsync("isMemberDependentRegistered", "<isMemberDependentRegistered/>");

        result.IsSuccess.Should().BeFalse();
        result.ErrorCode.Should().Be("TOKEN_EXPIRED");
        result.ResponseXml.Should().Contain("TOKEN_EXPIRED");
    }

    [Fact]
    public async Task RunFullE2eSimulationAsync_HappyPath_CompletesAll7StepsSuccessfully()
    {
        _sandboxService.SetScenario(SoapSimulationScenario.HappyPath);

        var report = await _sandboxService.RunFullE2eSimulationAsync("HCI-NCR-00921", "CLINICEZ-YAKAP-DEV-KEY-32BYTES!");

        report.Should().NotBeNull();
        report.Passed.Should().BeTrue();
        report.TotalSteps.Should().Be(7);
        report.PassedSteps.Should().Be(7);
        report.FailedSteps.Should().Be(0);
        report.Steps.Should().HaveCount(7);
        report.Steps[0].ActionName.Should().Be("getToken");
        report.Steps[1].ActionName.Should().Be("isMemberDependentRegistered");
        report.Steps[2].ActionName.Should().Be("isATCValid");
        report.Steps[3].ActionName.Should().Be("extractRegistrationList");
        report.Steps[4].ActionName.Should().Be("validateReport");
        report.Steps[5].ActionName.Should().Be("submitReport");
        report.Steps[5].Status.Should().Be(SoapSimulationStepStatus.Passed);
        report.Steps[5].ResponseXml.Should().Contain("submitReportResponse");
        report.Steps[6].ActionName.Should().Be("checkUploadStatus");
    }

    [Fact]
    public async Task HandleSoapAction_SubmitReport_WithValidTranche2EncryptedPayload_ValidatesDtdAndIssuesReceipt()
    {
        var generator = new KonsultaXmlGenerator();
        var tranche2Doc = KonsultaXmlGeneratorTests.CreateSampleDocumentWithSoapAndMeds();
        string xml = generator.GenerateTranche2Xml(tranche2Doc);
        string encrypted = _encryptor.EncryptPayload(xml, "CLINICEZ-YAKAP-DEV-KEY-32BYTES!");

        var requestXml = $"<pka:submitReport xmlns:pka=\"http://philhealth.gov.ph/\"><pTransmittalID>RHCI-NCR-2026-0002</pTransmittalID><pReport>{encrypted}</pReport><pReportTagging>2</pReportTagging></pka:submitReport>";

        var result = await _sandboxService.HandleSoapActionAsync("submitReport", requestXml);

        result.IsSuccess.Should().BeTrue();
        result.ResponseXml.Should().NotBeNullOrEmpty();
        result.ResponseXml.Should().Contain("submitReportResponse");

        // Decrypt the receipt from the return element
        var match = System.Text.RegularExpressions.Regex.Match(result.ResponseXml!, @"<return>(.*?)</return>");
        match.Success.Should().BeTrue();
        string decryptedReceipt = _encryptor.DecryptPayload(match.Groups[1].Value, "CLINICEZ-YAKAP-DEV-KEY-32BYTES!");

        decryptedReceipt.Should().Contain("SUBMISSIONRECEIPT");
        decryptedReceipt.Should().Contain("pReportStatus=\"U\"");
        decryptedReceipt.Should().Contain("pReportTagging=\"2\"");
        decryptedReceipt.Should().Contain("pPkaTransactionNo=\"PKA-TRAN-");
    }

    [Fact]
    public void StatusAndReset_WorkCorrectly()
    {
        _sandboxService.SetScenario(SoapSimulationScenario.SoapFault500);
        var statusBefore = _sandboxService.GetStatus();
        statusBefore.ActiveScenario.Should().Be(SoapSimulationScenario.SoapFault500);
        statusBefore.IsActive.Should().BeTrue();

        _sandboxService.ResetSimulationState();
        var statusAfter = _sandboxService.GetStatus();
        statusAfter.ActiveScenario.Should().Be(SoapSimulationScenario.HappyPath);
        statusAfter.TotalSimulatedCalls.Should().Be(0);
    }
}
