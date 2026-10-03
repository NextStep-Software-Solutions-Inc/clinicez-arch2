using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Infrastructure.Persistence;
using ClinicEz.PhilHealthProxy.Infrastructure.Persistence.Repositories;
using ClinicEz.PhilHealthProxy.Infrastructure.Services;

namespace ClinicEz.PhilHealthProxy.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructureServices(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment? env = null)
    {
        var connectionString = configuration.GetConnectionString("DefaultConnection");

        services.AddDbContext<ApplicationDbContext>(options =>
            options.UseNpgsql(connectionString));

        services.AddScoped<ITenantRepository, TenantRepository>();

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

        services.AddDataProtection()
            .SetApplicationName("ClinicEz.PhilHealthProxy");

        if (env is not null && env.IsDevelopment())
        {
            using var scope = services.BuildServiceProvider().CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            dbContext.Database.EnsureCreated();
        }

        return services;
    }
}
