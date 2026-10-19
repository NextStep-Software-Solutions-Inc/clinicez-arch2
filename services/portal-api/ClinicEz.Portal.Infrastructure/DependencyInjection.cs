using Clerk.BackendAPI;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interfaces;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interoperability;
using ClinicEz.Shared.Security;
using ClinicEz.Portal.Domain.Interfaces;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Application.Features.Admin.Consumers;
using ClinicEz.Portal.Application.Features.Admin.Services;
using ClinicEz.Portal.Application.Features.Billing;
using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Features.Finance;
using ClinicEz.Portal.Application.Features.Licensing;
using ClinicEz.Portal.Application.Features.PhilHealth;
using Microsoft.Extensions.DependencyInjection.Extensions;
using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Application.Features.Notifications;
using ClinicEz.Portal.Application.Features.Workspace;
using ClinicEz.Portal.Infrastructure.Hub;
using ClinicEz.Portal.Infrastructure.Notifications;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Infrastructure.Persistence.Interceptors;
using ClinicEz.Portal.Infrastructure.Persistence.Repositories;
using ClinicEz.Portal.Infrastructure.Services;
using Hangfire;
using Hangfire.PostgreSql;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using ClinicEz.Portal.Infrastructure.Xendit;

namespace ClinicEz.Portal.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructureServices(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment env)
    {
        // No built-in secrets or endpoints: outside Development a missing value stops the start-up.
        RequiredSettings.EnsureConfigured(configuration, env,
            "ConnectionStrings:DefaultConnection", "Clerk:Authority", "Xendit:SecretKey", "Xendit:CallbackToken", "ClaimToken:SigningKey");

        var connectionString = configuration.GetConnectionString("DefaultConnection");

        services.AddSingleton(new ClerkBackendApi(bearerAuth: configuration["Clerk:SecretKey"] ?? throw new InvalidOperationException("Clerk SecretKey is missing.")));

        services.AddHttpContextAccessor();

        services.AddDbContext<ApplicationDbContext>((sp, options) =>
        {
            options.UseNpgsql(connectionString, npgsqlOptions =>
            {
                npgsqlOptions.MigrationsHistoryTable("__EFMigrationsHistory", "public");
            });

            options.ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.RelationalEventId.PendingModelChangesWarning));
            options.AddInterceptors(sp.GetRequiredService<SoftDeleteInterceptor>(), sp.GetRequiredService<FacilityDirectoryInterceptor>());
        });

        // Register seeders for runtime database initialization
        // PlanSeeder and AdminRBACSeeder are seeded explicitly at startup in every environment (see Program.cs).
        services.AddScoped<ClinicEz.Portal.Infrastructure.Persistence.Seeders.PlanSeeder>();
        services.AddScoped<ClinicEz.Portal.Infrastructure.Persistence.Seeders.AdminRBACSeeder>();
        services.AddScoped<ClinicEz.Portal.Domain.Interfaces.IBaseSeeder, ClinicEz.Portal.Infrastructure.Persistence.Seeders.AdminRBACSeeder>();
        services.AddScoped<ClinicEz.Portal.Domain.Interfaces.IBaseSeeder, ClinicEz.Portal.Infrastructure.Persistence.Seeders.BlogSeeder>();

        // Current user service backed by IHttpContextAccessor
        services.AddMemoryCache();
        services.AddScoped<ICurrentUserService, CurrentUserService>();
        services.AddScoped<SoftDeleteInterceptor>();
        services.AddScoped<FacilityDirectoryInterceptor>();

        // Register repositories and Unit of Work
        services.AddScoped<IApplicationDbContext>(provider => provider.GetRequiredService<ApplicationDbContext>());
        services.AddScoped<ISystemSettingsService, SystemSettingsService>();
        services.AddScoped<IExampleRepository, ExampleRepository>();
        services.AddScoped<ITenantRepository, TenantRepository>();
        services.AddScoped<IUnitOfWork, UnitOfWork>();
        services.AddScoped<IBillingProvider, XenditBillingProvider>();
        services.TryAddSingleton(TimeProvider.System);
        services.AddOptions<BillingOptions>().Bind(configuration.GetSection(BillingOptions.SectionName));
        services.AddOptions<LicenseOptions>().Bind(configuration.GetSection(LicenseOptions.SectionName));
        services.AddOptions<ClinicEz.Portal.Application.Features.PublicUploads.LabUploadOptions>().Bind(configuration.GetSection(ClinicEz.Portal.Application.Features.PublicUploads.LabUploadOptions.SectionName));
        services.AddScoped<IEntitlementService, EntitlementService>();
        services.AddScoped<IEntitlementGuard, EntitlementGuard>();
        services.AddScoped<ISubscriptionService, SubscriptionService>();
        services.AddScoped<IFacilityAllocationService, FacilityAllocationService>();
        services.AddScoped<ILicenseIssuer, LicenseIssuer>();
        services.AddScoped<IEntitlementsPublisher, EntitlementsPublisher>();
        services.AddScoped<IEntitlementRenewalJob, EntitlementRenewalJob>();
        services.AddScoped<IOrphanTenancyCleanupJob, OrphanTenancyCleanupJob>();
        services.AddScoped<ClinicEz.Portal.Application.Features.Ownership.IOwnershipPolicy, ClinicEz.Portal.Application.Features.Ownership.OwnershipPolicy>();
        services.AddScoped<IClerkMetadataSync, ClerkMetadataSync>();
        // The key ring protects the PhilHealth credentials stored per branch, so it is persisted to the database via EF Core.
        services.AddPersistentDataProtection<ApplicationDbContext>(configuration, env, "ClinicEz.Portal");

        services.AddSingleton<ClinicEz.Shared.Licensing.IFacilityLicenseSigner, ClinicEz.Shared.Licensing.FacilityLicenseSigner>();
        services.AddSingleton<ClinicEz.Shared.Licensing.IFacilityLicenseValidator, ClinicEz.Shared.Licensing.FacilityLicenseValidator>();
        ClinicEz.Shared.Security.ClaimTokens.ClaimTokenServiceExtensions.AddClaimTokenService(services);
        services.AddHttpContextAccessor();

        // Register Xendit Typed HTTP Client with Resilience
        services.AddXenditClient();

        // Register Clinic API Interop Client (routes over the Interop Hub)
        services.AddScoped<ClinicEz.Portal.Application.Interfaces.IClinicApiClient, ClinicEz.Portal.Infrastructure.Clinic.ClinicApiClient>();

        // Add Hangfire
        services.AddHangfire(config => config
            .UseSimpleAssemblyNameTypeSerializer()
            .UseRecommendedSerializerSettings()
            .UsePostgreSqlStorage(c => c.UseNpgsqlConnection(connectionString)));

        services.AddHangfireServer();
        services.AddScoped<IFacilityProvisioningReconciliationJob, FacilityProvisioningReconciliationJob>();

        // Outbound webhooks: no redirects, no proxy, and every connection is checked against private/reserved ranges.
        services.AddHttpClient(ClinicEz.Portal.Infrastructure.Webhooks.WebhookDeliveryJob.HttpClientName, client =>
            {
                client.Timeout = TimeSpan.FromSeconds(10);
            })
            .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
            {
                AllowAutoRedirect = false,
                UseProxy = false,
                ConnectTimeout = TimeSpan.FromSeconds(5),
                PooledConnectionLifetime = TimeSpan.FromMinutes(2),
                ConnectCallback = ClinicEz.Portal.Infrastructure.Webhooks.SafeWebhookConnect.ConnectAsync
            });
        services.AddScoped<ClinicEz.Portal.Infrastructure.Webhooks.IWebhookDeliveryJob, ClinicEz.Portal.Infrastructure.Webhooks.WebhookDeliveryJob>();

        // Interop SDK: transactional outbox/inbox on ApplicationDbContext; Messaging:* configures the hub connection.
        services.AddInterop<ApplicationDbContext>(configuration, handlers => handlers
            .Handle<FacilityProvisionedEvent, FacilityProvisionedHandler>(InteropTypes.FacilityProvisioned)
            .Handle<FacilityHeartbeatPayload, FacilityHeartbeatHandler>(InteropTypes.FacilityHeartbeat)
            .Handle<BillingInvoicePaidPayload, BillingInvoicePaidHandler>(InteropTypes.BillingInvoicePaid)
            .Handle<BillingInvoiceVoidedPayload, BillingInvoiceVoidedHandler>(InteropTypes.BillingInvoiceVoided)
            .Handle<NotificationEmailRequestedPayload, NotificationEmailRequestedHandler>(InteropTypes.NotificationEmailRequested)
            .Respond<PhilHealthConfigRequestedPayload, PhilHealthConfigRespondedPayload, PhilHealthConfigRequestedResponder>(
                InteropTypes.PhilHealthConfigRequested, InteropTypes.PhilHealthConfigResponded)
            .Respond<PhilHealthConfigPayload, PhilHealthConfigUpsertRespondedPayload, PhilHealthConfigUpsertRequestedResponder>(
                InteropTypes.PhilHealthConfigUpsertRequested, InteropTypes.PhilHealthConfigUpsertResponded)
            .HandleReply(InteropTypes.YakapTransmittalResponded));

        // The PhilHealth proxy asks the portal for the credentials it holds; the key ring protects them at rest.
        services.AddSingleton<IPhilHealthSecretProtector, ClinicEz.Portal.Infrastructure.PhilHealth.PhilHealthSecretProtector>();
        services.AddHttpClient<IPhilHealthSoapTester, ClinicEz.Portal.Infrastructure.PhilHealth.PhilHealthSoapTester>(client =>
        {
            client.Timeout = TimeSpan.FromSeconds(20);
        });

        // Hub directory feed and onboarding
        services.AddOptions<HubOptions>().Bind(configuration.GetSection(HubOptions.Section));
        services.AddScoped<IFacilityLinkService, SameBranchFacilityLinkService>();
        services.AddScoped<IHubDirectoryResyncService, HubDirectoryResyncService>();
        services.AddScoped<IHubOnboardingService, HubOnboardingService>();
        services.AddScoped<IFacilityProvisioningPublisher, FacilityProvisioningPublisher>();
        services.AddScoped<IWorkspaceProfilePublisher, WorkspaceProfilePublisher>();

        // portal-api acts as a ControlPlane client of the hub admin API, using the same Messaging credentials.
        services.AddHttpClient<IHubAdminClient, HubAdminHttpClient>(client => client.Timeout = TimeSpan.FromSeconds(30));
        services.AddHttpClient<IHubDirectoryClient, HubDirectoryHttpClient>(client => client.Timeout = TimeSpan.FromSeconds(15));

        // Notifications: templated email requests are handled asynchronously and sent through the unified mail server.
        services.AddSingleton<IValidateOptions<SmtpOptions>, SmtpOptionsValidator>();
        services.AddOptions<SmtpOptions>()
            .Bind(configuration.GetSection(SmtpOptions.SectionName))
            .ValidateOnStart();
        services.AddSingleton<IEmailTemplateRenderer, EmailTemplateRenderer>();
        services.AddScoped<INotificationService, NotificationService>();
        services.AddScoped<IStaffInvitationNotifier, StaffInvitationNotifier>();
        services.AddScoped<IFrontendUrlProvider, FrontendUrlProvider>();
        services.AddScoped<IEmailSender>(sp => sp.GetRequiredService<IOptions<SmtpOptions>>().Value.Mode == SmtpMode.Log
            ? ActivatorUtilities.CreateInstance<LogEmailSender>(sp)
            : ActivatorUtilities.CreateInstance<SmtpEmailSender>(sp));

        return services;
    }
}