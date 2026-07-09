using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using PatientApp.Application.Common.Interfaces;
using PatientApp.Infrastructure.Persistence;
using Testcontainers.PostgreSql;
using Testcontainers.Redis;

namespace PatientApp.Api.Tests.Infrastructure;

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
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        // Inject container connection strings and stub secrets before the host builds
        builder.ConfigureAppConfiguration((_, config) =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:DefaultConnection"]  = _postgres.GetConnectionString(),
                ["ConnectionStrings:Redis"]              = _redis.GetConnectionString(),
                ["Clerk:Authority"]                      = "https://test.clerk.accounts.dev",
                ["Clerk:Audience"]                       = "test",
                ["Encryption:Enabled"]                   = "false",
                ["Hangfire:DashboardUsername"]            = "admin",
                ["Hangfire:DashboardPassword"]            = "admin",
                ["R2:AccountId"]                         = "test-account",
                ["R2:BucketName"]                        = "test-bucket",
                ["R2:AccessKeyId"]                       = "test-key",
                ["R2:SecretAccessKey"]                   = "test-secret",
                ["R2:PublicUrl"]                         = "https://test.r2.dev",
            });
        });

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
        });
    }
}
