using FluentAssertions;
using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using NSubstitute;

namespace ClinicEz.Patient.Api.Tests.Security;

public sealed class CorsPolicyTests
{
    private static ServiceCollection Register(string environment, params string[] origins)
    {
        var settings = origins.Select((origin, index) => KeyValuePair.Create($"Cors:AllowedOrigins:{index}", (string?)origin));
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();
        var env = Substitute.For<IWebHostEnvironment>();
        env.EnvironmentName.Returns(environment);

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddApiServices(configuration, env);
        return services;
    }

    private static CorsResult Evaluate(ServiceCollection services, string origin)
    {
        using var provider = services.BuildServiceProvider();
        var context = new DefaultHttpContext();
        context.Request.Headers.Origin = origin;
        var policy = provider.GetRequiredService<ICorsPolicyProvider>().GetPolicyAsync(context, null).GetAwaiter().GetResult();
        return provider.GetRequiredService<ICorsService>().EvaluatePolicy(context, policy!);
    }

    [Fact]
    public void Outside_Development_the_host_refuses_to_start_without_configured_origins()
    {
        var act = () => Register(Environments.Production);

        act.Should().Throw<InvalidOperationException>().WithMessage("*CORS is not configured*");
    }

    [Fact]
    public void Outside_Development_allow_any_origin_is_refused()
    {
        var env = Substitute.For<IWebHostEnvironment>();
        env.EnvironmentName.Returns(Environments.Production);
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Cors:AllowAnyOrigin"] = "true", ["Cors:AllowedOrigins:0"] = "https://app.test" })
            .Build();

        var act = () => new ServiceCollection().AddApiServices(configuration, env);

        act.Should().Throw<InvalidOperationException>().WithMessage("*only allowed in Development*");
    }

    [Fact]
    public void Outside_Development_only_configured_origins_are_allowed()
    {
        var services = Register(Environments.Production, "https://app.test");

        Evaluate(services, "https://app.test").IsOriginAllowed.Should().BeTrue();
        Evaluate(services, "https://evil.example").IsOriginAllowed.Should().BeFalse();
    }

    [Fact]
    public void Development_starts_without_configuration_and_allows_any_origin()
    {
        var services = Register(Environments.Development);

        Evaluate(services, "https://anything.example").IsOriginAllowed.Should().BeTrue();
    }
}
