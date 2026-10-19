using System;
using System.Collections.Generic;

namespace ClinicEz.Clinic.Application.Features.Yakap.DTOs;

public enum SoapSimulationScenarioDto
{
    HappyPath = 0,
    DtdValidationError = 1,
    ExpiredToken = 2,
    InvalidPin = 3,
    NetworkTimeout = 4,
    SoapFault500 = 5,
}

public enum SoapSimulationStepStatusDto
{
    Pending = 0,
    Running = 1,
    Passed = 2,
    Failed = 3,
    Skipped = 4,
}

public record SoapSimulationStepResultDto(
    int StepNumber,
    string ActionName,
    SoapSimulationStepStatusDto Status,
    long DurationMs,
    string Summary,
    string? RequestXml = null,
    string? ResponseXml = null,
    string? ErrorMessage = null);

public record SoapSimulationReportDto(
    SoapSimulationScenarioDto Scenario,
    bool Passed,
    int TotalSteps,
    int PassedSteps,
    int FailedSteps,
    long TotalDurationMs,
    IReadOnlyList<SoapSimulationStepResultDto> Steps,
    DateTime Timestamp);

public record SoapSandboxStatusDto(
    bool IsActive,
    SoapSimulationScenarioDto ActiveScenario,
    string EndpointUrl,
    int TotalSimulatedCalls,
    IReadOnlyList<string> AvailableScenarios);

public record RunSoapSimulationProxyRequest(
    string? AccreditationNumber = null,
    string? CipherKey = null);

public record SetSimulationScenarioRequest(
    SoapSimulationScenarioDto Scenario);
