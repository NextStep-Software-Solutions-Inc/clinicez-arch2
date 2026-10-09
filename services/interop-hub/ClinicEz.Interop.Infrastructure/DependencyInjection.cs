using ClinicEz.Interop.Application;
using ClinicEz.Interop.Application.Abstractions;
using ClinicEz.Interop.Infrastructure.Background;
using ClinicEz.Interop.Infrastructure.Persistence;
using ClinicEz.Interop.Infrastructure.Security;
using ClinicEz.Interop.Infrastructure.Upstream;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace ClinicEz.Interop.Infrastructure;

public static class DependencyInjection
{
    /// <summary>
    /// Registers persistence, background jobs and the upstream client. Everything that depends on configuration is resolved lazily
    /// (when first used), so hosts can finish composing configuration before the hub reads it.
    /// </summary>
    public static IServiceCollection AddInteropHubInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<HubOptions>().Bind(configuration.GetSection(HubOptions.Section)).ValidateOnStart();
        services.AddSingleton<IValidateOptions<HubOptions>, HubOptionsValidator>();

        services.AddDbContext<HubDbContext>(options =>
        {
            var connectionString = configuration.GetConnectionString("DefaultConnection");
            if (string.IsNullOrWhiteSpace(connectionString))
                throw new InvalidOperationException("ConnectionStrings:DefaultConnection is required (the hub's PostgreSQL database).");

            var schema = configuration["DbSchema"];
            options.UseNpgsql(connectionString, npgsql => npgsql.MigrationsHistoryTable("__EFMigrationsHistory", schema));
        });

        services.AddScoped<IClientStore, EfClientStore>();
        services.AddScoped<IDirectoryStore, EfDirectoryStore>();
        services.AddScoped<IMessageStore, EfMessageStore>();
        services.AddScoped<IOutboundStore, EfOutboundStore>();
        services.AddScoped<IClaimStore, EfClaimStore>();
        services.AddSingleton<IEnvelopeProtector, EnvelopeProtector>();

        services.AddHttpClient(UpstreamHubClient.HttpClientName, (sp, client) =>
        {
            var upstream = sp.GetRequiredService<IOptions<HubOptions>>().Value.Upstream;
            if (Uri.TryCreate(upstream.Url.TrimEnd('/') + "/", UriKind.Absolute, out var baseAddress)) client.BaseAddress = baseAddress;
            client.Timeout = TimeSpan.FromSeconds(Math.Max(30, upstream.PollWaitSeconds + 25));
        });
        services.AddScoped<IUpstreamHub, UpstreamHubClient>();

        services.AddHostedService<HubMaintenanceService>();
        services.AddHostedService<OutboundForwarderService>();
        services.AddHostedService<CellInboxPullerService>();
        services.AddHostedService<DirectorySyncService>();
        return services;
    }

    /// <summary>Applies migrations (PostgreSQL) or creates the schema (other providers, tests). Safe with several instances starting at once.</summary>
    public static async Task InitializeDatabaseAsync(this IServiceProvider services, CancellationToken ct = default)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<HubDbContext>();
        if (db.Database.IsNpgsql()) await db.Database.MigrateAsync(ct);
        else await db.Database.EnsureCreatedAsync(ct);
    }
}
