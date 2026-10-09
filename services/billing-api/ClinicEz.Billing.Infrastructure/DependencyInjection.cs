using ClinicEz.Billing.Application.Abstractions;
using ClinicEz.Billing.Application.Interop;
using ClinicEz.Billing.Infrastructure.Auth;
using ClinicEz.Billing.Infrastructure.Persistence;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Billing.Infrastructure;

public static class DependencyInjection
{
    /// <param name="configureDatabase">Overrides the default PostgreSQL provider (integration tests use an in-memory database).</param>
    public static IServiceCollection AddInfrastructureServices(
        this IServiceCollection services, IConfiguration configuration, Action<DbContextOptionsBuilder>? configureDatabase = null)
    {
        var connectionString = configuration.GetConnectionString("DefaultConnection");

        var schemaName = configuration["DbSchema"];
        if (string.IsNullOrEmpty(schemaName))
        {
            throw new InvalidOperationException("DbSchema configuration value is required but was not specified.");
        }

        services.AddDbContext<ApplicationDbContext>(options =>
        {
            if (configureDatabase is null)
            {
                options.UseNpgsql(connectionString, npgsqlOptions =>
                {
                    npgsqlOptions.MigrationsHistoryTable("__EFMigrationsHistory", schemaName);
                });
            }
            else
            {
                configureDatabase(options);
            }

            options.ConfigureWarnings(w => w.Ignore(RelationalEventId.PendingModelChangesWarning));
        });

        services.AddScoped<IBillingDbContext>(sp => sp.GetRequiredService<ApplicationDbContext>());

        // Cell-local authentication (no external identity provider; works offline/LAN).
        services.AddHttpContextAccessor();
        services.AddMemoryCache();
        services.AddScoped<IBillingContext, BillingContext>();
        services.AddSingleton<IStaffAccessCache, StaffAccessCache>();
        services.AddScoped<BillingAuthService>();
        services.AddScoped<StaffAdminService>();

        // Interop hub messaging: transactional outbox/inbox + typed handlers.
        services.AddInterop<ApplicationDbContext>(configuration, handlers => handlers
            .Handle<BillingInvoiceRequestedPayload, InvoiceRequestedHandler>(InteropTypes.BillingInvoiceRequested));

        return services;
    }
}
