using ClinicEz.Interop.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Transport;
using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace ClinicEz.Interop.E2E.Support;

/// <summary>
/// The REAL interop hub (services/interop-hub, hosted through its own Program) over a throw-away SQLite database. Production
/// configuration except for the database provider; one cloud cell with one client per service, like the hub's Development bootstrap.
/// </summary>
public sealed class HubFixture : IAsyncDisposable
{
    public const string CloudCell = "cloud";

    private readonly Factory _factory;
    private readonly string _dbFile;

    private HubFixture(Factory factory, string dbFile)
    {
        _factory = factory;
        _dbFile = dbFile;
    }

    public IServiceProvider Services => _factory.Services;

    /// <summary>A fresh in-memory handler into the hub's TestServer (what a service's HttpClient is wired to).</summary>
    public HttpMessageHandler NewHandler() => _factory.Server.CreateHandler();

    public static string ClientId(string service) => $"e2e-{service}";

    public static string Secret(string service) => $"e2e-{service}-secret-0123456789abcdef";

    private static readonly (string Service, HubClientKind Kind)[] Clients =
    [
        (InteropServices.Portal, HubClientKind.ControlPlane),
        (InteropServices.Clinic, HubClientKind.CloudService),
        (InteropServices.Laboratory, HubClientKind.CloudService),
        (InteropServices.Pharmacy, HubClientKind.CloudService),
        (InteropServices.Billing, HubClientKind.CloudService),
        (InteropServices.Patient, HubClientKind.PatientPlane)
    ];

    public static HubFixture Start()
    {
        var config = new Dictionary<string, string?>
        {
            ["DbSchema"] = "interop_hub",
            ["Hub:Database:AutoMigrate"] = "true",
            ["Hub:Background:Enabled"] = "false",
            ["Hub:Auth:Pbkdf2Iterations"] = "1000",
            ["Hub:MaxDeliveryAttempts"] = "3",
            ["Hub:VisibilityTimeoutSeconds"] = "30",
            ["Hub:NackDelaySeconds"] = "0",
            ["Hub:LongPollIntervalMs"] = "50",
            ["Hub:Bootstrap:Cells:0:CellId"] = CloudCell,
            ["Hub:Bootstrap:Cells:0:Name"] = "ClinicEZ Cloud (e2e)",
            ["Hub:Bootstrap:Cells:0:Kind"] = nameof(CellKind.Cloud)
        };

        for (var i = 0; i < Clients.Length; i++)
        {
            var (service, kind) = Clients[i];
            config[$"Hub:Bootstrap:Clients:{i}:ClientId"] = ClientId(service);
            config[$"Hub:Bootstrap:Clients:{i}:Secret"] = Secret(service);
            config[$"Hub:Bootstrap:Clients:{i}:CellId"] = CloudCell;
            config[$"Hub:Bootstrap:Clients:{i}:Service"] = service;
            config[$"Hub:Bootstrap:Clients:{i}:Kind"] = kind.ToString();
        }

        var dbFile = Path.Combine(Path.GetTempPath(), $"interop-e2e-hub-{Guid.NewGuid():N}.db");
        var factory = new Factory(config, dbFile);
        _ = factory.Server; // start the host now (migrations + bootstrap) so startup failures surface here
        return new HubFixture(factory, dbFile);
    }

    public async Task<T> DbAsync<T>(Func<HubDbContext, Task<T>> query)
    {
        using var scope = Services.CreateScope();
        return await query(scope.ServiceProvider.GetRequiredService<HubDbContext>());
    }

    /// <summary>The portal feeding the hub directory (what portal-api does when a facility is created or changes).</summary>
    public async Task UpsertFacilityAsync(
        Party facility,
        FacilityVisibility visibility = FacilityVisibility.Private,
        string? name = null,
        bool acceptsExternal = true)
    {
        var sdk = NewSdk(InteropServices.Portal);
        var envelope = InteropEnvelope.Create(
            InteropTypes.DirectoryFacilityUpserted,
            Party.Portal,
            Party.Hub,
            Guid.NewGuid(),
            new DirectoryFacilityUpsertedPayload
            {
                TenantId = facility.TenantId!,
                FacilityId = facility.FacilityId!,
                FacilityType = facility.FacilityType!.Value,
                CellId = CloudCell,
                DisplayName = name ?? facility.FacilityId!,
                Visibility = visibility,
                AcceptsExternalRequests = acceptsExternal,
                Active = true
            });
        var results = await sdk.SendAsync([envelope], CancellationToken.None);
        results.Should().ContainSingle().Which.Status.Should().Be(SendResult.Accepted, results[0].Reason);
    }

    public async Task UpsertLinkAsync(Party source, Party target, LinkScopes scopes = LinkScopes.All)
    {
        var sdk = NewSdk(InteropServices.Portal);
        var envelope = InteropEnvelope.Create(
            InteropTypes.DirectoryLinkUpserted,
            Party.Portal,
            Party.Hub,
            Guid.NewGuid(),
            new DirectoryLinkUpsertedPayload
            {
                LinkId = Guid.NewGuid(),
                SourceTenantId = source.TenantId!,
                SourceFacilityId = source.FacilityId!,
                TargetTenantId = target.TenantId!,
                TargetFacilityId = target.FacilityId!,
                Status = LinkStatus.Active,
                Scopes = scopes
            });
        var results = await sdk.SendAsync([envelope], CancellationToken.None);
        results.Should().ContainSingle().Which.Status.Should().Be(SendResult.Accepted, results[0].Reason);
    }

    /// <summary>The SDK's real HTTP client, authenticated as the service's client (for the portal, which has no service host here).</summary>
    public ClinicEz.Shared.Interop.Transport.HubHttpClient NewSdk(string service)
    {
        var http = _factory.CreateClient();
        return new ClinicEz.Shared.Interop.Transport.HubHttpClient(http, Microsoft.Extensions.Options.Options.Create(new InteropOptions
        {
            HubUrl = "http://localhost",
            ClientId = ClientId(service),
            ClientSecret = Secret(service),
            PollWaitSeconds = 0
        }));
    }

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        SqliteConnection.ClearAllPools();
        foreach (var file in new[] { _dbFile, _dbFile + "-wal", _dbFile + "-shm" })
        {
            try { File.Delete(file); }
            catch (IOException) { /* best effort cleanup of a temp file */ }
        }
    }

    private sealed class Factory(Dictionary<string, string?> config, string dbFile) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Production");
            builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(config));
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<DbContextOptions<HubDbContext>>();
                services.RemoveAll<IDbContextOptionsConfiguration<HubDbContext>>();
                services.AddDbContext<HubDbContext>(o => o.UseSqlite($"Data Source={dbFile};Pooling=False"));
            });
        }
    }
}
