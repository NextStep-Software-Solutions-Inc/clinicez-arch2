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
    [InlineData("https://preview.vercel.app")]
    [InlineData("http://localhost:8081")]
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
}
