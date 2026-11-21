using System.Collections.Concurrent;
using System.Text.Json;
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
using Microsoft.Extensions.Options;

namespace ClinicEz.Interop.Tests.Support;

/// <summary>A controllable clock so visibility timeouts, TTLs and backoff can be tested without sleeping.</summary>
public sealed class FakeClock : TimeProvider
{
    private DateTimeOffset _now = DateTimeOffset.UtcNow;

    public override DateTimeOffset GetUtcNow() => _now;

    public void Advance(TimeSpan by) => _now += by;
}

/// <summary>Signing key pairs of the test clients, generated once per test run (the hub bootstraps the public halves).</summary>
public static class TestKeys
{
    private static readonly ConcurrentDictionary<string, (string PrivateKey, string PublicKey)> Pairs = new();

    public static (string PrivateKey, string PublicKey) For(string clientId) => Pairs.GetOrAdd(clientId, _ => PemKey.GenerateP256Base64());

    /// <summary>The envelope signed the way client <paramref name="clientId"/>'s SDK would sign it.</summary>
    public static InteropEnvelope Sign(string clientId, InteropEnvelope envelope) => new EnvelopeSigner(For(clientId).PrivateKey, clientId).Sign(envelope);
}

/// <summary>The same parties and tenants in every test.</summary>
public static class W
{
    public const string TenantA = "tenant-a";
    public const string TenantB = "tenant-b";
    public const string TenantE = "tenant-e";
    public const string EdgeCell = "edge-1";

    public static readonly Party A1Clinic = Party.ForFacility(TenantA, "a-clinic", FacilityType.Clinic);
    public static readonly Party A2Lab = Party.ForFacility(TenantA, "a-lab", FacilityType.Laboratory);
    public static readonly Party A3Pharmacy = Party.ForFacility(TenantA, "a-pharm", FacilityType.Pharmacy);
    public static readonly Party B1Lab = Party.ForFacility(TenantB, "b-lab", FacilityType.Laboratory);
    public static readonly Party B2Clinic = Party.ForFacility(TenantB, "b-clinic", FacilityType.Clinic);
    public static readonly Party E1Clinic = Party.ForFacility(TenantE, "e-clinic", FacilityType.Clinic);
    public static readonly Party E2Lab = Party.ForFacility(TenantE, "e-lab", FacilityType.Laboratory);

    public static string Secret(string clientId) => $"{clientId}-secret-0123456789abcdef";

    public static InteropEnvelope Env(string type, Party from, Party to, Guid? correlation = null, object? payload = null, Guid? messageId = null)
    {
        var envelope = InteropEnvelope.Create(type, from, to, correlation ?? Guid.NewGuid(), payload ?? new { note = "hello" });
        return messageId is { } id ? envelope with { MessageId = id } : envelope;
    }
}

/// <summary>
/// A hub host over a throw-away SQLite database (WAL, so concurrent requests behave) driven by the SDK's real
/// <see cref="HubHttpClient"/>. Configuration mirrors production; only the clock and the database provider are replaced.
/// </summary>
public sealed class HubApp : IAsyncDisposable
{
    private readonly Factory _factory;
    private readonly string _dbFile;

    private HubApp(Factory factory, string dbFile, FakeClock clock)
    {
        _factory = factory;
        _dbFile = dbFile;
        Clock = clock;
    }

    public FakeClock Clock { get; }
    public IServiceProvider Services => _factory.Services;
    public HttpMessageHandler Handler => _factory.Server.CreateHandler();

    public record ClientSpec(string Id, string CellId, string Service, HubClientKind Kind);

    public static ClientSpec[] CloudClients { get; } =
    [
        new("portal", "cloud", "portal", HubClientKind.ControlPlane),
        new("clinic", "cloud", "clinic", HubClientKind.CloudService),
        new("lab", "cloud", "laboratory", HubClientKind.CloudService),
        new("pharmacy", "cloud", "pharmacy", HubClientKind.CloudService),
        new("billing", "cloud", "billing", HubClientKind.CloudService),
        new("patient", "cloud", "patient", HubClientKind.PatientPlane),
        new("philhealth", "cloud", "philhealth", HubClientKind.PlatformService),
        new("media", "cloud", "media", HubClientKind.PlatformService),
        new("comms", "cloud", "comms", HubClientKind.CloudService),
        new("edge-hub", W.EdgeCell, "cell", HubClientKind.EdgeCell)
    ];

    public static async Task<HubApp> StartCloudAsync(
        Dictionary<string, string?>? overrides = null,
        string environment = "Production",
        bool seed = true,
        FakeClock? clock = null,
        Action<IServiceCollection>? configure = null,
        bool bootstrap = true)
    {
        var config = BaseConfig();
        if (bootstrap)
            AddBootstrap(config, [
                ("cloud", "Clinic EZ Cloud", CellKind.Cloud, null),
                (W.EdgeCell, "Edge 1", CellKind.Edge, W.TenantE)], CloudClients, []);
        return await StartAsync(config, overrides, environment, seed, clock, configure);
    }

    /// <summary>A local (edge) hub for tenant-e's cell, with facilities seeded from bootstrap, forwarding to <paramref name="cloud"/> through <paramref name="upstream"/>.</summary>
    public static async Task<HubApp> StartLocalAsync(UpstreamSwitch upstream, FakeClock? clock = null, Dictionary<string, string?>? overrides = null)
    {
        var config = BaseConfig();
        config["Hub:Mode"] = "Local";
        config["Hub:LocalCellId"] = W.EdgeCell;
        config["Hub:Upstream:Url"] = "http://cloud.test";
        config["Hub:Upstream:ClientId"] = "edge-hub";
        config["Hub:Upstream:ClientSecret"] = W.Secret("edge-hub");
        config["Hub:Upstream:SigningKey"] = TestKeys.For("edge-hub").PrivateKey;
        config["Hub:Upstream:MaxBackoffSeconds"] = "60";
        AddBootstrap(config,
            [(W.EdgeCell, "Edge 1", CellKind.Edge, W.TenantE)],
            [new("local-clinic", W.EdgeCell, "clinic", HubClientKind.EdgeCell), new("local-lab", W.EdgeCell, "laboratory", HubClientKind.EdgeCell)],
            [(W.E1Clinic, "E Clinic"), (W.E2Lab, "E Lab")]);
        return await StartAsync(config, overrides, "Production", false, clock, services =>
            services.AddHttpClient("hub-upstream").ConfigurePrimaryHttpMessageHandler(() => upstream));
    }

    private static async Task<HubApp> StartAsync(
        Dictionary<string, string?> config,
        Dictionary<string, string?>? overrides,
        string environment,
        bool seed,
        FakeClock? clock,
        Action<IServiceCollection>? configure)
    {
        if (overrides is not null) foreach (var (key, value) in overrides) config[key] = value;
        clock ??= new FakeClock();
        var dbFile = Path.Combine(Path.GetTempPath(), $"interop-hub-test-{Guid.NewGuid():N}.db");
        var factory = new Factory(config, environment, clock, dbFile, configure);
        var app = new HubApp(factory, dbFile, clock);
        _ = factory.Server; // start the host (runs migrations/bootstrap) now so startup failures surface here
        if (seed) await app.SeedDefaultDirectoryAsync();
        return app;
    }

    private static Dictionary<string, string?> BaseConfig() => new()
    {
        ["DbSchema"] = "public",
        ["Hub:Database:AutoMigrate"] = "true",
        ["Hub:Background:Enabled"] = "false",
        ["Hub:Auth:Pbkdf2Iterations"] = "1000",
        ["Hub:Signing:Required"] = "false",
        ["Hub:MaxEnvelopeBytes"] = "8192",
        ["Hub:MaxDeliveryAttempts"] = "3",
        ["Hub:VisibilityTimeoutSeconds"] = "30",
        ["Hub:NackDelaySeconds"] = "0",
        ["Hub:LongPollIntervalMs"] = "100"
    };

    private static void AddBootstrap(
        Dictionary<string, string?> config,
        (string Id, string Name, CellKind Kind, string? Tenant)[] cells,
        ClientSpec[] clients,
        (Party Party, string Name)[] facilities)
    {
        for (var i = 0; i < cells.Length; i++)
        {
            config[$"Hub:Bootstrap:Cells:{i}:CellId"] = cells[i].Id;
            config[$"Hub:Bootstrap:Cells:{i}:Name"] = cells[i].Name;
            config[$"Hub:Bootstrap:Cells:{i}:Kind"] = cells[i].Kind.ToString();
            config[$"Hub:Bootstrap:Cells:{i}:TenantId"] = cells[i].Tenant;
        }

        for (var i = 0; i < clients.Length; i++)
        {
            config[$"Hub:Bootstrap:Clients:{i}:ClientId"] = clients[i].Id;
            config[$"Hub:Bootstrap:Clients:{i}:Secret"] = W.Secret(clients[i].Id);
            config[$"Hub:Bootstrap:Clients:{i}:CellId"] = clients[i].CellId;
            config[$"Hub:Bootstrap:Clients:{i}:Service"] = clients[i].Service;
            config[$"Hub:Bootstrap:Clients:{i}:Kind"] = clients[i].Kind.ToString();
            config[$"Hub:Bootstrap:Clients:{i}:PublicKey"] = TestKeys.For(clients[i].Id).PublicKey;
        }

        for (var i = 0; i < facilities.Length; i++)
        {
            config[$"Hub:Bootstrap:Facilities:{i}:TenantId"] = facilities[i].Party.TenantId;
            config[$"Hub:Bootstrap:Facilities:{i}:FacilityId"] = facilities[i].Party.FacilityId;
            config[$"Hub:Bootstrap:Facilities:{i}:FacilityType"] = facilities[i].Party.FacilityType.ToString();
            config[$"Hub:Bootstrap:Facilities:{i}:CellId"] = W.EdgeCell;
            config[$"Hub:Bootstrap:Facilities:{i}:DisplayName"] = facilities[i].Name;
        }
    }

    // ---- clients -------------------------------------------------------------------------------------------------

    /// <summary>The SDK's real HTTP client, authenticated as one of the bootstrapped clients.</summary>
    public HubHttpClient Sdk(string clientId, string? secret = null)
    {
        var http = _factory.CreateClient();
        return new HubHttpClient(http, Options.Create(new InteropOptions
        {
            HubUrl = "http://localhost",
            ClientId = clientId,
            ClientSecret = secret ?? W.Secret(clientId),
            PollWaitSeconds = 0
        }));
    }

    public HubAdminHttpClient AdminSdk(string clientId = "portal", string? secret = null)
    {
        var http = _factory.CreateClient();
        return new HubAdminHttpClient(http, Options.Create(new InteropOptions
        {
            HubUrl = "http://localhost",
            ClientId = clientId,
            ClientSecret = secret ?? W.Secret(clientId)
        }));
    }

    public HttpClient Raw(string? clientId = null, string? secret = null)
    {
        var http = _factory.CreateClient();
        if (clientId is not null) http.DefaultRequestHeaders.Add(HubHttpClient.ClientIdHeader, clientId);
        if (secret is not null) http.DefaultRequestHeaders.Add(HubHttpClient.ClientSecretHeader, secret);
        return http;
    }

    public HttpClient RawAs(string clientId) => Raw(clientId, W.Secret(clientId));

    // ---- helpers -------------------------------------------------------------------------------------------------

    public async Task<SendResult> SendAsync(string clientId, InteropEnvelope envelope)
    {
        var results = await Sdk(clientId).SendAsync([envelope], CancellationToken.None);
        results.Should().HaveCount(1);
        return results[0];
    }

    public async Task<IReadOnlyList<PulledMessage>> PullAsync(string clientId, string service, int max = 50) =>
        await Sdk(clientId).PullAsync(service, max, 0, CancellationToken.None);

    public async Task<T> DbAsync<T>(Func<HubDbContext, Task<T>> query)
    {
        using var scope = Services.CreateScope();
        return await query(scope.ServiceProvider.GetRequiredService<HubDbContext>());
    }

    public async Task SendPortalAsync<T>(string type, T payload)
    {
        var result = await SendAsync("portal", TestKeys.Sign("portal", InteropEnvelope.Create(type, Party.Portal, Party.Hub, Guid.NewGuid(), payload)));
        result.Status.Should().Be(SendResult.Accepted, result.Reason);
    }

    public Task UpsertFacilityAsync(
        Party party,
        FacilityVisibility visibility,
        string cell = "cloud",
        string? city = null,
        string? name = null,
        bool active = true,
        bool acceptsExternal = true) =>
        SendPortalAsync(InteropTypes.DirectoryFacilityUpserted, new DirectoryFacilityUpsertedPayload
        {
            TenantId = party.TenantId!,
            FacilityId = party.FacilityId!,
            FacilityType = party.FacilityType!.Value,
            CellId = cell,
            DisplayName = name ?? party.FacilityId!,
            City = city,
            Visibility = visibility,
            AcceptsExternalRequests = acceptsExternal,
            Active = active
        });

    public Task UpsertLinkAsync(Guid id, Party source, Party target, LinkStatus status = LinkStatus.Active, LinkScopes scopes = LinkScopes.All) =>
        SendPortalAsync(InteropTypes.DirectoryLinkUpserted, new DirectoryLinkUpsertedPayload
        {
            LinkId = id,
            SourceTenantId = source.TenantId!,
            SourceFacilityId = source.FacilityId!,
            TargetTenantId = target.TenantId!,
            TargetFacilityId = target.FacilityId!,
            Status = status,
            Scopes = scopes
        });

    /// <summary>tenant-a (all Private), tenant-b (lab Network, clinic Private) in the cloud cell; tenant-e (Network) in the edge cell.</summary>
    private async Task SeedDefaultDirectoryAsync()
    {
        await UpsertFacilityAsync(W.A1Clinic, FacilityVisibility.Private, city: "Manila");
        await UpsertFacilityAsync(W.A2Lab, FacilityVisibility.Private, city: "Manila");
        await UpsertFacilityAsync(W.A3Pharmacy, FacilityVisibility.Private, city: "Manila");
        await UpsertFacilityAsync(W.B1Lab, FacilityVisibility.Network, city: "Cebu");
        await UpsertFacilityAsync(W.B2Clinic, FacilityVisibility.Private, city: "Cebu");
        await UpsertFacilityAsync(W.E1Clinic, FacilityVisibility.Network, cell: W.EdgeCell, city: "Davao");
        await UpsertFacilityAsync(W.E2Lab, FacilityVisibility.Network, cell: W.EdgeCell, city: "Davao");
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

    private sealed class Factory(
        Dictionary<string, string?> config,
        string environment,
        FakeClock clock,
        string dbFile,
        Action<IServiceCollection>? configure) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(environment);
            builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(config));
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<DbContextOptions<HubDbContext>>();
                services.RemoveAll<IDbContextOptionsConfiguration<HubDbContext>>();
                services.AddDbContext<HubDbContext>(o => o.UseSqlite($"Data Source={dbFile};Pooling=False"));
                services.RemoveAll<TimeProvider>();
                services.AddSingleton<TimeProvider>(clock);
                configure?.Invoke(services);
            });
        }
    }
}

/// <summary>Lets a test cut the local hub's connection to the cloud hub (and count how often it is used).</summary>
public sealed class UpstreamSwitch : DelegatingHandler
{
    public bool Up { get; set; } = true;
    public int Requests { get; private set; }

    public void ConnectTo(HubApp cloud) => InnerHandler = cloud.Handler;

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        Requests++;
        return Up
            ? base.SendAsync(request, cancellationToken)
            : throw new HttpRequestException("The upstream hub is unreachable (test).");
    }
}

public static class JsonExtensions
{
    public static JsonElement ToElement(this object value) => JsonSerializer.SerializeToElement(value, InteropJson.Options);
}
