using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Laboratory.Application.Common.Interfaces;
using ClinicEz.Laboratory.Infrastructure.Persistence;
using ClinicEz.Laboratory.Infrastructure.Persistence.Repositories;
using ClinicEz.Laboratory.Infrastructure.Services;
using ClinicEz.Shared.Documents;
using Hangfire;
using Hangfire.PostgreSql;
using MassTransit;
using ClinicEz.Laboratory.Infrastructure.Consumers;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace ClinicEz.Laboratory.Infrastructure;

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
        services.AddClinicEzDocumentEngine();

        // Register publisher & clinical engine services
        services.AddScoped<IDiagnosticReportPublisher, DiagnosticReportPublisher>();
        services.AddScoped<IAnalyzerFeedService, AnalyzerFeedService>();
        services.AddScoped<IDiagnosticReportPdfGenerator, DiagnosticReportPdfGenerator>();
        services.AddScoped<IPanicAlertPublisher, PanicAlertPublisher>();

        // Add Hangfire
        services.AddHangfire(config => config
            .UseSimpleAssemblyNameTypeSerializer()
            .UseRecommendedSerializerSettings()
            .UsePostgreSqlStorage(c => c.UseNpgsqlConnection(connectionString)));

        services.AddHangfireServer();

		services.AddMassTransit(x =>
		{
			x.AddConsumer<FacilityCreatedConsumer>();
			x.AddConsumer<LabRequisitionIssuedConsumer>();
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
                Console.WriteLine($"[ClinicEz.Laboratory] Migration notice: {ex.Message}");
            }
        }
        return services;
    }
}








