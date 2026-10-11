using ClinicEz.Organization.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Facility;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interop.Persistence;
using ClinicEz.Shared.Interoperability;
using ClinicEz.Shared.Licensing;
using ClinicEz.Organization.Infrastructure.Persistence;
using ClinicEz.Organization.Infrastructure.Services;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Organization.Tests;

/// <summary>
/// The organization's part of the shared entitlement machinery: the facility record written at provisioning, the license
/// store / facility registry on it, and the <c>entitlements.changed</c> and heartbeat wiring through the real dispatcher.
/// </summary>
public class OrganizationEntitlementsTests
{
    private const string Tenant = "tenant-org";
    private static readonly Guid OrganizationGuid = new("bbbbbbbb-0000-0000-0000-000000000001");
    private static Party OrganizationParty => Party.ForFacility(Tenant, OrganizationGuid.ToString(), FacilityType.Organization);

    private static string Token(int version, DateTime? expires = null, string plan = "Standard", Guid? facilityId = null) =>
        new FacilityLicenseSigner().SignLicense(new FacilityLicensePayload
        {
            FacilityId = facilityId ?? OrganizationGuid,
            TenantId = Tenant,
            FacilityName = "Northern Health Network",
            FacilityType = "Organization",
            PlanTier = plan,
            EntitlementVersion = version,
            ExpiresAtUtc = expires ?? DateTime.UtcNow.AddDays(30)
        });

    private static OrganizationFacility Facility(
        string? token = null, int version = 0, bool deleted = false, Guid? id = null, string tenant = Tenant) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenant,
        FacilityId = id ?? OrganizationGuid,
        Name = "Northern Health Network",
        LicenseToken = token,
        EntitlementVersion = version,
        IsDeleted = deleted,
        CreatedAt = DateTime.UtcNow,
        CreatedBy = "test"
    };

    private static InteropEnvelope Provisioning(string name, string? token = null, string? plan = null, DateTime? expires = null) =>
        InteropEnvelope.Create(InteropTypes.FacilityLicenseIssued, Party.Portal, OrganizationParty, Guid.NewGuid(), new FacilityCreatedEvent
        {
            TenantId = Tenant,
            ResourceId = OrganizationGuid,
            FacilityType = FacilityType.Organization,
            Name = name,
            LicenseToken = token,
            PlanTier = plan,
            LicenseExpiresAt = expires
        });

    private static InteropEnvelope Entitlements(string token, Party? from = null) =>
        InteropEnvelope.Create(
            InteropTypes.EntitlementsChanged,
            from ?? Party.Portal,
            OrganizationParty,
            Guid.NewGuid(),
            new EntitlementsChangedEvent { TenantId = Tenant, FacilityId = OrganizationGuid, LicenseToken = token });

    private static async Task SeedAsync(OrganizationInteropHost host, params OrganizationFacility[] facilities)
    {
        using var scope = host.Provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.OrganizationFacilities.AddRange(facilities);
        await db.SaveChangesAsync();
    }

    private static async Task<List<OrganizationFacility>> ReadFacilitiesAsync(OrganizationInteropHost host)
    {
        using var scope = host.Provider.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>()
            .OrganizationFacilities.AsNoTracking().ToListAsync();
    }

    // ── provisioning ────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Provisioning_RecordsTheOrganization_WithItsLicense_AndAcknowledgesInTheSameCommit()
    {
        using var host = new OrganizationInteropHost();
        var token = Token(version: 0);
        var expiry = new DateTime(2027, 3, 1, 0, 0, 0, DateTimeKind.Utc);

        (await host.Dispatcher.DispatchAsync(Provisioning("Northern Health Network", token, "Enterprise", expiry), default))
            .Outcome.Should().Be(DispatchOutcome.Handled);

        var saved = (await ReadFacilitiesAsync(host)).Should().ContainSingle().Subject;
        saved.TenantId.Should().Be(Tenant);
        saved.FacilityId.Should().Be(OrganizationGuid);
        saved.Name.Should().Be("Northern Health Network");
        saved.LicenseToken.Should().Be(token);
        saved.PlanTier.Should().Be("Enterprise");
        saved.LicenseExpiresAt.Should().Be(expiry);
        (await host.OutboxAsync()).Should().ContainSingle().Which.Type.Should().Be(InteropTypes.FacilityProvisioned);
    }

    [Fact]
    public async Task Provisioning_AgainForTheSameOrganization_UpdatesTheRecord_AndKeepsTheHeldLicenseWhenNoneIsSupplied()
    {
        using var host = new OrganizationInteropHost();
        await SeedAsync(host, Facility("held-token", version: 3));

        await host.Dispatcher.DispatchAsync(Provisioning("Renamed Network"), default);

        var saved = (await ReadFacilitiesAsync(host)).Should().ContainSingle().Subject;
        saved.Name.Should().Be("Renamed Network");
        saved.LicenseToken.Should().Be("held-token");
        saved.EntitlementVersion.Should().Be(3);
    }

    // ── store + registry ────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Store_ReadsAndReplacesTheLicense()
    {
        using var host = new OrganizationInteropHost();
        await SeedAsync(host, Facility("old-token", version: 1));
        var token = Token(version: 4, plan: "Enterprise", expires: new DateTime(2027, 5, 1, 0, 0, 0, DateTimeKind.Utc));
        var payload = new FacilityLicenseValidator(FacilityLicenseValidator.DefaultAuthorityPublicKeyPem)
            .Validate(token, OrganizationGuid, Tenant).Payload!;

        using var scope = host.Provider.CreateScope();
        var store = scope.ServiceProvider.GetRequiredService<IFacilityLicenseStore>();

        (await store.GetAsync(Tenant, OrganizationGuid, default)).Should().Be(new HeldFacilityLicense("old-token", 1));
        await store.SaveAsync(Tenant, OrganizationGuid, new FacilityLicenseUpdate(token, payload), default);

        var saved = (await ReadFacilitiesAsync(host)).Should().ContainSingle().Subject;
        saved.LicenseToken.Should().Be(token);
        saved.EntitlementVersion.Should().Be(4);
        saved.PlanTier.Should().Be("Enterprise");
        saved.LicenseExpiresAt.Should().Be(new DateTime(2027, 5, 1, 0, 0, 0, DateTimeKind.Utc));
    }

    [Fact]
    public async Task Store_DoesNotHoldOtherTenantsOrUnprovisionedOrDeletedOrganizations()
    {
        using var host = new OrganizationInteropHost();
        var deleted = Guid.NewGuid();
        await SeedAsync(host, Facility("t"), Facility("gone", deleted: true, id: deleted));

        using var scope = host.Provider.CreateScope();
        var store = scope.ServiceProvider.GetRequiredService<IFacilityLicenseStore>();

        (await store.GetAsync("tenant-other", OrganizationGuid, default)).Should().BeNull();
        (await store.GetAsync(Tenant, Guid.NewGuid(), default)).Should().BeNull();
        (await store.GetAsync(Tenant, deleted, default)).Should().BeNull();
    }

    [Fact]
    public async Task Registry_ListsEveryProvisionedOrganization_WithItsLicenseExpiry()
    {
        using var host = new OrganizationInteropHost();
        var expiry = new DateTime(2027, 2, 1, 0, 0, 0, DateTimeKind.Utc);
        var second = Guid.NewGuid();
        var first = Facility("a");
        first.LicenseExpiresAt = expiry;
        await SeedAsync(host, first, Facility("b", id: second, tenant: "tenant-two"), Facility("c", deleted: true, id: Guid.NewGuid()));

        using var scope = host.Provider.CreateScope();
        var entries = await scope.ServiceProvider.GetRequiredService<IFacilityRegistry>().ListAsync(default);

        entries.Should().BeEquivalentTo(new[]
        {
            new FacilityRegistryEntry(Tenant, OrganizationGuid, FacilityType.Organization, expiry),
            new FacilityRegistryEntry("tenant-two", second, FacilityType.Organization, null)
        });
    }

    // ── entitlements.changed + heartbeat through the real dispatcher ────────────────────

    [Fact]
    public async Task EntitlementsChanged_FromThePortal_UpdatesTheOrganizationsLicense_AndIgnoresStaleOnes()
    {
        using var host = new OrganizationInteropHost();
        await SeedAsync(host, Facility("old", version: 1));
        var current = Token(version: 3, plan: "Enterprise");

        (await host.Dispatcher.DispatchAsync(Entitlements(current), default)).Outcome.Should().Be(DispatchOutcome.Handled);
        (await host.Dispatcher.DispatchAsync(Entitlements(Token(version: 2)), default)).Outcome.Should().Be(DispatchOutcome.Handled);

        var saved = (await ReadFacilitiesAsync(host)).Should().ContainSingle().Subject;
        saved.LicenseToken.Should().Be(current);
        saved.EntitlementVersion.Should().Be(3);
        saved.PlanTier.Should().Be("Enterprise");
    }

    [Fact]
    public async Task EntitlementsChanged_AfterProvisioningWithoutAVersion_IsAccepted()
    {
        using var host = new OrganizationInteropHost();
        await host.Dispatcher.DispatchAsync(Provisioning("Northern Health Network"), default);
        var renewed = Token(version: 1);

        await host.Dispatcher.DispatchAsync(Entitlements(renewed), default);

        (await ReadFacilitiesAsync(host)).Should().ContainSingle().Which.LicenseToken.Should().Be(renewed);
    }

    [Fact]
    public async Task EntitlementsChanged_FromAFacility_OrWithAForeignSignature_ChangesNothing()
    {
        using var host = new OrganizationInteropHost();
        await SeedAsync(host, Facility("old", version: 1));
        var clinic = Party.ForFacility("tenant-x", Guid.NewGuid().ToString(), FacilityType.Clinic);
        var foreign = new FacilityLicenseSigner(
                System.Security.Cryptography.ECDsa.Create(System.Security.Cryptography.ECCurve.NamedCurves.nistP256).ExportECPrivateKeyPem())
            .SignLicense(new FacilityLicensePayload { FacilityId = OrganizationGuid, TenantId = Tenant, EntitlementVersion = 9 });

        await host.Dispatcher.DispatchAsync(Entitlements(Token(version: 5), from: clinic), default);
        await host.Dispatcher.DispatchAsync(Entitlements(foreign), default);

        (await ReadFacilitiesAsync(host)).Should().ContainSingle().Which.LicenseToken.Should().Be("old");
    }

    [Fact]
    public async Task Heartbeat_QueuesOneMessagePerProvisionedOrganization_FromTheOrganizationToThePortal()
    {
        using var host = new OrganizationInteropHost();
        await SeedAsync(host, Facility("t"));

        (await host.Provider.GetRequiredService<FacilityHeartbeatService>().RunOnceAsync(default)).Should().Be(1);

        var outbox = (await host.OutboxAsync()).Should().ContainSingle().Subject;
        outbox.Type.Should().Be(InteropTypes.FacilityHeartbeat);
        var envelope = InteropEnvelope.FromJson(outbox.EnvelopeJson);
        envelope.From.Should().Be(OrganizationParty);
        envelope.To.Should().Be(Party.Portal);
    }
}
