using ClinicEz.Interop.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Transport;
using ClinicEz.Shared.Security;
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

    private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, (string PrivateKey, string PublicKey)> SigningPairs = new();

    /// <summary>The service's hub client signing key pair (generated once per test run; the hub is bootstrapped with the public half).</summary>
    public static (string PrivateKey, string PublicKey) SigningPair(string service) => SigningPairs.GetOrAdd(service, _ => PemKey.GenerateP256Base64());

    /// <summary>The value of <c>Messaging:SigningKey</c> for the service.</summary>
    public static string SigningKey(string service) => SigningPair(service).PrivateKey;

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
            ["Hub:Signing:Required"] = "true",
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
            config[$"Hub:Bootstrap:Clients:{i}:PublicKey"] = SigningPair(service).PublicKey;
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
    /// <param name="service">The service whose client credentials and signing key are used.</param>
    /// <param name="sign">When false the client sends exactly the envelopes it is given, so a test can send them unsigned or tampered.</param>
    public IHubClient NewSdk(string service, bool sign = true)
    {
        var http = _factory.CreateClient();
        var client = new HubHttpClient(http, Microsoft.Extensions.Options.Options.Create(new InteropOptions
        {
            HubUrl = "http://localhost",
            ClientId = ClientId(service),
            ClientSecret = Secret(service),
            PollWaitSeconds = 0
        }));
        return sign ? new SigningHubClient(client, new EnvelopeSigner(SigningKey(service), ClientId(service))) : client;
    }

    /// <summary>The SDK client of a service that, like the real relay, signs everything it sends with its own key.</summary>
    private sealed class SigningHubClient(HubHttpClient inner, EnvelopeSigner signer) : IHubClient
    {
        public Task<IReadOnlyList<SendResult>> SendAsync(IReadOnlyList<InteropEnvelope> envelopes, CancellationToken ct) =>
            inner.SendAsync(envelopes.Select(signer.Sign).ToList(), ct);

        public Task<IReadOnlyList<PulledMessage>> PullAsync(string service, int max, int waitSeconds, CancellationToken ct) =>
            inner.PullAsync(service, max, waitSeconds, ct);

        public Task AckAsync(IReadOnlyList<Guid> deliveryIds, CancellationToken ct) => inner.AckAsync(deliveryIds, ct);

        public Task NackAsync(IReadOnlyList<NackItem> items, CancellationToken ct) => inner.NackAsync(items, ct);
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
