using System;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Facility;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ClinicEz.Shared.Tests.Interop;

/// <summary>
/// Challenger 2 empirical verification for Shared Contracts & Heartbeat Payload:
/// Asserts backward compatibility when IsWorkspaceEligible is omitted or null,
/// and verifies forwarding in FacilityHeartbeatService.
/// </summary>
public class FacilityHeartbeatContractChallengerTests
{
    [Fact]
    public void FacilityRegistryEntry_FourParameters_IsBackwardCompatible()
    {
        var tenantId = "tenant-1";
        var facilityId = Guid.NewGuid();
        var expiry = DateTime.UtcNow.AddDays(90);

        // Pre-existing 4-param call
        var entry = new FacilityRegistryEntry(tenantId, facilityId, FacilityType.Pharmacy, expiry);

        entry.TenantId.Should().Be(tenantId);
        entry.FacilityId.Should().Be(facilityId);
        entry.FacilityType.Should().Be(FacilityType.Pharmacy);
        entry.LicenseExpiresAt.Should().Be(expiry);
        entry.IsWorkspaceEligible.Should().BeNull();
    }

    [Theory]
    [InlineData(null)]
    [InlineData(true)]
    [InlineData(false)]
    public void FacilityRegistryEntry_FiveParameters_SetsEligibilityExplicitly(bool? eligible)
    {
        var tenantId = "tenant-2";
        var facilityId = Guid.NewGuid();

        var entry = new FacilityRegistryEntry(tenantId, facilityId, FacilityType.Clinic, null, eligible);

        entry.IsWorkspaceEligible.Should().Be(eligible);
    }

    [Fact]
    public async Task FacilityHeartbeatService_ForwardsIsWorkspaceEligibleToPayload()
    {
        using var h = new FacilityHarness();
        var clinicFacilityId = Guid.NewGuid();
        var labFacilityId = Guid.NewGuid();

        h.Data.Facilities.Clear();
        // 1. Clinic with IsWorkspaceEligible = true
        h.Data.Facilities.Add(new FacilityRegistryEntry(FacilityHarness.Tenant, clinicFacilityId, FacilityType.Clinic, null, IsWorkspaceEligible: true));
        // 2. Laboratory with default null (4 params)
        h.Data.Facilities.Add(new FacilityRegistryEntry(FacilityHarness.Tenant, labFacilityId, FacilityType.Laboratory, null));

        (await h.Heartbeat.RunOnceAsync(CancellationToken.None)).Should().Be(2);

        var outbox = await h.OutboxAsync();
        outbox.Should().HaveCount(2);

        var envelopes = outbox.Select(m => InteropEnvelope.FromJson(m.EnvelopeJson)).ToList();

        var clinicEnvelope = envelopes.Single(e => e.From.FacilityId == clinicFacilityId.ToString());
        var clinicPayload = clinicEnvelope.GetPayload<FacilityHeartbeatPayload>();
        clinicPayload.IsWorkspaceEligible.Should().BeTrue();

        var labEnvelope = envelopes.Single(e => e.From.FacilityId == labFacilityId.ToString());
        var labPayload = labEnvelope.GetPayload<FacilityHeartbeatPayload>();
        labPayload.IsWorkspaceEligible.Should().BeNull();
    }

    [Theory]
    [InlineData("{\"appVersion\": \"1.0.0\"}", null)]
    [InlineData("{\"appVersion\": \"1.0.0\", \"isWorkspaceEligible\": null}", null)]
    [InlineData("{\"appVersion\": \"1.0.0\", \"isWorkspaceEligible\": true}", true)]
    [InlineData("{\"appVersion\": \"1.0.0\", \"isWorkspaceEligible\": false}", false)]
    public void FacilityHeartbeatPayload_JsonRoundtrip_HandlesOmittedAndExplicitValues(string json, bool? expected)
    {
        var payload = JsonSerializer.Deserialize<FacilityHeartbeatPayload>(json, InteropJson.Options);
        payload.Should().NotBeNull();
        payload!.IsWorkspaceEligible.Should().Be(expected);
    }
}
