using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Background;
using ClinicEz.Shared.Interop.Facility;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interop.Persistence;
using ClinicEz.Shared.Interop.Transport;
using ClinicEz.Shared.Interoperability;
using ClinicEz.Shared.Licensing;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using System.Security.Cryptography;

namespace ClinicEz.Shared.Tests.Interop;

/// <summary>In-memory facility data shared by the fake store and registry of one harness.</summary>
public sealed class FacilityData
{
    public Dictionary<(string Tenant, Guid Facility), HeldFacilityLicense> Held { get; } = new();
    public List<FacilityRegistryEntry> Facilities { get; } = new();
    public List<FacilityLicenseUpdate> Saves { get; } = new();
}

public sealed class FakeLicenseStore : IFacilityLicenseStore
{
    private readonly FacilityData _data;
    public FakeLicenseStore(FacilityData data) => _data = data;

    public Task<HeldFacilityLicense?> GetAsync(string tenantId, Guid facilityId, CancellationToken ct) =>
        Task.FromResult(_data.Held.TryGetValue((tenantId, facilityId), out var held) ? held : null);

    public Task SaveAsync(string tenantId, Guid facilityId, FacilityLicenseUpdate update, CancellationToken ct)
    {
        _data.Held[(tenantId, facilityId)] = new HeldFacilityLicense(update.LicenseToken, update.License.EntitlementVersion);
        _data.Saves.Add(update);
        return Task.CompletedTask;
    }
}

public sealed class FakeFacilityRegistry : IFacilityRegistry
{
    private readonly FacilityData _data;
    public FakeFacilityRegistry(FacilityData data) => _data = data;

    public Task<IReadOnlyList<FacilityRegistryEntry>> ListAsync(CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<FacilityRegistryEntry>>(_data.Facilities.ToList());
}

internal sealed class FacilityHarness : IDisposable
{
    public const string Tenant = "tenant-a";

    public ServiceProvider Provider { get; }
    public FacilityData Data => Provider.GetRequiredService<FacilityData>();
    public InteropDispatcher Dispatcher => Provider.GetRequiredService<InteropDispatcher>();
    public FacilityHeartbeatService Heartbeat => Provider.GetRequiredService<FacilityHeartbeatService>();
    public InProcessHubAccessor Hub => new(Provider);

    public Guid FacilityId { get; } = Guid.NewGuid();

    public FacilityHarness(string heartbeatMinutes = "15")
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Messaging:Transport"] = "InProcess",
            ["Messaging:Service"] = InteropServices.Laboratory,
            ["Messaging:Enabled"] = "true",
            ["Messaging:HeartbeatMinutes"] = heartbeatMinutes
        }).Build();

        var dbName = Guid.NewGuid().ToString();
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<IConfiguration>(config);
        services.AddSingleton<FacilityData>();
        services.AddSingleton<IFacilityLicenseValidator>(new FacilityLicenseValidator(FacilityLicenseValidator.DefaultAuthorityPublicKeyPem));
        services.AddDbContext<TestDbContext>(o => o.UseInMemoryDatabase(dbName));
        services.AddFacilityEntitlements<FakeLicenseStore>().AddFacilityHeartbeat<FakeFacilityRegistry>();
        services.AddInterop<TestDbContext>(config, h => h.HandleEntitlementsChanged());
        Provider = services.BuildServiceProvider();

        Data.Held[(Tenant, FacilityId)] = new HeldFacilityLicense(null, 0);
        Data.Facilities.Add(new FacilityRegistryEntry(Tenant, FacilityId, FacilityType.Laboratory, new DateTime(2027, 1, 1, 0, 0, 0, DateTimeKind.Utc)));
    }

    public Party FacilityParty => Party.ForFacility(Tenant, FacilityId.ToString(), FacilityType.Laboratory);

    public async Task<List<InteropOutboxMessage>> OutboxAsync()
    {
        using var scope = Provider.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<TestDbContext>().InteropOutbox.AsNoTracking().ToListAsync();
    }

    public void Dispose() => Provider.Dispose();
}

internal readonly struct InProcessHubAccessor
{
    private readonly IServiceProvider _provider;
    public InProcessHubAccessor(IServiceProvider provider) => _provider = provider;
    public IReadOnlyList<InteropEnvelope> Sent => _provider.GetRequiredService<InProcessHub>().Sent;
}

public class FacilityEntitlementsTests
{
    private static readonly string OtherAuthorityKey = ECDsa.Create(ECCurve.NamedCurves.nistP256).ExportECPrivateKeyPem();

    private static string Sign(
        Guid facilityId,
        int version,
        string tenant = FacilityHarness.Tenant,
        DateTime? expires = null,
        int maxStaff = 12,
        string plan = "Standard",
        string? signingKey = null)
    {
        var payload = new FacilityLicensePayload
        {
            FacilityId = facilityId,
            TenantId = tenant,
            FacilityName = "Test Lab",
            FacilityType = "Laboratory",
            PlanTier = plan,
            EntitlementVersion = version,
            ExpiresAtUtc = expires ?? DateTime.UtcNow.AddDays(30),
            Limits = new FacilityLimits { MaxStaff = maxStaff },
            EnabledFeatures = [FacilityFeatureKeys.LisIntegration]
        };
        return signingKey is null ? new FacilityLicenseSigner().SignLicense(payload) : new FacilityLicenseSigner(signingKey).SignLicense(payload);
    }

    private static InteropEnvelope Envelope(
        FacilityHarness h,
        string token,
        Party? from = null,
        Party? to = null,
        string? tenant = null,
        Guid? facilityId = null) =>
        InteropEnvelope.Create(
            InteropTypes.EntitlementsChanged,
            from ?? Party.Portal,
            to ?? h.FacilityParty,
            Guid.NewGuid(),
            new EntitlementsChangedEvent
            {
                TenantId = tenant ?? FacilityHarness.Tenant,
                FacilityId = facilityId ?? h.FacilityId,
                LicenseToken = token,
                EntitlementVersion = 99,
                MaxStaff = 999,
                PlanSlug = "enterprise"
            });

    private static async Task<DispatchResult> SendAsync(FacilityHarness h, InteropEnvelope envelope) =>
        await h.Dispatcher.DispatchAsync(envelope, CancellationToken.None);

    [Fact]
    public async Task NewerLicense_ReplacesTheHeldOne_UsingTheSignedPayload()
    {
        using var h = new FacilityHarness();
        h.Data.Held[(FacilityHarness.Tenant, h.FacilityId)] = new HeldFacilityLicense("old", 1);
        var token = Sign(h.FacilityId, version: 2, maxStaff: 12, plan: "Standard");

        (await SendAsync(h, Envelope(h, token))).Outcome.Should().Be(DispatchOutcome.Handled);

        var save = h.Data.Saves.Should().ContainSingle().Subject;
        save.LicenseToken.Should().Be(token);
        save.License.EntitlementVersion.Should().Be(2);
        save.License.Limits.MaxStaff.Should().Be(12, "limits come from the signed token, not from the unsigned message fields");
        save.License.PlanTier.Should().Be("Standard");
        h.Data.Held[(FacilityHarness.Tenant, h.FacilityId)].EntitlementVersion.Should().Be(2);
    }

    [Fact]
    public async Task SameVersionWithANewToken_IsAccepted_AsARenewal()
    {
        using var h = new FacilityHarness();
        var first = Sign(h.FacilityId, 3, expires: DateTime.UtcNow.AddDays(2));
        await SendAsync(h, Envelope(h, first));
        var renewed = Sign(h.FacilityId, 3, expires: DateTime.UtcNow.AddDays(400));

        await SendAsync(h, Envelope(h, renewed));

        h.Data.Held[(FacilityHarness.Tenant, h.FacilityId)].LicenseToken.Should().Be(renewed);
        h.Data.Saves.Should().HaveCount(2);
    }

    [Fact]
    public async Task StaleLicense_IsIgnored()
    {
        using var h = new FacilityHarness();
        h.Data.Held[(FacilityHarness.Tenant, h.FacilityId)] = new HeldFacilityLicense("current", 5);

        (await SendAsync(h, Envelope(h, Sign(h.FacilityId, 4)))).Outcome.Should().Be(DispatchOutcome.Handled);

        h.Data.Saves.Should().BeEmpty();
        h.Data.Held[(FacilityHarness.Tenant, h.FacilityId)].LicenseToken.Should().Be("current");
    }

    [Fact]
    public async Task RedeliveringTheSameLicenseUnderANewMessageId_IsANoOp()
    {
        using var h = new FacilityHarness();
        var token = Sign(h.FacilityId, 2);

        await SendAsync(h, Envelope(h, token));
        await SendAsync(h, Envelope(h, token));

        h.Data.Saves.Should().ContainSingle();
    }

    [Fact]
    public async Task RedeliveringTheSameMessage_IsDeduplicatedByTheInbox()
    {
        using var h = new FacilityHarness();
        var envelope = Envelope(h, Sign(h.FacilityId, 2));

        (await SendAsync(h, envelope)).Outcome.Should().Be(DispatchOutcome.Handled);
        (await SendAsync(h, envelope)).Outcome.Should().Be(DispatchOutcome.Duplicate);

        h.Data.Saves.Should().ContainSingle();
    }

    [Fact]
    public async Task ExpiredButAuthenticLicense_IsAccepted_SoTheFacilityReportsItsRealState()
    {
        using var h = new FacilityHarness();
        var token = Sign(h.FacilityId, 2, expires: DateTime.UtcNow.AddDays(-3));

        await SendAsync(h, Envelope(h, token));

        h.Data.Saves.Should().ContainSingle();
    }

    [Fact]
    public async Task LicenseSignedByAnotherAuthority_IsRejected()
    {
        using var h = new FacilityHarness();

        await SendAsync(h, Envelope(h, Sign(h.FacilityId, 2, signingKey: OtherAuthorityKey)));

        h.Data.Saves.Should().BeEmpty();
    }

    [Fact]
    public async Task TamperedOrMalformedTokens_AreRejected()
    {
        using var h = new FacilityHarness();
        var valid = Sign(h.FacilityId, 2);
        var parts = valid.Split('.');
        var forgedPayload = parts[0][..^2] + (parts[0].EndsWith("AA") ? "BB" : "AA") + "." + parts[1];

        await SendAsync(h, Envelope(h, forgedPayload));
        await SendAsync(h, Envelope(h, "not-a-license"));
        await SendAsync(h, Envelope(h, string.Empty));

        h.Data.Saves.Should().BeEmpty();
    }

    [Fact]
    public async Task LicenseBoundToAnotherTenantOrFacility_IsRejected()
    {
        using var h = new FacilityHarness();

        await SendAsync(h, Envelope(h, Sign(h.FacilityId, 2, tenant: "tenant-other")));
        await SendAsync(h, Envelope(h, Sign(Guid.NewGuid(), 2)));

        h.Data.Saves.Should().BeEmpty();
    }

    [Fact]
    public async Task OnlyThePortal_MayChangeEntitlements()
    {
        using var h = new FacilityHarness();
        var token = Sign(h.FacilityId, 2);
        var clinic = Party.ForFacility("tenant-x", Guid.NewGuid().ToString(), FacilityType.Clinic);

        await SendAsync(h, Envelope(h, token, from: clinic));
        await SendAsync(h, Envelope(h, token, from: Party.Hub));
        await SendAsync(h, Envelope(h, token, from: h.FacilityParty));

        h.Data.Saves.Should().BeEmpty();
    }

    [Fact]
    public async Task MessageAddressedToAnotherFacilityOrTenant_OrAnUnheldFacility_IsIgnored()
    {
        using var h = new FacilityHarness();
        var token = Sign(h.FacilityId, 2);
        var otherFacility = Party.ForFacility(FacilityHarness.Tenant, Guid.NewGuid().ToString(), FacilityType.Laboratory);
        var otherTenant = Party.ForFacility("tenant-other", h.FacilityId.ToString(), FacilityType.Laboratory);
        var unheld = Guid.NewGuid();

        await SendAsync(h, Envelope(h, token, to: otherFacility));
        await SendAsync(h, Envelope(h, token, to: otherTenant));
        await SendAsync(h, Envelope(h, Sign(unheld, 2), to: Party.ForFacility(FacilityHarness.Tenant, unheld.ToString(), FacilityType.Laboratory), facilityId: unheld));

        h.Data.Saves.Should().BeEmpty();
    }

    // ── heartbeat ───────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Heartbeat_QueuesOnePerFacility_FromTheFacilityToThePortal_AndShipsThem()
    {
        using var h = new FacilityHarness();
        var second = Guid.NewGuid();
        h.Data.Facilities.Add(new FacilityRegistryEntry("tenant-b", second, FacilityType.Laboratory, null));

        (await h.Heartbeat.RunOnceAsync(CancellationToken.None)).Should().Be(2);
        (await h.Provider.GetRequiredService<InteropRelayService>().RunOnceAsync(CancellationToken.None)).Should().Be(2);

        var sent = h.Hub.Sent;
        sent.Should().HaveCount(2).And.OnlyContain(e => e.Type == InteropTypes.FacilityHeartbeat && e.To == Party.Portal);
        sent.Select(e => e.From).Should().BeEquivalentTo(new[]
        {
            h.FacilityParty,
            Party.ForFacility("tenant-b", second.ToString(), FacilityType.Laboratory)
        });
        var first = sent.Single(e => e.From == h.FacilityParty).GetPayload<FacilityHeartbeatPayload>();
        first.LicenseExpiresAt.Should().Be(new DateTime(2027, 1, 1, 0, 0, 0, DateTimeKind.Utc));
        first.AppVersion.Should().NotBeNullOrWhiteSpace();
        sent.Single(e => e.From.FacilityId == second.ToString()).GetPayload<FacilityHeartbeatPayload>().LicenseExpiresAt.Should().BeNull();
    }

    [Fact]
    public async Task Heartbeat_WithNoFacilities_QueuesNothing()
    {
        using var h = new FacilityHarness();
        h.Data.Facilities.Clear();

        (await h.Heartbeat.RunOnceAsync(CancellationToken.None)).Should().Be(0);

        (await h.OutboxAsync()).Should().BeEmpty();
    }

    [Fact]
    public async Task Heartbeat_ExpiresAfterTwoIntervals_SoAStaleOneIsNeverDelivered()
    {
        using var h = new FacilityHarness("10");

        await h.Heartbeat.RunOnceAsync(CancellationToken.None);

        var envelope = InteropEnvelope.FromJson((await h.OutboxAsync()).Single().EnvelopeJson);
        envelope.ExpiresAtUtc.Should().BeCloseTo(DateTime.UtcNow.AddMinutes(20), TimeSpan.FromSeconds(30));
    }

    [Fact]
    public async Task Heartbeat_RunsAtStartup_WhenEnabled()
    {
        using var h = new FacilityHarness();

        await h.Heartbeat.StartAsync(CancellationToken.None);
        var queued = false;
        for (var i = 0; i < 50 && !queued; i++)
        {
            queued = (await h.OutboxAsync()).Count == 1;
            if (!queued) await Task.Delay(100);
        }
        await h.Heartbeat.StopAsync(CancellationToken.None);

        queued.Should().BeTrue();
    }

    [Fact]
    public async Task Heartbeat_ZeroMinutes_DisablesTheBackgroundLoop()
    {
        using var h = new FacilityHarness("0");

        await h.Heartbeat.StartAsync(CancellationToken.None);
        await h.Heartbeat.ExecuteTask!;
        await h.Heartbeat.StopAsync(CancellationToken.None);

        (await h.OutboxAsync()).Should().BeEmpty();
    }
}
