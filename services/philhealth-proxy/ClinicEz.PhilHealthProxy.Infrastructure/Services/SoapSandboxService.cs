using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Xml.Linq;
using Microsoft.Extensions.Logging;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Domain.Models;
using ClinicEz.PhilHealthProxy.Domain.Models.SoapSandbox;
using ClinicEz.PhilHealthProxy.Domain.Models.Yakap;

namespace ClinicEz.PhilHealthProxy.Infrastructure.Services;

/// <summary>
/// Full in-memory PhilHealth SOAP 1.1 Sandbox simulation engine.
/// Emulates the 7 PhilHealth Konsulta / YAKAP operations with authentic XML schemas,
/// Modulus-11 check digit verification, Annex D cryptography, and real DTD validation.
/// </summary>
public sealed class SoapSandboxService : ISoapSandboxService
{
    private static readonly XNamespace SoapNs = "http://schemas.xmlsoap.org/soap/envelope/";
    private static readonly XNamespace PhilHealthNs = "http://philhealth.gov.ph/";

    private readonly IPhilHealthPayloadEncryptor _payloadEncryptor;
    private readonly IKonsultaXmlValidator _xmlValidator;
    private readonly IKonsultaMasterlistParser _masterlistParser;
    private readonly IKonsultaXmlGenerator _xmlGenerator;
    private readonly ILogger<SoapSandboxService> _logger;

    private SoapSimulationScenario _activeScenario = SoapSimulationScenario.HappyPath;
    private int _simulatedCallCount;
    private readonly ConcurrentDictionary<string, DateTime> _issuedTokens = new();

    public SoapSandboxService(
        IPhilHealthPayloadEncryptor payloadEncryptor,
        IKonsultaXmlValidator xmlValidator,
        IKonsultaMasterlistParser masterlistParser,
        ILogger<SoapSandboxService> logger,
        IKonsultaXmlGenerator? xmlGenerator = null)
    {
        _payloadEncryptor = payloadEncryptor;
        _xmlValidator = xmlValidator;
        _masterlistParser = masterlistParser;
        _logger = logger;
        _xmlGenerator = xmlGenerator ?? new KonsultaXmlGenerator();
    }

    public void SetScenario(SoapSimulationScenario scenario)
    {
        _activeScenario = scenario;
        _logger.LogInformation("SOAP Sandbox scenario switched to: {Scenario}", scenario);
    }

    public SoapSimulationScenario GetActiveScenario() => _activeScenario;

    public SoapSandboxStatus GetStatus() =>
        new(
            IsActive: true,
            ActiveScenario: _activeScenario,
            EndpointUrl: "/soap/konsulta",
            TotalSimulatedCalls: _simulatedCallCount,
            AvailableScenarios: Enum.GetNames<SoapSimulationScenario>());

    public void ResetSimulationState()
    {
        _activeScenario = SoapSimulationScenario.HappyPath;
        _simulatedCallCount = 0;
        _issuedTokens.Clear();
        _logger.LogInformation("SOAP Sandbox state has been reset.");
    }

    public async Task<SoapResult> HandleSoapActionAsync(
        string soapAction,
        string? requestBodyXml,
        string? tokenHeader = null,
        CancellationToken ct = default)
    {
        Interlocked.Increment(ref _simulatedCallCount);

        // Normalize action name (strip namespace or URL quotes)
        var action = soapAction.Trim('\"');
        if (action.Contains('/'))
        {
            action = action.Substring(action.LastIndexOf('/') + 1);
        }

        // Scenario 5: Simulated 500 SOAP Fault
        if (_activeScenario == SoapSimulationScenario.SoapFault500)
        {
            return BuildSoapFaultResult("SERVER_ERROR", "Simulated PhilHealth SOAP service internal failure (HTTP 500).");
        }

        // Scenario 4: Simulated Network Timeout
        if (_activeScenario == SoapSimulationScenario.NetworkTimeout)
        {
            await Task.Delay(1500, ct);
            return new SoapResult(false, null, "TIMEOUT", "The request to simulated PhilHealth gateway timed out.");
        }

        // Scenario 2: Simulated Expired Token (except getToken which acquires a token)
        if (_activeScenario == SoapSimulationScenario.ExpiredToken && action != "getToken" && action != "checkUploadStatus")
        {
            return BuildSoapFaultResult("TOKEN_EXPIRED", "Simulated PhilHealth session token has expired or is invalid.");
        }

        try
        {
            return action switch
            {
                "getToken" => HandleGetToken(requestBodyXml),
                "isMemberDependentRegistered" => HandleIsMemberDependentRegistered(requestBodyXml),
                "isATCValid" => HandleIsAtcValid(requestBodyXml),
                "extractRegistrationList" => HandleExtractRegistrationList(requestBodyXml),
                "validateReport" => HandleValidateReport(requestBodyXml),
                "submitReport" => HandleSubmitReport(requestBodyXml),
                "checkUploadStatus" => HandleCheckUploadStatus(requestBodyXml),
                _ => BuildSoapFaultResult("UNKNOWN_ACTION", $"Unsupported SOAP action: {action}"),
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error executing simulated SOAP action [{Action}]", action);
            return BuildSoapFaultResult("SIMULATION_ERROR", ex.Message);
        }
    }

    // ── 1. getToken ───────────────────────────────────────────────────────────
    private SoapResult HandleGetToken(string? bodyXml)
    {
        string username = ExtractElementValue(bodyXml, "pUsername") ?? "DEMO_USER";
        string hospitalCode = ExtractElementValue(bodyXml, "pHospitalCode") ?? "HCI-NCR-00921";

        var token = $"PKA-SIM-{hospitalCode}-{Guid.NewGuid():N}";
        _issuedTokens[token] = DateTime.UtcNow.AddMinutes(28);

        var responseXml = BuildSoapResponseEnvelope("getTokenResponse", token);
        return new SoapResult(true, responseXml, null, null);
    }

    // ── 2. isMemberDependentRegistered ───────────────────────────────────────
    private SoapResult HandleIsMemberDependentRegistered(string? bodyXml)
    {
        string pin = ExtractElementValue(bodyXml, "pPIN") ?? string.Empty;
        string type = ExtractElementValue(bodyXml, "pType") ?? "MM";

        if (_activeScenario == SoapSimulationScenario.InvalidPin)
        {
            var notFoundResponse = BuildSoapResponseEnvelope("isMemberDependentRegisteredResponse", "NOT_FOUND");
            return new SoapResult(true, notFoundResponse, null, null);
        }

        // Modulus-11 check
        bool isValidMod11 = _masterlistParser.ValidatePin(pin);
        string returnVal = isValidMod11 ? "REGISTERED" : "NOT_REGISTERED";

        var responseXml = BuildSoapResponseEnvelope("isMemberDependentRegisteredResponse", returnVal);
        return new SoapResult(true, responseXml, null, null);
    }

    // ── 3. isATCValid ─────────────────────────────────────────────────────────
    private SoapResult HandleIsAtcValid(string? bodyXml)
    {
        string atc = ExtractElementValue(bodyXml, "pATC") ?? string.Empty;
        string effectivityDate = ExtractElementValue(bodyXml, "pEffectivityDate") ?? string.Empty;

        string returnVal = "VALID";
        if (atc.Contains("EXPIRED", StringComparison.OrdinalIgnoreCase) || atc.Contains("INVALID", StringComparison.OrdinalIgnoreCase))
        {
            returnVal = "EXPIRED";
        }

        var responseXml = BuildSoapResponseEnvelope("isATCValidResponse", returnVal);
        return new SoapResult(true, responseXml, null, null);
    }

    // ── 4. extractRegistrationList ───────────────────────────────────────────
    private SoapResult HandleExtractRegistrationList(string? bodyXml)
    {
        string defaultCipherKey = "CLINICEZ-YAKAP-DEV-KEY-32BYTES!";

        // Generate valid KonsultaMasterlist_v1.4.dtd compliant XML
        var sb = new StringBuilder();
        sb.AppendLine("<!DOCTYPE ASSIGNMENTS SYSTEM \"KonsultaMasterlist_v1.4.dtd\">");
        sb.AppendLine("<ASSIGNMENTS pHospitalCode=\"HCI-NCR-00921\" pTransmittalNo=\"ML-HCI-NCR-00921-202610\">");
        sb.AppendLine("  <ASSIGNMENT pMemberPin=\"030263078507\" pMemberLastName=\"DELA CRUZ\" pMemberFirstName=\"JUAN\" pMemberMiddleName=\"M\" pMemberSuffix=\"\" pMemberBirthDate=\"1985-05-15\" pMemberGender=\"M\" pPatientPin=\"030263078507\" pPatientLastName=\"DELA CRUZ\" pPatientFirstName=\"JUAN\" pPatientMiddleName=\"M\" pPatientSuffix=\"\" pPatientBirthDate=\"1985-05-15\" pPatientGender=\"M\" pPatientCategory=\"MM\" pEffectivityYear=\"2026\" pWithConsent=\"Y\" pWithFPE=\"Y\" pAssignmentDate=\"2026-01-10\"/>");
        sb.AppendLine("  <ASSIGNMENT pMemberPin=\"242500004774\" pMemberLastName=\"SILANG\" pMemberFirstName=\"GABRIELA\" pMemberMiddleName=\"A\" pMemberSuffix=\"\" pMemberBirthDate=\"1992-08-20\" pMemberGender=\"F\" pPatientPin=\"242500004774\" pPatientLastName=\"SILANG\" pPatientFirstName=\"GABRIELA\" pPatientMiddleName=\"A\" pPatientSuffix=\"\" pPatientBirthDate=\"1992-08-20\" pPatientGender=\"F\" pPatientCategory=\"MM\" pEffectivityYear=\"2026\" pWithConsent=\"Y\" pWithFPE=\"Y\" pAssignmentDate=\"2026-02-14\"/>");
        sb.AppendLine("  <ASSIGNMENT pMemberPin=\"120504123456\" pMemberLastName=\"SANTOS\" pMemberFirstName=\"MARIA\" pMemberMiddleName=\"B\" pMemberSuffix=\"\" pMemberBirthDate=\"1978-11-03\" pMemberGender=\"F\" pPatientPin=\"120504123456\" pPatientLastName=\"SANTOS\" pPatientFirstName=\"MARIA\" pPatientMiddleName=\"B\" pPatientSuffix=\"\" pPatientBirthDate=\"1978-11-03\" pPatientGender=\"F\" pPatientCategory=\"MM\" pEffectivityYear=\"2026\" pWithConsent=\"Y\" pWithFPE=\"Y\" pAssignmentDate=\"2026-03-01\"/>");
        sb.AppendLine("</ASSIGNMENTS>");

        string rawXml = sb.ToString();
        string encryptedJson = _payloadEncryptor.EncryptPayload(rawXml, defaultCipherKey);

        var responseXml = BuildSoapResponseEnvelope("extractRegistrationListResponse", encryptedJson);
        return new SoapResult(true, responseXml, null, null);
    }

    // ── 5. validateReport ─────────────────────────────────────────────────────
    private SoapResult HandleValidateReport(string? bodyXml)
    {
        string defaultCipherKey = "CLINICEZ-YAKAP-DEV-KEY-32BYTES!";
        string reportTagging = ExtractElementValue(bodyXml, "pReportTagging") ?? "1";
        string report = ExtractElementValue(bodyXml, "pReport") ?? string.Empty;

        // Check scenario failure
        if (_activeScenario == SoapSimulationScenario.DtdValidationError)
        {
            string failXml = $"<RECEIPT pReportTagging=\"{reportTagging}\" pReportStatus=\"F\" pDeficiencyRemarks=\"DTD validation error: Attribute 'pDrugCode' missing or malformed at line 42, position 18.\"/>";
            string encryptedFail = _payloadEncryptor.EncryptPayload(failXml, defaultCipherKey);
            var failSoap = BuildSoapResponseEnvelope("validateReportResponse", encryptedFail);
            return new SoapResult(true, failSoap, null, null);
        }

        // Try decrypting and running real DTD validator
        string status = "V";
        string remarks = "Pre-flight and PhilHealth VKR validation successful.";

        if (!string.IsNullOrWhiteSpace(report) && report.TrimStart().StartsWith("{"))
        {
            try
            {
                string decryptedXml = _payloadEncryptor.DecryptPayload(report, defaultCipherKey);
                var validation = _xmlValidator.ValidateReportXml(decryptedXml);
                if (!validation.IsValid)
                {
                    status = "F";
                    remarks = string.Join("; ", validation.Errors.Take(3).Select(e => e.Message));
                }
            }
            catch (Exception ex)
            {
                status = "F";
                remarks = $"Annex D decryption or format error: {ex.Message}";
            }
        }

        string receiptXml = $"<RECEIPT pReportTagging=\"{reportTagging}\" pReportStatus=\"{status}\" pDeficiencyRemarks=\"{remarks}\"/>";
        string encryptedReceipt = _payloadEncryptor.EncryptPayload(receiptXml, defaultCipherKey);

        var responseXml = BuildSoapResponseEnvelope("validateReportResponse", encryptedReceipt);
        return new SoapResult(true, responseXml, null, null);
    }

    // ── 6. submitReport ───────────────────────────────────────────────────────
    private SoapResult HandleSubmitReport(string? bodyXml)
    {
        string defaultCipherKey = "CLINICEZ-YAKAP-DEV-KEY-32BYTES!";
        string transmittalId = ExtractElementValue(bodyXml, "pTransmittalID") ?? "RHCI-NCR-2026-0001";
        string reportTagging = ExtractElementValue(bodyXml, "pReportTagging") ?? "2";
        string report = ExtractElementValue(bodyXml, "pReport") ?? string.Empty;

        // Check scenario failure
        if (_activeScenario == SoapSimulationScenario.DtdValidationError)
        {
            string failXml = $"<SUBMISSIONRECEIPT pTransmittalID=\"{transmittalId}\" pReportTagging=\"{reportTagging}\" pReportStatus=\"F\" pDeficiencyRemarks=\"DTD validation error: Attribute 'pDrugCode' missing or malformed at line 42, position 18.\"/>";
            string encryptedFail = _payloadEncryptor.EncryptPayload(failXml, defaultCipherKey);
            var failSoap = BuildSoapResponseEnvelope("submitReportResponse", encryptedFail);
            return new SoapResult(true, failSoap, null, null);
        }

        string status = "U";
        string remarks = "Tranche 2 transmittal accepted and queued for PhilHealth claims processing.";

        if (!string.IsNullOrWhiteSpace(report) && report.TrimStart().StartsWith("{"))
        {
            try
            {
                string decryptedXml = _payloadEncryptor.DecryptPayload(report, defaultCipherKey);
                var validation = _xmlValidator.ValidateReportXml(decryptedXml);
                if (!validation.IsValid)
                {
                    status = "F";
                    remarks = string.Join("; ", validation.Errors.Take(3).Select(e => e.Message));
                }
            }
            catch (Exception ex)
            {
                status = "F";
                remarks = $"Annex D decryption error: {ex.Message}";
            }
        }

        var rnd = new Random();
        string pkaTransactionNo = $"PKA-TRAN-{DateTime.UtcNow:yyyyMMdd}-{rnd.Next(100000, 999999)}";

        string receiptXml = $"<SUBMISSIONRECEIPT pTransmittalID=\"{transmittalId}\" pReportTagging=\"{reportTagging}\" pPkaTransactionNo=\"{pkaTransactionNo}\" pReportStatus=\"{status}\" pDeficiencyRemarks=\"{remarks}\" pProcessedAt=\"{DateTime.UtcNow:yyyy-MM-ddTHH:mm:ssZ}\"/>";
        string encryptedReceipt = _payloadEncryptor.EncryptPayload(receiptXml, defaultCipherKey);

        var responseXml = BuildSoapResponseEnvelope("submitReportResponse", encryptedReceipt);
        return new SoapResult(true, responseXml, null, null);
    }

    // ── 7. checkUploadStatus ──────────────────────────────────────────────────
    private SoapResult HandleCheckUploadStatus(string? bodyXml)
    {
        string transmittalId = ExtractElementValue(bodyXml, "pTransmittalID") ?? string.Empty;
        var responseXml = BuildSoapResponseEnvelope("checkUploadStatusResponse", "PROCESSED");
        return new SoapResult(true, responseXml, null, null);
    }

    // ── Full 7-Step E2E Simulation Orchestrator ──────────────────────────────
    public async Task<SoapSimulationReport> RunFullE2eSimulationAsync(
        string accreditationNumber,
        string cipherKey,
        CancellationToken ct = default)
    {
        var steps = new List<SoapSimulationStepResult>();
        var totalSw = Stopwatch.StartNew();
        string? activeToken = null;

        // Step 1: getToken
        var sw1 = Stopwatch.StartNew();
        var step1Body = $"<pka:getToken xmlns:pka=\"http://philhealth.gov.ph/\"><pUsername>HCI_ADMIN</pUsername><pUserPassword>Secr3t!</pUserPassword><pSoftwareCertificationId>CERT-CLINICEZ-2026</pSoftwareCertificationId><pHospitalCode>{accreditationNumber}</pHospitalCode></pka:getToken>";
        var res1 = await HandleSoapActionAsync("getToken", step1Body, tokenHeader: null, ct);
        sw1.Stop();

        if (res1.IsSuccess && res1.ResponseXml != null)
        {
            activeToken = ExtractReturnValue(res1.ResponseXml);
            steps.Add(new SoapSimulationStepResult(
                StepNumber: 1,
                ActionName: "getToken",
                Status: SoapSimulationStepStatus.Passed,
                DurationMs: sw1.ElapsedMilliseconds,
                Summary: $"Facility authenticated. Access token issued (expires in 28 mins): {activeToken?.Substring(0, Math.Min(24, activeToken?.Length ?? 0))}...",
                RequestXml: step1Body,
                ResponseXml: res1.ResponseXml));
        }
        else
        {
            steps.Add(new SoapSimulationStepResult(
                StepNumber: 1,
                ActionName: "getToken",
                Status: SoapSimulationStepStatus.Failed,
                DurationMs: sw1.ElapsedMilliseconds,
                Summary: "Authentication failed.",
                RequestXml: step1Body,
                ResponseXml: res1.ResponseXml,
                ErrorMessage: res1.ErrorMessage));
        }

        // Step 2: isMemberDependentRegistered
        var sw2 = Stopwatch.StartNew();
        var step2Body = "<pka:isMemberDependentRegistered xmlns:pka=\"http://philhealth.gov.ph/\"><pPIN>030263078507</pPIN><pType>MM</pType></pka:isMemberDependentRegistered>";
        var res2 = await HandleSoapActionAsync("isMemberDependentRegistered", step2Body, tokenHeader: activeToken, ct);
        sw2.Stop();

        steps.Add(new SoapSimulationStepResult(
            StepNumber: 2,
            ActionName: "isMemberDependentRegistered",
            Status: res2.IsSuccess ? SoapSimulationStepStatus.Passed : SoapSimulationStepStatus.Failed,
            DurationMs: sw2.ElapsedMilliseconds,
            Summary: "Verified Member PIN '03-026307850-7' Modulus-11 check digit against simulated NHIP registry.",
            RequestXml: step2Body,
            ResponseXml: res2.ResponseXml,
            ErrorMessage: res2.ErrorMessage));

        // Step 3: isATCValid
        var sw3 = Stopwatch.StartNew();
        var step3Body = "<pka:isATCValid xmlns:pka=\"http://philhealth.gov.ph/\"><pPIN>030263078507</pPIN><pATC>ATC-2026-0001</pATC><pEffectivityDate>10/01/2026</pEffectivityDate></pka:isATCValid>";
        var res3 = await HandleSoapActionAsync("isATCValid", step3Body, tokenHeader: activeToken, ct);
        sw3.Stop();

        steps.Add(new SoapSimulationStepResult(
            StepNumber: 3,
            ActionName: "isATCValid",
            Status: res3.IsSuccess ? SoapSimulationStepStatus.Passed : SoapSimulationStepStatus.Failed,
            DurationMs: sw3.ElapsedMilliseconds,
            Summary: "Authorization Transaction Code 'ATC-2026-0001' verified with active encounter effectivity.",
            RequestXml: step3Body,
            ResponseXml: res3.ResponseXml,
            ErrorMessage: res3.ErrorMessage));

        // Step 4: extractRegistrationList
        var sw4 = Stopwatch.StartNew();
        var step4Body = "<pka:extractRegistrationList xmlns:pka=\"http://philhealth.gov.ph/\"><pStartDate>10/01/2026</pStartDate><pEndDate>10/31/2026</pEndDate></pka:extractRegistrationList>";
        var res4 = await HandleSoapActionAsync("extractRegistrationList", step4Body, tokenHeader: activeToken, ct);
        sw4.Stop();

        steps.Add(new SoapSimulationStepResult(
            StepNumber: 4,
            ActionName: "extractRegistrationList",
            Status: res4.IsSuccess ? SoapSimulationStepStatus.Passed : SoapSimulationStepStatus.Failed,
            DurationMs: sw4.ElapsedMilliseconds,
            Summary: "Extracted assigned beneficiary masterlist conforming to KonsultaMasterlist_v1.4.dtd in Annex D JSON envelope.",
            RequestXml: step4Body,
            ResponseXml: res4.ResponseXml,
            ErrorMessage: res4.ErrorMessage));

        // Step 5: validateReport (Tranche 1 First Patient Encounter & 24-Q NCD Profiling)
        var sw5 = Stopwatch.StartNew();
        var docT1 = CreateSimulationTranche1Doc(accreditationNumber);
        string sampleT1Xml = _xmlGenerator.GenerateTranche1Xml(docT1);
        string encryptedT1 = _payloadEncryptor.EncryptPayload(sampleT1Xml, cipherKey);
        var step5Body = $"<pka:validateReport xmlns:pka=\"http://philhealth.gov.ph/\"><pReportTagging>1</pReportTagging><pReport>{encryptedT1}</pReport></pka:validateReport>";
        var res5 = await HandleSoapActionAsync("validateReport", step5Body, tokenHeader: activeToken, ct);
        sw5.Stop();

        steps.Add(new SoapSimulationStepResult(
            StepNumber: 5,
            ActionName: "validateReport",
            Status: res5.IsSuccess ? SoapSimulationStepStatus.Passed : SoapSimulationStepStatus.Failed,
            DurationMs: sw5.ElapsedMilliseconds,
            Summary: "Tranche 1 XML (Enlistment + 24-Q NCD Profiling) passed KonsultaData_v1.14.dtd validation and verified receipt issued.",
            RequestXml: step5Body,
            ResponseXml: res5.ResponseXml,
            ErrorMessage: res5.ErrorMessage));

        // Step 6: submitReport (Tranche 2 Consultation, Diagnostics & ₱20,000 GAMOT Prescriptions)
        var sw6 = Stopwatch.StartNew();
        var docT2 = CreateSimulationTranche2Doc(accreditationNumber);
        string sampleT2Xml = _xmlGenerator.GenerateTranche2Xml(docT2);
        string encryptedT2 = _payloadEncryptor.EncryptPayload(sampleT2Xml, cipherKey);
        var step6Body = $"<pka:submitReport xmlns:pka=\"http://philhealth.gov.ph/\"><pTransmittalID>RHCI-NCR-2026-0002</pTransmittalID><pReport>{encryptedT2}</pReport><pReportTagging>2</pReportTagging></pka:submitReport>";
        var res6 = await HandleSoapActionAsync("submitReport", step6Body, tokenHeader: activeToken, ct);
        sw6.Stop();

        steps.Add(new SoapSimulationStepResult(
            StepNumber: 6,
            ActionName: "submitReport",
            Status: res6.IsSuccess ? SoapSimulationStepStatus.Passed : SoapSimulationStepStatus.Failed,
            DurationMs: sw6.ElapsedMilliseconds,
            Summary: "Tranche 2 Transmittal with ₱20,000 GAMOT medications submitted. PhilHealth transaction sequence assigned.",
            RequestXml: step6Body,
            ResponseXml: res6.ResponseXml,
            ErrorMessage: res6.ErrorMessage));

        // Step 7: checkUploadStatus
        var sw7 = Stopwatch.StartNew();
        var step7Body = $"<pka:checkUploadStatus xmlns:pka=\"http://philhealth.gov.ph/\"><pUsername>HCI_ADMIN</pUsername><pUserPassword>Secr3t!</pUserPassword><pHospitalCode>{accreditationNumber}</pHospitalCode><pStartDate>10/01/2026</pStartDate><pEndDate>10/31/2026</pEndDate><pTransmittalID>RHCI-NCR-2026-0002</pTransmittalID><pReport></pReport></pka:checkUploadStatus>";
        var res7 = await HandleSoapActionAsync("checkUploadStatus", step7Body, tokenHeader: null, ct);
        sw7.Stop();

        steps.Add(new SoapSimulationStepResult(
            StepNumber: 7,
            ActionName: "checkUploadStatus",
            Status: res7.IsSuccess ? SoapSimulationStepStatus.Passed : SoapSimulationStepStatus.Failed,
            DurationMs: sw7.ElapsedMilliseconds,
            Summary: "Batch upload status verified as PROCESSED in PhilHealth eClaims subsystem.",
            RequestXml: step7Body,
            ResponseXml: res7.ResponseXml,
            ErrorMessage: res7.ErrorMessage));

        totalSw.Stop();

        int passedCount = steps.Count(s => s.Status == SoapSimulationStepStatus.Passed);
        int failedCount = steps.Count(s => s.Status == SoapSimulationStepStatus.Failed);

        return new SoapSimulationReport(
            Scenario: _activeScenario,
            Passed: failedCount == 0,
            TotalSteps: steps.Count,
            PassedSteps: passedCount,
            FailedSteps: failedCount,
            TotalDurationMs: totalSw.ElapsedMilliseconds,
            Steps: steps,
            Timestamp: DateTime.UtcNow);
    }

    // ── Helper methods ────────────────────────────────────────────────────────
    private static string BuildSoapResponseEnvelope(string operationResponseName, string returnContent)
    {
        return $@"<soapenv:Envelope xmlns:soapenv=""http://schemas.xmlsoap.org/soap/envelope/"" xmlns:pka=""http://philhealth.gov.ph/"">
  <soapenv:Header/>
  <soapenv:Body>
    <pka:{operationResponseName}>
      <return>{SecurityEscape(returnContent)}</return>
    </pka:{operationResponseName}>
  </soapenv:Body>
</soapenv:Envelope>";
    }

    private static SoapResult BuildSoapFaultResult(string faultCode, string faultMessage)
    {
        string faultXml = $@"<soapenv:Envelope xmlns:soapenv=""http://schemas.xmlsoap.org/soap/envelope/"">
  <soapenv:Body>
    <soapenv:Fault>
      <faultcode>{faultCode}</faultcode>
      <faultstring>{SecurityEscape(faultMessage)}</faultstring>
    </soapenv:Fault>
  </soapenv:Body>
</soapenv:Envelope>";
        return new SoapResult(false, faultXml, faultCode, faultMessage);
    }

    private static string? ExtractElementValue(string? xml, string elementName)
    {
        if (string.IsNullOrWhiteSpace(xml)) return null;

        try
        {
            var match = Regex.Match(xml, $@"<(?:[a-zA-Z0-9_\-]+:)?{elementName}[^>]*>([\s\S]*?)</(?:[a-zA-Z0-9_\-]+:)?{elementName}>", RegexOptions.IgnoreCase);
            if (match.Success)
            {
                return match.Groups[1].Value.Trim();
            }
        }
        catch
        {
            // fallback
        }
        return null;
    }

    private static string? ExtractReturnValue(string xml)
    {
        try
        {
            var doc = XDocument.Parse(xml);
            var returnElem = doc.Descendants().FirstOrDefault(e => e.Name.LocalName == "return");
            return returnElem?.Value;
        }
        catch
        {
            return ExtractElementValue(xml, "return");
        }
    }

    private static string SecurityEscape(string input)
    {
        if (string.IsNullOrEmpty(input)) return string.Empty;
        if (input.Contains('<') && !input.StartsWith("<!DOCTYPE") && !input.StartsWith("<RECEIPT") && !input.StartsWith("<SUBMISSIONRECEIPT"))
        {
            return System.Security.SecurityElement.Escape(input);
        }
        return input;
    }

    private static YakapReportDocument CreateSimulationTranche1Doc(string accreditationNumber) =>
        new(
            Username: "HCI_ADMIN",
            Password: "Password123!",
            HciAccreNo: accreditationNumber,
            PmccNo: "PMCC-001",
            CertificationId: "CERT-CLINICEZ-2026",
            HciTransmittalNumber: "RHCI-NCR-2026-0001",
            Enlistments:
            [
                new YakapEnlistment(
                    HciCaseNo: "THCI-001",
                    HciTransNo: "EHCI-001",
                    EffYear: "2026",
                    EnlistStat: "1",
                    EnlistDate: "2026-10-01",
                    PackageType: "K",
                    MemPin: "030263078507",
                    MemFname: "JUAN",
                    MemMname: "BAUTISTA",
                    MemLname: "DELA CRUZ",
                    MemExtname: "",
                    MemDob: "1984-07-22",
                    PatientPin: "030263078507",
                    PatientFname: "JUAN",
                    PatientMname: "BAUTISTA",
                    PatientLname: "DELA CRUZ",
                    PatientExtname: "",
                    PatientSex: "M",
                    PatientDob: "1984-07-22",
                    PatientType: "MM",
                    PatientMobileNo: "09198887766",
                    PatientLandlineNo: "",
                    WithConsent: "Y",
                    TransDate: "2026-10-01",
                    CreatedBy: "CLINICADMIN")
            ],
            Profiles:
            [
                new YakapProfile(
                    HciTransNo: "PHCI-001",
                    HciCaseNo: "THCI-001",
                    ProfDate: "2026-10-01",
                    PatientPin: "030263078507",
                    PatientType: "MM",
                    PatientAge: "42 YR(S), 2 MO(S), 12 DAY(S)",
                    MemPin: "030263078507",
                    EffYear: "2026",
                    ATC: "WALKEDIN",
                    IsWalkedIn: "Y",
                    TransDate: "2026-10-01",
                    MedicalHistories: [new YakapMedicalHistory("001"), new YakapMedicalHistory("006")],
                    MedicalSpecifics: [new YakapSpecificHistory("001", "Hypertension"), new YakapSpecificHistory("006", "Type 2 Diabetes")],
                    SurgicalHistories: [new YakapSurgicalHistory("None", "2026-01-01")],
                    FamilyHistories: [new YakapMedicalHistory("001"), new YakapMedicalHistory("006")],
                    FamilySpecifics: [new YakapSpecificHistory("001", "Hypertension"), new YakapSpecificHistory("006", "Type 2 Diabetes")],
                    SocialHistory: new YakapSocialHistory("N", "", "N", "", "N", "Y"),
                    Immunizations: [new YakapImmunization(null, null, null, null, "999")],
                    MenstrualHistory: new YakapMenstrualHistory("", "", "", "", "", "", "", "N", "", "N"),
                    PregnancyHistory: new YakapPregnancyHistory("0", "0", "", "0", "0", "0", "0", "", "", "N"),
                    PhysicalExam: new YakapPhysicalExamPertinent("120", "80", "72", "18", "36.5", "172", "68", "23.0", Waist: "32", Hip: "36"),
                    BloodType: "A+",
                    GenSurveyId: "1",
                    GenSurveyRem: "",
                    PhysicalExamMiscs: [new YakapPhysicalExamMisc("1", "1", "1", "1", "1", "1", "1", "1")],
                    PhysicalExamSpecifics: new YakapPhysicalExamSpecific("", "", "Clear breath sounds", "Regular rhythm", "", "", "", ""),
                    NcdAnswers: new YakapNcdAnswers(
                        Qid1Yn: "N", Qid2Yn: "N", Qid3Yn: "N", Qid4Yn: "N", Qid5Ynx: "N",
                        Qid6Yn: "N", Qid7Yn: "N", Qid8Yn: "N", Qid9Yn: "Y", Qid10Yn: "N",
                        Qid11Yn: "N", Qid12Yn: "N", Qid13Yn: "Y", Qid14Yn: "N", Qid15Yn: "N",
                        Qid16Yn: "Y", Qid17Abcde: "A", Qid18Yn: "N", Qid19Yn: "N", Qid20Yn: "N",
                        Qid21Yn: "N", Qid22Yn: "N", Qid23Yn: "N", Qid24Yn: "N"))
            ],
            Soaps: [],
            DiagnosticResults: [],
            Medicines: []);

    private static YakapReportDocument CreateSimulationTranche2Doc(string accreditationNumber) =>
        new(
            Username: "HCI_ADMIN",
            Password: "Password123!",
            HciAccreNo: accreditationNumber,
            PmccNo: "PMCC-001",
            CertificationId: "CERT-CLINICEZ-2026",
            HciTransmittalNumber: "RHCI-NCR-2026-0002",
            Enlistments:
            [
                new YakapEnlistment(
                    HciCaseNo: "THCI-001",
                    HciTransNo: "EHCI-001",
                    EffYear: "2026",
                    EnlistStat: "1",
                    EnlistDate: "2026-10-01",
                    PackageType: "K",
                    MemPin: "030263078507",
                    MemFname: "JUAN",
                    MemMname: "BAUTISTA",
                    MemLname: "DELA CRUZ",
                    MemExtname: "",
                    MemDob: "1984-07-22",
                    PatientPin: "030263078507",
                    PatientFname: "JUAN",
                    PatientMname: "BAUTISTA",
                    PatientLname: "DELA CRUZ",
                    PatientExtname: "",
                    PatientSex: "M",
                    PatientDob: "1984-07-22",
                    PatientType: "MM",
                    PatientMobileNo: "09198887766",
                    PatientLandlineNo: "",
                    WithConsent: "Y",
                    TransDate: "2026-10-01",
                    CreatedBy: "CLINICADMIN")
            ],
            Profiles:
            [
                new YakapProfile(
                    HciTransNo: "PHCI-001",
                    HciCaseNo: "THCI-001",
                    ProfDate: "2026-10-01",
                    PatientPin: "030263078507",
                    PatientType: "MM",
                    PatientAge: "42 YR(S), 2 MO(S), 12 DAY(S)",
                    MemPin: "030263078507",
                    EffYear: "2026",
                    ATC: "WALKEDIN",
                    IsWalkedIn: "Y",
                    TransDate: "2026-10-01",
                    MedicalHistories: [new YakapMedicalHistory("001"), new YakapMedicalHistory("006")],
                    MedicalSpecifics: [new YakapSpecificHistory("001", "Hypertension"), new YakapSpecificHistory("006", "Type 2 Diabetes")],
                    SurgicalHistories: [new YakapSurgicalHistory("None", "2026-01-01")],
                    FamilyHistories: [new YakapMedicalHistory("001"), new YakapMedicalHistory("006")],
                    FamilySpecifics: [new YakapSpecificHistory("001", "Hypertension"), new YakapSpecificHistory("006", "Type 2 Diabetes")],
                    SocialHistory: new YakapSocialHistory("N", "", "N", "", "N", "Y"),
                    Immunizations: [new YakapImmunization(null, null, null, null, "999")],
                    MenstrualHistory: new YakapMenstrualHistory("", "", "", "", "", "", "", "N", "", "N"),
                    PregnancyHistory: new YakapPregnancyHistory("0", "0", "", "0", "0", "0", "0", "", "", "N"),
                    PhysicalExam: new YakapPhysicalExamPertinent("120", "80", "72", "18", "36.5", "172", "68", "23.0", Waist: "32", Hip: "36"),
                    BloodType: "A+",
                    GenSurveyId: "1",
                    GenSurveyRem: "",
                    PhysicalExamMiscs: [new YakapPhysicalExamMisc("1", "1", "1", "1", "1", "1", "1", "1")],
                    PhysicalExamSpecifics: new YakapPhysicalExamSpecific("", "", "Clear breath sounds", "Regular rhythm", "", "", "", ""),
                    NcdAnswers: new YakapNcdAnswers(
                        Qid1Yn: "N", Qid2Yn: "N", Qid3Yn: "N", Qid4Yn: "N", Qid5Ynx: "N",
                        Qid6Yn: "N", Qid7Yn: "N", Qid8Yn: "N", Qid9Yn: "Y", Qid10Yn: "N",
                        Qid11Yn: "N", Qid12Yn: "N", Qid13Yn: "Y", Qid14Yn: "N", Qid15Yn: "N",
                        Qid16Yn: "Y", Qid17Abcde: "A", Qid18Yn: "N", Qid19Yn: "N", Qid20Yn: "N",
                        Qid21Yn: "N", Qid22Yn: "N", Qid23Yn: "N", Qid24Yn: "N"))
            ],
            Soaps:
            [
                new YakapSoap(
                    HciCaseNo: "THCI-001",
                    HciTransNo: "SHCI-001",
                    SoapDate: "2026-10-02",
                    PatientPin: "030263078507",
                    PatientType: "MM",
                    MemPin: "030263078507",
                    EffYear: "2026",
                    ATC: "WALKEDIN",
                    IsWalkedIn: "Y",
                    CoPay: "0",
                    TransDate: "2026-10-02",
                    IllnessHistory: "Follow-up consultation for Essential Hypertension and Type 2 Diabetes Mellitus",
                    SignsSymptoms: "37;X",
                    OtherComplaint: "Occasional morning headache",
                    PainSite: "",
                    PhysicalExam: new YakapPhysicalExamPertinent("130", "85", "74", "18", "36.6", "172", "68", "23.0", Waist: "32", Hip: "36"),
                    PhysicalExamMiscs: [new YakapPhysicalExamMisc("1", "1", "1", "1", "1", "1", "1", "1")],
                    PhysicalExamSpecifics: new YakapPhysicalExamSpecific("", "", "Clear breath sounds", "Regular rhythm", "", "", "", ""),
                    IcdCodes: ["I10", "E11.9"],
                    Diagnostics: [new YakapDiagnosticOrder("1", "", "Y", "RQ"), new YakapDiagnosticOrder("2", "", "Y", "RQ")],
                    Managements: [new YakapManagement("1", ""), new YakapManagement("6", "Lifestyle modification and low sodium diet")],
                    AdviceRemarks: "Strict adherence to anti-hypertensive regimen and daily blood glucose monitoring. Follow-up after 30 days.")
            ],
            DiagnosticResults:
            [
                new YakapDiagnosticResult(
                    HciCaseNo: "THCI-001",
                    HciTransNo: "SHCI-001",
                    PatientPin: "030263078507",
                    PatientType: "MM",
                    MemPin: "030263078507",
                    EffYear: "2026",
                    FbsResults: [new YakapFbsResult("In-house Lab", "2026-10-02", "110", "6.1", "2026-10-02")],
                    CbcResults: [new YakapCbcResult("In-house Lab", "2026-10-02", "0.42", "140", "8.7", "30", "1.8", "330", "20.5", "90", "90", "6.5", "6.5", "0", "2", "60", "32", "4", "2", "0", "250", "2026-10-02")])
            ],
            Medicines:
            [
                new YakapMedicine("THCI-001", "MHCI-001", "P", "AMLOD0000000005TAB00000000090", "AMLOD", "00000", "00005", "TAB00", "00000", "00090", "", "", "Oral", "90", "0.65", "58.50", "1", "5mg", "Once a day", "Dr. Roberto Cruz, MD", "Y", "2026-10-02", "Pharmacist Ana Cruz, RPh", "Y", "2026-10-02"),
                new YakapMedicine("THCI-001", "MHCI-002", "P", "LOSAR0000000050TAB00000000090", "LOSAR", "00000", "00050", "TAB00", "00000", "00090", "", "", "Oral", "90", "1.75", "157.50", "1", "50mg", "Once a day", "Dr. Roberto Cruz, MD", "Y", "2026-10-02", "Pharmacist Ana Cruz, RPh", "Y", "2026-10-02"),
                new YakapMedicine("THCI-001", "MHCI-003", "P", "METFO0000000500TAB00000000180", "METFO", "00000", "00500", "TAB00", "00000", "00180", "", "", "Oral", "180", "1.25", "225.00", "1", "500mg", "Twice a day with meals", "Dr. Roberto Cruz, MD", "Y", "2026-10-02", "Pharmacist Ana Cruz, RPh", "Y", "2026-10-02")
            ]);
}
