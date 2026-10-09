using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Consumers;
using ClinicEz.Shared.Workspace;
using ClinicEz.Clinic.Infrastructure.Context;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Persistence.Repositories;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Documents;
using Hangfire;
using Hangfire.PostgreSql;
using MassTransit;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace ClinicEz.Clinic.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructureServices(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment? env = null)
    {
        var connectionString = configuration.GetConnectionString("DefaultConnection");

        var schemaName = configuration["DbSchema"];
        if (string.IsNullOrEmpty(schemaName))
        {
            throw new InvalidOperationException("DbSchema configuration value is required but was not specified.");
        }

        // Must be registered before Hangfire/MassTransit so the schema exists when they start (fresh on-prem installs).
        services.AddHostedService<ClinicEz.Clinic.Infrastructure.PhilHealth.Catalog.DatabaseMigrationHostedService>();

        services.AddHttpContextAccessor();
        services.AddScoped<IClinicContext, ClinicContext>();

        services.AddDbContext<ApplicationDbContext>(options =>
        {
            options.UseNpgsql(connectionString, npgsqlOptions =>
            {
                npgsqlOptions.MigrationsHistoryTable("__EFMigrationsHistory", schemaName);
            });
            options.ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.RelationalEventId.PendingModelChangesWarning));
        });

        // Register repositories and Unit of Work
        services.AddScoped(typeof(IRepository<>), typeof(Repository<>));
        services.AddScoped<IProductRepository, ProductRepository>();
        services.AddScoped<IUnitOfWork, UnitOfWork>();
        services.AddSingleton<ClinicEz.Shared.Licensing.IFacilityLicenseValidator, ClinicEz.Shared.Licensing.FacilityLicenseValidator>();
        services.AddHttpClient<ITenantLookupService, TenantLookupService>();

        // Facility-local authentication (no external identity provider; works offline/LAN)
        services.AddMemoryCache();
        services.AddSingleton<ClinicEz.Clinic.Infrastructure.Auth.IStaffAccessCache, ClinicEz.Clinic.Infrastructure.Auth.StaffAccessCache>();
        services.AddSingleton<ClinicEz.Clinic.Domain.Interfaces.IStaffAccessInvalidator>(sp => sp.GetRequiredService<ClinicEz.Clinic.Infrastructure.Auth.IStaffAccessCache>());
        services.AddScoped<ClinicEz.Clinic.Infrastructure.Auth.IWorkspaceResolver, ClinicEz.Clinic.Infrastructure.Auth.WorkspaceResolver>();
        services.AddScoped<ClinicEz.Clinic.Infrastructure.Auth.IClinicAuthService, ClinicEz.Clinic.Infrastructure.Auth.ClinicAuthService>();

        // PhilHealth Catalog: bundled lib_* JSON seeded on every boot + idempotent administrator import
        services.AddScoped<ClinicEz.Clinic.Infrastructure.PhilHealth.Catalog.IPhilHealthCatalogImportService, ClinicEz.Clinic.Infrastructure.PhilHealth.Catalog.PhilHealthCatalogImportService>();
        services.AddScoped<ClinicEz.Clinic.Infrastructure.PhilHealth.Catalog.IPhilHealthCatalogQueryService, ClinicEz.Clinic.Infrastructure.PhilHealth.Catalog.PhilHealthCatalogQueryService>();
        services.AddSingleton<ClinicEz.Clinic.Infrastructure.PhilHealth.Catalog.PhilHealthCatalogLookup>();
        services.AddSingleton<ClinicEz.Clinic.Application.Common.Interfaces.IPhilHealthCatalogLookup>(sp => sp.GetRequiredService<ClinicEz.Clinic.Infrastructure.PhilHealth.Catalog.PhilHealthCatalogLookup>());
        services.AddSingleton<ClinicEz.Clinic.Infrastructure.PhilHealth.Catalog.IPhilHealthCatalogCache>(sp => sp.GetRequiredService<ClinicEz.Clinic.Infrastructure.PhilHealth.Catalog.PhilHealthCatalogLookup>());
        services.AddHostedService<ClinicEz.Clinic.Infrastructure.PhilHealth.Catalog.PhilHealthCatalogSeedHostedService>();
        services.AddHostedService<ClinicEz.Clinic.Infrastructure.Idempotency.IdempotencyCleanupHostedService>();

        // Workspace brand/regional defaults, pulled from portal-api (works against a remote portal)
        services.AddWorkspaceProfileClient();

        // Outbound patient webhook notifier
        services.AddHttpClient<IPatientWebhookNotifier, PatientWebhookNotifier>();

        // Outbound PhilHealth Yakap integration client
        services.AddHttpClient<IPhilHealthProxyClient, PhilHealthProxyClient>();
        services.AddHttpClient<IPharmacyGamotGateway, PharmacyGamotGateway>();
        services.AddScoped<ClinicEz.Clinic.Application.Features.Yakap.Services.IPhilHealthSequenceGenerator, PhilHealthSequenceGenerator>();

        // Outbound interoperability publisher
        services.AddScoped<ILabRequisitionPublisher, LabRequisitionPublisher>();
        services.AddScoped<IPrescriptionPublisher, PrescriptionPublisher>();
        services.AddClinicEzDocumentEngine();
        services.AddScoped<IClinicDocumentPdfService, ClinicDocumentPdfService>();
        services.AddSingleton<IClinicEncryptionService, ClinicEz.Clinic.Infrastructure.Services.Storage.ClinicEncryptionService>();
        services.AddSingleton<IClinicStorageService, ClinicEz.Clinic.Infrastructure.Services.Storage.LocalClinicStorageService>();
        services.AddScoped<IClinicRecordEventPublisher, ClinicEz.Clinic.Infrastructure.Services.ClinicRecordEventPublisher>();


        // Add Hangfire
        services.AddHangfire(config => config
            .UseSimpleAssemblyNameTypeSerializer()
            .UseRecommendedSerializerSettings()
            .UsePostgreSqlStorage(c => c.UseNpgsqlConnection(connectionString)));

        services.AddHangfireServer();

        services.AddMassTransit(x =>
        {
            x.SetEndpointNameFormatter(new KebabCaseEndpointNameFormatter("clinic", false));
            x.AddConsumer<FacilityCreatedConsumer>();
            x.AddConsumer<ClinicEz.Shared.Workspace.WorkspaceProfileUpdatedConsumer>();
            x.AddConsumer<AppointmentBookedConsumer>();
            x.AddConsumer<DiagnosticReportFinalizedConsumer>();
            x.AddConsumer<PrescriptionDispensedConsumer>();
            x.AddConsumer<LabPanicResultAlertConsumer>();
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
                var portStr = configuration["RabbitMq:Port"];
                ushort port = !string.IsNullOrEmpty(portStr) && ushort.TryParse(portStr, out var p) ? p : (ushort)5672;
                var useSsl = configuration.GetValue<bool>("RabbitMq:UseSsl", port == 5671);

                cfg.Host(host, port, configuration["RabbitMq:VirtualHost"] ?? "/", h =>
                {
                    h.Username(configuration["RabbitMq:Username"] ?? "rabbitmq");
                    h.Password(configuration["RabbitMq:Password"] ?? "nextstep-rabbitmq-2o2G");
                    if (useSsl)
                    {
                        h.UseSsl(s =>
                        {
                            // Supports on-premises outbound AMQPS firewall traversal over port 5671
                        });
                    }
                });

                cfg.ConfigureEndpoints(context);
            });
        });

        if (env != null && env.IsDevelopment())
        {
            try
            {
                using var scope = services.BuildServiceProvider().CreateScope();
                var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                dbContext.Database.Migrate();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ClinicEz.Clinic] Migration notice: {ex.Message}");
            }
        }
        return services;
    }
}
