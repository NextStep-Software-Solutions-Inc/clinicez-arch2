using ClinicEz.Organization.Domain.Interfaces;
using ClinicEz.Organization.Infrastructure.Persistence;
using ClinicEz.Organization.Infrastructure.Persistence.Repositories;
using Hangfire;
using Hangfire.PostgreSql;
using ClinicEz.Organization.Application.Interop;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Facility;
using ClinicEz.Shared.Workspace;
using ClinicEz.Shared.Security;
using ClinicEz.Organization.Infrastructure.Services;
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

        var schemaName = configuration["DbSchema"] ?? "public";

        services.AddDbContext<ApplicationDbContext>(options =>
        {
            options.UseNpgsql(connectionString, npgsqlOptions =>
            {
                npgsqlOptions.MigrationsHistoryTable("__EFMigrationsHistory", schemaName);
            });
        });
        // Register repositories and Unit of Work
        services.AddScoped<IProductRepository, ProductRepository>();
        services.AddScoped(typeof(IRepository<>), typeof(Repository<>));
        services.AddScoped<IUnitOfWork, UnitOfWork>();

        // Add Hangfire
        services.AddHangfire(config => config
            .UseSimpleAssemblyNameTypeSerializer()
            .UseRecommendedSerializerSettings()
            .UsePostgreSqlStorage(c => c.UseNpgsqlConnection(connectionString)));

        services.AddHangfireServer();

        // Facility entitlements (signed license held per organization) and the heartbeat to the portal.
        services.AddFacilityEntitlements<OrganizationLicenseStore>();
        services.AddFacilityHeartbeat<OrganizationLicenseStore>();

        // Workspace profile (brand and regional defaults), pushed by the portal and held in this service's own database.
        services.AddWorkspaceProfile<ApplicationDbContext>();
        services.AddPersistentDataProtection<ApplicationDbContext>(configuration, env, "ClinicEz.Organization");

        // Interop hub messaging (replaces the message broker): transactional outbox/inbox + typed handlers.
        services.AddInterop<ApplicationDbContext>(configuration, handlers => handlers
            .Handle<FacilityCreatedEvent, FacilityLicenseIssuedHandler>(InteropTypes.FacilityLicenseIssued)
            .HandleEntitlementsChanged()
            .HandleWorkspaceProfileUpdated());

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








