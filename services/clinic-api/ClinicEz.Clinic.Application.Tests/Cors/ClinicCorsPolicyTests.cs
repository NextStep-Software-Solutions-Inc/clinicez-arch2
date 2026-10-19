using System.IO;
using ClinicEz.Shared.Middlewares;
using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Cors;

public class ClinicCorsPolicyTests
{
    [Theory]
    [InlineData("http://localhost:8081")]
    [InlineData("https://clinic.dev.example.com")]
    [InlineData("https://tenant1.clinic.dev.example.com")]
    [InlineData("https://clinic.api.dev.partner.example.org")]
    [InlineData("https://any-dev-origin.example.org")]
    [InlineData("https://custom-preview-branch.vercel.app")]
    public void DevelopmentEnvironment_AllowsAnyOrigin(string origin)
    {
        var services = new ServiceCollection();
        var configuration = new ConfigurationBuilder().Build();

        var env = Substitute.For<IWebHostEnvironment>();
        env.EnvironmentName.Returns("Development");

        services.AddClinicEzCors(configuration, env);

        var sp = services.BuildServiceProvider();
        var corsOptions = sp.GetRequiredService<IOptions<CorsOptions>>().Value;
        var policy = corsOptions.GetPolicy(CorsExtensions.DevelopmentPolicyName);

        Assert.NotNull(policy);
        Assert.NotNull(policy.IsOriginAllowed);
        Assert.True(policy.IsOriginAllowed(origin), $"Origin '{origin}' should be allowed in development.");
        Assert.True(policy.SupportsCredentials, "Development policy must allow credentials.");
    }

    [Theory]
    [InlineData("https://example.com")]
    [InlineData("https://clinic.example.com")]
    [InlineData("https://tenant1.clinic.example.com")]
    [InlineData("https://partner.example.org")]
    [InlineData("https://dev.partner.example.org")]
    [InlineData("https://clinic.api.dev.partner.example.org")]
    public void ProductionPolicy_AllowsTrustedOrigins(string origin)
    {
        var services = new ServiceCollection();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                { "Facility:BaseDomain", "example.com" },
                { "Cors:AllowedDomains:0", "partner.example.org" }
            })
            .Build();

        var env = Substitute.For<IWebHostEnvironment>();
        env.EnvironmentName.Returns("Production");

        services.AddClinicEzCors(configuration, env);

        var sp = services.BuildServiceProvider();
        var corsOptions = sp.GetRequiredService<IOptions<CorsOptions>>().Value;
        var policy = corsOptions.GetPolicy(CorsExtensions.ProductionPolicyName);

        Assert.NotNull(policy);
        Assert.NotNull(policy.IsOriginAllowed);
        Assert.True(policy.IsOriginAllowed(origin), $"Origin '{origin}' should be allowed in production policy.");
        Assert.True(policy.SupportsCredentials);
    }

    [Theory]
    [InlineData("https://evil-hacker.com")]
    [InlineData("https://attacker-example.com.org")]
    [InlineData("http://untrusted-site.io")]
    [InlineData("https://preview.vercel.app")]
    [InlineData("http://localhost:8081")]
    [InlineData("")]
    public void ProductionPolicy_RejectsUntrustedOrigins(string origin)
    {
        var services = new ServiceCollection();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                { "Facility:BaseDomain", "example.com" },
                { "Cors:AllowedDomains:0", "partner.example.org" }
            })
            .Build();

        var env = Substitute.For<IWebHostEnvironment>();
        env.EnvironmentName.Returns("Production");

        services.AddClinicEzCors(configuration, env);

        var sp = services.BuildServiceProvider();
        var corsOptions = sp.GetRequiredService<IOptions<CorsOptions>>().Value;
        var policy = corsOptions.GetPolicy(CorsExtensions.ProductionPolicyName);

        Assert.NotNull(policy);
        Assert.NotNull(policy.IsOriginAllowed);
        Assert.False(policy.IsOriginAllowed(origin), $"Origin '{origin}' should be rejected in production policy.");
    }

    private static string ShippedAppSettingsPath()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            var candidate = Path.Combine(dir.FullName, "services", "clinic-api", "ClinicEz.Clinic.Api", "appsettings.json");
            if (File.Exists(candidate)) return candidate;
        }

        throw new FileNotFoundException("The clinic-api appsettings.json was not found above the test output directory.");
    }

    [Fact]
    public void ShippedBaseConfig_DoesNotOpenCorsToAnyOrigin()
    {
        var configuration = new ConfigurationBuilder().AddJsonFile(ShippedAppSettingsPath(), optional: false).Build();

        Assert.False(configuration.GetValue<bool>("Cors:AllowAnyOrigin"), "Cors:AllowAnyOrigin belongs in appsettings.Development.json only.");
    }

    [Fact]
    public void ShippedBaseConfig_OutsideDevelopment_FailsFastUntilADomainIsConfigured()
    {
        var configuration = new ConfigurationBuilder().AddJsonFile(ShippedAppSettingsPath(), optional: false).Build();
        var env = Substitute.For<IWebHostEnvironment>();
        env.EnvironmentName.Returns("Production");

        var act = () => new ServiceCollection().AddClinicEzCors(configuration, env);

        Assert.Throws<InvalidOperationException>(act);
    }

    [Fact]
    public void ShippedBaseConfig_OutsideDevelopment_StartsOnceABaseDomainIsConfigured()
    {
        var configuration = new ConfigurationBuilder()
            .AddJsonFile(ShippedAppSettingsPath(), optional: false)
            .AddInMemoryCollection(new Dictionary<string, string?> { { "Facility:BaseDomain", "example.com" } })
            .Build();
        var env = Substitute.For<IWebHostEnvironment>();
        env.EnvironmentName.Returns("Production");

        var services = new ServiceCollection();
        services.AddClinicEzCors(configuration, env);

        var policy = services.BuildServiceProvider().GetRequiredService<IOptions<CorsOptions>>().Value.GetPolicy(CorsExtensions.ProductionPolicyName);
        Assert.NotNull(policy);
        Assert.True(policy.IsOriginAllowed("https://clinic.example.com"));
        Assert.False(policy.IsOriginAllowed("https://evil-hacker.com"));
    }}
