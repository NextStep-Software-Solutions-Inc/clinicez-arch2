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
                { "Cors:AllowedOrigins:0", "https://clinicez-portal-pro.vercel.app" }
            })
            .Build();

        var services = new ServiceCollection();
        services.AddApplicationServices(configuration);

        var serviceProvider = services.BuildServiceProvider();
        var corsOptions = serviceProvider.GetRequiredService<IOptions<CorsOptions>>().Value;
        _productionPolicy = corsOptions.GetPolicy("production")!;
    }

    [Theory]
    [InlineData("https://clinicez.net")]
    [InlineData("https://v2.clinicez.net")]
    [InlineData("https://clinic.clinicez.net")]
    [InlineData("https://lab.clinicez.net")]
    [InlineData("https://pharmacy.clinicez.net")]
    [InlineData("https://org.clinicez.net")]
    [InlineData("https://portal.clinicez.net")]
    [InlineData("https://sub.v2.clinicez.net")]
    [InlineData("https://clinicez-portal-pro.vercel.app")]
    public void ProductionPolicy_AllowsValidOriginsAndSubdomains(string origin)
    {
        Assert.NotNull(_productionPolicy);
        Assert.NotNull(_productionPolicy.IsOriginAllowed);
        Assert.True(_productionPolicy.IsOriginAllowed(origin), $"Origin '{origin}' should be allowed by production CORS policy.");
    }

    [Theory]
    [InlineData("https://clinicez.ph")]
    [InlineData("https://clinic.clinicez.ph")]
    [InlineData("https://evil-clinicez.net")]
    [InlineData("https://notclinicez.net")]
    [InlineData("https://clinicez.net.attacker.com")]
    [InlineData("https://clinicez.ph.attacker.com")]
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
