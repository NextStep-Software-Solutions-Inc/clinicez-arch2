using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Workspace;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Shared.Tests.Workspace;

public sealed class ProfileTestDb(DbContextOptions<ProfileTestDb> options) : DbContext(options), IWorkspaceProfileDbContext
{
    public DbSet<WorkspaceProfileRecord> WorkspaceProfiles => Set<WorkspaceProfileRecord>();

    protected override void OnModelCreating(ModelBuilder modelBuilder) => modelBuilder.ApplyWorkspaceProfileModel();
}

public class WorkspaceProfileTests : IDisposable
{
    private const string Tenant = "11111111-1111-1111-1111-111111111111";
    private const string Slug = "metro-clinic";

    private readonly ServiceProvider _provider;

    public WorkspaceProfileTests()
    {
        var dbName = Guid.NewGuid().ToString();
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<IConfiguration>(new ConfigurationBuilder().Build());
        services.AddDbContext<ProfileTestDb>(o => o.UseInMemoryDatabase(dbName));
        services.AddWorkspaceProfile<ProfileTestDb>();
        services.AddScoped<WorkspaceProfileUpdatedHandler>();
        _provider = services.BuildServiceProvider();
    }

    public void Dispose() => _provider.Dispose();

    private static WorkspaceProfile Profile(long version, string name = "Metro Clinic", string slug = Slug) =>
        new(slug, version, name, null, "#112233", "Asia/Manila", "en-PH", "MM/dd/yyyy", "PHP", "Dr. DPO", "dpo@metro.test", "https://metro.test/privacy");

    private static InteropMessageContext Context(Party from, Party to, WorkspaceProfile? profile, string tenant = Tenant)
    {
        var message = new WorkspaceProfileUpdatedEvent { TenantId = tenant, TenantSlug = Slug, Version = profile?.Version ?? 0, Profile = profile };
        return new InteropMessageContext(InteropEnvelope.Create(InteropTypes.WorkspaceProfileUpdated, from, to, Guid.NewGuid(), message));
    }

    private static Party Clinic(string tenant = Tenant) => Party.ForFacility(tenant, Guid.NewGuid().ToString(), FacilityType.Clinic);

    private async Task Deliver(Party from, Party to, WorkspaceProfile? profile, string tenant = Tenant)
    {
        using var scope = _provider.CreateScope();
        var handler = scope.ServiceProvider.GetRequiredService<WorkspaceProfileUpdatedHandler>();
        var ctx = Context(from, to, profile, tenant);
        await handler.HandleAsync(ctx.Envelope.GetPayload<WorkspaceProfileUpdatedEvent>(), ctx, CancellationToken.None);
    }

    [Fact]
    public async Task PortalMessage_IsStored_AndReadableByIdAndSlug()
    {
        await Deliver(Party.Portal, Clinic(), Profile(1));

        var provider = _provider.GetRequiredService<IWorkspaceProfileProvider>();
        (await provider.GetAsync(Tenant))!.DisplayName.Should().Be("Metro Clinic");
        (await provider.GetAsync("METRO-CLINIC"))!.Version.Should().Be(1);
        provider.TryGetCached(Slug)!.DpoEmail.Should().Be("dpo@metro.test");
    }

    [Fact]
    public async Task NothingReceivedYet_IsNull_NotAnError()
    {
        var provider = _provider.GetRequiredService<IWorkspaceProfileProvider>();
        (await provider.GetAsync(Tenant)).Should().BeNull();
        provider.TryGetCached("unknown").Should().BeNull();
        (await provider.GetAsync("  ")).Should().BeNull();
    }

    [Fact]
    public async Task NewerVersion_Replaces_AndCacheIsInvalidated()
    {
        var provider = _provider.GetRequiredService<IWorkspaceProfileProvider>();
        await Deliver(Party.Portal, Clinic(), Profile(1));
        (await provider.GetAsync(Tenant))!.Version.Should().Be(1); // warm the cache

        await Deliver(Party.Portal, Clinic(), Profile(2, "Metro Clinic Group"));

        (await provider.GetAsync(Tenant))!.DisplayName.Should().Be("Metro Clinic Group");
    }

    [Fact]
    public async Task EqualAndOlderVersions_AreIgnored()
    {
        await Deliver(Party.Portal, Clinic(), Profile(5, "Five"));
        await Deliver(Party.Portal, Clinic(), Profile(5, "Five again"));
        await Deliver(Party.Portal, Clinic(), Profile(3, "Three"));

        var provider = _provider.GetRequiredService<IWorkspaceProfileProvider>();
        (await provider.GetAsync(Tenant))!.DisplayName.Should().Be("Five");

        using var scope = _provider.CreateScope();
        (await scope.ServiceProvider.GetRequiredService<ProfileTestDb>().WorkspaceProfiles.CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task Sender_MustBeThePortal()
    {
        await Deliver(Party.ForFacility(Tenant, Guid.NewGuid().ToString(), FacilityType.Laboratory), Clinic(), Profile(1));
        await Deliver(Party.ForPatient("p-1"), Clinic(), Profile(1));
        await Deliver(Party.Hub, Clinic(), Profile(1));

        (await _provider.GetRequiredService<IWorkspaceProfileProvider>().GetAsync(Tenant)).Should().BeNull();
    }

    [Fact]
    public async Task Recipient_MustBeAFacilityOfTheSameTenant()
    {
        await Deliver(Party.Portal, Clinic("22222222-2222-2222-2222-222222222222"), Profile(1));
        await Deliver(Party.Portal, Party.ForPatient("p-1"), Profile(1));

        (await _provider.GetRequiredService<IWorkspaceProfileProvider>().GetAsync(Tenant)).Should().BeNull();
    }

    [Fact]
    public async Task MessageWithoutProfile_OrWithoutIdentity_IsIgnored()
    {
        await Deliver(Party.Portal, Clinic(), null);
        await Deliver(Party.Portal, Clinic(), Profile(1, name: " "));
        await Deliver(Party.Portal, Clinic(), Profile(1, slug: ""));

        (await _provider.GetRequiredService<IWorkspaceProfileProvider>().GetAsync(Tenant)).Should().BeNull();
    }

    [Fact]
    public async Task Tenants_AreIsolated()
    {
        const string other = "33333333-3333-3333-3333-333333333333";
        await Deliver(Party.Portal, Clinic(), Profile(1, "A"));
        await Deliver(Party.Portal, Clinic(other), Profile(1, "B", "other-clinic"), other);

        var provider = _provider.GetRequiredService<IWorkspaceProfileProvider>();
        (await provider.GetAsync(Tenant))!.DisplayName.Should().Be("A");
        (await provider.GetAsync("other-clinic"))!.DisplayName.Should().Be("B");
    }

    [Fact]
    public void Event_RoundTripsThroughTheEnvelope_AndAnOldPayloadStillParses()
    {
        var sent = new WorkspaceProfileUpdatedEvent { TenantId = Tenant, TenantSlug = Slug, Version = 7, Profile = Profile(7) };
        var envelope = InteropEnvelope.FromJson(InteropEnvelope.Create(InteropTypes.WorkspaceProfileUpdated, Party.Portal, Clinic(), Guid.NewGuid(), sent).ToJson());
        envelope.GetPayload<WorkspaceProfileUpdatedEvent>().Profile.Should().BeEquivalentTo(Profile(7));

        var old = System.Text.Json.JsonSerializer.SerializeToElement(new { id = Guid.NewGuid(), tenantId = Tenant, tenantSlug = Slug, version = 2, occurredAt = DateTime.UtcNow });
        var legacy = InteropEnvelope.Create(InteropTypes.WorkspaceProfileUpdated, Party.Portal, Clinic(), Guid.NewGuid(), new { }) with { Payload = old };
        legacy.GetPayload<WorkspaceProfileUpdatedEvent>().Profile.Should().BeNull();
    }
}
