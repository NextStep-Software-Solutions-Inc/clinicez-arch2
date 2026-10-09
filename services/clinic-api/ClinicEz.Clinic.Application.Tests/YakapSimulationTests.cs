using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Common;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public sealed class YakapSimulationTests
{
    /// <summary>The proxy writes enums as strings, like every platform API.</summary>
    private static readonly JsonSerializerOptions ProxyJson = new JsonSerializerOptions().UseStrictStringEnums();

    private class MockHttpMessageHandler(Func<HttpRequestMessage, HttpResponseMessage> handlerFunc) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            return Task.FromResult(handlerFunc(request));
        }
    }

    private static PhilHealthProxyClient CreateClient(Func<HttpRequestMessage, HttpResponseMessage> handler)
    {
        var httpClient = new HttpClient(new MockHttpMessageHandler(handler))
        {
            BaseAddress = new Uri("http://localhost:5025")
        };

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["PhilHealthProxy:BaseUrl"] = "http://localhost:5025"
            })
            .Build();

        return new PhilHealthProxyClient(httpClient, config, NullLogger<PhilHealthProxyClient>.Instance);
    }

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

        var client = CreateClient(req =>
        {
            req.Method.Should().Be(HttpMethod.Post);
            req.RequestUri!.PathAndQuery.Should().Be("/api/soap-sandbox/run-e2e");
            var json = JsonSerializer.Serialize(ApiResponse<SoapSimulationReportDto>.Success(sampleReport), ProxyJson);
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json")
            };
        });

        var result = await client.RunSoapSimulationAsync(new RunSoapSimulationProxyRequest("HCI-NCR-00921"));

        result.Succeeded.Should().BeTrue();
        result.Data.Should().NotBeNull();
        result.Data!.Passed.Should().BeTrue();
        result.Data.TotalSteps.Should().Be(7);
        result.Data.Steps.Should().HaveCount(7);
        result.Data.Steps[4].ActionName.Should().Be("validateReport");
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

        var client = CreateClient(req =>
        {
            req.Method.Should().Be(HttpMethod.Get);
            req.RequestUri!.PathAndQuery.Should().Be("/api/soap-sandbox/status");
            var json = JsonSerializer.Serialize(ApiResponse<SoapSandboxStatusDto>.Success(sampleStatus), ProxyJson);
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json")
            };
        });

        var result = await client.GetSoapSandboxStatusAsync();

        result.Succeeded.Should().BeTrue();
        result.Data!.ActiveScenario.Should().Be(SoapSimulationScenarioDto.HappyPath);
        result.Data.TotalSimulatedCalls.Should().Be(42);
        result.Data.AvailableScenarios.Should().Contain("HappyPath");
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

        var client = CreateClient(req =>
        {
            req.Method.Should().Be(HttpMethod.Post);
            req.RequestUri!.PathAndQuery.Should().Be("/api/soap-sandbox/scenario");
            var json = JsonSerializer.Serialize(ApiResponse<SoapSandboxStatusDto>.Success(updatedStatus), ProxyJson);
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json")
            };
        });

        var result = await client.SetSoapSandboxScenarioAsync(new SetSimulationScenarioRequest(SoapSimulationScenarioDto.SoapFault500));

        result.Succeeded.Should().BeTrue();
        result.Data!.ActiveScenario.Should().Be(SoapSimulationScenarioDto.SoapFault500);
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

        var client = CreateClient(req =>
        {
            req.Method.Should().Be(HttpMethod.Post);
            req.RequestUri!.PathAndQuery.Should().Be("/api/soap-sandbox/reset");
            var json = JsonSerializer.Serialize(ApiResponse<SoapSandboxStatusDto>.Success(resetStatus), ProxyJson);
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json")
            };
        });

        var result = await client.ResetSoapSandboxAsync();

        result.Succeeded.Should().BeTrue();
        result.Data!.TotalSimulatedCalls.Should().Be(0);
        result.Data.ActiveScenario.Should().Be(SoapSimulationScenarioDto.HappyPath);
    }

    [Fact]
    public async Task RunSoapSimulationAsync_WhenHttpError_ReturnsFailure()
    {
        var client = CreateClient(req =>
            new HttpResponseMessage(HttpStatusCode.InternalServerError)
            {
                Content = new StringContent("Server Error")
            });

        var result = await client.RunSoapSimulationAsync(new RunSoapSimulationProxyRequest());

        result.Succeeded.Should().BeFalse();
        result.Message.Should().NotBeNullOrEmpty();
    }
}
