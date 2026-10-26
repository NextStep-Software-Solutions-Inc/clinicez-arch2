using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Interop.E2E.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Transport;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace ClinicEz.Interop.E2E;

/// <summary>
/// E2E Verification for Requirement R1, R7, R8 and Scenario 28:
/// Edge Cell & Directory Bootstrap:
/// - Directory updates support and propagate BranchId for physical branch channel scoping
/// - Edge cells register comms clients and verify key distribution
/// </summary>
public class CommsEdgeDirectoryBootstrapTests
{
    [Fact]
    public async Task DirectoryFacilityUpsert_PropagatesBranchId_ToHubDirectory()
    {
        await using var cell = new TestCell();
        var clinic = Fac.Clinic("tenant-branch-test", "Branch Clinic 01");
        var branchId = "branch-north-wing";

        var sdk = cell.Hub.NewSdk(InteropServices.Portal);
        var envelope = InteropEnvelope.Create(
            InteropTypes.DirectoryFacilityUpserted,
            Party.Portal,
            Party.Hub,
            Guid.NewGuid(),
            new DirectoryFacilityUpsertedPayload
            {
                TenantId = clinic.Tenant,
                FacilityId = clinic.FacilityId,
                FacilityType = clinic.Type,
                CellId = HubFixture.CloudCell,
                DisplayName = clinic.Name,
                Visibility = FacilityVisibility.Private,
                AcceptsExternalRequests = true,
                Active = true,
                BranchId = branchId
            });

        var results = await sdk.SendAsync([envelope], CancellationToken.None);
        results.Should().ContainSingle().Which.Status.Should().Be(SendResult.Accepted);

        // Verify facility row in hub database contains the correct BranchId
        var facilityRow = await cell.Hub.DbAsync(db => db.Facilities
            .SingleOrDefaultAsync(f => f.TenantId == clinic.Tenant && f.FacilityId == clinic.FacilityId));

        facilityRow.Should().NotBeNull();
        facilityRow!.BranchId.Should().Be(branchId, "BranchId must be persisted to enable branch-scoped conversation filtering");
    }

    [Fact]
    public async Task Hub_ExposesCommsAndMediaClientSignerKeys_ViaKeyEndpoint()
    {
        await using var cell = new TestCell();

        var keyClient = cell.Hub.NewKeyClient();

        // 1. Check Comms client key
        var commsClientId = HubFixture.ClientId(InteropServices.Comms);
        var commsKey = await keyClient.GetSignerKeyAsync(commsClientId, CancellationToken.None);

        commsKey.Should().NotBeNull();
        commsKey!.ClientId.Should().Be(commsClientId);
        commsKey.Service.Should().Be(InteropServices.Comms);
        commsKey.PublicKey.Should().NotBeNullOrWhiteSpace();
        commsKey.Revoked.Should().BeFalse();

        // 2. Check Media client key
        var mediaClientId = HubFixture.ClientId(InteropServices.Media);
        var mediaKey = await keyClient.GetSignerKeyAsync(mediaClientId, CancellationToken.None);

        mediaKey.Should().NotBeNull();
        mediaKey!.ClientId.Should().Be(mediaClientId);
        mediaKey.Service.Should().Be(InteropServices.Media);
        mediaKey.Kind.Should().Be(HubClientKind.PlatformService);
        mediaKey.PublicKey.Should().NotBeNullOrWhiteSpace();
        mediaKey.Revoked.Should().BeFalse();
    }
}
