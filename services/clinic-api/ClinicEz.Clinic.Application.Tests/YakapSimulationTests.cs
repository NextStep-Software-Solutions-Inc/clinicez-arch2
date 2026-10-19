using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public sealed class YakapSimulationTests
{
    /// <summary>The proxy writes enums as strings, like every platform API.</summary>
    private static readonly JsonSerializerOptions ProxyJson = new JsonSerializerOptions().UseStrictStringEnums();

    private static (PhilHealthProxyClient Client, StubInteropRequestClient Hub) CreateClient(PhilHealthResponsePayload reply)
    {
        var hub = new StubInteropRequestClient(_ => reply);
        var client = new PhilHealthProxyClient(
            hub, Phase3TestKit.Identity(Guid.NewGuid(), "tenant-sim"), NullLogger<PhilHealthProxyClient>.Instance);
        return (client, hub);
    }

    private static PhilHealthResponsePayload Ok<T>(T data) =>
        new() { StatusCode = 200, Body = JsonSerializer.Serialize(ApiResponse<T>.Success(data), ProxyJson) };

    private static string OperationOf(StubInteropRequestClient hub) =>
        ((PhilHealthRequestPayload)hub.Calls.Single().Payload).Operation;

    [Fact]
    public async Task RunSoapSimulationAsync_WhenSuccessful_Deserializes7StepsReport()
    {
        var sampleReport = new SoapSimulationReportDto(
            Scenario: SoapSimulationScenarioDto.HappyPath,
            Passed: true,
            TotalSteps: 7,
            PassedSteps: 7,
            FailedSteps: 0,
            TotalDurationMs: 145,
            Steps: new List<SoapSimulationStepResultDto>
            {
                new(1, "getToken", SoapSimulationStepStatusDto.Passed, 25, "Token issued"),
                new(2, "isMemberDependentRegistered", SoapSimulationStepStatusDto.Passed, 15, "PIN valid"),
                new(3, "isATCValid", SoapSimulationStepStatusDto.Passed, 12, "ATC valid"),
                new(4, "extractRegistrationList", SoapSimulationStepStatusDto.Passed, 18, "Masterlist extracted"),
                new(5, "validateReport", SoapSimulationStepStatusDto.Passed, 20, "Tranche 1 DTD verified"),
                new(6, "submitReport", SoapSimulationStepStatusDto.Passed, 16, "Tranche 2 Transmitted"),
                new(7, "checkUploadStatus", SoapSimulationStepStatusDto.Passed, 14, "PROCESSED")
            },
            Timestamp: DateTime.UtcNow);
        var (client, hub) = CreateClient(Ok(sampleReport));

        var result = await client.RunSoapSimulationAsync(new RunSoapSimulationProxyRequest("HCI-NCR-00921"));

        result.Succeeded.Should().BeTrue();
        result.Data.Should().NotBeNull();
        result.Data!.Passed.Should().BeTrue();
        result.Data.TotalSteps.Should().Be(7);
        result.Data.Steps.Should().HaveCount(7);
        result.Data.Steps[4].ActionName.Should().Be("validateReport");
        OperationOf(hub).Should().Be(PhilHealthOperations.SoapSandboxRun);
        ((PhilHealthRequestPayload)hub.Calls.Single().Payload).Body.Should().Contain("HCI-NCR-00921");
    }

    [Fact]
    public async Task GetSoapSandboxStatusAsync_ReturnsStatusAndScenarios()
    {
        var sampleStatus = new SoapSandboxStatusDto(
            IsActive: true,
            ActiveScenario: SoapSimulationScenarioDto.HappyPath,
            EndpointUrl: "/soap/konsulta",
            TotalSimulatedCalls: 42,
            AvailableScenarios: new[] { "HappyPath", "SoapFault500" });
        var (client, hub) = CreateClient(Ok(sampleStatus));

        var result = await client.GetSoapSandboxStatusAsync();

        result.Succeeded.Should().BeTrue();
        result.Data!.ActiveScenario.Should().Be(SoapSimulationScenarioDto.HappyPath);
        result.Data.TotalSimulatedCalls.Should().Be(42);
        result.Data.AvailableScenarios.Should().Contain("HappyPath");
        OperationOf(hub).Should().Be(PhilHealthOperations.SoapSandboxStatus);
    }

    [Fact]
    public async Task SetSoapSandboxScenarioAsync_SendsScenarioPayload()
    {
        var updatedStatus = new SoapSandboxStatusDto(
            IsActive: true,
            ActiveScenario: SoapSimulationScenarioDto.SoapFault500,
            EndpointUrl: "/soap/konsulta",
            TotalSimulatedCalls: 43,
            AvailableScenarios: new[] { "HappyPath", "SoapFault500" });
        var (client, hub) = CreateClient(Ok(updatedStatus));

        var result = await client.SetSoapSandboxScenarioAsync(new SetSimulationScenarioRequest(SoapSimulationScenarioDto.SoapFault500));

        result.Succeeded.Should().BeTrue();
        result.Data!.ActiveScenario.Should().Be(SoapSimulationScenarioDto.SoapFault500);
        OperationOf(hub).Should().Be(PhilHealthOperations.SoapSandboxScenario);
        ((PhilHealthRequestPayload)hub.Calls.Single().Payload).Body.Should().Contain("SoapFault500", "enums travel as strings");
    }

    [Fact]
    public async Task ResetSoapSandboxAsync_SendsResetRequest()
    {
        var resetStatus = new SoapSandboxStatusDto(
            IsActive: true,
            ActiveScenario: SoapSimulationScenarioDto.HappyPath,
            EndpointUrl: "/soap/konsulta",
            TotalSimulatedCalls: 0,
            AvailableScenarios: new[] { "HappyPath" });
        var (client, hub) = CreateClient(Ok(resetStatus));

        var result = await client.ResetSoapSandboxAsync();

        result.Succeeded.Should().BeTrue();
        result.Data!.TotalSimulatedCalls.Should().Be(0);
        result.Data.ActiveScenario.Should().Be(SoapSimulationScenarioDto.HappyPath);
        OperationOf(hub).Should().Be(PhilHealthOperations.SoapSandboxReset);
    }

    [Fact]
    public async Task ValidatePinAsync_PassesThePinAsTheArgument()
    {
        var (client, hub) = CreateClient(Ok(true));

        var result = await client.ValidatePinAsync("12-345678901-2");

        result.Succeeded.Should().BeTrue();
        result.Data.Should().BeTrue();
        var payload = (PhilHealthRequestPayload)hub.Calls.Single().Payload;
        payload.Operation.Should().Be(PhilHealthOperations.YakapPinValidate);
        payload.Argument.Should().Be("12-345678901-2");
        payload.Body.Should().BeNull();
    }

    [Fact]
    public async Task RunSoapSimulationAsync_WhenTheServiceErrors_ReturnsFailure()
    {
        var (client, _) = CreateClient(new PhilHealthResponsePayload { StatusCode = 500, Body = "Server Error" });

        var result = await client.RunSoapSimulationAsync(new RunSoapSimulationProxyRequest());

        result.Succeeded.Should().BeFalse();
        result.Message.Should().NotBeNullOrEmpty();
    }
}
