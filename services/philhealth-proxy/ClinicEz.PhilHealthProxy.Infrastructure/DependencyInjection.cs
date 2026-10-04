using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Infrastructure.Services;

namespace ClinicEz.PhilHealthProxy.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructureServices(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment? env = null)
    {
        // Pure Stateless Zero-DB Micro-Gateway:
        // Register in-memory cache for 1-hour statutory credentials caching
        services.AddMemoryCache();

        // Resilient HTTP Client connecting to Portal API for branch accreditation credentials
        var portalBaseUrl = configuration["PortalApi:BaseUrl"]
            ?? configuration["PORTAL_API_BASE_URL"]
            ?? "http://localhost:5000";

        services.AddHttpClient<ITenantRepository, PortalTenantClient>(client =>
        {
            client.BaseAddress = new Uri(portalBaseUrl);
            client.Timeout = TimeSpan.FromSeconds(10);
        })
        .AddStandardResilienceHandler();

        // Register CurrentTenantService as both itself (for the middleware setter)
        // and as ICurrentTenant (for handlers and the SOAP client).
        services.AddScoped<CurrentTenantService>();
        services.AddScoped<ICurrentTenant>(sp => sp.GetRequiredService<CurrentTenantService>());

        services.AddHttpClient<IPhilHealthSoapClient, PhilHealthSoapClient>(client =>
        {
            client.Timeout = TimeSpan.FromSeconds(30);
        });

        // Singleton token cache — holds per-tenant access tokens across HTTP requests.
        services.AddSingleton<IPhilHealthTokenCache, PhilHealthTokenCache>();

        // PhilHealth PKA cryptographic, validation, generation, and parsing engines
        services.AddSingleton<IPhilHealthPayloadEncryptor, PhilHealthPayloadEncryptor>();
        services.AddSingleton<IKonsultaXmlValidator, KonsultaXmlValidator>();
        services.AddSingleton<IKonsultaXmlGenerator, KonsultaXmlGenerator>();
        services.AddSingleton<IKonsultaMasterlistParser, KonsultaMasterlistParser>();
        services.AddSingleton<ISoapSandboxService, SoapSandboxService>();

        services.AddDataProtection()
            .SetApplicationName("ClinicEz.PhilHealthProxy");

        return services;
    }
}
