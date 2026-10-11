using System.Text.Json;
using ClinicEz.Shared.Middlewares;
using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;

namespace ClinicEz.Billing.Tests;

/// <summary>billing-api registers CORS through the shared <c>AddClinicEzCors</c>, which refuses to start without an explicit allow-list.</summary>
public class CorsConfigurationTests
{
    private sealed class Env(string name) : IWebHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "billing";
        public string ContentRootPath { get; set; } = string.Empty;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
        public string WebRootPath { get; set; } = string.Empty;
        public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
    }

    private static IConfiguration Config(params (string Key, string? Value)[] values) =>
        new ConfigurationBuilder().AddInMemoryCollection(values.ToDictionary(v => v.Key, v => v.Value)).Build();

    private static void Register(string environment, params (string Key, string? Value)[] values) =>
        new ServiceCollection().AddClinicEzCors(Config(values), new Env(environment));

    [Fact]
    public void Startup_outside_development_fails_when_no_origin_is_configured()
    {
        var act = () => Register(Environments.Production);

        act.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public void Startup_outside_development_refuses_allow_any_origin()
    {
        var act = () => Register(Environments.Production, ("Cors:AllowAnyOrigin", "true"), ("Facility:BaseDomain", "example.com"));

        act.Should().Throw<InvalidOperationException>();
    }

    [Theory]
    [InlineData("Facility:BaseDomain", "example.com")]
    [InlineData("Cors:AllowedOrigins", "https://cashier.example.com")]
    public void Startup_outside_development_succeeds_with_a_base_domain_or_allowed_origins(string key, string value)
    {
        var act = () => Register(Environments.Production, (key, value));

        act.Should().NotThrow();
    }

    [Fact]
    public void Development_starts_without_any_cors_configuration()
    {
        var act = () => Register(Environments.Development);

        act.Should().NotThrow();
    }

    [Fact]
    public void The_shipped_base_settings_do_not_open_cors_and_only_the_development_file_does()
    {
        var api = Path.Combine(FindRepositoryRoot(), "services", "billing-api", "ClinicEz.Billing.Api");

        using var baseSettings = JsonDocument.Parse(File.ReadAllText(Path.Combine(api, "appsettings.json")));
        using var devSettings = JsonDocument.Parse(File.ReadAllText(Path.Combine(api, "appsettings.Development.json")));

        baseSettings.RootElement.TryGetProperty("Cors", out _).Should().BeFalse();
        devSettings.RootElement.GetProperty("Cors").GetProperty("AllowAnyOrigin").GetBoolean().Should().BeTrue();
    }

    private static string FindRepositoryRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !Directory.Exists(Path.Combine(directory.FullName, "services", "billing-api"))) directory = directory.Parent;
        return directory?.FullName ?? throw new DirectoryNotFoundException("Repository root not found.");
    }
}
