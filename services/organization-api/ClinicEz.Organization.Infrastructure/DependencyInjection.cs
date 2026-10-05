using ClinicEz.Organization.Domain.Interfaces;
using ClinicEz.Organization.Infrastructure.Persistence;
using ClinicEz.Organization.Infrastructure.Persistence.Repositories;
using Hangfire;
using Hangfire.PostgreSql;
using MassTransit;
using ClinicEz.Organization.Infrastructure.Consumers;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace ClinicEz.Organization.Infrastructure;

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
        services.AddScoped<IProductRepository, ProductRepository>();
        services.AddScoped<IUnitOfWork, UnitOfWork>();

        // Add Hangfire
        services.AddHangfire(config => config
            .UseSimpleAssemblyNameTypeSerializer()
            .UseRecommendedSerializerSettings()
            .UsePostgreSqlStorage(c => c.UseNpgsqlConnection(connectionString)));

        services.AddHangfireServer();

		services.AddMassTransit(x =>
		{
			x.AddConsumer<FacilityCreatedConsumer>();
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
                Console.WriteLine($"[ClinicEz.Organization] Migration notice: {ex.Message}");
            }
        }
        return services;
    }
}








