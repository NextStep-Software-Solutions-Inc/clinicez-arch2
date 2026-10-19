using ClinicEz.Pharmacy.Application.Common.Interfaces;
using ClinicEz.Pharmacy.Application.Interop;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Pharmacy.Infrastructure.Persistence;
using ClinicEz.Pharmacy.Infrastructure.Persistence.Repositories;
using ClinicEz.Pharmacy.Infrastructure.Services;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Facility;
using ClinicEz.Shared.Interoperability;
using ClinicEz.Shared.Workspace;
using Hangfire;
using Hangfire.PostgreSql;
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

        var schemaName = configuration["DbSchema"] ?? "public";

        services.AddDbContext<ApplicationDbContext>(options =>
        {
            options.UseNpgsql(connectionString, npgsqlOptions =>
            {
                npgsqlOptions.MigrationsHistoryTable("__EFMigrationsHistory", schemaName);
            });
        });

        // Register repositories and Unit of Work
        services.AddScoped(typeof(IRepository<>), typeof(Repository<>));
        services.AddScoped<IProductRepository, ProductRepository>();
        services.AddScoped<IUnitOfWork, UnitOfWork>();
        services.AddSingleton<ClinicEz.Shared.Licensing.IFacilityLicenseValidator, ClinicEz.Shared.Licensing.FacilityLicenseValidator>();

        // UPSC signing secret: required config, resolved now so a missing secret stops startup instead of the first GAMOT dispense
        services.AddSingleton<Domain.Services.IUpscSecurityService>(UpscSecurityServiceFactory.Create(configuration));

        // Entitlement renewals from the portal and the liveness heartbeat, both on PharmacySettings
        services.AddFacilityEntitlements<PharmacyLicenseStore>();
        services.AddFacilityHeartbeat<PharmacyLicenseStore>();

        // Workspace brand / regional profile, pushed by the portal (workspace.profile.updated) and held in this database
        services.AddWorkspaceProfile<ApplicationDbContext>();

        // Facility-local authentication (no external identity provider; works offline/LAN)
        services.AddMemoryCache();
        services.AddHttpContextAccessor();
        services.AddSingleton<ClinicEz.Pharmacy.Infrastructure.Auth.IStaffAccessCache, ClinicEz.Pharmacy.Infrastructure.Auth.StaffAccessCache>();
        services.AddScoped<ClinicEz.Pharmacy.Infrastructure.Auth.IWorkspaceResolver, ClinicEz.Pharmacy.Infrastructure.Auth.WorkspaceResolver>();
        services.AddScoped<ClinicEz.Pharmacy.Infrastructure.Auth.IPharmacyAuthService, ClinicEz.Pharmacy.Infrastructure.Auth.PharmacyAuthService>();
        services.AddScoped<ClinicEz.Pharmacy.Infrastructure.Context.PharmacyContext>();
        services.AddScoped<ClinicEz.Pharmacy.Domain.Interfaces.IPharmacyContext>(sp => sp.GetRequiredService<ClinicEz.Pharmacy.Infrastructure.Context.PharmacyContext>());
        services.AddScoped<ClinicEz.Pharmacy.Domain.Interfaces.IPharmacyScopeSetter>(sp => sp.GetRequiredService<ClinicEz.Pharmacy.Infrastructure.Context.PharmacyContext>());

        // Register publishers
        services.AddScoped<IPrescriptionDispensedPublisher, PrescriptionDispensedPublisher>();
        services.AddScoped<IRxStatusPublisher, RxStatusPublisher>();
        services.AddScoped<IPharmacyBillingPublisher, PharmacyBillingPublisher>();

        // Add Hangfire
        services.AddHangfire(config => config
            .UseSimpleAssemblyNameTypeSerializer()
            .UseRecommendedSerializerSettings()
            .UsePostgreSqlStorage(c => c.UseNpgsqlConnection(connectionString)));

        services.AddHangfireServer();

        // Interop hub messaging (replaces the broker): inbound handlers + transactional outbox/inbox on this DbContext
        services.AddInterop<ApplicationDbContext>(configuration, handlers => handlers
            .Handle<FacilityCreatedEvent, FacilityCreatedHandler>(InteropTypes.FacilityLicenseIssued)
            .Handle<PrescriptionIssuedEvent, PrescriptionIssuedHandler>(InteropTypes.RxIssued)
            .Handle<BillingPaymentConfirmedPayload, BillingPaymentConfirmedHandler>(InteropTypes.BillingPaymentConfirmed)
            .Handle<BillingInvoiceVoidedPayload, BillingInvoiceVoidedHandler>(InteropTypes.BillingInvoiceVoided)
            .HandleEntitlementsChanged()
            .HandleWorkspaceProfileUpdated()
            .Respond<GamotLookupRequestedPayload, GamotLookupRespondedPayload, GamotLookupResponder>(
                InteropTypes.GamotLookupRequested, InteropTypes.GamotLookupResponded));

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
