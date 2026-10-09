using System;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Common;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Workspace;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ClinicEz.Laboratory.Application.Tests;

/// <summary>
/// workspace.profile.updated is pushed by the portal and held in the laboratory's own database; the laboratory never
/// calls the portal for it.
/// </summary>
public class LabWorkspaceProfileTests
{
    private const string Tenant = LabInteropTestData.LabTenant;

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

    private static Task<WorkspaceProfile?> HeldAsync(LabInteropHost host, string tenantIdentifier)
    {
        using var scope = host.Provider.CreateScope();
        return scope.ServiceProvider.GetRequiredService<IWorkspaceProfileStore>().GetAsync(tenantIdentifier, default);
    }

    [Fact]
    public async Task Nothing_is_held_until_the_first_message()
    {
        using var host = new LabInteropHost();

        (await HeldAsync(host, Tenant)).Should().BeNull();
        (await host.Provider.GetRequiredService<IWorkspaceProfileProvider>().GetAsync(Tenant)).Should().BeNull();
    }

    [Fact]
    public async Task Profile_from_the_portal_is_stored_and_served_by_tenant_id_and_slug()
    {
        using var host = new LabInteropHost();

        var result = await host.Dispatcher.DispatchAsync(
            Envelope(Party.Portal, LabInteropTestData.Lab, Tenant, Profile(3)), default);

        result.Outcome.Should().Be(DispatchOutcome.Handled);
        var provider = host.Provider.GetRequiredService<IWorkspaceProfileProvider>();
        (await provider.GetAsync(Tenant))!.Version.Should().Be(3);
        (await provider.GetAsync("ACME"))!.DisplayName.Should().Be("Acme Health");
    }

    [Fact]
    public async Task Redelivery_and_older_versions_change_nothing()
    {
        using var host = new LabInteropHost();
        var current = Envelope(Party.Portal, LabInteropTestData.Lab, Tenant, Profile(5, "#AAAAAA"));

        (await host.Dispatcher.DispatchAsync(current, default)).Outcome.Should().Be(DispatchOutcome.Handled);
        (await host.Dispatcher.DispatchAsync(current, default)).Outcome.Should().Be(DispatchOutcome.Duplicate);
        // An older profile arriving late, under a new message id, must not roll the profile back.
        (await host.Dispatcher.DispatchAsync(
            Envelope(Party.Portal, LabInteropTestData.Lab, Tenant, Profile(4, "#BBBBBB")), default)).ShouldAck.Should().BeTrue();

        var held = await HeldAsync(host, Tenant);
        held!.Version.Should().Be(5);
        held.AccentColorHex.Should().Be("#AAAAAA");
    }

    [Fact]
    public async Task Newer_version_replaces_the_held_one()
    {
        using var host = new LabInteropHost();

        await host.Dispatcher.DispatchAsync(Envelope(Party.Portal, LabInteropTestData.Lab, Tenant, Profile(1, "#111111")), default);
        await host.Dispatcher.DispatchAsync(Envelope(Party.Portal, LabInteropTestData.Lab, Tenant, Profile(2, "#222222")), default);

        (await HeldAsync(host, Tenant))!.AccentColorHex.Should().Be("#222222");
    }

    [Fact]
    public async Task Message_addressed_to_a_facility_of_another_tenant_is_ignored()
    {
        using var host = new LabInteropHost();

        // The profile claims tenant-lab but is delivered to a laboratory of a different tenant.
        var result = await host.Dispatcher.DispatchAsync(
            Envelope(Party.Portal, LabInteropTestData.OtherLab, Tenant, Profile(1)), default);

        result.ShouldAck.Should().BeTrue();
        (await HeldAsync(host, Tenant)).Should().BeNull();
        (await HeldAsync(host, LabInteropTestData.OtherLabTenant)).Should().BeNull();
    }

    [Fact]
    public async Task Message_from_a_facility_instead_of_the_portal_is_ignored()
    {
        using var host = new LabInteropHost();

        var result = await host.Dispatcher.DispatchAsync(
            Envelope(LabInteropTestData.ClinicA, LabInteropTestData.Lab, Tenant, Profile(1)), default);

        result.ShouldAck.Should().BeTrue();
        (await HeldAsync(host, Tenant)).Should().BeNull();
    }

    [Fact]
    public async Task Message_without_a_profile_stores_nothing()
    {
        using var host = new LabInteropHost();

        var result = await host.Dispatcher.DispatchAsync(
            Envelope(Party.Portal, LabInteropTestData.Lab, Tenant, profile: null), default);

        result.ShouldAck.Should().BeTrue();
        (await HeldAsync(host, Tenant)).Should().BeNull();
    }

    [Fact]
    public async Task Each_tenant_keeps_its_own_profile()
    {
        using var host = new LabInteropHost();

        await host.Dispatcher.DispatchAsync(Envelope(Party.Portal, LabInteropTestData.Lab, Tenant, Profile(1, "#111111", "acme")), default);
        await host.Dispatcher.DispatchAsync(
            Envelope(Party.Portal, LabInteropTestData.OtherLab, LabInteropTestData.OtherLabTenant, Profile(9, "#999999", "other")), default);

        (await HeldAsync(host, Tenant))!.AccentColorHex.Should().Be("#111111");
        (await HeldAsync(host, LabInteropTestData.OtherLabTenant))!.AccentColorHex.Should().Be("#999999");
    }

    [Fact]
    public async Task Report_letterhead_uses_the_accent_received_from_the_portal()
    {
        using var host = new LabInteropHost();
        await host.SeedLabAsync();
        await host.Dispatcher.DispatchAsync(Envelope(Party.Portal, LabInteropTestData.Lab, Tenant, Profile(1, "#0F766E")), default);

        var config = await host.InLabScopeAsync(async services =>
        {
            var provider = new LabPrintoutConfigProvider(
                services.GetRequiredService<IRepository<LabSettings>>(),
                services.GetRequiredService<IWorkspaceProfileProvider>());
            return await provider.GetAsync(
                new LabRequisition { AccessionNumber = "ACC-PROFILE", PatientName = "Test Patient", TenantId = Tenant, LaboratoryId = LabInteropTestData.LabId }, default);
        });

        config.PrimaryColorHex.Should().Be("#0F766E");
    }

    [Fact]
    public async Task Report_letterhead_falls_back_to_the_product_accent_before_the_first_message()
    {
        using var host = new LabInteropHost();
        await host.SeedLabAsync();

        var config = await host.InLabScopeAsync(async services =>
        {
            var provider = new LabPrintoutConfigProvider(
                services.GetRequiredService<IRepository<LabSettings>>(),
                services.GetRequiredService<IWorkspaceProfileProvider>());
            return await provider.GetAsync(
                new LabRequisition { AccessionNumber = "ACC-PROFILE", PatientName = "Test Patient", TenantId = Tenant, LaboratoryId = LabInteropTestData.LabId }, default);
        });

        config.PrimaryColorHex.Should().Be("#5B21B6");
    }
}
