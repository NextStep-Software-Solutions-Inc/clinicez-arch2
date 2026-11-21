using System;
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
    public async Task GetSandboxStatusAsync_ReturnsPcapiSandboxStatus()
    {
        var sampleStatus = new SandboxStatus("HappyPath", 3, 1, 1, 2, 1);
        var (client, hub) = CreateClient(Ok(sampleStatus));

        var result = await client.GetSandboxStatusAsync();

        result.Succeeded.Should().BeTrue();
        result.Data!.CurrentScenario.Should().Be("HappyPath");
        result.Data.BeneficiariesCount.Should().Be(3);
        OperationOf(hub).Should().Be(PhilHealthOperations.PcapiSandboxStatus);
    }

    [Fact]
    public async Task SetSandboxScenarioAsync_SendsScenarioPayload()
    {
        var updatedStatus = new SandboxStatus("BeneficiaryNotFound", 3, 0, 0, 0, 0);
        var (client, hub) = CreateClient(Ok(updatedStatus));

        var result = await client.SetSandboxScenarioAsync(new SetSandboxScenarioRequest("BeneficiaryNotFound"));

        result.Succeeded.Should().BeTrue();
        result.Data!.CurrentScenario.Should().Be("BeneficiaryNotFound");
        OperationOf(hub).Should().Be(PhilHealthOperations.PcapiSandboxScenario);
        ((PhilHealthRequestPayload)hub.Calls.Single().Payload).Body.Should().Contain("BeneficiaryNotFound");
    }

    [Fact]
    public async Task ResetSandboxAsync_SendsResetRequest()
    {
        var resetStatus = new SandboxStatus("HappyPath", 3, 1, 1, 0, 0);
        var (client, hub) = CreateClient(Ok(resetStatus));

        var result = await client.ResetSandboxAsync();

        result.Succeeded.Should().BeTrue();
        result.Data!.CurrentScenario.Should().Be("HappyPath");
        OperationOf(hub).Should().Be(PhilHealthOperations.PcapiSandboxReset);
    }

    [Fact]
    public async Task ValidateStandingAsync_DispatchesService02OverInteropHub()
    {
        var standing = new YakapValidatorResponse(
            "123456789012",
            "DELA CRUZ",
            "JUAN",
            "SANTOS",
            null,
            new PcuStatusInfo("UNVERIFIED"),
            new SelectionStatusInfo("NOT_ASSIGNED"),
            new EmpanelmentStatusInfo("N"),
            new FpeStatusInfo("N"),
            new ConsultationStatusInfo("N"));
        var (client, hub) = CreateClient(Ok(standing));

        var result = await client.ValidateStandingAsync(new YakapValidateStandingRequest("123456789012", "2026"));

        result.Succeeded.Should().BeTrue();
        result.Data!.Selection!.Status.Should().Be("NOT_ASSIGNED");
        OperationOf(hub).Should().Be(PhilHealthOperations.YakapValidateStanding);
    }

    [Fact]
    public async Task ValidatePinAsync_ValidatesFormatLocallyWithoutSoapCall()
    {
        var (client, hub) = CreateClient(Ok(true));

        var result = await client.ValidatePinAsync("12-345678901-2");

        result.Succeeded.Should().BeTrue();
        result.Data.Should().BeTrue();
        hub.Calls.Should().BeEmpty();
    }

    [Fact]
    public async Task UploadPlainJsonAsync_SendsRawJsonToPcapiDataUploadOperation()
    {
        var (client, hub) = CreateClient(Ok(new DataUploadResponse("UH100000012026112000001", "fpe", "queued", "CH100000012026112000001", DateTime.UtcNow)));

        var result = await client.UploadPlainJsonAsync("fpe", "{\"pPatientPin\":\"123456789012\"}");

        result.Succeeded.Should().BeTrue();
        var payload = (PhilHealthRequestPayload)hub.Calls.Single().Payload;
        payload.Operation.Should().Be(PhilHealthOperations.DataUploadFpe);
        payload.Body.Should().Be("{\"pPatientPin\":\"123456789012\"}");
    }
}
