using ClinicEz.PhilHealthProxy.Infrastructure;
using FluentAssertions;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.DataProtection.KeyManagement;
using Microsoft.AspNetCore.DataProtection.Repositories;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Xunit;

namespace ClinicEz.PhilHealthProxy.Application.Tests.Services;

/// <summary>The proxy has no built-in secrets or key ring location: outside Development both must be configured.</summary>
public sealed class StartupConfigurationTests : IDisposable
{
    private readonly string _keysPath = Path.Combine(Path.GetTempPath(), "proxy-dpkeys-" + Guid.NewGuid().ToString("N"));

    private sealed class FakeEnvironment(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "ClinicEz.PhilHealthProxy.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private IConfiguration Config(bool keysPath = true, bool internalKey = true, bool portalUrl = true)
    {
        var values = new Dictionary<string, string?>();
        if (keysPath) values["DataProtection:KeysPath"] = _keysPath;
        if (internalKey) values["Internal:ApiKey"] = "internal-key";
        if (portalUrl) values["PortalApi:BaseUrl"] = "http://portal-api:8080";
        return new ConfigurationBuilder().AddInMemoryCollection(values).Build();
    }

    private static IServiceCollection Register(IConfiguration configuration, string environment) =>
        new ServiceCollection().AddInfrastructureServices(configuration, new FakeEnvironment(environment));

    public void Dispose()
    {
        if (Directory.Exists(_keysPath)) Directory.Delete(_keysPath, recursive: true);
    }

    [Fact]
    public void KeyRing_IsPersistedToTheConfiguredDirectory_UnderTheServiceName()
    {
        using var provider = Register(Config(), "Production").BuildServiceProvider();

        var options = provider.GetRequiredService<IOptions<KeyManagementOptions>>().Value;
        var repository = options.XmlRepository.Should().BeOfType<FileSystemXmlRepository>().Subject;

        repository.Directory.FullName.Should().Be(new DirectoryInfo(_keysPath).FullName);
        Directory.Exists(_keysPath).Should().BeTrue();
        provider.GetRequiredService<IOptions<DataProtectionOptions>>().Value.ApplicationDiscriminator.Should().Be("ClinicEz.PhilHealthProxy");
    }

    [Fact]
    public void KeyRing_WithoutAConfiguredDirectory_FailsOutsideDevelopment()
    {
        var act = () => Register(Config(keysPath: false), "Production");

        act.Should().Throw<InvalidOperationException>().WithMessage("*DataProtection:KeysPath*");
    }

    [Fact]
    public void KeyRing_WithoutAConfiguredDirectory_IsAllowedInDevelopment()
    {
        var act = () => Register(Config(keysPath: false, internalKey: false), "Development");

        act.Should().NotThrow();
    }

    [Fact]
    public void MissingInternalKey_FailsOutsideDevelopment_AndNamesTheEnvironmentVariable()
    {
        var act = () => Register(Config(internalKey: false), "Production");

        act.Should().Throw<InvalidOperationException>().WithMessage("*Internal:ApiKey*Internal__ApiKey*");
    }

    [Fact]
    public void MissingPortalUrl_FailsInsteadOfFallingBackToLocalhost()
    {
        var act = () => Register(Config(portalUrl: false), "Development");

        act.Should().Throw<InvalidOperationException>().WithMessage("*PortalApi:BaseUrl*");
    }
}
