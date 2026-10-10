using ClinicEz.PhilHealthProxy.Infrastructure;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace ClinicEz.PhilHealthProxy.Application.Tests.Services;

/// <summary>The proxy has no built-in secrets: outside Development both must be configured.</summary>
public sealed class StartupConfigurationTests
{
    private sealed class FakeEnvironment(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "ClinicEz.PhilHealthProxy.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private static IConfiguration Config(bool portalUrl = true)
    {
        var values = new Dictionary<string, string?>();
        if (portalUrl) values["PortalApi:BaseUrl"] = "http://portal-api:8080";
        return new ConfigurationBuilder().AddInMemoryCollection(values).Build();
    }

    private static IServiceCollection Register(IConfiguration configuration, string environment) =>
        new ServiceCollection().AddInfrastructureServices(configuration, new FakeEnvironment(environment));

    [Fact]
    public void MissingPortalUrl_FailsInsteadOfFallingBackToLocalhost()
    {
        var act = () => Register(Config(portalUrl: false), "Development");

        act.Should().Throw<InvalidOperationException>().WithMessage("*PortalApi:BaseUrl*");
    }
}
