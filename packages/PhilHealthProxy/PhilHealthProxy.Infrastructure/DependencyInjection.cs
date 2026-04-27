using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using PhilHealthProxy.Domain.Interfaces;
using PhilHealthProxy.Infrastructure.Persistence;
using PhilHealthProxy.Infrastructure.Persistence.Repositories;
using PhilHealthProxy.Infrastructure.Services;

namespace PhilHealthProxy.Infrastructure;

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

        services.AddDataProtection()
            .SetApplicationName("CLINICEZ.PhilHealthProxy");

        if (env is not null && env.IsDevelopment())
        {
            using var scope = services.BuildServiceProvider().CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            dbContext.Database.EnsureCreated();
        }

        return services;
    }
}
