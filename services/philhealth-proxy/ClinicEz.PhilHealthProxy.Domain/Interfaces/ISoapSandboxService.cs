using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Domain.Models;
using ClinicEz.PhilHealthProxy.Domain.Models.SoapSandbox;

namespace ClinicEz.PhilHealthProxy.Domain.Interfaces;

/// <summary>
/// Service contract for the in-process PhilHealth SOAP 1.1 Sandbox simulation engine.
/// Emulates all 7 official Konsulta/Yakap operations with configurable scenario injection.
/// </summary>
public interface ISoapSandboxService
{
    /// <summary>
    /// Processes a raw SOAP action and returns a realistic PhilHealth SOAP response envelope.
    /// </summary>
    Task<SoapResult> HandleSoapActionAsync(
        string soapAction,
        string? requestBodyXml,
        string? tokenHeader = null,
        CancellationToken ct = default);

    /// <summary>
    /// Sets the active simulation scenario (HappyPath, DtdValidationError, ExpiredToken, etc.).
    /// </summary>
    void SetScenario(SoapSimulationScenario scenario);

    /// <summary>
    /// Gets the currently active simulation scenario.
    /// </summary>
    SoapSimulationScenario GetActiveScenario();

    /// <summary>
    /// Gets current operational and telemetry status of the sandbox.
    /// </summary>
    SoapSandboxStatus GetStatus();

    /// <summary>
    /// Resets all simulated state, counters, and registries back to initial values.
    /// </summary>
    void ResetSimulationState();

    /// <summary>
    /// Executes the complete 7-step PhilHealth Konsulta / YAKAP E2E simulation sequence
    /// with timing, status, and payload telemetry.
    /// </summary>
    Task<SoapSimulationReport> RunFullE2eSimulationAsync(
        string accreditationNumber,
        string cipherKey,
        CancellationToken ct = default);
}
