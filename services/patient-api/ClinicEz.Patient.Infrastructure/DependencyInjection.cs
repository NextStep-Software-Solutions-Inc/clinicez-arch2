using System.Security.Claims;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interfaces;
using ClinicEz.Shared.Security.ClaimTokens;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interoperability;
using ClinicEz.Patient.Application.Features.Appointments.Interop;
using ClinicEz.Patient.Application.Features.Documents.Interop;
using ClinicEz.Patient.Application.Features.Sharing;
using ClinicEz.Patient.Application.Features.Sharing.Interop;
using Hangfire;
using Hangfire.PostgreSql;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Patient.Infrastructure.Options;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Patient.Infrastructure.Persistence.Repositories;
using ClinicEz.Patient.Infrastructure.Services;
using ClinicEz.Patient.Infrastructure.Services.Auth;
using ClinicEz.Patient.Infrastructure.Services.Encryption;
using ClinicEz.Patient.Infrastructure.Services.Jobs;
using ClinicEz.Patient.Infrastructure.Services.Jobs.Processors;
using ClinicEz.Patient.Infrastructure.Services.Storage;
using ClinicEz.Patient.Infrastructure.Services.Notifications;
using ClinicEz.Patient.Infrastructure.Interop;

namespace ClinicEz.Patient.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructureServices(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment? env = null)
    {
        var connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("Connection string 'DefaultConnection' is not configured.");


        // ── Options ──────────────────────────────────────────────────────────
        services.Configure<R2Options>(configuration.GetSection("R2"));
        services.Configure<ClerkOptions>(configuration.GetSection("Clerk"));
        services.AddOptions<EncryptionOptions>()
            .Bind(configuration.GetSection("Encryption"))
            .ValidateOnStart();
        services.AddSingleton<IValidateOptions<EncryptionOptions>, EncryptionOptionsValidator>();
        services.AddOptions<SharingOptions>()
            .Bind(configuration.GetSection(SharingOptions.SectionName))
            .Validate(
                o => !string.IsNullOrWhiteSpace(o.SigningKey) && o.SigningKey.Length >= SharingOptions.MinimumSigningKeyLength,
                $"{SharingOptions.SectionName}:SigningKey must be set to a secret of at least {SharingOptions.MinimumSigningKeyLength} characters.")
            .ValidateOnStart();

        // ── EF Core — PostgreSQL with snake_case naming ───────────────────────
        services.AddDbContext<ApplicationDbContext>(options =>
            options
                .UseNpgsql(connectionString, npgsql =>
                    npgsql.MigrationsAssembly(typeof(ApplicationDbContext).Assembly.FullName))
                .UseSnakeCaseNamingConvention());


        services.AddHangfire(config => config
            .UseSimpleAssemblyNameTypeSerializer()
            .UseRecommendedSerializerSettings()
            .UsePostgreSqlStorage(c => c.UseNpgsqlConnection(connectionString)));

        services.AddHangfireServer();

        services.AddPatientInterop(configuration);

        // ── Repositories & Unit of Work ───────────────────────────────────────
        services.AddScoped<IPatientRepository, PatientRepository>();
        services.AddScoped<ISyncLogRepository, SyncLogRepository>();
        services.AddScoped<IDeviceSessionRepository, DeviceSessionRepository>();
        services.AddScoped<INotificationRepository, NotificationRepository>();
        services.AddScoped<IOrganizationRepository, OrganizationRepository>();
        services.AddScoped<IClinicRepository, ClinicRepository>();
        services.AddScoped<IProviderAvailabilityRepository, ProviderAvailabilityRepository>();
        services.AddScoped<IAppointmentRepository, AppointmentRepository>();
        services.AddScoped<IOrganizationMembershipRepository, OrganizationMembershipRepository>();
        services.AddScoped<IClinicMembershipRepository, ClinicMembershipRepository>();
        services.AddScoped<IBookingDraftRepository, BookingDraftRepository>();
        services.AddScoped<INotificationPreferencesRepository, NotificationPreferencesRepository>();
        services.AddScoped<IFileRecordRepository, FileRecordRepository>();
        services.AddScoped<IDocumentTypeRepository, DocumentTypeRepository>();
        services.AddScoped<IUnitOfWork, UnitOfWork>();
        services.AddScoped<IPatientAccessRepository, PatientAccessRepository>();
        services.AddScoped<IShareCodeRepository, ShareCodeRepository>();
        services.AddScoped<IPatientDocumentRepository, PatientDocumentRepository>();

        // ── Application Services ──────────────────────────────────────────────
        services.AddSingleton<IStorageService, R2StorageService>();
        services.AddSingleton(sp => PatientEncryptionKeyRing.FromConfiguration(sp.GetRequiredService<IConfiguration>()));
        services.AddScoped<IPatientEncryptionService, PatientEncryptionService>();
        services.AddHttpContextAccessor();
        services.AddScoped<ICurrentUserService, CurrentUserService>();
        services.AddScoped<IBackgroundJobEnqueuer, HangfireJobEnqueuer>();
        services.AddSingleton<IPushNotificationService, FirebasePushNotificationService>();
        services.AddClaimTokenService();

        // ── Sync entity processors ────────────────────────────────────────────
        // Core
        services.AddScoped<ISyncEntityProcessor, PatientSyncProcessor>();
        // Personal / contact
        services.AddScoped<ISyncEntityProcessor, EmergencyContactSyncProcessor>();
        services.AddScoped<ISyncEntityProcessor, PatientAddressSyncProcessor>();
        services.AddScoped<ISyncEntityProcessor, PatientGovernmentIdSyncProcessor>();
        // Medical history
        services.AddScoped<ISyncEntityProcessor, PatientAllergySyncProcessor>();
        services.AddScoped<ISyncEntityProcessor, PatientMedicationSyncProcessor>();
        services.AddScoped<ISyncEntityProcessor, PatientSurgicalHistorySyncProcessor>();
        services.AddScoped<ISyncEntityProcessor, PatientPastIllnessSyncProcessor>();
        services.AddScoped<ISyncEntityProcessor, PatientChronicConditionSyncProcessor>();
        services.AddScoped<ISyncEntityProcessor, PatientFamilyHistorySyncProcessor>();
        // Lifestyle & social
        services.AddScoped<ISyncEntityProcessor, PatientSocialHistorySyncProcessor>();
        // Reproductive
        services.AddScoped<ISyncEntityProcessor, PatientObstetricProfileSyncProcessor>();
        services.AddScoped<ISyncEntityProcessor, PatientMentalHealthProfileSyncProcessor>();
        services.AddScoped<ISyncEntityProcessor, PatientContraceptiveHistorySyncProcessor>();
        services.AddScoped<ISyncEntityProcessor, PatientPregnancySyncProcessor>();
        services.AddScoped<ISyncEntityProcessor, PatientMaleReproductiveSyncProcessor>();
        // Clinical
        services.AddScoped<ISyncEntityProcessor, PatientHealthcareProviderSyncProcessor>();
        services.AddScoped<ISyncEntityProcessor, PatientImmunizationSelfSyncProcessor>();
        services.AddScoped<ISyncEntityProcessor, PatientDisabilitySyncProcessor>();
        services.AddScoped<ISyncEntityProcessor, PatientOccupationSyncProcessor>();
        services.AddScoped<ISyncEntityProcessor, PatientTravelHistorySyncProcessor>();
        services.AddScoped<ISyncEntityProcessor, PatientDentalVisionSyncProcessor>();
        services.AddScoped<ISyncEntityProcessor, PatientNcdQuestionnaireSyncProcessor>();
        // Files
        services.AddScoped<ISyncEntityProcessor, FileRecordSyncProcessor>();

        // ── Sync processing engine ───────────────────────────────────────────
        services.AddScoped<ISyncPayloadProcessor, SyncPayloadProcessor>();
        services.AddScoped<ISyncPayloadJob, SyncPayloadJobProcessor>();

        // ── Clerk JWT Bearer Authentication ───────────────────────────────────
        services.AddClerkAuthentication(configuration);

        // ── Auto-migration (all non-test environments) & dev seeding ──────────
        if (env is not null && !env.IsEnvironment("Testing"))
        {
            using var scope = services.BuildServiceProvider().CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            dbContext.Database.Migrate();
            if (env.IsDevelopment())
            {
                DbSeeder.Seed(dbContext);
            }
        }

        return services;
    }

    /// <summary>
    /// Wires the patient plane into the interop hub (mailbox <c>patient</c>): the outbox/inbox live on the
    /// service's own DbContext, and every message type patient-api receives is routed to its handler.
    /// </summary>
    public static IServiceCollection AddPatientInterop(
        this IServiceCollection services,
        IConfiguration configuration) =>
        services.AddInterop<ApplicationDbContext>(configuration, handlers => handlers
            .Handle<FacilityCreatedEvent, FacilityDirectoryUpdatedInteropHandler>(InteropTypes.FacilityDirectoryUpdated)
            .Handle<ClinicRecordVerifiedEvent, ClinicRecordVerifiedInteropHandler>(InteropTypes.ClinicRecordVerified)
            .Handle<ClinicAppointmentUpdatedEvent, ClinicAppointmentUpdatedInteropHandler>(InteropTypes.ClinicAppointmentUpdated)
            .Handle<PatientShareRedeemPayload, PatientShareRedeemInteropHandler>(InteropTypes.PatientShareRedeem)
            .Handle<PatientDocumentIssuedPayload, PatientDocumentIssuedInteropHandler>(InteropTypes.PatientDocumentIssued)
            .Handle<LabOrderStatusChangedPayload, LabOrderStatusChangedInteropHandler>(InteropTypes.LabOrderStatusChanged)
            .Handle<RxStatusChangedPayload, RxStatusChangedInteropHandler>(InteropTypes.RxStatusChanged)
            .Handle<LabResultReviewedPayload, LabResultReviewedInteropHandler>(InteropTypes.LabResultReviewed)
            .Handle<ClinicalImmunizationAdministeredPayload, ClinicalImmunizationAdministeredInteropHandler>(InteropTypes.ClinicalImmunizationAdministered)
            .Handle<PatientQueueAlertPayload, PatientQueueAlertInteropHandler>(InteropTypes.PatientQueueAlert)
            .Handle<PatientAppointmentAlertPayload, PatientAppointmentAlertInteropHandler>(InteropTypes.PatientAppointmentAlert));

    public static IServiceCollection AddClerkAuthentication(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var clerkAuthority = configuration["Clerk:Authority"]
            ?? throw new InvalidOperationException("Clerk:Authority is not configured.");

        var clerkAudience = configuration["Clerk:Audience"];

        // Clerk session tokens issued by frontend SDKs (e.g. @clerk/expo) do not include an 'aud' claim by default.
        // Disable audience validation unless a custom JWT template audience is explicitly configured (and not mistakenly set to authority).
        var shouldValidateAudience = !string.IsNullOrWhiteSpace(clerkAudience)
            && !string.Equals(clerkAudience, clerkAuthority, StringComparison.OrdinalIgnoreCase);

        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.Authority = clerkAuthority;
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    NameClaimType = ClaimTypes.NameIdentifier,
                    ValidateIssuer = true,
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    ValidateAudience = shouldValidateAudience,
                    ValidAudience = shouldValidateAudience ? clerkAudience : null,
                };
            });

        return services;
    }
}

