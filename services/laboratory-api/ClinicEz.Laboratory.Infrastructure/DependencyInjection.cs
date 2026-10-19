using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Laboratory.Application.Common;
using ClinicEz.Laboratory.Application.Common.Interfaces;
using ClinicEz.Shared.Workspace;
using ClinicEz.Laboratory.Infrastructure.Persistence;
using ClinicEz.Laboratory.Infrastructure.Persistence.Repositories;
using ClinicEz.Laboratory.Infrastructure.Services;
using ClinicEz.Shared.Documents;
using Hangfire;
using Hangfire.PostgreSql;
using ClinicEz.Laboratory.Application.Interop;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Facility;
using ClinicEz.Shared.Interoperability;
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
        services.AddClinicEzDocumentEngine();

        // Facility-local authentication (no external identity provider; works offline/LAN).
        // ILabContext must be registered before the dev auto-migration below builds a temporary provider.
        services.AddHttpContextAccessor();
        services.AddMemoryCache();
        services.AddScoped<ClinicEz.Laboratory.Domain.Interfaces.ILabContext, ClinicEz.Laboratory.Infrastructure.Context.LabContext>();
        services.AddSingleton<ClinicEz.Laboratory.Infrastructure.Auth.IStaffAccessCache, ClinicEz.Laboratory.Infrastructure.Auth.StaffAccessCache>();
        services.AddScoped<ClinicEz.Laboratory.Infrastructure.Auth.IWorkspaceResolver, ClinicEz.Laboratory.Infrastructure.Auth.WorkspaceResolver>();
        services.AddScoped<ClinicEz.Laboratory.Infrastructure.Auth.ILabAuthService, ClinicEz.Laboratory.Infrastructure.Auth.LabAuthService>();

        // Register publisher & clinical engine services
        services.AddScoped<IDiagnosticReportPublisher, DiagnosticReportPublisher>();
        services.AddScoped<IAnalyzerFeedService, AnalyzerFeedService>();
        services.AddScoped<IDiagnosticReportPdfGenerator, DiagnosticReportPdfGenerator>();
        services.AddWorkspaceProfile<ApplicationDbContext>();
        services.AddScoped<ILabPrintoutConfigProvider, LabPrintoutConfigProvider>();
        services.AddScoped<IPanicAlertPublisher, PanicAlertPublisher>();

        // Add Hangfire
        services.AddHangfire(config => config
            .UseSimpleAssemblyNameTypeSerializer()
            .UseRecommendedSerializerSettings()
            .UsePostgreSqlStorage(c => c.UseNpgsqlConnection(connectionString)));

        services.AddHangfireServer();

        // Entitlement renewals from the portal and the liveness heartbeat, both on LabSettings
        services.AddFacilityEntitlements<LabLicenseStore>();
        services.AddFacilityHeartbeat<LabLicenseStore>();

        // Interop hub messaging (replaces the message broker): transactional outbox/inbox + typed handlers.
        services.AddInterop<ApplicationDbContext>(configuration, handlers => handlers
            .Handle<FacilityCreatedEvent, FacilityLicenseIssuedHandler>(InteropTypes.FacilityLicenseIssued)
            .HandleWorkspaceProfileUpdated()
            .Handle<LabRequisitionIssuedEvent, LabOrderIssuedHandler>(InteropTypes.LabOrderIssued)
            .Handle<BillingPaymentConfirmedPayload, BillingPaymentConfirmedHandler>(InteropTypes.BillingPaymentConfirmed)
            .Handle<BillingInvoiceVoidedPayload, BillingInvoiceVoidedHandler>(InteropTypes.BillingInvoiceVoided)
            .Handle<LabResultReviewedPayload, LabResultReviewedHandler>(InteropTypes.LabResultReviewed)
            .HandleEntitlementsChanged());


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








