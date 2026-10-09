using System.Net.Http;
using ClinicEz.Clinic.Application.Common;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using ClinicEz.Shared.Workspace;
using ClinicEz.Clinic.Infrastructure.Context;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Persistence.Repositories;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Documents;
using Hangfire;
using Hangfire.PostgreSql;
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

        // Must be registered before Hangfire/interop so the schema exists when they start (fresh on-prem installs).
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
        services.AddScoped<ITenantLookupService, TenantLookupService>();

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

        // Outbound PhilHealth Yakap integration client
        services.AddHttpClient<IPhilHealthProxyClient, PhilHealthProxyClient>();
        services.AddHttpClient<IPharmacyGamotGateway, PharmacyGamotGateway>();
        services.AddScoped<ClinicEz.Clinic.Application.Features.Yakap.Services.IPhilHealthSequenceGenerator, PhilHealthSequenceGenerator>();

        // Interoperability: outbound messages are queued in the transactional interop outbox; inbound ones are
        // scoped to the clinic they are addressed to.
        services.AddScoped<ClinicRecipientResolver>();
        services.AddScoped<ClinicPatientAddressResolver>();
        services.AddScoped<IClinicIdentityProvider, ClinicIdentityProvider>();
        services.AddScoped<IPatientAppointmentPublisher, PatientAppointmentPublisher>();
        services.AddScoped<ILabRequisitionPublisher, LabRequisitionPublisher>();
        services.AddScoped<IPrescriptionPublisher, PrescriptionPublisher>();
        services.AddHttpClient(PatientRecordSharedHandler.HttpClientName, client => client.Timeout = TimeSpan.FromSeconds(30))
            .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
        services.Configure<ClinicUploadOptions>(configuration.GetSection(ClinicUploadOptions.SectionName));
        services.AddScoped<IUploadGrantService, UploadGrantService>();
        services.AddScoped<ILabResultFileStore, LabResultFileStore>();
        services.AddScoped<ILabResultIntake, LabResultIntake>();
        services.AddScoped<IPatientDocumentPublisher, PatientDocumentPublisher>();
        services.AddScoped<IClaimSlipService, ClaimSlipService>();
        services.AddScoped<IBillingRequestPublisher, BillingRequestPublisher>();
        services.AddScoped<IPatientRecordGateway, PatientRecordGateway>();
        services.AddScoped<ILabResultReviewedPublisher, LabResultReviewedPublisher>();
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

        services.AddInterop<ApplicationDbContext>(configuration, b => b
            .Handle<FacilityCreatedEvent, FacilityCreatedHandler>(InteropTypes.FacilityLicenseIssued)
            .Handle<WorkspaceProfileUpdatedEvent, WorkspaceProfileUpdatedHandler>(InteropTypes.WorkspaceProfileUpdated)
            .Handle<AppointmentBookedEvent, AppointmentBookedHandler>(InteropTypes.PatientAppointmentBooked)
            .Handle<DiagnosticReportFinalizedEvent, DiagnosticReportFinalizedHandler>(InteropTypes.LabResultFinalized)
            .Handle<PrescriptionDispensedEvent, PrescriptionDispensedHandler>(InteropTypes.RxDispensed)
            .Handle<LabPanicResultAlertEvent, LabPanicResultAlertHandler>(InteropTypes.LabResultPanic)
            .Handle<LabOrderStatusChangedPayload, LabOrderStatusChangedHandler>(InteropTypes.LabOrderStatusChanged)
            .Handle<ExternalLabResultUploadedEvent, LabResultExternalSubmittedHandler>(InteropTypes.LabResultExternalSubmitted)
            .Handle<BillingPaymentConfirmedPayload, BillingPaymentConfirmedHandler>(InteropTypes.BillingPaymentConfirmed)
            .Handle<PatientShareSnapshotPayload, PatientShareSnapshotHandler>(InteropTypes.PatientShareSnapshot)
            .Handle<PatientRecordSharedPayload, PatientRecordSharedHandler>(InteropTypes.PatientRecordShared)
            .Handle<ExternalPrescriptionDispensedEvent, ExternalPrescriptionDispensedHandler>(InteropTypes.RxExternalDispensed));

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
