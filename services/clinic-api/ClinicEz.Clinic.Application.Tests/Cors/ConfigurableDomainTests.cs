using ClinicEz.Shared.Common;
using ClinicEz.Shared.Documents.Security;
using ClinicEz.Shared.Middlewares;
using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Cors;

public class ConfigurableDomainTests
{
    private static IConfiguration Build(Dictionary<string, string?> values) =>
        new ConfigurationBuilder().AddInMemoryCollection(values).Build();

    [Fact]
    public void GetStringList_SplitsCommaSeparatedScalarAndMergesIndexedEntries()
    {
        var config = Build(new()
        {
            { "Cors:AllowedDomains", "a.example.com, b.example.com;c.example.com" },
            { "Cors:AllowedDomains:0", "d.example.com" },
            { "Cors:AllowedDomains:1", "A.example.com" }
        });

        var list = config.GetStringList("Cors:AllowedDomains");

        Assert.Equal(4, list.Length);
        Assert.Contains("a.example.com", list, StringComparer.OrdinalIgnoreCase);
        Assert.Contains("b.example.com", list);
        Assert.Contains("c.example.com", list);
        Assert.Contains("d.example.com", list);
    }

    [Fact]
    public void GetStringList_ReturnsEmptyWhenMissingOrBlank()
    {
        Assert.Empty(Build(new()).GetStringList("Cors:AllowedDomains"));
        Assert.Empty(Build(new() { { "Cors:AllowedDomains", "" } }).GetStringList("Cors:AllowedDomains"));
    }

    [Fact]
    public void GetAuthorizedParties_DerivesWildcardsFromBaseAndAllowedDomains()
    {
        var config = Build(new()
        {
            { "Facility:BaseDomain", ".tenants.example.com" },
            { "Cors:AllowedDomains", "partner.example.org" },
            { "Clerk:AuthorizedParties", "http://localhost:*" }
        });

        var parties = config.GetAuthorizedParties("Clerk:AuthorizedParties");

        Assert.Contains("http://localhost:*", parties);
        Assert.Contains("https://tenants.example.com", parties);
        Assert.Contains("https://*.tenants.example.com", parties);
        Assert.Contains("https://partner.example.org", parties);
        Assert.Contains("https://*.partner.example.org", parties);
    }

    [Fact]
    public void CorsProductionPolicy_AllowsDomainsSuppliedAsSingleCommaSeparatedValue()
    {
        var services = new ServiceCollection();
        var config = Build(new()
        {
            { "Cors:AllowedDomains", "one.example.net,two.example.net" },
            { "Cors:AllowedOrigins", "https://console.example.io" }
        });
        var env = Substitute.For<IWebHostEnvironment>();
        env.EnvironmentName.Returns("Production");

        services.AddClinicEzCors(config, env);

        var policy = services.BuildServiceProvider()
            .GetRequiredService<IOptions<CorsOptions>>().Value
            .GetPolicy(CorsExtensions.ProductionPolicyName)!;

        Assert.True(policy.IsOriginAllowed!("https://tenant.two.example.net"));
        Assert.True(policy.IsOriginAllowed("https://console.example.io"));
        Assert.False(policy.IsOriginAllowed("https://other.example.io"));
    }

    [Fact]
    public void VerificationUrlResolver_PrefersExplicitUrlThenBaseDomainThenEmpty()
    {
        Assert.Equal("https://verify.example.com",
            VerificationUrlResolver.Resolve(Build(new()
            {
                { "Verification:BaseUrl", "https://verify.example.com/" },
                { "Facility:BaseDomain", "tenants.example.com" }
            })));

        Assert.Equal("https://tenants.example.com",
            VerificationUrlResolver.Resolve(Build(new() { { "Facility:BaseDomain", "tenants.example.com" } })));

        Assert.Equal(string.Empty, VerificationUrlResolver.Resolve(Build(new())));
        Assert.Equal(string.Empty, VerificationUrlResolver.Resolve(null));
    }
}
