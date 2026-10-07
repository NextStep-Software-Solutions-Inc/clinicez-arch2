using ClinicEz.Pharmacy.Application.Common.Interfaces;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Pharmacy.Infrastructure.Consumers;
using ClinicEz.Pharmacy.Infrastructure.Persistence;
using ClinicEz.Pharmacy.Infrastructure.Persistence.Repositories;
using ClinicEz.Pharmacy.Infrastructure.Services;
using Hangfire;
using Hangfire.PostgreSql;
using MassTransit;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace ClinicEz.Pharmacy.Infrastructure;

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

        // Facility-local authentication (no external identity provider; works offline/LAN)
        services.AddMemoryCache();
        services.AddHttpContextAccessor();
        services.AddSingleton<ClinicEz.Pharmacy.Infrastructure.Auth.IStaffAccessCache, ClinicEz.Pharmacy.Infrastructure.Auth.StaffAccessCache>();
        services.AddScoped<ClinicEz.Pharmacy.Infrastructure.Auth.IWorkspaceResolver, ClinicEz.Pharmacy.Infrastructure.Auth.WorkspaceResolver>();
        services.AddScoped<ClinicEz.Pharmacy.Infrastructure.Auth.IPharmacyAuthService, ClinicEz.Pharmacy.Infrastructure.Auth.PharmacyAuthService>();
        services.AddScoped<ClinicEz.Pharmacy.Domain.Interfaces.IPharmacyContext, ClinicEz.Pharmacy.Infrastructure.Context.PharmacyContext>();

        // Register publishers
        services.AddScoped<IPrescriptionDispensedPublisher, PrescriptionDispensedPublisher>();

        // Add Hangfire
        services.AddHangfire(config => config
            .UseSimpleAssemblyNameTypeSerializer()
            .UseRecommendedSerializerSettings()
            .UsePostgreSqlStorage(c => c.UseNpgsqlConnection(connectionString)));

        services.AddHangfireServer();

        services.AddMassTransit(x =>
        {
            x.SetEndpointNameFormatter(new KebabCaseEndpointNameFormatter("pharmacy", false));
            x.AddConsumer<FacilityCreatedConsumer>();
            x.AddConsumer<PrescriptionIssuedConsumer>();
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
            try
            {
                using var scope = services.BuildServiceProvider().CreateScope();
                var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                dbContext.Database.Migrate();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ClinicEz.Pharmacy] Migration notice: {ex.Message}");
            }
        }
        return services;
    }
}
