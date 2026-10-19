using System.Net;
using ClinicEz.Interop.Application;
using ClinicEz.Interop.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop.Contracts;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Interop.Tests;

public class DirectoryTests
{
    private static string[] Ids(IEnumerable<DirectoryFacilityDto> facilities) =>
        facilities.Select(f => f.FacilityId).OrderBy(id => id, StringComparer.Ordinal).ToArray();

    [Fact]
    public async Task A_workspace_sees_its_own_facilities_and_no_private_or_unlinked_network_ones()
    {
        await using var hub = await HubApp.StartCloudAsync();

        var visible = await hub.ListFacilitiesAsync("clinic", W.TenantA);

        Ids(visible).Should().Equal("a-clinic", "a-lab", "a-pharm");
        visible.Should().OnlyContain(f => f.IsOwnWorkspace && f.LinkStatus == null);
    }

    [Fact]
    public async Task An_active_link_reveals_a_network_facility_with_its_link_status_but_never_a_private_one()
    {
        await using var hub = await HubApp.StartCloudAsync();
        await hub.UpsertLinkAsync(Guid.NewGuid(), W.A1Clinic, W.B1Lab);
        await hub.UpsertLinkAsync(Guid.NewGuid(), W.A1Clinic, W.B2Clinic);

        var visible = await hub.ListFacilitiesAsync("clinic", W.TenantA);

        Ids(visible).Should().Equal("a-clinic", "a-lab", "a-pharm", "b-lab");
        var lab = visible.Single(f => f.FacilityId == "b-lab");
        lab.IsOwnWorkspace.Should().BeFalse();
        lab.LinkStatus.Should().Be(LinkStatus.Active);
        lab.Visibility.Should().Be(FacilityVisibility.Network);
        lab.City.Should().Be("Cebu");
    }

    [Theory]
    [InlineData(LinkStatus.Pending)]
    [InlineData(LinkStatus.Revoked)]
    [InlineData(LinkStatus.Rejected)]
    public async Task A_link_that_is_not_active_does_not_reveal_a_network_facility(LinkStatus status)
    {
        await using var hub = await HubApp.StartCloudAsync();
        await hub.UpsertLinkAsync(Guid.NewGuid(), W.A1Clinic, W.B1Lab, status);

        Ids(await hub.ListFacilitiesAsync("clinic", W.TenantA)).Should().NotContain("b-lab");
    }

    [Fact]
    public async Task Public_facilities_are_listed_for_everybody_with_the_link_status_of_a_pending_request()
    {
        await using var hub = await HubApp.StartCloudAsync();
        await hub.UpsertFacilityAsync(W.B2Clinic, FacilityVisibility.Public);
        await hub.UpsertLinkAsync(Guid.NewGuid(), W.A1Clinic, W.B2Clinic, LinkStatus.Pending);

        var visible = await hub.ListFacilitiesAsync("clinic", W.TenantA);

        visible.Single(f => f.FacilityId == "b-clinic").LinkStatus.Should().Be(LinkStatus.Pending);
        Ids(await hub.ListFacilitiesAsync("lab", W.TenantB)).Should().Contain("b-clinic").And.NotContain("a-clinic");
    }

    [Fact]
    public async Task Inactive_facilities_are_hidden()
    {
        await using var hub = await HubApp.StartCloudAsync();
        await hub.UpsertFacilityAsync(W.A3Pharmacy, FacilityVisibility.Private, active: false);

        Ids(await hub.ListFacilitiesAsync("clinic", W.TenantA)).Should().Equal("a-clinic", "a-lab");
    }

    [Fact]
    public async Task Facilities_can_be_filtered_by_type_name_and_city()
    {
        await using var hub = await HubApp.StartCloudAsync();
        await hub.UpsertFacilityAsync(W.A3Pharmacy, FacilityVisibility.Private, city: "Cebu", name: "Sunrise Pharmacy");

        Ids(await hub.ListFacilitiesAsync("clinic", W.TenantA, "type=laboratory")).Should().Equal("a-lab");
        Ids(await hub.ListFacilitiesAsync("clinic", W.TenantA, "type=Pharmacy")).Should().Equal("a-pharm");
        Ids(await hub.ListFacilitiesAsync("clinic", W.TenantA, "q=SUNRISE")).Should().Equal("a-pharm");
        Ids(await hub.ListFacilitiesAsync("clinic", W.TenantA, "city=cebu")).Should().Equal("a-pharm");
        Ids(await hub.ListFacilitiesAsync("clinic", W.TenantA, "city=Manila&type=clinic")).Should().Equal("a-clinic");
        (await hub.GetFacilitiesAsync("clinic", W.TenantA, "type=spaceship")).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task The_cloud_cell_needs_a_tenant_that_belongs_to_it_given_as_header_or_query()
    {
        await using var hub = await HubApp.StartCloudAsync();

        (await hub.GetFacilitiesAsync("clinic")).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await hub.GetFacilitiesAsync("clinic", W.TenantE)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await hub.GetFacilitiesAsync("clinic", "nobody")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await hub.GetFacilitiesAsync("clinic", W.TenantB)).StatusCode.Should().Be(HttpStatusCode.OK);
        Ids(await (await hub.GetFacilitiesAsync("clinic", W.TenantB, tenantInQuery: true)).ReadAsync<List<DirectoryFacilityDto>>()).Should().Equal("b-clinic", "b-lab");
    }

    [Fact]
    public async Task An_edge_cell_client_has_its_workspace_derived_from_its_cell()
    {
        await using var hub = await HubApp.StartCloudAsync();

        Ids(await hub.ListFacilitiesAsync("edge-hub")).Should().Equal("e-clinic", "e-lab");
        (await hub.GetFacilitiesAsync("edge-hub", W.TenantA)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task The_control_plane_sees_everything_and_the_patient_plane_only_public_facilities()
    {
        await using var hub = await HubApp.StartCloudAsync();

        Ids(await hub.ListFacilitiesAsync("portal")).Should().HaveCount(7);
        Ids(await hub.ListFacilitiesAsync("portal", W.TenantB)).Should().Equal("b-clinic", "b-lab");
        (await hub.ListFacilitiesAsync("patient")).Should().BeEmpty();

        await hub.UpsertFacilityAsync(W.B1Lab, FacilityVisibility.Public);
        Ids(await hub.ListFacilitiesAsync("patient")).Should().Equal("b-lab");
    }

    [Fact]
    public async Task The_directory_requires_credentials()
    {
        await using var hub = await HubApp.StartCloudAsync();

        (await hub.Raw().GetAsync("/v1/directory/facilities")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await hub.Raw().GetAsync("/v1/directory/snapshot")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task The_snapshot_is_for_edge_cells_only_and_unchanged_when_the_version_is_current()
    {
        await using var hub = await HubApp.StartCloudAsync();
        await hub.UpsertLinkAsync(Guid.NewGuid(), W.E1Clinic, W.B1Lab);

        (await hub.RawAs("clinic").GetAsync("/v1/directory/snapshot")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await hub.RawAs("portal").GetAsync("/v1/directory/snapshot")).StatusCode.Should().Be(HttpStatusCode.Forbidden);

        var full = await (await hub.RawAs("edge-hub").GetAsync("/v1/directory/snapshot")).ReadAsync<DirectorySnapshotDto>();
        full.Unchanged.Should().BeFalse();
        full.Version.Should().BeGreaterThan(0);
        full.Facilities.Select(f => f.FacilityId).Should().BeEquivalentTo("e-clinic", "e-lab", "b-lab");
        full.Links.Should().ContainSingle();
        full.Cells.Select(c => c.CellId).Should().BeEquivalentTo("cloud", "edge-1");

        var current = await (await hub.RawAs("edge-hub").GetAsync($"/v1/directory/snapshot?sinceVersion={full.Version}")).ReadAsync<DirectorySnapshotDto>();
        current.Unchanged.Should().BeTrue();
        current.Version.Should().Be(full.Version);
        current.Facilities.Should().BeEmpty();

        await hub.UpsertFacilityAsync(W.B1Lab, FacilityVisibility.Network, city: "Iloilo");
        var changed = await (await hub.RawAs("edge-hub").GetAsync($"/v1/directory/snapshot?sinceVersion={full.Version}")).ReadAsync<DirectorySnapshotDto>();
        changed.Unchanged.Should().BeFalse();
        changed.Version.Should().BeGreaterThan(full.Version);
        changed.Facilities.Single(f => f.FacilityId == "b-lab").City.Should().Be("Iloilo");
    }

    [Fact]
    public async Task The_directory_feed_is_idempotent_and_every_change_bumps_the_version()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var before = (await (await hub.RawAs("edge-hub").GetAsync("/v1/directory/snapshot")).ReadAsync<DirectorySnapshotDto>()).Version;

        await hub.UpsertFacilityAsync(W.E1Clinic, FacilityVisibility.Network, cell: W.EdgeCell, city: "Davao");
        await hub.UpsertFacilityAsync(W.E1Clinic, FacilityVisibility.Network, cell: W.EdgeCell, city: "Davao");

        var after = (await (await hub.RawAs("edge-hub").GetAsync("/v1/directory/snapshot")).ReadAsync<DirectorySnapshotDto>()).Version;
        after.Should().Be(before + 2);
        (await hub.DbAsync(db => db.Facilities.CountAsync())).Should().Be(7);
    }
}
