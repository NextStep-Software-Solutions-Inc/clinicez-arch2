using Clerk.BackendAPI;
using CLINICEZ.Shared.Interfaces;
using MainPortalBE.Domain.Interfaces;
using MassTransit;
using MainPortalBE.Application.Interfaces;
using MainPortalBE.Application.Features.Admin.Consumers;
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

        // Register seeders for runtime database initialization
        services.AddScoped<MainPortalBE.Domain.Interfaces.IBaseSeeder, MainPortalBE.Infrastructure.Persistence.Seeders.SubscriptionPlanSeeder>();
        services.AddScoped<MainPortalBE.Domain.Interfaces.IBaseSeeder, MainPortalBE.Infrastructure.Persistence.Seeders.AdminRBACSeeder>();
        services.AddScoped<MainPortalBE.Domain.Interfaces.IBaseSeeder, MainPortalBE.Infrastructure.Persistence.Seeders.BlogSeeder>();

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

        services.AddMassTransit(x =>
        {
            x.AddConsumer<FacilityProvisionedEventConsumer>();

            x.AddEntityFrameworkOutbox<ApplicationDbContext>(o =>
            {
                o.UsePostgres();
                o.UseBusOutbox();
            });

            x.UsingRabbitMq((context, cfg) =>
            {
                cfg.Host(configuration["RabbitMq:Host"] ?? "localhost", configuration["RabbitMq:VirtualHost"] ?? "/", h =>
                {
                    h.Username(configuration["RabbitMq:Username"] ?? "rabbitmq");
					h.Password(configuration["RabbitMq:Password"] ?? "nextstep-rabbitmq-2o2G");
                });

                cfg.ConfigureEndpoints(context);
            });
        });

        return services;
    }
}