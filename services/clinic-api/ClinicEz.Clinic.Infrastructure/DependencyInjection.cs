using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Consumers;
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

        services.AddHttpContextAccessor();
        services.AddScoped<IClinicContext, ClinicContext>();

        services.AddDbContext<ApplicationDbContext>(options =>
            options.UseNpgsql(connectionString, npgsqlOptions =>
            {
                npgsqlOptions.MigrationsHistoryTable("__EFMigrationsHistory", schemaName);
            }));

        // Register repositories and Unit of Work
        services.AddScoped(typeof(IRepository<>), typeof(Repository<>));
        services.AddScoped<IProductRepository, ProductRepository>();
        services.AddScoped<IUnitOfWork, UnitOfWork>();
        services.AddSingleton<ClinicEz.Shared.Licensing.IFacilityLicenseValidator, ClinicEz.Shared.Licensing.FacilityLicenseValidator>();

        // Outbound patient webhook notifier
        services.AddHttpClient<IPatientWebhookNotifier, PatientWebhookNotifier>();

        // Outbound PhilHealth Yakap integration client
        services.AddHttpClient<IPhilHealthProxyClient, PhilHealthProxyClient>();
        services.AddScoped<ClinicEz.Clinic.Application.Features.Yakap.Services.IPhilHealthSequenceGenerator, PhilHealthSequenceGenerator>();

        // Outbound interoperability publisher
        services.AddScoped<ILabRequisitionPublisher, LabRequisitionPublisher>();
        services.AddScoped<IPrescriptionPublisher, PrescriptionPublisher>();
        services.AddClinicEzDocumentEngine();
        services.AddScoped<IClinicDocumentPdfService, ClinicDocumentPdfService>();

        // Add Hangfire
        services.AddHangfire(config => config
            .UseSimpleAssemblyNameTypeSerializer()
            .UseRecommendedSerializerSettings()
            .UsePostgreSqlStorage(c => c.UseNpgsqlConnection(connectionString)));

        services.AddHangfireServer();

        services.AddMassTransit(x =>
        {
            x.AddConsumer<FacilityCreatedConsumer>();
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
                var host = configuration["RabbitMq:Host"] ?? "localhost";
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
            using var scope = services.BuildServiceProvider().CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            dbContext.Database.Migrate();
        }
        return services;
    }
}
