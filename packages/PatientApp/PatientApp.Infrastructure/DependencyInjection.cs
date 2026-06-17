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
using PatientApp.Infrastructure.Services.Auth;
using PatientApp.Infrastructure.Services.Jobs;
using PatientApp.Infrastructure.Services.Jobs.Processors;
using PatientApp.Infrastructure.Services.Session;
using PatientApp.Infrastructure.Services.Storage;
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

        // ── EF Core — PostgreSQL with snake_case naming ───────────────────────
        services.AddDbContext<ApplicationDbContext>(options =>
            options
                .UseNpgsql(connectionString, npgsql =>
                    npgsql.MigrationsAssembly(typeof(ApplicationDbContext).Assembly.FullName))
                .UseSnakeCaseNamingConvention());

        // ── Redis ─────────────────────────────────────────────────────────────
        services.AddSingleton<IConnectionMultiplexer>(
            ConnectionMultiplexer.Connect(redisConnection));

        // ── Hangfire — PostgreSQL backed ──────────────────────────────────────
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
        services.AddScoped<IUnitOfWork, UnitOfWork>();

        // ── Application Services ──────────────────────────────────────────────
        services.AddSingleton<IStorageService, R2StorageService>();
        services.AddScoped<ISessionService, RedisSessionService>();
        services.AddHttpContextAccessor();
        services.AddScoped<ICurrentUserService, CurrentUserService>();
        services.AddScoped<IBackgroundJobEnqueuer, HangfireJobEnqueuer>();

        // ── Sync entity processors (add one per ISyncable entity type) ────────
        services.AddScoped<ISyncEntityProcessor, PatientSyncProcessor>();

        // ── Hangfire job implementation ────────────────────────────────────────
        services.AddScoped<ISyncPayloadJob, SyncPayloadJobProcessor>();

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

        // ── Dev auto-migration ────────────────────────────────────────────────
        if (env is not null && env.IsDevelopment())
        {
            using var scope = services.BuildServiceProvider().CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            dbContext.Database.Migrate();
        }

        return services;
    }
}

