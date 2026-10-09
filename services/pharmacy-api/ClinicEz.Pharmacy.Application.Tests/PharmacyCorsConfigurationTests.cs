using System;
using System.Collections.Generic;
using System.IO;
using ClinicEz.Shared.Middlewares;
using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using NSubstitute;
using Xunit;

namespace ClinicEz.Pharmacy.Application.Tests;

/// <summary>The pharmacy's shipped settings against the shared CORS guard (<see cref="CorsExtensions.AddClinicEzCors"/>).</summary>
public class PharmacyCorsConfigurationTests
{
    private static readonly string ApiDirectory = Path.GetDirectoryName(typeof(Api.DependencyInjection).Assembly.Location)!;

    private static IWebHostEnvironment Env(string name)
    {
        var env = Substitute.For<IWebHostEnvironment>();
        env.EnvironmentName.Returns(name);
        return env;
    }

    private static IConfiguration ShippedSettings(string environment, params (string Key, string Value)[] overrides)
    {
        var builder = new ConfigurationBuilder().AddJsonFile(Path.Combine(ApiDirectory, "appsettings.json"));
        var environmentFile = Path.Combine(ApiDirectory, $"appsettings.{environment}.json");
        if (File.Exists(environmentFile)) builder.AddJsonFile(environmentFile);
        var extra = new Dictionary<string, string?>();
        foreach (var (key, value) in overrides) extra[key] = value;
        return builder.AddInMemoryCollection(extra).Build();
    }

    [Fact]
    public void BaseAppSettings_DoNotAllowAnyOrigin_ButDevelopmentSettingsDo()
    {
        ShippedSettings(Environments.Production).GetValue<bool>("Cors:AllowAnyOrigin").Should().BeFalse();
        ShippedSettings(Environments.Development).GetValue<bool>("Cors:AllowAnyOrigin").Should().BeTrue();
    }

    [Fact]
    public void Production_WithTheShippedSettingsAlone_FailsFast()
    {
        var act = () => new ServiceCollection().AddClinicEzCors(ShippedSettings(Environments.Production), Env(Environments.Production));

        act.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public void Production_WithABaseDomain_Starts()
    {
        var configuration = ShippedSettings(Environments.Production, ("Facility:BaseDomain", "clinicez.net"));

        var act = () => new ServiceCollection().AddClinicEzCors(configuration, Env(Environments.Production));

        act.Should().NotThrow();
    }

    [Fact]
    public void Development_WithTheShippedSettings_Starts()
    {
        var act = () => new ServiceCollection().AddClinicEzCors(ShippedSettings(Environments.Development), Env(Environments.Development));

        act.Should().NotThrow();
    }
}
