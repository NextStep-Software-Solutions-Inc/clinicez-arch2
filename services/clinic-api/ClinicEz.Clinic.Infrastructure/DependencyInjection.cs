using System.Net.Http;
using ClinicEz.Clinic.Application.Common;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Facility;
using ClinicEz.Shared.Interoperability;
using ClinicEz.Shared.Security;
using ClinicEz.Shared.Workspace;
using ClinicEz.Clinic.Infrastructure.Context;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Persistence.Interceptors;
using ClinicEz.Clinic.Infrastructure.Persistence.Repositories;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Documents;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Clinic.Application.Common.Privacy;
using ClinicEz.Clinic.Infrastructure.Audit;
using ClinicEz.Clinic.Infrastructure.Privacy;
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

        var schemaName = configuration["DbSchema"] ?? "public";

        // Must be registered before Hangfire/interop so the schema exists when they start (fresh on-prem installs).
        services.AddHostedService<ClinicEz.Clinic.Infrastructure.Persistence.DatabaseMigrationHostedService>();

        services.AddHttpContextAccessor();
        services.AddScoped<IClinicContext, ClinicContext>();
        services.AddScoped<ClinicEz.Clinic.Domain.Interfaces.IClinicScopeSetter>(sp => (ClinicContext)sp.GetRequiredService<IClinicContext>());

        services.AddScoped<ClinicPortalProjectionInterceptor>();
        services.AddScoped<IRecordAttachmentStorage, RecordAttachmentStorage>();

        services.AddDbContext<ApplicationDbContext>((sp, options) =>
        {
            options.UseNpgsql(connectionString, npgsqlOptions =>
            {
                npgsqlOptions.MigrationsHistoryTable("__EFMigrationsHistory", schemaName);
                npgsqlOptions.UseQuerySplittingBehavior(QuerySplittingBehavior.SplitQuery);
            });
            options.AddInterceptors(sp.GetRequiredService<ClinicPortalProjectionInterceptor>());
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
        services.AddSingleton<ClinicEz.Clinic.Application.Common.Interfaces.IWhoZScoreCalculator, ClinicEz.Clinic.Infrastructure.PhilHealth.Services.WhoZScoreCalculator>();
        services.AddHostedService<ClinicEz.Clinic.Infrastructure.PhilHealth.Catalog.PhilHealthCatalogSeedHostedService>();
        services.AddHostedService<ClinicEz.Clinic.Infrastructure.Idempotency.IdempotencyCleanupHostedService>();
        services.AddHostedService<ClinicEz.Clinic.Infrastructure.BackgroundServices.EodReconciliationBackgroundService>();
        services.AddHostedService<ClinicEz.Clinic.Infrastructure.BackgroundServices.NotificationRetentionCleanupBackgroundService>();
        services.AddHostedService<ClinicEz.Clinic.Infrastructure.BackgroundServices.AppointmentReminderBackgroundService>();
        services.AddHostedService<ClinicEz.Clinic.Infrastructure.Persistence.ClinicRoleSeederHostedService>();
        services.AddHostedService<ClinicPortalStartupBackfillHostedService>();

        // Audit Logging & Forensic Activity Trail Pipeline (M1)
        services.AddSingleton<IPhiRedactionService, PhiRedactionService>();
        services.AddSingleton<IAuditLogQueue, AuditLogQueue>();
        services.AddHostedService<AuditLogBackgroundWorker>();

        // Workspace brand/regional defaults: fed by workspace.profile.updated messages and held in this service's own database
        services.AddWorkspaceProfile<ApplicationDbContext>();
        services.AddPersistentDataProtection<ApplicationDbContext>(configuration, env, "ClinicEz.Clinic");

        // PhilHealth Yakap & GAMOT Services with Comprehensive Audit Decorators
        services.AddScoped<PhilHealthProxyClient>();
        services.AddScoped<PharmacyGamotGateway>();
        services.AddScoped<PhilHealthSequenceGenerator>();

        services.AddScoped<IPhilHealthProxyClient, ClinicEz.Clinic.Infrastructure.PhilHealth.Auditing.AuditablePhilHealthProxyClient>(sp =>
            new ClinicEz.Clinic.Infrastructure.PhilHealth.Auditing.AuditablePhilHealthProxyClient(
                sp.GetRequiredService<PhilHealthProxyClient>(),
                sp.GetRequiredService<IAuditLogQueue>(),
                sp.GetRequiredService<IClinicContext>(),
                sp.GetRequiredService<IPhiRedactionService>(),
                sp.GetRequiredService<Microsoft.AspNetCore.Http.IHttpContextAccessor>(),
                sp.GetRequiredService<Microsoft.Extensions.Logging.ILogger<ClinicEz.Clinic.Infrastructure.PhilHealth.Auditing.AuditablePhilHealthProxyClient>>()));

        services.AddScoped<IPharmacyGamotGateway, ClinicEz.Clinic.Infrastructure.PhilHealth.Auditing.AuditablePharmacyGamotGateway>(sp =>
            new ClinicEz.Clinic.Infrastructure.PhilHealth.Auditing.AuditablePharmacyGamotGateway(
                sp.GetRequiredService<PharmacyGamotGateway>(),
                sp.GetRequiredService<IAuditLogQueue>(),
                sp.GetRequiredService<IClinicContext>(),
                sp.GetRequiredService<IPhiRedactionService>(),
                sp.GetRequiredService<Microsoft.AspNetCore.Http.IHttpContextAccessor>(),
                sp.GetRequiredService<Microsoft.Extensions.Logging.ILogger<ClinicEz.Clinic.Infrastructure.PhilHealth.Auditing.AuditablePharmacyGamotGateway>>()));

        services.AddScoped<ClinicEz.Clinic.Application.Features.Yakap.Services.IPhilHealthSequenceGenerator, ClinicEz.Clinic.Infrastructure.PhilHealth.Auditing.AuditablePhilHealthSequenceGenerator>(sp =>
            new ClinicEz.Clinic.Infrastructure.PhilHealth.Auditing.AuditablePhilHealthSequenceGenerator(
                sp.GetRequiredService<PhilHealthSequenceGenerator>(),
                sp.GetRequiredService<IAuditLogQueue>(),
                sp.GetRequiredService<IClinicContext>(),
                sp.GetRequiredService<Microsoft.AspNetCore.Http.IHttpContextAccessor>(),
                sp.GetRequiredService<Microsoft.Extensions.Logging.ILogger<ClinicEz.Clinic.Infrastructure.PhilHealth.Auditing.AuditablePhilHealthSequenceGenerator>>()));

        services.AddScoped<ClinicEz.Clinic.Application.Common.Interfaces.IPatientCodeGenerator, PatientCodeGenerator>();
        services.AddScoped<ClinicEz.Clinic.Application.Features.Yakap.Services.IPhilHealthMasterlistSyncService, ClinicEz.Clinic.Infrastructure.Services.PhilHealthMasterlistSyncService>();

        // Interoperability: outbound messages are queued in the transactional interop outbox; inbound ones are
        // scoped to the clinic they are addressed to.
        services.AddScoped<ClinicRecipientResolver>();
        services.AddScoped<ClinicPatientAddressResolver>();
        services.AddScoped<IClinicIdentityProvider, ClinicIdentityProvider>();
        services.AddScoped<IPatientAppointmentPublisher, PatientAppointmentPublisher>();
        services.AddScoped<ILabRequisitionPublisher, LabRequisitionPublisher>();
        services.AddScoped<IPrescriptionPublisher, PrescriptionPublisher>();
        services.AddScoped<IImmunizationEventPublisher, ImmunizationEventPublisher>();
        services.AddHttpClient(PatientRecordSharedHandler.HttpClientName, client => client.Timeout = TimeSpan.FromSeconds(30))
            .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
        services.Configure<ClinicUploadOptions>(configuration.GetSection(ClinicUploadOptions.SectionName));
        services.AddScoped<IUploadGrantService, UploadGrantService>();
        services.AddScoped<ILabResultFileStore, LabResultFileStore>();
        services.AddScoped<ILabResultIntake, LabResultIntake>();
        services.AddScoped<IPatientDocumentPublisher, PatientDocumentPublisher>();
        services.AddScoped<IClinicStaffInvitationNotifier, ClinicStaffInvitationNotifier>();
        services.AddScoped<IClaimSlipService, ClaimSlipService>();
        services.AddScoped<IBillingRequestPublisher, BillingRequestPublisher>();
        services.AddScoped<IPatientRecordGateway, PatientRecordGateway>();
        services.AddScoped<ILabResultReviewedPublisher, LabResultReviewedPublisher>();
        services.AddClinicEzDocumentEngine();
        services.AddScoped<IClinicDocumentPdfService, ClinicDocumentPdfService>();
        services.AddScoped<ISampleDocumentGenerator, SampleDocumentGenerator>();

        // Read eagerly: a missing or too-short ClinicEncryption:MasterSecret stops the service from starting.
        services.AddSingleton(ClinicEz.Clinic.Infrastructure.Services.Storage.ClinicEncryptionKeyRing.FromConfiguration(configuration));
        services.AddSingleton<IClinicEncryptionService, ClinicEz.Clinic.Infrastructure.Services.Storage.ClinicEncryptionService>();

        // Storage Provider Configuration: Local disk (edge / on-premise without S3), Cloudflare R2, or Private S3 Server (MinIO/Ceph/Wasabi)
        services.Configure<ClinicEz.Clinic.Infrastructure.Options.StorageOptions>(configuration.GetSection(ClinicEz.Clinic.Infrastructure.Options.StorageOptions.SectionName));
        services.Configure<ClinicEz.Clinic.Infrastructure.Options.S3Options>(configuration.GetSection(ClinicEz.Clinic.Infrastructure.Options.S3Options.SectionName));
        services.Configure<ClinicEz.Clinic.Infrastructure.Options.R2Options>(configuration.GetSection(ClinicEz.Clinic.Infrastructure.Options.R2Options.SectionName));

        var storageProvider = configuration["Storage:Provider"]?.Trim();
        var isS3 = string.Equals(storageProvider, "S3", StringComparison.OrdinalIgnoreCase) ||
                   string.Equals(storageProvider, "R2", StringComparison.OrdinalIgnoreCase);

        if (isS3)
        {
            var enableFallback = configuration.GetValue("Storage:EnableLocalFallback", true);
            if (enableFallback)
            {
                services.AddSingleton<ClinicEz.Clinic.Infrastructure.Services.Storage.S3ClinicStorageAdapter>();
                services.AddSingleton<ClinicEz.Clinic.Infrastructure.Services.Storage.LocalClinicStorageService>();
                services.AddSingleton<IClinicStorageService>(sp =>
                {
                    var s3 = sp.GetRequiredService<ClinicEz.Clinic.Infrastructure.Services.Storage.S3ClinicStorageAdapter>();
                    var local = sp.GetRequiredService<ClinicEz.Clinic.Infrastructure.Services.Storage.LocalClinicStorageService>();
                    var logger = sp.GetRequiredService<Microsoft.Extensions.Logging.ILogger<ClinicEz.Clinic.Infrastructure.Services.Storage.FallbackClinicStorageService>>();
                    return new ClinicEz.Clinic.Infrastructure.Services.Storage.FallbackClinicStorageService(s3, local, logger);
                });
            }
            else
            {
                services.AddSingleton<IClinicStorageService, ClinicEz.Clinic.Infrastructure.Services.Storage.S3ClinicStorageAdapter>();
            }
        }
        else
        {
            services.AddSingleton<IClinicStorageService, ClinicEz.Clinic.Infrastructure.Services.Storage.LocalClinicStorageService>();
        }

        services.AddScoped<IClinicRecordEventPublisher, ClinicEz.Clinic.Infrastructure.Services.ClinicRecordEventPublisher>();


        // Add Hangfire
        services.AddHangfire(config => config
            .UseSimpleAssemblyNameTypeSerializer()
            .UseRecommendedSerializerSettings()
            .UsePostgreSqlStorage(c => c.UseNpgsqlConnection(connectionString)));

        services.AddHangfireServer();

        // Subscription entitlements: the license store, the heartbeat to the control plane and entitlements.changed.
        services.AddFacilityEntitlements<ClinicLicenseStore>();
        services.AddFacilityHeartbeat<ClinicLicenseStore>();

        // Catalog types the clinic deliberately does not handle: the laboratory reports every stage of an order (accepted,
        // rejected, payment confirmed included) through lab.order.status.changed only, so no other lab.order.* type is
        // ever sent to a clinic. GAMOT and PhilHealth answers are replies to this clinic's own requests.
        services.AddInterop<ApplicationDbContext>(configuration, b => b
            .Handle<FacilityCreatedEvent, FacilityCreatedHandler>(InteropTypes.FacilityLicenseIssued)
            .Handle<FacilityCreatedEvent, FacilityDirectoryUpdatedHandler>(InteropTypes.FacilityDirectoryUpdated)
            .HandleWorkspaceProfileUpdated()
            .Handle<AppointmentBookedEvent, AppointmentBookedHandler>(InteropTypes.PatientAppointmentBooked)
            .Handle<PatientJoinRequestedPayload, PatientJoinRequestedHandler>(InteropTypes.PatientJoinRequested)
            .Handle<DiagnosticReportFinalizedEvent, DiagnosticReportFinalizedHandler>(InteropTypes.LabResultFinalized)
            .Handle<PrescriptionDispensedEvent, PrescriptionDispensedHandler>(InteropTypes.RxDispensed)
            .Handle<LabPanicResultAlertEvent, LabPanicResultAlertHandler>(InteropTypes.LabResultPanic)
            .Handle<LabOrderStatusChangedPayload, LabOrderStatusChangedHandler>(InteropTypes.LabOrderStatusChanged)
            .Handle<ExternalLabResultUploadedEvent, LabResultExternalSubmittedHandler>(InteropTypes.LabResultExternalSubmitted)
            .Handle<BillingPaymentConfirmedPayload, BillingPaymentConfirmedHandler>(InteropTypes.BillingPaymentConfirmed)
            .Handle<PatientShareSnapshotPayload, PatientShareSnapshotHandler>(InteropTypes.PatientShareSnapshot)
            .Handle<PatientRecordSharedPayload, PatientRecordSharedHandler>(InteropTypes.PatientRecordShared)
            .Handle<ExternalPrescriptionDispensedEvent, ExternalPrescriptionDispensedHandler>(InteropTypes.RxExternalDispensed)
            .Handle<RxStatusChangedPayload, RxStatusChangedHandler>(InteropTypes.RxStatusChanged)
            .Handle<BillingInvoiceVoidedPayload, BillingInvoiceVoidedHandler>(InteropTypes.BillingInvoiceVoided)
            .Respond<YakapTransmittalRequestedPayload, YakapTransmittalRespondedPayload, ClinicEz.Clinic.Infrastructure.Messaging.Responders.YakapTransmittalResponder>(
                InteropTypes.YakapTransmittalRequested, InteropTypes.YakapTransmittalResponded)
            .HandleReply(InteropTypes.GamotLookupResponded)
            .HandleReply(InteropTypes.PhilHealthResponse)
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
                Console.WriteLine($"[ClinicEz.Clinic] Migration notice: {ex.Message}");
            }
        }
        return services;
    }
}
