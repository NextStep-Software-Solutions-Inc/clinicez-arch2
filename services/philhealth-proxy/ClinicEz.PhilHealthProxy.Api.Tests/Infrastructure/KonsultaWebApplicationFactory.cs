using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using NSubstitute;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Infrastructure.Persistence;

namespace ClinicEz.PhilHealthProxy.Api.Tests.Infrastructure;

/// <summary>
/// Creates an in-process test server for the PhilHealth Proxy API.
/// The real <see cref="IPhilHealthSoapClient"/> is replaced by a NSubstitute mock
/// and the Npgsql DbContext is swapped for InMemory to prevent any external connections.
/// </summary>
public sealed class KonsultaWebApplicationFactory : WebApplicationFactory<Program>
{
    public IPhilHealthSoapClient MockSoapClient { get; } =
        Substitute.For<IPhilHealthSoapClient>();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // Prevent EnsureCreated() call inside AddInfrastructureServices dev branch.
        builder.UseEnvironment("Testing");

        // Provide a dummy connection string so Npgsql registration doesn't throw.
        builder.ConfigureAppConfiguration(config =>
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:DefaultConnection"] =
                    "Host=localhost;Database=test;Username=test;Password=test"
            }));

        builder.ConfigureServices(services =>
        {
            // ── Replace Npgsql DbContext with InMemory ────────────────────────
            var dbDescriptors = services
                .Where(d => d.ServiceType == typeof(DbContextOptions<ApplicationDbContext>))
                .ToList();
            foreach (var d in dbDescriptors) services.Remove(d);

            services.AddDbContext<ApplicationDbContext>(opts =>
                opts.UseInMemoryDatabase("PhilHealthProxy_Tests_" + Guid.NewGuid()));

            // ── Replace real SOAP client with our mock ────────────────────────
            var soapDescriptors = services
                .Where(d => d.ServiceType == typeof(IPhilHealthSoapClient))
                .ToList();
            foreach (var d in soapDescriptors) services.Remove(d);

            services.AddSingleton(MockSoapClient);
        });
    }
}
