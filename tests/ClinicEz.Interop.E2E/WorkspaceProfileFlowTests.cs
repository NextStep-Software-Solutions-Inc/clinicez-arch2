using ClinicEz.Interop.E2E.Support;
using ClinicEz.Portal.Application.Features.Integrations;
using ClinicEz.Portal.Application.Features.Workspace;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Transport;
using ClinicEz.Shared.Workspace;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using PortalDbContext = ClinicEz.Portal.Infrastructure.Persistence.ApplicationDbContext;
using PortalFacility = ClinicEz.Portal.Domain.Entities.Facility;
using PortalTenant = ClinicEz.Portal.Domain.Entities.Tenant;

namespace ClinicEz.Interop.E2E;

/// <summary>
/// The workspace profile is pushed, not fetched: portal publishes <c>workspace.profile.updated</c> with the full profile and each
/// facility service keeps its own copy, readable through <see cref="IWorkspaceProfileProvider"/> with no call back to the portal.
/// </summary>
public class WorkspaceProfileFlowTests
{
    private const string Tenant = "tenant-a";

    [Fact]
    public async Task PortalProfile_ReachesEveryFacilityService_AndNewerVersionsReplaceOlderOnes()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic(Tenant));
        var lab = await cell.ProvisionAsync(Fac.Lab(Tenant));
        var pharmacy = await cell.ProvisionAsync(Fac.Pharmacy(Tenant));
        var targets = new (ServiceHostBase Host, Fac Facility)[] { (cell.Clinic, clinic), (cell.Lab, lab), (cell.Pharmacy, pharmacy) };
        foreach (var (host, _) in targets) (await ProfileAsync(host)).Should().BeNull("no profile has been pushed yet");

        await PublishAsync(cell, targets.Select(t => t.Facility), Profile(version: 2, "Metro Health"));
        await cell.PumpAsync();

        foreach (var (host, _) in targets)
        {
            var held = await ProfileAsync(host);
            held.Should().NotBeNull($"{host.Service} stores the pushed profile");
            held!.DisplayName.Should().Be("Metro Health");
            held.Version.Should().Be(2);
            held.CurrencyCode.Should().Be("PHP");
        }

        await PublishAsync(cell, targets.Select(t => t.Facility), Profile(version: 1, "Stale Name"));
        await PublishAsync(cell, targets.Select(t => t.Facility), Profile(version: 3, "Metro Health Group"));
        await cell.PumpAsync();

        foreach (var (host, _) in targets) (await ProfileAsync(host))!.DisplayName.Should().Be("Metro Health Group", $"{host.Service} ignores an older version and applies a newer one");
        foreach (var host in cell.Hosts) await host.AssertNothingStuckAsync();
    }

    [Fact]
    public async Task ProfileOfAnotherTenant_AddressedToAFacility_IsNotStored()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic(Tenant));
        var other = Profile(version: 1, "Someone Else") with { TenantSlug = "tenant-b" };

        var envelope = InteropEnvelope.Create(
            InteropTypes.WorkspaceProfileUpdated,
            Party.Portal,
            clinic.Party,
            Guid.NewGuid(),
            new WorkspaceProfileUpdatedEvent { TenantId = "tenant-b", TenantSlug = "tenant-b", Version = 1, Profile = other });
        var results = await cell.Hub.NewSdk(InteropServices.Portal).SendAsync([envelope], CancellationToken.None);
        results.Should().ContainSingle().Which.Status.Should().Be(SendResult.Accepted, results[0].Reason);
        await cell.PumpAsync();

        (await ProfileAsync(cell.Clinic, "tenant-b")).Should().BeNull("a facility only takes the profile of its own tenant");
        (await ProfileAsync(cell.Clinic, Tenant)).Should().BeNull();
    }

    [Fact]
    public async Task TheRealPortalPublisher_AddressesAllFourFacilityTypes_AndEachHostedServiceStoresWhatItSends()
    {
        await using var cell = new TestCell();
        var tenantId = Guid.NewGuid();
        var tenant = tenantId.ToString();
        var clinic = await cell.ProvisionAsync(Fac.Clinic(tenant));
        var lab = await cell.ProvisionAsync(Fac.Lab(tenant));
        var pharmacy = await cell.ProvisionAsync(Fac.Pharmacy(tenant));
        var organization = new Fac(tenant, Guid.NewGuid(), FacilityType.Organization, "Head Office");

        var envelopes = await StagePortalProfileAsync(tenantId, [clinic, lab, pharmacy, organization]);

        envelopes.Select(e => e.To.FacilityType).Should().BeEquivalentTo(
            [FacilityType.Clinic, FacilityType.Laboratory, FacilityType.Pharmacy, FacilityType.Organization],
            "the portal tells every routable facility of the workspace");
        var portal = cell.Hub.NewSdk(InteropServices.Portal);
        foreach (var envelope in envelopes.Where(e => e.To.FacilityType != FacilityType.Organization))
        {
            var results = await portal.SendAsync([envelope], CancellationToken.None);
            results.Should().ContainSingle().Which.Status.Should().Be(SendResult.Accepted, results[0].Reason);
        }

        await cell.PumpAsync();

        foreach (var host in new ServiceHostBase[] { cell.Clinic, cell.Lab, cell.Pharmacy })
        {
            var held = await ProfileAsync(host, tenant);
            held.Should().NotBeNull($"{host.Service} accepts the portal's own message");
            held!.DisplayName.Should().Be("Metro Health");
            held.Version.Should().Be(7);
            held.TenantSlug.Should().Be("metro-health");
            held.DpoEmail.Should().Be("dpo@metro.example");
            (await ProfileAsync(host, "metro-health")).Should().BeEquivalentTo(held, "the profile is also readable by tenant slug");
        }

        envelopes.Select(e => e.GetPayload<WorkspaceProfileUpdatedEvent>().Profile).Distinct().Should().ContainSingle(
            "every facility type gets the same profile");
        foreach (var host in cell.Hosts) await host.AssertNothingStuckAsync();
    }

    private static async Task<List<InteropEnvelope>> StagePortalProfileAsync(Guid tenantId, IReadOnlyList<Fac> facilities)
    {
        await using var portal = new PortalDbContext(new DbContextOptionsBuilder<PortalDbContext>()
            .UseInMemoryDatabase($"e2e-portal-{Guid.NewGuid():N}").Options);
        var portalTenant = new PortalTenant { Id = tenantId, Name = "Metro Health Group", TenantSlug = "metro-health" };
        var settings = new WorkspaceSettings { TenantId = tenantId, BrandName = "Metro Health", ProfileVersion = 7, DpoEmail = "dpo@metro.example" };
        portal.Tenants.Add(portalTenant);
        portal.WorkspaceSettings.Add(settings);
        foreach (var facility in facilities)
        {
            portal.Facilities.Add(new PortalFacility
            {
                Id = facility.Id,
                TenantId = tenantId,
                Name = facility.Name,
                Slug = facility.Name.ToLowerInvariant().Replace(' ', '-'),
                FacilityType = facility.Type,
                Status = FacilityStatus.Active
            });
        }

        await portal.SaveChangesAsync();

        var captured = new CapturingPublisher();
        await new WorkspaceProfilePublisher(portal, captured, new WebhookDispatcher(portal)).StageUpdatedAsync(portalTenant, settings, CancellationToken.None);
        return captured.Sent;
    }

    private sealed class CapturingPublisher : IInteropPublisher
    {
        public List<InteropEnvelope> Sent { get; } = [];

        public InteropEnvelope Enqueue<T>(string type, Party from, Party to, Guid correlationId, T payload, int schemaVersion = 1, TimeSpan? ttl = null)
        {
            var envelope = InteropEnvelope.Create(type, from, to, correlationId, payload, schemaVersion, ttl);
            Enqueue(envelope);
            return envelope;
        }

        public void Enqueue(InteropEnvelope envelope) => Sent.Add(envelope);
    }

    private static async Task PublishAsync(TestCell cell, IEnumerable<Fac> facilities, WorkspaceProfile profile)
    {
        var portal = cell.Hub.NewSdk(InteropServices.Portal);
        foreach (var facility in facilities)
        {
            var envelope = InteropEnvelope.Create(
                InteropTypes.WorkspaceProfileUpdated,
                Party.Portal,
                facility.Party,
                Guid.NewGuid(),
                new WorkspaceProfileUpdatedEvent { TenantId = Tenant, TenantSlug = profile.TenantSlug, Version = profile.Version, Profile = profile });
            var results = await portal.SendAsync([envelope], CancellationToken.None);
            results.Should().ContainSingle().Which.Status.Should().Be(SendResult.Accepted, results[0].Reason);
        }
    }

    private static Task<WorkspaceProfile?> ProfileAsync(ServiceHostBase host, string tenant = Tenant) =>
        host.Provider.GetRequiredService<IWorkspaceProfileProvider>().GetAsync(tenant);

    private static WorkspaceProfile Profile(long version, string displayName) => new(
        Tenant, version, displayName, LogoUrl: null, AccentColorHex: "#0057B8", TimeZoneId: "Asia/Manila", Locale: "en-PH", DateFormat: "dd/MM/yyyy", CurrencyCode: "PHP");
}
