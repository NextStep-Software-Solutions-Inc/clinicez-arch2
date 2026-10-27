using ClinicEz.Shared.Common;
using ClinicEz.Shared.Middlewares;
using ClinicEz.Portal.Api;
using ClinicEz.Portal.Application;
using ClinicEz.Portal.Infrastructure;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Domain.Interfaces;
using Microsoft.EntityFrameworkCore;
using Hangfire;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.IdentityModel.Tokens;
using System.Security.Claims;
using System.Linq;
using Scalar.AspNetCore;
using ClinicEz.Portal.Api.Extensions;

var builder = WebApplication.CreateBuilder(args);
var env = builder.Environment;
builder.Configuration.AddJsonFile("appsettings.json", false, true);
builder.Configuration.AddJsonFile($"appsettings.{env.EnvironmentName}.json", true, true);
// CreateBuilder put the environment variables before the files added here, so the files would override them; re-add them last.
builder.Configuration.AddEnvironmentVariables();
builder.Configuration.AddUserSecrets(typeof(Program).Assembly, true);

// 0. Add Authentication and Authorization Services
// IMPORTANT: This block must define the authentication scheme
builder.Services
    .AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
    })
    .AddJwtBearer(options =>
    {
        // These values MUST be correctly configured in appsettings.json
        options.Authority = builder.Configuration["Clerk:Authority"];

        // This parameter block configures how the token is validated
        options.TokenValidationParameters = new TokenValidationParameters
        {
            NameClaimType = ClaimTypes.NameIdentifier,
            ValidateAudience = false
        };
        options.Events = new JwtBearerEvents
        {
            OnAuthenticationFailed = context =>
            {
                Console.WriteLine($"JWT AUTH FAILURE: Token validation failed with exception: {context.Exception.Message}");
                return Task.CompletedTask;
            },
            // Additional validation for AZP claim
            OnTokenValidated = context =>
            {
                var azp = context.Principal?.FindFirstValue("azp");
                var authorizedParties = builder.Configuration.GetAuthorizedParties("Clerk:AuthorizedParties");

                bool isAuthorized = false;

                if (!string.IsNullOrEmpty(azp) && authorizedParties != null)
                {
                    isAuthorized = authorizedParties.Any(party => 
                        party == azp || 
                        (party.Contains('*') && System.Text.RegularExpressions.Regex.IsMatch(
                            azp, 
                            "^" + System.Text.RegularExpressions.Regex.Escape(party).Replace("\\*", ".*") + "$", 
                            System.Text.RegularExpressions.RegexOptions.IgnoreCase)));
                }

                if (!isAuthorized)
                {
                    context.Fail("AZP Claim is invalid or missing");
                }

                return Task.CompletedTask;
            }
        };
    })
    .AddScheme<Microsoft.AspNetCore.Authentication.AuthenticationSchemeOptions, ClinicEz.Portal.Api.Auth.ApiKeyAuthenticationHandler>(
        ClinicEz.Portal.Api.Auth.ApiKeyAuthenticationHandler.SchemeName, null);
builder.Services.AddAuthorization(options =>
{
    // Integration (workspace API key) endpoints: one policy per scope, bound to the ApiKey scheme only.
    foreach (var scope in ClinicEz.Portal.Application.Features.Integrations.IntegrationCatalog.Scopes)
    {
        options.AddPolicy($"ApiKey:{scope}", policy => policy
            .AddAuthenticationSchemes(ClinicEz.Portal.Api.Auth.ApiKeyAuthenticationHandler.SchemeName)
            .RequireAuthenticatedUser()
            .RequireClaim(ClinicEz.Portal.Api.Auth.ApiKeyAuthenticationHandler.ScopeClaim, scope));
    }
});

builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedFor | Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedProto;
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
});

// 1. Add services from our other layers
builder.Services
    .AddApiServices()
    .AddApplicationServices()
    .AddInfrastructureServices(builder.Configuration, builder.Environment);

builder.Services.AddClinicEzCors(builder.Configuration, builder.Environment);

var app = builder.Build();
bool isDevelopment = app.Environment.IsDevelopment();

using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

    try
    {
        // Apply clean migrations
        dbContext.Database.Migrate();
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[Migration Error] Exception type: {ex.GetType().FullName}");
        Console.WriteLine($"[Migration Error] Exception message: {ex.Message}");
        try
        {
            var services = ((Microsoft.EntityFrameworkCore.Infrastructure.IInfrastructure<IServiceProvider>)dbContext).Instance;
            var modelDiffer = (Microsoft.EntityFrameworkCore.Migrations.IMigrationsModelDiffer)services.GetService(typeof(Microsoft.EntityFrameworkCore.Migrations.IMigrationsModelDiffer))!;
            var migrationsAssembly = (Microsoft.EntityFrameworkCore.Migrations.IMigrationsAssembly)services.GetService(typeof(Microsoft.EntityFrameworkCore.Migrations.IMigrationsAssembly))!;
            var modelRuntimeInitializer = (Microsoft.EntityFrameworkCore.Infrastructure.IModelRuntimeInitializer)services.GetService(typeof(Microsoft.EntityFrameworkCore.Infrastructure.IModelRuntimeInitializer))!;
            
            var currentModel = dbContext.Model.GetRelationalModel();
            var snapshotModel = migrationsAssembly.ModelSnapshot?.Model;
            Microsoft.EntityFrameworkCore.Metadata.IRelationalModel? snapshotRelationalModel = null;

            if (snapshotModel is Microsoft.EntityFrameworkCore.Metadata.IMutableModel mutableModel)
            {
                snapshotModel = mutableModel.FinalizeModel();
            }

            if (snapshotModel is not null)
            {
                snapshotModel = modelRuntimeInitializer.Initialize(snapshotModel);
                snapshotRelationalModel = snapshotModel.GetRelationalModel();
            }

            var diffs = modelDiffer.GetDifferences(snapshotRelationalModel, currentModel);
            Console.WriteLine($"[Migration Error] Detected {diffs.Count} model differences:");
            foreach (var diff in diffs)
            {
                Console.WriteLine($" - Operation: {diff.GetType().Name} : {diff}");
            }
        }
        catch (Exception diagEx)
        {
            Console.WriteLine($"[Migration Error] Failed to extract EF diagnostics: {diagEx.Message}");
        }

        if (!isDevelopment && !app.Environment.IsEnvironment("Testing"))
        {
            throw;
        }
        Console.WriteLine("[ClinicEz.Portal] Warning: Migration encountered an issue during startup; continuing application execution.");
    }

    // Idempotent assurance of portal projection tables (e.g. FacilityQueueBoards with TvDisplayPin)
    try
    {
        dbContext.Database.ExecuteSqlRaw("""
            CREATE TABLE IF NOT EXISTS public."FacilityQueueBoards" (
                "TenantId" uuid NOT NULL,
                "FacilityId" uuid NOT NULL,
                "QueueDate" date NOT NULL,
                "IsAcceptingWalkIns" boolean NOT NULL DEFAULT true,
                "PatientsWaitingCount" integer NOT NULL DEFAULT 0,
                "NowServingJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
                "UpNextJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
                "EmergencyJson" jsonb NULL,
                "TvDisplayPin" character varying(50) NULL,
                "GeneratedAtUtc" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "UpdatedAtUtc" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT "PK_FacilityQueueBoards" PRIMARY KEY ("TenantId", "FacilityId")
            );
            ALTER TABLE public."FacilityQueueBoards" ADD COLUMN IF NOT EXISTS "TvDisplayPin" character varying(50) NULL;
            CREATE INDEX IF NOT EXISTS "IX_FacilityQueueBoards_FacilityId_QueueDate" ON public."FacilityQueueBoards" ("FacilityId", "QueueDate");
        """);
    }
    catch (Exception schemaEx)
    {
        Console.WriteLine($"[ClinicEz.Portal] Warning: Ensuring FacilityQueueBoards schema failed: {schemaEx.Message}");
    }

    // The plan catalogue (Billing:Plans) and Admin RBAC roles/bootstrap Super Admin are production data: seeded in every environment.
    scope.ServiceProvider.GetRequiredService<ClinicEz.Portal.Infrastructure.Persistence.Seeders.PlanSeeder>().SeedAsync().GetAwaiter().GetResult();
    scope.ServiceProvider.GetRequiredService<ClinicEz.Portal.Infrastructure.Persistence.Seeders.AdminRBACSeeder>().SeedAsync().GetAwaiter().GetResult();

    if (isDevelopment)
    {
        var seeders = scope.ServiceProvider.GetServices<IBaseSeeder>();
        foreach (var seeder in seeders) seeder.SeedAsync().GetAwaiter().GetResult();

        // Auto-heal any legacy facilities stuck in Provisioning status (Development only)
        try
        {
            var stuckFacilities = dbContext.Facilities
                .Where(f => f.Status == ClinicEz.Portal.Domain.Entities.FacilityStatus.Provisioning)
                .ToList();

            if (stuckFacilities.Count > 0)
            {
                Console.WriteLine($"[ClinicEz.Portal] Auto-healing {stuckFacilities.Count} facility/facilities stuck in Provisioning status...");
                foreach (var fac in stuckFacilities)
                {
                    fac.Status = ClinicEz.Portal.Domain.Entities.FacilityStatus.Active;
                    fac.UpdatedAt = DateTime.UtcNow;
                }
                dbContext.SaveChanges();
                Console.WriteLine("[ClinicEz.Portal] Auto-healing complete. All facilities updated to Active.");
            }
        }
        catch (Exception healEx)
        {
            Console.WriteLine($"[ClinicEz.Portal] Warning: Auto-healing facilities failed: {healEx.Message}");
        }
    }
}

// Configure the HTTP request pipeline.
if (isDevelopment)
{
    app.MapOpenApi();
    app.MapScalarApiReference(opts => opts.WithTitle("Clinic EZ Main Portal API"));
}

// 4. Add middleware
app.UseForwardedHeaders();
app.UseCors(isDevelopment ? CorsExtensions.DevelopmentPolicyName : CorsExtensions.ProductionPolicyName);
app.UseHttpsRedirection();
app.UseExceptionHandler(); // Use our global exception handler
app.UseHangfireDashboard("/hangfire", new DashboardOptions { Authorization = [new HangfireDashboardAuthFilter(app.Configuration)] }); // Basic Auth; denied when no password is configured

// Recurring background reconciliation job for pending/stuck facilities
RecurringJob.AddOrUpdate<ClinicEz.Portal.Infrastructure.Services.IFacilityProvisioningReconciliationJob>(
    "facility-provisioning-reconciliation",
    job => job.ReconcileStuckFacilitiesAsync(CancellationToken.None),
    "*/2 * * * *"
);

// Sends queued workspace webhooks (and retries failed ones with backoff)
RecurringJob.AddOrUpdate<ClinicEz.Portal.Infrastructure.Webhooks.IWebhookDeliveryJob>(
    "workspace-webhook-delivery",
    job => job.DeliverDueAsync(CancellationToken.None),
    "* * * * *"
);

// Facility licenses are short-lived: re-mint and re-send (entitlements.changed) those about to expire
RecurringJob.AddOrUpdate<ClinicEz.Portal.Infrastructure.Services.IEntitlementRenewalJob>(
    "facility-license-renewal",
    job => job.RenewExpiringAsync(CancellationToken.None),
    "0 * * * *"
);

// Once a workspace's subscription has lapsed past the read-only grace period its on-premise hub clients are revoked
RecurringJob.AddOrUpdate<ClinicEz.Portal.Infrastructure.Services.IEntitlementRenewalJob>(
    "lapsed-hub-client-revocation",
    job => job.RevokeLapsedHubClientsAsync(CancellationToken.None),
    "30 3 * * *"
);

// Scans for orphaned workspaces based on platform settings and safely purges ghost workspaces
RecurringJob.AddOrUpdate<ClinicEz.Portal.Infrastructure.Services.IOrphanTenancyCleanupJob>(
    "orphan-tenancy-cleanup",
    job => job.ProcessOrphanTenanciesAsync(CancellationToken.None),
    "0 2 * * *"
);

// IMPORTANT: Authentication MUST run before Authorization
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

// 5. Tell the app to use controllers
app.MapApiEndpoints();
app.Run();
