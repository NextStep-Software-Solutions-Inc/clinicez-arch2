using System;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Infrastructure.Interop;
using ClinicEz.PhilHealthProxy.Infrastructure.Persistence;
using ClinicEz.PhilHealthProxy.Infrastructure.Services;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Persistence;
using ClinicEz.Shared.Interoperability;
using ClinicEz.Shared.Security;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace ClinicEz.PhilHealthProxy.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructureServices(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment env)
    {
        services.AddMemoryCache();

        // 1. Configure DbContext for Interop Inbox/Outbox
        var dbConnection = configuration.GetConnectionString("DefaultConnection");
        if (!string.IsNullOrWhiteSpace(dbConnection))
        {
            services.AddDbContext<PhilHealthProxyDbContext>(opts =>
                opts.UseNpgsql(dbConnection, npgsql => npgsql.MigrationsHistoryTable("__EFMigrationsHistory", "philhealth")));
        }
        else
        {
            services.AddDbContext<PhilHealthProxyDbContext>(opts =>
                opts.UseInMemoryDatabase("PhilHealthProxy_Interop"));
        }

        services.AddScoped<IInteropDbContext>(sp => sp.GetRequiredService<PhilHealthProxyDbContext>());

        // 2. Wire Interop SDK with Responder and Reply handlers
        services.AddInterop<PhilHealthProxyDbContext>(configuration, handlers => handlers
            .Respond<PhilHealthRequestPayload, PhilHealthResponsePayload, PhilHealthRequestResponder>(
                InteropTypes.PhilHealthRequest,
                InteropTypes.PhilHealthResponse)
            .HandleReply(InteropTypes.PhilHealthConfigResponded)
            .HandleReply(InteropTypes.PhilHealthConfigUpsertResponded));

        // 3. Resilient HTTP Client connecting to Portal API for credentials
        var portalBaseUrl = (configuration["PortalApi:BaseUrl"]
            ?? configuration["PORTAL_API_BASE_URL"]
            ?? throw new InvalidOperationException("PortalApi:BaseUrl is not configured (environment variable PortalApi__BaseUrl)."))
            .TrimEnd('/');
        if (portalBaseUrl.EndsWith("/api/v1", StringComparison.OrdinalIgnoreCase))
        {
            portalBaseUrl = portalBaseUrl[..^7].TrimEnd('/');
        }

        services.AddHttpClient<ITenantRepository, PortalTenantClient>(client =>
        {
            client.BaseAddress = new Uri(portalBaseUrl + "/");
            client.Timeout = TimeSpan.FromSeconds(10);
        })
        .AddStandardResilienceHandler();

        // 4. Tenant Context & Session services
        services.AddScoped<CurrentTenantService>();
        services.AddScoped<ICurrentTenant>(sp => sp.GetRequiredService<CurrentTenantService>());

        // 5. PhilHealth PCAPI v2.0 services
        services.AddSingleton<IPhilHealthTokenCache, PhilHealthTokenCache>();
        services.AddSingleton<IPhilHealthRateLimiter, PhilHealthRateLimiter>();
        services.AddSingleton<IPhilHealthPayloadEncryptor, PhilHealthPayloadEncryptor>();
        services.AddSingleton<IPcapiSandboxService, PcapiSandboxService>();

        services.AddHttpClient<IPhilHealthPcapiClient, PhilHealthPcapiClient>(client =>
        {
            client.Timeout = TimeSpan.FromSeconds(30);
        });

        services.AddScoped<PhilHealthRequestResponder>();

        // 6. Data Protection
        services.AddInMemoryEncryptedDataProtection(configuration, "ClinicEz.PhilHealthProxy");

        return services;
    }
}
