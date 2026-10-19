using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Workspace;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Organization.Tests;

/// <summary>workspace.profile.updated is pushed by the portal and held in the organization service's own database.</summary>
public class WorkspaceProfileHandlerTests
{
    private const string Tenant = "tenant-org";

    private static Party Organization(string tenantId = Tenant) =>
        Party.ForFacility(tenantId, Guid.NewGuid().ToString(), FacilityType.Organization);

    private static WorkspaceProfile Profile(long version, string accent = "#112233", string slug = "acme") =>
        new(slug, version, "Acme Health", null, accent, "Asia/Manila", "en-PH", "MM/dd/yyyy", "PHP");

    private static InteropEnvelope Envelope(Party from, Party to, string tenantId, WorkspaceProfile? profile) =>
        InteropEnvelope.Create(InteropTypes.WorkspaceProfileUpdated, from, to, Guid.NewGuid(), new WorkspaceProfileUpdatedEvent
        {
            TenantId = tenantId,
            TenantSlug = profile?.TenantSlug ?? string.Empty,
            Version = profile?.Version ?? 0,
            Profile = profile
        });

    private static async Task<WorkspaceProfile?> HeldAsync(OrganizationInteropHost host, string tenantIdentifier)
    {
        using var scope = host.Provider.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<IWorkspaceProfileStore>().GetAsync(tenantIdentifier, default);
    }

    [Fact]
    public async Task Profile_from_the_portal_is_stored_and_served_by_tenant_id_and_slug()
    {
        using var host = new OrganizationInteropHost();
        (await host.Provider.GetRequiredService<IWorkspaceProfileProvider>().GetAsync(Tenant)).Should().BeNull();

        var result = await host.Dispatcher.DispatchAsync(Envelope(Party.Portal, Organization(), Tenant, Profile(3)), default);

        result.Outcome.Should().Be(DispatchOutcome.Handled);
        var provider = host.Provider.GetRequiredService<IWorkspaceProfileProvider>();
        (await provider.GetAsync(Tenant))!.Version.Should().Be(3);
        (await provider.GetAsync("ACME"))!.DisplayName.Should().Be("Acme Health");
    }

    [Fact]
    public async Task Redelivery_and_older_versions_change_nothing()
    {
        using var host = new OrganizationInteropHost();
        var to = Organization();
        var current = Envelope(Party.Portal, to, Tenant, Profile(5, "#AAAAAA"));

        (await host.Dispatcher.DispatchAsync(current, default)).Outcome.Should().Be(DispatchOutcome.Handled);
        (await host.Dispatcher.DispatchAsync(current, default)).Outcome.Should().Be(DispatchOutcome.Duplicate);
        // An older profile arriving late, under a new message id, must not roll the profile back.
        (await host.Dispatcher.DispatchAsync(Envelope(Party.Portal, to, Tenant, Profile(4, "#BBBBBB")), default)).ShouldAck.Should().BeTrue();

        var held = await HeldAsync(host, Tenant);
        held!.Version.Should().Be(5);
        held.AccentColorHex.Should().Be("#AAAAAA");
    }

    [Fact]
    public async Task Newer_version_replaces_the_held_one()
    {
        using var host = new OrganizationInteropHost();
        var to = Organization();

        await host.Dispatcher.DispatchAsync(Envelope(Party.Portal, to, Tenant, Profile(1, "#111111")), default);
        await host.Dispatcher.DispatchAsync(Envelope(Party.Portal, to, Tenant, Profile(2, "#222222")), default);

        (await HeldAsync(host, Tenant))!.AccentColorHex.Should().Be("#222222");
    }

    [Fact]
    public async Task Message_addressed_to_a_facility_of_another_tenant_is_ignored()
    {
        using var host = new OrganizationInteropHost();

        // The profile claims tenant-org but is delivered to an organization of a different tenant.
        var result = await host.Dispatcher.DispatchAsync(
            Envelope(Party.Portal, Organization("other-tenant"), Tenant, Profile(1)), default);

        result.ShouldAck.Should().BeTrue();
        (await HeldAsync(host, Tenant)).Should().BeNull();
        (await HeldAsync(host, "other-tenant")).Should().BeNull();
    }

    [Fact]
    public async Task Message_from_a_facility_instead_of_the_portal_is_ignored()
    {
        using var host = new OrganizationInteropHost();
        var spoofed = Party.ForFacility("tenant-a", Guid.NewGuid().ToString(), FacilityType.Clinic);

        var result = await host.Dispatcher.DispatchAsync(Envelope(spoofed, Organization(), Tenant, Profile(1)), default);

        result.ShouldAck.Should().BeTrue();
        (await HeldAsync(host, Tenant)).Should().BeNull();
    }

    [Fact]
    public async Task Message_without_a_profile_stores_nothing()
    {
        using var host = new OrganizationInteropHost();

        var result = await host.Dispatcher.DispatchAsync(Envelope(Party.Portal, Organization(), Tenant, profile: null), default);

        result.ShouldAck.Should().BeTrue();
        (await HeldAsync(host, Tenant)).Should().BeNull();
    }

    [Fact]
    public async Task Each_tenant_keeps_its_own_profile()
    {
        using var host = new OrganizationInteropHost();

        await host.Dispatcher.DispatchAsync(Envelope(Party.Portal, Organization(), Tenant, Profile(1, "#111111", "acme")), default);
        await host.Dispatcher.DispatchAsync(
            Envelope(Party.Portal, Organization("tenant-two"), "tenant-two", Profile(9, "#999999", "other")), default);

        (await HeldAsync(host, Tenant))!.AccentColorHex.Should().Be("#111111");
        (await HeldAsync(host, "tenant-two"))!.AccentColorHex.Should().Be("#999999");
    }
}
