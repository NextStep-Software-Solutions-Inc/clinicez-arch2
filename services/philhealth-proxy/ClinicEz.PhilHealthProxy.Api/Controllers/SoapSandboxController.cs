using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Domain.Models.SoapSandbox;
using ClinicEz.Shared.Common;

namespace ClinicEz.PhilHealthProxy.Api.Controllers;

public record RunSoapSimulationRequest(string? AccreditationNumber = null, string? CipherKey = null);
public record SetScenarioRequest(SoapSimulationScenario Scenario);

[ApiController]
public sealed class SoapSandboxController : ControllerBase
{
    private readonly ISoapSandboxService _sandboxService;
    private readonly ILogger<SoapSandboxController> _logger;

    public SoapSandboxController(
        ISoapSandboxService sandboxService,
        ILogger<SoapSandboxController> logger)
    {
        _sandboxService = sandboxService;
        _logger = logger;
    }

    /// <summary>
    /// Raw SOAP 1.1 HTTP endpoint mimicking the official PhilHealth Konsulta web service.
    /// External clients, Postman, SoapUI, or HTTP callers can POST raw SOAP XML envelopes here.
    /// </summary>
    [HttpPost("/soap/konsulta")]
    [Consumes("text/xml", "application/xml", "text/plain")]
    [Produces("text/xml")]
    public async Task<IActionResult> HandleSoapPost(CancellationToken ct)
    {
        using var reader = new StreamReader(Request.Body, Encoding.UTF8);
        var rawXml = await reader.ReadToEndAsync(ct);

        // SOAPAction header from HTTP request (SOAP 1.1)
        string? soapAction = Request.Headers["SOAPAction"].FirstOrDefault();

        // If SOAPAction header is missing or empty, extract action from XML body
        if (string.IsNullOrWhiteSpace(soapAction))
        {
            var match = Regex.Match(rawXml, @"<(?:\w+:)?(getToken|isMemberDependentRegistered|isATCValid|extractRegistrationList|validateReport|submitReport|checkUploadStatus)[\s>]", RegexOptions.IgnoreCase);
            if (match.Success)
            {
                soapAction = match.Groups[1].Value;
            }
            else
            {
                soapAction = "unknown";
            }
        }

        string? tokenHeader = Request.Headers["Token"].FirstOrDefault();

        _logger.LogInformation("SOAP Sandbox received action [{Action}]", soapAction);

        var result = await _sandboxService.HandleSoapActionAsync(soapAction, rawXml, tokenHeader, ct);

        int statusCode = result.IsSuccess ? StatusCodes.Status200OK : StatusCodes.Status500InternalServerError;
        return Content(result.ResponseXml ?? string.Empty, "text/xml; charset=utf-8", Encoding.UTF8);
    }

    /// <summary>
    /// Executes the full 7-step PhilHealth SOAP E2E sequence and returns detailed telemetry and payloads.
    /// </summary>
    [HttpPost("api/soap-sandbox/run-e2e")]
    [ProducesResponseType<ApiResponse<SoapSimulationReport>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> RunFullSimulation(
        [FromBody] RunSoapSimulationRequest? request,
        CancellationToken ct)
    {
        var accreditationNumber = !string.IsNullOrWhiteSpace(request?.AccreditationNumber)
            ? request.AccreditationNumber
            : "HCI-NCR-00921";

        var cipherKey = !string.IsNullOrWhiteSpace(request?.CipherKey)
            ? request.CipherKey
            : "CLINICEZ-YAKAP-DEV-KEY-32BYTES!";

        var report = await _sandboxService.RunFullE2eSimulationAsync(accreditationNumber, cipherKey, ct);
        return Ok(ApiResponse<SoapSimulationReport>.Success(report));
    }

    /// <summary>
    /// Returns the current SOAP Sandbox simulator status and statistics.
    /// </summary>
    [HttpGet("api/soap-sandbox/status")]
    [ProducesResponseType<ApiResponse<SoapSandboxStatus>>(StatusCodes.Status200OK)]
    public IActionResult GetStatus()
    {
        var status = _sandboxService.GetStatus();
        return Ok(ApiResponse<SoapSandboxStatus>.Success(status));
    }

    /// <summary>
    /// Updates the active fault injection / simulation scenario.
    /// </summary>
    [HttpPost("api/soap-sandbox/scenario")]
    [ProducesResponseType<ApiResponse<SoapSandboxStatus>>(StatusCodes.Status200OK)]
    public IActionResult SetScenario([FromBody] SetScenarioRequest request)
    {
        _sandboxService.SetScenario(request.Scenario);
        var status = _sandboxService.GetStatus();
        return Ok(ApiResponse<SoapSandboxStatus>.Success(status));
    }

    /// <summary>
    /// Resets the simulator metrics and restores HappyPath scenario.
    /// </summary>
    [HttpPost("api/soap-sandbox/reset")]
    [ProducesResponseType<ApiResponse<SoapSandboxStatus>>(StatusCodes.Status200OK)]
    public IActionResult Reset()
    {
        _sandboxService.ResetSimulationState();
        var status = _sandboxService.GetStatus();
        return Ok(ApiResponse<SoapSandboxStatus>.Success(status));
    }
}
