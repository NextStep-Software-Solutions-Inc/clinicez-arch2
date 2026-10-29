using System.Linq;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using NSubstitute;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;

namespace ClinicEz.PhilHealthProxy.Api.Tests.Infrastructure;

/// <summary>
/// Creates an in-process test server for the stateless PhilHealth Proxy API.
/// </summary>
public sealed class KonsultaWebApplicationFactory : WebApplicationFactory<Program>
{
    public IPhilHealthPcapiClient MockPcapiClient { get; } =
        Substitute.For<IPhilHealthPcapiClient>();

    public ITenantRepository MockTenantRepository { get; } =
        Substitute.For<ITenantRepository>();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        // Configuration settings required for startup outside Development
        builder.UseSetting("Internal:ApiKey", "test-internal-key");
        builder.UseSetting("PortalApi:BaseUrl", "http://localhost:8080");
        builder.UseSetting("Messaging:Transport", "InProcess");
        builder.UseSetting("Messaging:Enabled", "false");

        builder.ConfigureServices(services =>
        {
            // ── Replace real PCAPI client with our mock ────────────────────────
            var pcapiDescriptors = services
                .Where(d => d.ServiceType == typeof(IPhilHealthPcapiClient))
                .ToList();
            foreach (var d in pcapiDescriptors) services.Remove(d);

            services.AddSingleton(MockPcapiClient);

            // ── Replace real Tenant Repository with mock ──────────────────────
            var tenantDescriptors = services
                .Where(d => d.ServiceType == typeof(ITenantRepository))
                .ToList();
            foreach (var d in tenantDescriptors) services.Remove(d);

            services.AddSingleton(MockTenantRepository);
        });
    }
}
