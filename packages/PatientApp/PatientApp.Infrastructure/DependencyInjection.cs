using CLINICEZ.Shared.Interfaces;
using Hangfire;
using Hangfire.PostgreSql;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.Tokens;
using PatientApp.Application.Common.Interfaces;
using PatientApp.Domain.Interfaces;
using PatientApp.Infrastructure.Options;
using PatientApp.Infrastructure.Persistence;
using PatientApp.Infrastructure.Persistence.Repositories;
using PatientApp.Infrastructure.Services;
using PatientApp.Infrastructure.Services.Auth;
using PatientApp.Infrastructure.Services.Clinic;
using PatientApp.Infrastructure.Services.Jobs;
using PatientApp.Infrastructure.Services.Jobs.Processors;
using PatientApp.Infrastructure.Services.Session;
using PatientApp.Infrastructure.Services.Storage;
using PatientApp.Infrastructure.Services.Workers;
using PatientApp.Infrastructure.Services.Notifications;
using StackExchange.Redis;

namespace PatientApp.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructureServices(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment? env = null)
    {
        var connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("Connection string 'DefaultConnection' is not configured.");

        var redisConnection = configuration.GetConnectionString("Redis")
            ?? throw new InvalidOperationException("Connection string 'Redis' is not configured.");

        // ── Options ──────────────────────────────────────────────────────────
        services.Configure<R2Options>(configuration.GetSection("R2"));
        services.Configure<ClerkOptions>(configuration.GetSection("Clerk"));
        services.Configure<EncryptionOptions>(configuration.GetSection("Encryption"));

        // ── EF Core — PostgreSQL with snake_case naming ───────────────────────
        services.AddDbContext<ApplicationDbContext>(options =>
            options
                .UseNpgsql(connectionString, npgsql =>
                    npgsql.MigrationsAssembly(typeof(ApplicationDbContext).Assembly.FullName))
                .UseSnakeCaseNamingConvention());

        // ── Redis ─────────────────────────────────────────────────────────────
        services.AddSingleton<IConnectionMultiplexer>(
            ConnectionMultiplexer.Connect(redisConnection));

        // ── Clinic Dashboard — named HttpClient with Polly standard resilience ─
        var clinicTimeout = configuration.GetValue<int>("ClinicDashboard:TimeoutSeconds", 30);
        var clinicRetry = configuration.GetValue<int>("ClinicDashboard:RetryCount", 3);

        services.AddHttpClient("ClinicDashboard")
            .AddStandardResilienceHandler(options =>
            {
                options.Retry.MaxRetryAttempts = clinicRetry;
                options.Retry.Delay = TimeSpan.FromMilliseconds(500);
                options.Retry.UseJitter = true;
                // Total timeout accounts for all retry attempts
                options.TotalRequestTimeout.Timeout = TimeSpan.FromSeconds(clinicTimeout * (clinicRetry + 1));
                options.AttemptTimeout.Timeout = TimeSpan.FromSeconds(clinicTimeout);
            });

        services.AddScoped<IClinicDashboardService, ClinicDashboardService>();


        services.AddHangfire(config => config
            .UseSimpleAssemblyNameTypeSerializer()
            .UseRecommendedSerializerSettings()
            .UsePostgreSqlStorage(c => c.UseNpgsqlConnection(connectionString)));

        services.AddHangfireServer();

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
        services.AddScoped<IPatientStorageProfileRepository, PatientStorageProfileRepository>();
        services.AddScoped<IFileFolderRepository, FileFolderRepository>();
        services.AddScoped<IFileRecordRepository, FileRecordRepository>();
        services.AddScoped<IUnitOfWork, UnitOfWork>();

        // ── Application Services ──────────────────────────────────────────────
        services.AddSingleton<IStorageService, R2StorageService>();
        services.AddScoped<ISessionService, RedisSessionService>();
        services.AddHttpContextAccessor();
        services.AddScoped<ICurrentUserService, CurrentUserService>();
        services.AddScoped<IBackgroundJobEnqueuer, HangfireJobEnqueuer>();
        services.AddSingleton<IPushNotificationService, FirebasePushNotificationService>();

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
        // Files
        services.AddScoped<ISyncEntityProcessor, FileFolderSyncProcessor>();
        services.AddScoped<ISyncEntityProcessor, FileRecordSyncProcessor>();

        // ── Hangfire job implementation ────────────────────────────────────────
        services.AddScoped<ISyncPayloadJob, SyncPayloadJobProcessor>();
        services.AddScoped<IFileUploadReconciliationJob, FileUploadReconciliationJob>();

        // ── Clerk JWT Bearer Authentication ───────────────────────────────────
        var clerkAuthority = configuration["Clerk:Authority"]
            ?? throw new InvalidOperationException("Clerk:Authority is not configured.");

        var clerkAudience = configuration["Clerk:Audience"];

        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.Authority = clerkAuthority;
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    ValidateAudience = !string.IsNullOrWhiteSpace(clerkAudience),
                    ValidAudience = clerkAudience,
                };
            });

        // ── Dev auto-migration & seeding ──────────────────────────────────────
        if (env is not null && env.IsDevelopment())
        {
            using var scope = services.BuildServiceProvider().CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            dbContext.Database.Migrate();
            DbSeeder.Seed(dbContext);
        }

        services.AddHostedService<ClinicPingBackgroundService>();
        
        return services;
    }
}

