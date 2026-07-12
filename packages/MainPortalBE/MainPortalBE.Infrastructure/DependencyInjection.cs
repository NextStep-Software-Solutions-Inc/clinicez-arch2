using Clerk.BackendAPI;
using CLINICEZ.Shared.Interfaces;
using MainPortalBE.Domain.Interfaces;
using MainPortalBE.Application.Interfaces;
using MainPortalBE.Infrastructure.Persistence;
using MainPortalBE.Infrastructure.Persistence.Interceptors;
using MainPortalBE.Infrastructure.Persistence.Repositories;
using MainPortalBE.Infrastructure.Services;
using Hangfire;
using Hangfire.PostgreSql;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using MainPortalBE.Infrastructure.Xendit;

namespace MainPortalBE.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructureServices(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment env)
    {
        var connectionString = configuration.GetConnectionString("DefaultConnection");

        services.AddSingleton(new ClerkBackendApi(bearerAuth: configuration["Clerk:SecretKey"] ?? throw new InvalidOperationException("Clerk SecretKey is missing.")));

        services.AddHttpContextAccessor();

        services.AddDbContext<ApplicationDbContext>((sp, options) =>
        {
            options.UseNpgsql(connectionString, npgsqlOptions =>
            {
                npgsqlOptions.MigrationsHistoryTable("__EFMigrationsHistory", "main");
            });

            options.AddInterceptors(sp.GetRequiredService<SoftDeleteInterceptor>());
        });

        // Current user service backed by IHttpContextAccessor
        services.AddScoped<ICurrentUserService, CurrentUserService>();
        services.AddScoped<SoftDeleteInterceptor>();

        // Register repositories and Unit of Work
        services.AddScoped<IApplicationDbContext>(provider => provider.GetRequiredService<ApplicationDbContext>());
        services.AddScoped<IExampleRepository, ExampleRepository>();
        services.AddScoped<ITenantRepository, TenantRepository>();
        services.AddScoped<IUnitOfWork, UnitOfWork>();
        services.AddScoped<IXenditBillingService, XenditBillingService>();
        services.AddScoped<ITenantFeatureGuard, TenantFeatureGuard>();
        services.AddHttpContextAccessor();

        // Register Xendit Typed HTTP Client with Resilience
        services.AddXenditClient();

        // Add Hangfire
        services.AddHangfire(config => config
            .UseSimpleAssemblyNameTypeSerializer()
            .UseRecommendedSerializerSettings()
            .UsePostgreSqlStorage(c => c.UseNpgsqlConnection(connectionString)));

        services.AddHangfireServer();
        return services;
    }
}