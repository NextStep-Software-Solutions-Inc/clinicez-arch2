using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using NSubstitute;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;

namespace ClinicEz.PhilHealthProxy.Api.Tests.Infrastructure;

/// <summary>
/// Creates an in-process test server for the stateless PhilHealth Proxy API.
/// Zero database dependencies.
/// </summary>
public sealed class KonsultaWebApplicationFactory : WebApplicationFactory<Program>
{
    public IPhilHealthSoapClient MockSoapClient { get; } =
        Substitute.For<IPhilHealthSoapClient>();

    public ITenantRepository MockTenantRepository { get; } =
        Substitute.For<ITenantRepository>();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        // Outside Development the proxy refuses to start without these; the tests give it throw-away values.
        builder.UseSetting("DataProtection:KeysPath", Path.Combine(Path.GetTempPath(), "clinicez-proxy-tests-dpkeys"));
        builder.UseSetting("Internal:ApiKey", "test-internal-key");

        builder.ConfigureServices(services =>
        {
            // ── Replace real SOAP client with our mock ────────────────────────
            var soapDescriptors = services
                .Where(d => d.ServiceType == typeof(IPhilHealthSoapClient))
                .ToList();
            foreach (var d in soapDescriptors) services.Remove(d);

            services.AddSingleton(MockSoapClient);

            // ── Replace real Tenant Repository with mock ──────────────────────
            var tenantDescriptors = services
                .Where(d => d.ServiceType == typeof(ITenantRepository))
                .ToList();
            foreach (var d in tenantDescriptors) services.Remove(d);

            services.AddSingleton(MockTenantRepository);
        });
    }
}
