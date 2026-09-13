using Clerk.BackendAPI;
using ClinicEz.Shared.Interfaces;
using ClinicEz.Portal.Domain.Interfaces;
using MassTransit;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Application.Features.Admin.Consumers;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Infrastructure.Persistence.Interceptors;
using ClinicEz.Portal.Infrastructure.Persistence.Repositories;
using ClinicEz.Portal.Infrastructure.Services;
using Hangfire;
using Hangfire.PostgreSql;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using ClinicEz.Portal.Infrastructure.Xendit;

namespace ClinicEz.Portal.Infrastructure;

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
        services.AddScoped<ClinicEz.Portal.Domain.Interfaces.IBaseSeeder, ClinicEz.Portal.Infrastructure.Persistence.Seeders.SubscriptionPlanSeeder>();
        services.AddScoped<ClinicEz.Portal.Domain.Interfaces.IBaseSeeder, ClinicEz.Portal.Infrastructure.Persistence.Seeders.AdminRBACSeeder>();
        services.AddScoped<ClinicEz.Portal.Domain.Interfaces.IBaseSeeder, ClinicEz.Portal.Infrastructure.Persistence.Seeders.BlogSeeder>();

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