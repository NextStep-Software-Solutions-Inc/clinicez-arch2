using ClinicEz.Shared.Middlewares;
using FluentAssertions;
using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace ClinicEz.Shared.Tests.Middlewares;

public class CorsConfigurationTests
{
    private sealed class WebEnv(string name) : IWebHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
        public string WebRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
    }

    private static IConfiguration Config(params (string Key, string? Value)[] values) =>
        new ConfigurationBuilder().AddInMemoryCollection(values.ToDictionary(v => v.Key, v => v.Value)).Build();

    private static CorsPolicy DefaultPolicy(IConfiguration config, string environment)
    {
        var services = new ServiceCollection();
        services.AddClinicEzCors(config, new WebEnv(environment));
        var options = services.BuildServiceProvider().GetRequiredService<IOptions<CorsOptions>>().Value;
        return options.GetPolicy(options.DefaultPolicyName)!;
    }

    private static CorsPolicy NamedPolicy(IConfiguration config, string name)
    {
        var services = new ServiceCollection();
        services.AddClinicEzCors(config, new WebEnv("Production"));
        return services.BuildServiceProvider().GetRequiredService<IOptions<CorsOptions>>().Value.GetPolicy(name)!;
    }

    [Theory]
    [InlineData("Production")]
    [InlineData("Staging")]
    [InlineData("Dev-like")]
    public void Outside_development_nothing_configured_fails_to_start(string environment)
    {
        var start = () => DefaultPolicy(Config(), environment);

        start.Should().Throw<InvalidOperationException>().WithMessage("*CORS is not configured*");
    }

    [Fact]
    public void Outside_development_AllowAnyOrigin_is_an_error_even_when_origins_are_configured()
    {
        var config = Config(("Cors:AllowAnyOrigin", "true"), ("Facility:BaseDomain", "clinicez.example"));

        var start = () => DefaultPolicy(config, "Production");

        start.Should().Throw<InvalidOperationException>().WithMessage("*AllowAnyOrigin*Development*");
    }

    [Theory]
    [InlineData("Facility:BaseDomain", "clinicez.example")]
    [InlineData("Cors:AllowedDomains:0", "clinicez.example")]
    [InlineData("Cors:AllowedOrigins:0", "https://app.clinicez.example")]
    public void Any_one_trusted_origin_setting_is_enough(string key, string value)
    {
        var policy = DefaultPolicy(Config((key, value)), "Production");

        policy.AllowAnyOrigin.Should().BeFalse();
        policy.IsOriginAllowed("https://app.clinicez.example").Should().BeTrue();
        policy.IsOriginAllowed("https://evil.example").Should().BeFalse();
    }

    [Fact]
    public void Configured_origins_are_matched_by_host_suffix_and_wildcards_only()
    {
        var policy = DefaultPolicy(Config(("Facility:BaseDomain", "clinicez.example"), ("Cors:AllowedOrigins:0", "https://*.partner.test")), "Production");

        policy.IsOriginAllowed("https://acme.clinicez.example").Should().BeTrue();
        policy.IsOriginAllowed("https://notclinicez.example").Should().BeFalse();
        policy.IsOriginAllowed("https://x.partner.test").Should().BeTrue();
        policy.IsOriginAllowed("not a url").Should().BeFalse();
    }

    [Theory]
    [InlineData("https://preview-branch.vercel.app")]
    [InlineData("http://localhost:3000")]
    [InlineData("https://app.localhost")]
    [InlineData("https://tenant.lvh.me")]
    [InlineData("https://clinicez.example.attacker.test")]
    public void Production_trusts_nothing_beyond_the_configured_domains_and_origins(string origin)
    {
        var policy = DefaultPolicy(Config(("Facility:BaseDomain", "clinicez.example")), "Production");
        var named = NamedPolicy(Config(("Facility:BaseDomain", "clinicez.example")), CorsExtensions.ProductionPolicyName);

        policy.IsOriginAllowed(origin).Should().BeFalse();
        named.IsOriginAllowed(origin).Should().BeFalse();
    }

    [Fact]
    public void An_origin_the_operator_lists_explicitly_is_still_allowed()
    {
        var policy = DefaultPolicy(Config(("Cors:AllowedOrigins:0", "https://portal-preview.vercel.app"), ("Cors:AllowedOrigins:1", "http://localhost:3000")), "Production");

        policy.IsOriginAllowed("https://portal-preview.vercel.app").Should().BeTrue();
        policy.IsOriginAllowed("http://localhost:3000").Should().BeTrue();
        policy.IsOriginAllowed("https://other.vercel.app").Should().BeFalse();
    }

    [Fact]
    public void A_plain_host_environment_is_enough_to_register_the_policies()
    {
        var services = new ServiceCollection();
        var environment = new Microsoft.Extensions.Hosting.Internal.HostingEnvironment { EnvironmentName = "Production" };

        services.AddClinicEzCors(Config(("Facility:BaseDomain", "clinicez.example")), environment);

        services.BuildServiceProvider().GetRequiredService<IOptions<CorsOptions>>().Value.GetPolicy(CorsExtensions.ProductionPolicyName).Should().NotBeNull();
    }
    [Fact]
    public void Development_allows_every_origin_without_any_configuration()
    {
        var policy = DefaultPolicy(Config(), "Development");

        policy.IsOriginAllowed("https://anything.example").Should().BeTrue();
    }

    [Fact]
    public void A_development_looking_config_value_no_longer_switches_the_policy_off_in_production()
    {
        var config = Config(("Environment", "Development"), ("Facility:BaseDomain", "clinicez.example"));

        var policy = DefaultPolicy(config, "Production");

        policy.IsOriginAllowed("https://evil.example").Should().BeFalse();
    }

    [Fact]
    public void The_guard_can_be_called_directly_by_services_that_do_not_use_AddClinicEzCors()
    {
        var production = () => CorsConfigurationGuard.EnsureConfigured(Config(), new WebEnv("Production"));
        var development = () => CorsConfigurationGuard.EnsureConfigured(Config(), new WebEnv("Development"));

        production.Should().Throw<InvalidOperationException>();
        development.Should().NotThrow();
    }
}
