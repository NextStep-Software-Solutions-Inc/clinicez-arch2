using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Transport;
using FluentAssertions;

namespace ClinicEz.Interop.E2E.Support;

/// <summary>A facility of the test world: its tenant, its facility id (the facility's <c>ResourceId</c>) and type.</summary>
public sealed record Fac(string Tenant, Guid Id, FacilityType Type, string Name)
{
    public string FacilityId => Id.ToString();

    public Party Party => Party.ForFacility(Tenant, FacilityId, Type);

    public Party Billing => Party.ForFacility(Tenant, FacilityId, Type, InteropServices.Billing);

    public static Fac Clinic(string tenant, string name = "Clinic") => new(tenant, Guid.NewGuid(), FacilityType.Clinic, name);

    public static Fac Lab(string tenant, string name = "Lab") => new(tenant, Guid.NewGuid(), FacilityType.Laboratory, name);

    public static Fac Pharmacy(string tenant, string name = "Pharmacy") => new(tenant, Guid.NewGuid(), FacilityType.Pharmacy, name);
}

/// <summary>The real hub plus every facility service of one cell, each hosted from its real composition and talking to the hub over HTTP.</summary>
public sealed class TestCell : IAsyncDisposable
{
    public HubFixture Hub { get; } = HubFixture.Start();

    public ClinicHost Clinic { get; }

    public LabHost Lab { get; }

    public PharmacyHost Pharmacy { get; }

    public BillingServiceHost Billing { get; }

    public PatientHost Patient { get; }

    public TestCell()
    {
        Clinic = new ClinicHost(Hub);
        Lab = new LabHost(Hub);
        Pharmacy = new PharmacyHost(Hub);
        Billing = new BillingServiceHost(Hub);
        Patient = new PatientHost(Hub);
    }

    public IReadOnlyList<ServiceHostBase> Hosts => [Clinic, Lab, Pharmacy, Billing, Patient];

    /// <summary>Relays and polls every service until nothing is in flight.</summary>
    public Task PumpAsync() => Cell.PumpAsync(Hosts);

    /// <summary>
    /// What portal-api does when it creates a facility: registers it in the hub directory and issues its license to the facility's
    /// service, which provisions the facility and confirms back. Returns once the whole exchange has settled.
    /// </summary>
    public async Task<Fac> ProvisionAsync(Fac facility, FacilityVisibility visibility = FacilityVisibility.Private, bool acceptsExternal = true)
    {
        await Hub.UpsertFacilityAsync(facility.Party, visibility, facility.Name, acceptsExternal);

        var envelope = InteropEnvelope.Create(
            InteropTypes.FacilityLicenseIssued,
            Party.Portal,
            facility.Party,
            Guid.NewGuid(),
            new FacilityCreatedEvent
            {
                TenantId = facility.Tenant,
                ResourceId = facility.Id,
                FacilityType = facility.Type,
                Name = facility.Name,
                LicenseToken = "e2e-license-token",
                PlanTier = "Pro"
            });
        var results = await Hub.NewSdk(InteropServices.Portal).SendAsync([envelope], CancellationToken.None);
        results.Should().ContainSingle().Which.Status.Should().Be(SendResult.Accepted, results[0].Reason);

        await PumpAsync();
        return facility;
    }

    public async ValueTask DisposeAsync()
    {
        foreach (var host in Hosts) host.Dispose();
        await Hub.DisposeAsync();
    }
}
