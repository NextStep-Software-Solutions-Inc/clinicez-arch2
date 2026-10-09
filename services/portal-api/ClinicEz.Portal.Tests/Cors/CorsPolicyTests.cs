using ClinicEz.Shared.Middlewares;
using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Xunit;

namespace ClinicEz.Portal.Tests.Cors;

/// <summary>portal-api uses the shared CORS policy (AddClinicEzCors); these pin the behaviour it relies on.</summary>
public class CorsPolicyTests
{
    private sealed class FakeEnvironment(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "ClinicEz.Portal.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private static IConfiguration Config(params (string Key, string Value)[] values) =>
        new ConfigurationBuilder().AddInMemoryCollection(values.ToDictionary(v => v.Key, v => (string?)v.Value)).Build();

    private static CorsPolicy Policy(string policyName, string environment, params (string Key, string Value)[] values)
    {
        var services = new ServiceCollection().AddClinicEzCors(Config(values), new FakeEnvironment(environment));
        return services.BuildServiceProvider().GetRequiredService<IOptions<CorsOptions>>().Value.GetPolicy(policyName)!;
    }

    private static CorsPolicy ProductionPolicy() => Policy(
        CorsExtensions.ProductionPolicyName,
        "Production",
        ("Cors:AllowedOrigins:0", "https://portal-preview.vercel.app"),
        ("Facility:BaseDomain", "example.com"));

    [Theory]
    [InlineData("https://example.com")]
    [InlineData("https://v2.example.com")]
    [InlineData("https://clinic.example.com")]
    [InlineData("https://lab.example.com")]
    [InlineData("https://pharmacy.example.com")]
    [InlineData("https://org.example.com")]
    [InlineData("https://portal.example.com")]
    [InlineData("https://sub.v2.example.com")]
    [InlineData("https://portal-preview.vercel.app")]
    public void ProductionPolicy_AllowsValidOriginsAndSubdomains(string origin)
    {
        Assert.True(ProductionPolicy().IsOriginAllowed(origin), $"Origin '{origin}' should be allowed by production CORS policy.");
    }

    [Theory]
    [InlineData("https://example.ph")]
    [InlineData("https://clinic.example.ph")]
    [InlineData("https://evil-example.com")]
    [InlineData("https://notexample.com")]
    [InlineData("https://example.com.attacker.com")]
    [InlineData("https://example.ph.attacker.com")]
    [InlineData("https://malicious.com")]
    [InlineData("http://untrusted-site.com")]
    [InlineData("https://someone-elses-app.vercel.app")]
    [InlineData("https://portal-preview.vercel.app.attacker.com")]
    [InlineData("http://localhost:3000")]
    [InlineData("https://app.localhost")]
    [InlineData("https://tenant.lvh.me")]
    [InlineData("")]
    public void ProductionPolicy_RejectsUntrustedOrigins(string origin)
    {
        Assert.False(ProductionPolicy().IsOriginAllowed(origin), $"Origin '{origin}' should NOT be allowed by production CORS policy.");
    }

    [Fact]
    public void ProductionPolicy_EnablesCredentials()
    {
        Assert.True(ProductionPolicy().SupportsCredentials, "Production CORS policy should support credentials.");
    }

    [Fact]
    public void ProductionPolicy_AllowsConfiguredAllowedDomainsAndTheirSubdomains_Only()
    {
        var policy = Policy(CorsExtensions.ProductionPolicyName, "Production", ("Cors:AllowedDomains", "partner.org"));

        Assert.True(policy.IsOriginAllowed("https://partner.org"));
        Assert.True(policy.IsOriginAllowed("https://app.partner.org"));
        Assert.False(policy.IsOriginAllowed("https://partner.org.attacker.com"));
    }

    [Fact]
    public void DevelopmentPolicy_AllowsAnyOrigin()
    {
        var policy = Policy(CorsExtensions.DevelopmentPolicyName, "Development");

        Assert.True(policy.IsOriginAllowed("http://localhost:3000"));
        Assert.True(policy.IsOriginAllowed("https://anything.vercel.app"));
    }

    [Fact]
    public void OutsideDevelopment_WithoutAnyConfiguredOrigin_FailsFast()
    {
        var ex = Assert.Throws<InvalidOperationException>(() => Policy(CorsExtensions.ProductionPolicyName, "Production"));

        Assert.Contains("Cors__AllowedOrigins", ex.Message);
    }

    [Fact]
    public void OutsideDevelopment_AnAllowAnyOriginSwitch_IsRefused()
    {
        var ex = Assert.Throws<InvalidOperationException>(() =>
            Policy(CorsExtensions.ProductionPolicyName, "Production", ("Cors:AllowAnyOrigin", "true"), ("Cors:AllowedOrigins", "https://app.example.org")));

        Assert.Contains("Cors:AllowAnyOrigin", ex.Message);
    }

    [Fact]
    public void OutsideDevelopment_ABaseDomainAlone_IsEnough()
    {
        var ex = Record.Exception(() => Policy(CorsExtensions.ProductionPolicyName, "Production", ("Facility:BaseDomain", "example.com")));

        Assert.Null(ex);
    }

    [Fact]
    public void Development_NeedsNoConfiguredOrigins()
    {
        var ex = Record.Exception(() => Policy(CorsExtensions.DevelopmentPolicyName, "Development"));

        Assert.Null(ex);
    }
}
