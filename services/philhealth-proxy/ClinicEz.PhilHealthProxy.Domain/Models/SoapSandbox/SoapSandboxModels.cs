using System;
using System.Collections.Generic;

namespace ClinicEz.PhilHealthProxy.Domain.Models.SoapSandbox;

/// <summary>
/// Configurable simulation scenarios for testing resilience and compliance.
/// </summary>
public enum SoapSimulationScenario
{
    HappyPath = 0,
    DtdValidationError = 1,
    ExpiredToken = 2,
    InvalidPin = 3,
    NetworkTimeout = 4,
    SoapFault500 = 5,
}

public enum SoapSimulationStepStatus
{
    Pending = 0,
    Running = 1,
    Passed = 2,
    Failed = 3,
    Skipped = 4,
}

public sealed record SoapSimulationStepResult(
    int StepNumber,
    string ActionName,
    SoapSimulationStepStatus Status,
    long DurationMs,
    string Summary,
    string? RequestXml = null,
    string? ResponseXml = null,
    string? ErrorMessage = null);

public sealed record SoapSimulationReport(
    SoapSimulationScenario Scenario,
    bool Passed,
    int TotalSteps,
    int PassedSteps,
    int FailedSteps,
    long TotalDurationMs,
    IReadOnlyList<SoapSimulationStepResult> Steps,
    DateTime Timestamp);

public sealed record SimulatedMember(
    string Pin,
    string LastName,
    string FirstName,
    string Category,
    DateTime RegistrationDate,
    string Status);

public sealed record SimulatedAtc(
    string Pin,
    string AtcCode,
    DateTime EffectivityDate,
    DateTime ExpiryDate,
    bool IsValid);

public sealed record SoapSandboxStatus(
    bool IsActive,
    SoapSimulationScenario ActiveScenario,
    string EndpointUrl,
    int TotalSimulatedCalls,
    IReadOnlyList<string> AvailableScenarios);
