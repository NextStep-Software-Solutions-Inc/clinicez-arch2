using System.Collections.Generic;
using ClinicEz.Laboratory.Api.Controllers;
using ClinicEz.Laboratory.Application.Common.Interfaces;
using ClinicEz.Shared.Common;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using NSubstitute;
using Xunit;

namespace ClinicEz.Laboratory.Application.Tests;

/// <summary>The analyzer simulator fabricates instrument traffic, so it must be off outside Development unless configured on.</summary>
public class AnalyzerSimulatorGateTests
{
    private static readonly SimulateAnalyzerRequest Request = new() { AccessionNumber = "ACC-1" };

    private static AnalyzersController Create(string environment, string? simulatorEnabled = null)
    {
        var settings = new Dictionary<string, string?>();
        if (simulatorEnabled is not null) settings["Analyzer:SimulatorEnabled"] = simulatorEnabled;

        var configuration = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();
        var host = Substitute.For<IHostEnvironment>();
        host.EnvironmentName.Returns(environment);

        var feed = Substitute.For<IAnalyzerFeedService>();
        feed.GenerateSimulationPayload(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<string>()).Returns("H|\\^&");

        return new AnalyzersController(Substitute.For<ISender>(), feed, configuration, host);
    }

    [Theory]
    [InlineData("Production", null, false)]
    [InlineData("Staging", null, false)]
    [InlineData("Development", null, true)]
    [InlineData("Production", "true", true)]
    [InlineData("Development", "false", false)]
    public void Simulator_IsEnabled_OnlyInDevelopmentOrWhenConfigured(string environment, string? configured, bool expected)
    {
        var capabilities = Create(environment, configured).GetCapabilities();

        var body = capabilities.Result.Should().BeOfType<OkObjectResult>().Subject.Value.Should().BeOfType<ApiResponse<AnalyzerCapabilitiesResponse>>().Subject;
        body.Data!.SimulatorEnabled.Should().Be(expected);
    }

    [Fact]
    public void Simulate_Returns404_WhenDisabled()
    {
        var result = Create("Production").SimulatePayload(Request);

        result.Result.Should().BeOfType<NotFoundObjectResult>();
    }

    [Fact]
    public void Simulate_ReturnsPayload_WhenEnabledByConfiguration()
    {
        var result = Create("Production", "true").SimulatePayload(Request);

        var body = result.Result.Should().BeOfType<OkObjectResult>().Subject.Value.Should().BeOfType<ApiResponse<SimulateAnalyzerResponse>>().Subject;
        body.Data!.AccessionNumber.Should().Be("ACC-1");
    }

    [Fact]
    public void Simulate_ReturnsPayload_InDevelopment()
    {
        var result = Create("Development").SimulatePayload(Request);

        result.Result.Should().BeOfType<OkObjectResult>();
    }
}
