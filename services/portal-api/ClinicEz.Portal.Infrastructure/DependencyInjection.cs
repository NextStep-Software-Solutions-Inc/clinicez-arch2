using Clerk.BackendAPI;
using ClinicEz.Shared.Interfaces;
using ClinicEz.Portal.Domain.Interfaces;
using Microsoft.AspNetCore.DataProtection;
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

            options.ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.RelationalEventId.PendingModelChangesWarning));
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
        services.AddDataProtection()
            .SetApplicationName("ClinicEz.Portal");

        services.AddSingleton<ClinicEz.Shared.Licensing.IFacilityLicenseSigner, ClinicEz.Shared.Licensing.FacilityLicenseSigner>();
        services.AddSingleton<ClinicEz.Shared.Licensing.IFacilityLicenseValidator, ClinicEz.Shared.Licensing.FacilityLicenseValidator>();
        services.AddHttpContextAccessor();

        // Register Xendit Typed HTTP Client with Resilience
        services.AddXenditClient();

        // Register Clinic API Typed HTTP Client with Resilience
        services.AddHttpClient<ClinicEz.Portal.Application.Interfaces.IClinicApiClient, ClinicEz.Portal.Infrastructure.Clinic.ClinicApiClient>((sp, client) =>
        {
            var clinicUrl = configuration["Services:ClinicApiUrl"] ?? configuration["ClinicSettings:ClinicApiUrl"] ?? "http://clinic-api:8080";
            client.BaseAddress = new Uri(clinicUrl.EndsWith('/') ? clinicUrl : $"{clinicUrl}/");
            client.Timeout = TimeSpan.FromSeconds(60);
            // Trusted service-to-service credential: clinic-api rejects unauthenticated calls.
            var internalKey = configuration["Internal:ApiKey"];
            if (!string.IsNullOrWhiteSpace(internalKey))
            {
                client.DefaultRequestHeaders.TryAddWithoutValidation("X-Internal-Key", internalKey);
            }
        })
        .AddStandardResilienceHandler();

        // Add Hangfire
        services.AddHangfire(config => config
            .UseSimpleAssemblyNameTypeSerializer()
            .UseRecommendedSerializerSettings()
            .UsePostgreSqlStorage(c => c.UseNpgsqlConnection(connectionString)));

        services.AddHangfireServer();
        services.AddScoped<IFacilityProvisioningReconciliationJob, FacilityProvisioningReconciliationJob>();

        services.AddMassTransit(x =>
        {
            x.SetEndpointNameFormatter(new KebabCaseEndpointNameFormatter("portal", false));
            x.AddConsumer<FacilityProvisionedEventConsumer>();

            x.AddEntityFrameworkOutbox<ApplicationDbContext>(o =>
            {
                o.UsePostgres();
                o.UseBusOutbox();
            });

            x.UsingRabbitMq((context, cfg) =>
            {
                var host = configuration["RabbitMq:Host"];
                if (string.IsNullOrWhiteSpace(host) || host == "localhost")
                {
                    host = Environment.GetEnvironmentVariable("DOTNET_RUNNING_IN_CONTAINER") == "true" ? "rabbitmq" : (string.IsNullOrWhiteSpace(host) ? "localhost" : host);
                }

                cfg.Host(host, configuration["RabbitMq:VirtualHost"] ?? "/", h =>
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