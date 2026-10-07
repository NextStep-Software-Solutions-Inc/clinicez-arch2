using ClinicEz.Portal.Application;
using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Xunit;

namespace ClinicEz.Portal.Tests.Cors;

public class CorsPolicyTests
{
    private readonly CorsPolicy _productionPolicy;

    public CorsPolicyTests()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                { "Cors:AllowedOrigins:0", "https://portal-preview.vercel.app" },
                { "Facility:BaseDomain", "example.com" }
            })
            .Build();

        var services = new ServiceCollection();
        services.AddApplicationServices(configuration);

        var serviceProvider = services.BuildServiceProvider();
        var corsOptions = serviceProvider.GetRequiredService<IOptions<CorsOptions>>().Value;
        _productionPolicy = corsOptions.GetPolicy("production")!;
    }

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
        Assert.NotNull(_productionPolicy);
        Assert.NotNull(_productionPolicy.IsOriginAllowed);
        Assert.True(_productionPolicy.IsOriginAllowed(origin), $"Origin '{origin}' should be allowed by production CORS policy.");
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
    [InlineData("")]
    public void ProductionPolicy_RejectsUntrustedOrigins(string origin)
    {
        Assert.NotNull(_productionPolicy);
        Assert.NotNull(_productionPolicy.IsOriginAllowed);
        Assert.False(_productionPolicy.IsOriginAllowed(origin), $"Origin '{origin}' should NOT be allowed by production CORS policy.");
    }

    [Fact]
    public void ProductionPolicy_EnablesCredentials()
    {
        Assert.True(_productionPolicy.SupportsCredentials, "Production CORS policy should support credentials.");
    }
}
