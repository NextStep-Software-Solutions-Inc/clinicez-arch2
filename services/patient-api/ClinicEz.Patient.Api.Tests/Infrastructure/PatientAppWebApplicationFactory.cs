using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Infrastructure.Persistence;
using Testcontainers.PostgreSql;
using Testcontainers.Redis;

[assembly: Xunit.CollectionBehavior(DisableTestParallelization = true)]

namespace ClinicEz.Patient.Api.Tests.Infrastructure;

/// <summary>
/// Integration test factory. Starts isolated PostgreSQL and Redis containers via
/// Testcontainers, applies EF Core migrations, and replaces Clerk JWT auth with
/// <see cref="TestJwtAuthHandler"/> so protected endpoints can be called without
/// real tokens. Hangfire job enqueueing is replaced with a no-op.
/// </summary>
public sealed class PatientAppWebApplicationFactory
    : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:16-alpine")
        .WithDatabase("patientapp_test")
        .WithUsername("patientapp_test")
        .WithPassword("patientapp_test_secret")
        .Build();

    private readonly RedisContainer _redis = new RedisBuilder("redis:7-alpine").Build();

    public async Task InitializeAsync()
    {
        await _postgres.StartAsync();
        await _redis.StartAsync();

        // Inject container connection strings and stub secrets via environment variables
        // to guarantee they override the appsettings.json file-based sources.
        Environment.SetEnvironmentVariable("ConnectionStrings__DefaultConnection", _postgres.GetConnectionString() + ";SSL Mode=Disable;Trust Server Certificate=true");
        Environment.SetEnvironmentVariable("ConnectionStrings__Redis", _redis.GetConnectionString());
        Environment.SetEnvironmentVariable("Clerk__Authority", "https://test.clerk.accounts.dev");
        Environment.SetEnvironmentVariable("Clerk__Audience", "test");
        Environment.SetEnvironmentVariable("Encryption__Enabled", "false");
        Environment.SetEnvironmentVariable("Hangfire__DashboardUsername", "admin");
        Environment.SetEnvironmentVariable("Hangfire__DashboardPassword", "admin");
        Environment.SetEnvironmentVariable("R2__AccountId", "test-account");
        Environment.SetEnvironmentVariable("R2__BucketName", "test-bucket");
        Environment.SetEnvironmentVariable("R2__AccessKeyId", "test-key");
        Environment.SetEnvironmentVariable("R2__SecretAccessKey", "test-secret");
        Environment.SetEnvironmentVariable("R2__PublicUrl", "https://test.r2.dev");

        // Trigger host build then run migrations against the test container
        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Database.MigrateAsync();
    }

    public new async Task DisposeAsync()
    {
        Dispose();  // stop the test server first, then stop containers
        await _postgres.DisposeAsync();
        await _redis.DisposeAsync();

        // Clear injected environment variables
        Environment.SetEnvironmentVariable("ConnectionStrings__DefaultConnection", null);
        Environment.SetEnvironmentVariable("ConnectionStrings__Redis", null);
        Environment.SetEnvironmentVariable("Clerk__Authority", null);
        Environment.SetEnvironmentVariable("Clerk__Audience", null);
        Environment.SetEnvironmentVariable("Encryption__Enabled", null);
        Environment.SetEnvironmentVariable("Hangfire__DashboardUsername", null);
        Environment.SetEnvironmentVariable("Hangfire__DashboardPassword", null);
        Environment.SetEnvironmentVariable("R2__AccountId", null);
        Environment.SetEnvironmentVariable("R2__BucketName", null);
        Environment.SetEnvironmentVariable("R2__AccessKeyId", null);
        Environment.SetEnvironmentVariable("R2__SecretAccessKey", null);
        Environment.SetEnvironmentVariable("R2__PublicUrl", null);
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        // Override services AFTER the app has registered everything
        builder.ConfigureTestServices(services =>
        {
            // Replace Clerk JWT with always-authenticated test scheme
            services.PostConfigure<AuthenticationOptions>(opts =>
            {
                opts.DefaultAuthenticateScheme = TestJwtAuthHandler.SchemeName;
                opts.DefaultChallengeScheme    = TestJwtAuthHandler.SchemeName;
                opts.DefaultScheme             = TestJwtAuthHandler.SchemeName;
            });

            services.AddAuthentication()
                .AddScheme<AuthenticationSchemeOptions, TestJwtAuthHandler>(
                    TestJwtAuthHandler.SchemeName, _ => { });

            // Replace Hangfire job enqueuer so no background jobs run during tests
            var existing = services.SingleOrDefault(d => d.ServiceType == typeof(IBackgroundJobEnqueuer));
            if (existing is not null) services.Remove(existing);
            services.AddScoped<IBackgroundJobEnqueuer, NoOpJobEnqueuer>();

            // Remove ClinicPingBackgroundService so it doesn't query database during startup/migrations
            var clinicPingService = services.FirstOrDefault(d => d.ImplementationType == typeof(ClinicEz.Patient.Infrastructure.Services.Workers.ClinicPingBackgroundService));
            if (clinicPingService is not null) services.Remove(clinicPingService);
        });
    }
}
