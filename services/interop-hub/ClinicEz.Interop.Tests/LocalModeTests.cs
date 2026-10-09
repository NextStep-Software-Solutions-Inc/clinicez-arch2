using System.Net;
using System.Net.Http.Json;
using ClinicEz.Interop.Application;
using ClinicEz.Interop.Application.Abstractions;
using ClinicEz.Interop.Application.Messaging;
using ClinicEz.Interop.Application.Local;
using ClinicEz.Interop.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Transport;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Interop.Tests;

/// <summary>A cloud hub and the local hub of tenant-e's edge cell, wired together through a switch that can cut the line.</summary>
internal sealed class Federation : IAsyncDisposable
{
    private Federation(HubApp cloud, HubApp local, UpstreamSwitch upstream)
    {
        Cloud = cloud;
        Local = local;
        Upstream = upstream;
    }

    public HubApp Cloud { get; }
    public HubApp Local { get; }
    public UpstreamSwitch Upstream { get; }

    public static async Task<Federation> StartAsync(bool requireSigning = false)
    {
        Dictionary<string, string?>? overrides = requireSigning ? new() { ["Hub:Signing:Required"] = "true" } : null;
        var cloud = await HubApp.StartCloudAsync(overrides);
        var upstream = new UpstreamSwitch();
        upstream.ConnectTo(cloud);
        var local = await HubApp.StartLocalAsync(upstream, overrides: overrides);
        return new Federation(cloud, local, upstream);
    }

    public Task<int> ForwardAsync() => RunAsync<OutboundForwarder, int>(f => f.RunOnceAsync(CancellationToken.None));

    public Task<int> PullCellInboxAsync() => RunAsync<CellInboxPuller, int>(p => p.RunOnceAsync(0, CancellationToken.None));

    public Task<bool> SyncDirectoryAsync() => RunAsync<DirectorySyncer, bool>(s => s.RunOnceAsync(CancellationToken.None));

    private async Task<TResult> RunAsync<TService, TResult>(Func<TService, Task<TResult>> run) where TService : notnull
    {
        using var scope = Local.Services.CreateScope();
        return await run(scope.ServiceProvider.GetRequiredService<TService>());
    }

    public async ValueTask DisposeAsync()
    {
        await Local.DisposeAsync();
        await Cloud.DisposeAsync();
    }
}

public class LocalModeTests
{
    private const string Order = InteropTypes.LabOrderIssued;

    [Fact]
    public async Task Same_cell_messages_are_delivered_on_the_LAN_and_never_touch_the_cloud()
    {
        await using var f = await Federation.StartAsync();
        var envelope = W.Env(Order, W.E1Clinic, W.E2Lab);

        (await f.Local.SendAsync("local-clinic", envelope)).Status.Should().Be(SendResult.Accepted);

        (await f.Local.PullAsync("local-lab", "laboratory")).Should().ContainSingle().Which.Envelope.MessageId.Should().Be(envelope.MessageId);
        f.Upstream.Requests.Should().Be(0);
        (await f.Local.OutboundCountAsync()).Should().Be(0);
        (await f.Cloud.MessageCountAsync()).Should().Be(0);
        (await f.ForwardAsync()).Should().Be(0);
        f.Upstream.Requests.Should().Be(0, "an empty outbound queue does not call the cloud");
    }

    [Fact]
    public async Task The_local_hub_still_checks_that_a_client_speaks_for_its_own_cell()
    {
        await using var f = await Federation.StartAsync();

        (await f.Local.SendAsync("local-clinic", W.Env(Order, W.A1Clinic, W.E2Lab))).Status.Should().Be(SendResult.Rejected);
        (await f.Local.SendAsync("local-clinic", W.Env("clinic.note", Party.Portal, W.E2Lab))).Status.Should().Be(SendResult.Rejected);
        await f.Local.Sdk("local-clinic").PullAsync("laboratory", 10, 0, CancellationToken.None).ShouldFailWithAsync(HttpStatusCode.Forbidden);
        (await f.Local.Raw("local-clinic", "wrong").GetAsync("/v1/inbox?service=clinic")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        f.Upstream.Requests.Should().Be(0);
    }

    [Fact]
    public async Task A_message_for_another_cell_is_queued_and_forwarded_to_the_cloud_when_it_is_up()
    {
        await using var f = await Federation.StartAsync();
        await f.Cloud.UpsertLinkAsync(Guid.NewGuid(), W.E1Clinic, W.B1Lab);
        var envelope = W.Env(Order, W.E1Clinic, W.B1Lab);

        (await f.Local.SendAsync("local-clinic", envelope)).Status.Should().Be(SendResult.Accepted);
        (await f.Local.OutboundCountAsync()).Should().Be(1);
        (await f.Cloud.PullAsync("lab", "laboratory")).Should().BeEmpty("nothing is sent until the forwarder runs");

        (await f.ForwardAsync()).Should().Be(1);

        (await f.Local.OutboundCountAsync()).Should().Be(0);
        var delivered = (await f.Cloud.PullAsync("lab", "laboratory")).Single().Envelope;
        delivered.MessageId.Should().Be(envelope.MessageId);
        delivered.From.FacilityId.Should().Be("e-clinic");
    }

    [Fact]
    public async Task Messages_for_the_portal_and_patients_are_forwarded_too()
    {
        await using var f = await Federation.StartAsync();
        (await f.Local.SendAsync("local-clinic", W.Env(InteropTypes.NotificationEmailRequested, W.E1Clinic, Party.Portal))).Status.Should().Be(SendResult.Accepted);
        (await f.Local.SendAsync("local-clinic", W.Env(InteropTypes.ClinicAppointmentUpdated, W.E1Clinic, Party.ForPatient("p1")))).Status.Should().Be(SendResult.Accepted);

        (await f.ForwardAsync()).Should().Be(2);

        (await f.Cloud.PullAsync("portal", "portal")).Should().ContainSingle();
        (await f.Cloud.PullAsync("patient", "patient")).Should().ContainSingle();
    }

    [Fact]
    public async Task A_message_the_cloud_already_has_settles_as_a_duplicate()
    {
        await using var f = await Federation.StartAsync();
        await f.Cloud.UpsertLinkAsync(Guid.NewGuid(), W.E1Clinic, W.B1Lab);
        var envelope = W.Env(Order, W.E1Clinic, W.B1Lab);
        await f.Local.SendAsync("local-clinic", envelope);
        await f.ForwardAsync();

        (await f.Local.SendAsync("local-clinic", envelope)).Status.Should().Be(SendResult.Accepted, "the local queue no longer remembers it");
        (await f.ForwardAsync()).Should().Be(1);

        (await f.Local.OutboundCountAsync()).Should().Be(0);
        (await f.Cloud.MessageCountAsync()).Should().Be(1);
        (await f.Cloud.PullAsync("lab", "laboratory")).Should().ContainSingle();
    }

    [Fact]
    public async Task A_message_the_cloud_rejects_is_dead_lettered_locally_and_not_retried()
    {
        await using var f = await Federation.StartAsync();
        var envelope = W.Env(Order, W.E1Clinic, W.B1Lab);
        await f.Local.SendAsync("local-clinic", envelope);

        (await f.ForwardAsync()).Should().Be(1, "a verdict, even a rejection, settles the row");

        var row = await f.Local.DbAsync(db => db.Outbound.AsNoTracking().SingleAsync());
        row.DeadLetteredAtUtc.Should().NotBeNull();
        row.LastError.Should().Contain("No active link");
        var requests = f.Upstream.Requests;
        (await f.ForwardAsync()).Should().Be(0);
        f.Upstream.Requests.Should().Be(requests);
    }

    [Fact]
    public async Task While_the_cloud_is_down_messages_wait_with_backoff_and_leave_in_order_per_correlation_when_it_returns()
    {
        await using var f = await Federation.StartAsync();
        await f.Cloud.UpsertLinkAsync(Guid.NewGuid(), W.E1Clinic, W.B1Lab);
        var correlationA = Guid.NewGuid();
        var first = W.Env(Order, W.E1Clinic, W.B1Lab, correlationA);
        var second = W.Env(Order, W.E1Clinic, W.B1Lab, correlationA);
        var other = W.Env(Order, W.E1Clinic, W.B1Lab, Guid.NewGuid());
        f.Upstream.Up = false;
        foreach (var envelope in new[] { first, second, other })
            (await f.Local.SendAsync("local-clinic", envelope)).Status.Should().Be(SendResult.Accepted, "local clients are never blocked by an outage");

        (await f.ForwardAsync()).Should().Be(0);
        f.Upstream.Requests.Should().Be(1, "one attempt carries the head of each correlation");
        (await f.Local.OutboundCountAsync()).Should().Be(3);
        (await f.Cloud.MessageCountAsync()).Should().Be(0);

        (await f.ForwardAsync()).Should().Be(0);
        f.Upstream.Requests.Should().Be(1, "the rows are backing off");

        f.Local.Clock.Advance(TimeSpan.FromSeconds(3));
        (await f.ForwardAsync()).Should().Be(0);
        f.Upstream.Requests.Should().Be(2, "the first backoff is 2 seconds");
        f.Local.Clock.Advance(TimeSpan.FromSeconds(3));
        (await f.ForwardAsync()).Should().Be(0);
        f.Upstream.Requests.Should().Be(2, "the second backoff is 4 seconds");

        f.Upstream.Up = true;
        f.Local.Clock.Advance(TimeSpan.FromSeconds(10));
        (await f.ForwardAsync()).Should().Be(2);

        var firstBatch = await f.Cloud.PullAsync("lab", "laboratory");
        firstBatch.Select(m => m.Envelope.MessageId).Should().Equal(first.MessageId, other.MessageId);
        (await f.Local.OutboundCountAsync()).Should().Be(1);

        (await f.ForwardAsync()).Should().Be(1);
        (await f.Cloud.PullAsync("lab", "laboratory")).Select(m => m.Envelope.MessageId).Should().Equal(second.MessageId);
        (await f.Local.OutboundCountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task A_queued_message_that_expires_during_an_outage_is_dropped_instead_of_sent()
    {
        await using var f = await Federation.StartAsync();
        await f.Cloud.UpsertLinkAsync(Guid.NewGuid(), W.E1Clinic, W.B1Lab);
        var shortLived = InteropEnvelope.Create(Order, W.E1Clinic, W.B1Lab, Guid.NewGuid(), new { }, ttl: TimeSpan.FromMinutes(1));
        f.Upstream.Up = false;
        await f.Local.SendAsync("local-clinic", shortLived);

        f.Upstream.Up = true;
        f.Local.Clock.Advance(TimeSpan.FromMinutes(5));
        (await f.ForwardAsync()).Should().Be(1);

        (await f.Cloud.MessageCountAsync()).Should().Be(0);
        (await f.Local.DbAsync(db => db.Outbound.AsNoTracking().SingleAsync())).LastError.Should().Be("expired");
    }

    [Fact]
    public async Task Cloud_messages_for_an_edge_facility_are_pulled_from_the_cell_inbox_and_fanned_out_to_local_mailboxes()
    {
        await using var f = await Federation.StartAsync();
        await f.Cloud.UpsertLinkAsync(Guid.NewGuid(), W.A1Clinic, W.E2Lab);
        var toLab = W.Env(Order, W.A1Clinic, W.E2Lab);
        (await f.Cloud.SendAsync("clinic", toLab)).Status.Should().Be(SendResult.Accepted);
        (await f.Cloud.SendAsync("clinic", W.Env("clinic.note", W.A1Clinic, W.A2Lab))).Status.Should().Be(SendResult.Accepted);

        (await f.PullCellInboxAsync()).Should().Be(1);

        var local = (await f.Local.PullAsync("local-lab", "laboratory")).Single();
        local.Envelope.MessageId.Should().Be(toLab.MessageId);
        local.Envelope.From.FacilityId.Should().Be("a-clinic");
        (await f.Local.PullAsync("local-clinic", "clinic")).Should().BeEmpty();
        var cloudRow = await f.Cloud.MessageRowAsync(toLab.MessageId);
        cloudRow.AckedAtUtc.Should().NotBeNull("the cloud copy is purged once the local mailbox has it");
        cloudRow.Envelope.Should().BeEmpty();
        (await f.PullCellInboxAsync()).Should().Be(0);
    }

    [Fact]
    public async Task A_reply_from_the_edge_facility_travels_back_through_the_outbound_queue()
    {
        await using var f = await Federation.StartAsync();
        await f.Cloud.UpsertLinkAsync(Guid.NewGuid(), W.A1Clinic, W.E2Lab);
        var correlation = Guid.NewGuid();
        await f.Cloud.SendAsync("clinic", W.Env(Order, W.A1Clinic, W.E2Lab, correlation));
        await f.PullCellInboxAsync();
        (await f.Local.PullAsync("local-lab", "laboratory")).Should().ContainSingle();

        (await f.Local.SendAsync("local-lab", W.Env(InteropTypes.LabOrderStatusChanged, W.E2Lab, W.A1Clinic, correlation))).Status.Should().Be(SendResult.Accepted);
        (await f.ForwardAsync()).Should().Be(1);

        (await f.Cloud.PullAsync("clinic", "clinic")).Should().ContainSingle().Which.Envelope.Type.Should().Be(InteropTypes.LabOrderStatusChanged);
    }

    [Fact]
    public async Task A_cell_inbox_message_the_cloud_redelivers_after_a_lost_ack_lands_locally_only_once()
    {
        await using var f = await Federation.StartAsync();
        await f.Cloud.UpsertLinkAsync(Guid.NewGuid(), W.A1Clinic, W.E2Lab);
        await f.Cloud.SendAsync("clinic", W.Env(Order, W.A1Clinic, W.E2Lab));
        var redelivered = (await f.Cloud.PullCellInboxAsync()).Single().Envelope;

        using var scope = f.Local.Services.CreateScope();
        var messages = scope.ServiceProvider.GetRequiredService<MessageService>();
        (await messages.AcceptFromUpstreamAsync(redelivered, CancellationToken.None)).Should().Be(EnqueueOutcome.Accepted);
        (await messages.AcceptFromUpstreamAsync(redelivered, CancellationToken.None)).Should().Be(EnqueueOutcome.Duplicate);

        (await f.Local.PullAsync("local-lab", "laboratory")).Should().ContainSingle();
    }

    [Fact]
    public async Task The_directory_snapshot_populates_the_local_directory_and_is_only_applied_when_newer()
    {
        await using var f = await Federation.StartAsync();
        await f.Cloud.UpsertLinkAsync(Guid.NewGuid(), W.E1Clinic, W.B1Lab);

        (await f.SyncDirectoryAsync()).Should().BeTrue();
        (await f.SyncDirectoryAsync()).Should().BeFalse("nothing changed in the cloud");

        var visible = await f.Local.ListFacilitiesAsync("local-clinic");
        visible.Select(x => x.FacilityId).Should().BeEquivalentTo("e-clinic", "e-lab", "b-lab");
        visible.Single(x => x.FacilityId == "b-lab").LinkStatus.Should().Be(LinkStatus.Active);

        await f.Cloud.UpsertFacilityAsync(W.B1Lab, FacilityVisibility.Network, city: "Iloilo", name: "Renamed Lab");
        (await f.SyncDirectoryAsync()).Should().BeTrue();
        (await f.Local.ListFacilitiesAsync("local-clinic", query: "q=renamed")).Should().ContainSingle().Which.City.Should().Be("Iloilo");

        await f.Cloud.UpsertLinkAsync(Guid.NewGuid(), W.E1Clinic, W.B1Lab, LinkStatus.Revoked);
        await f.Cloud.UpsertFacilityAsync(W.B1Lab, FacilityVisibility.Private);
        (await f.SyncDirectoryAsync()).Should().BeTrue();
        (await f.Local.ListFacilitiesAsync("local-clinic")).Select(x => x.FacilityId).Should().BeEquivalentTo("e-clinic", "e-lab");
    }

    [Fact]
    public async Task A_local_hub_does_not_take_directory_updates_or_expose_cloud_only_endpoints()
    {
        await using var f = await Federation.StartAsync();

        var directoryUpdate = W.Env(InteropTypes.DirectoryFacilityUpserted, W.E1Clinic, Party.Hub, payload: new { });
        (await f.Local.SendAsync("local-clinic", directoryUpdate)).Status.Should().Be(SendResult.Rejected);

        (await f.Local.RawAs("local-clinic").GetAsync("/v1/cell-inbox")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await f.Local.RawAs("local-clinic").GetAsync("/v1/directory/snapshot")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await f.Local.RawAs("local-clinic").PutAsJsonAsync("/v1/admin/cells/x", new { })).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await f.Local.Raw().GetAsync("/health")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await f.Cloud.Raw().GetAsync("/health/ready")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Claims_are_proxied_to_the_cloud_and_redeemed_orders_fan_out_to_the_local_facility()
    {
        await using var f = await Federation.StartAsync();
        var order = W.Env(Order, W.E1Clinic, new Party { Kind = PartyKind.Facility, FacilityType = FacilityType.Laboratory });

        var created = await f.Local.RawAs("local-clinic").PostJsonAsync("/v1/claims", new CreateClaimRequest(order));
        created.StatusCode.Should().Be(HttpStatusCode.Created);
        var claim = await created.ReadAsync<CreateClaimResponse>();
        (await f.Cloud.DbAsync(db => db.Claims.CountAsync())).Should().Be(1);

        var redeemed = await f.Local.RawAs("local-lab").PostJsonAsync($"/v1/claims/{claim.Token}/redeem", new RedeemClaimRequest(W.TenantE, "e-lab"));
        redeemed.StatusCode.Should().Be(HttpStatusCode.OK);
        (await redeemed.ReadAsync<RedeemClaimResponse>()).MessageId.Should().Be(order.MessageId);
        (await f.PullCellInboxAsync()).Should().Be(1);
        (await f.Local.PullAsync("local-lab", "laboratory")).Should().ContainSingle().Which.Envelope.MessageId.Should().Be(order.MessageId);

        var again = await f.Local.RawAs("local-lab").PostJsonAsync($"/v1/claims/{claim.Token}/redeem", new RedeemClaimRequest(W.TenantE, "e-lab"));
        again.StatusCode.Should().Be(HttpStatusCode.Conflict, "the cloud's verdict is passed through");
    }

    [Fact]
    public async Task Claims_need_the_cloud_and_say_so_when_it_is_unreachable()
    {
        await using var f = await Federation.StartAsync();
        f.Upstream.Up = false;
        var order = W.Env(Order, W.E1Clinic, new Party { Kind = PartyKind.Facility, FacilityType = FacilityType.Laboratory });

        var response = await f.Local.RawAs("local-clinic").PostJsonAsync("/v1/claims", new CreateClaimRequest(order));

        response.StatusCode.Should().Be(HttpStatusCode.BadGateway);
        (await response.Content.ReadAsStringAsync()).Should().Contain("internet");
    }

    [Fact]
    public async Task A_local_hub_without_a_complete_upstream_configuration_refuses_to_start()
    {
        var upstream = new UpstreamSwitch();

        var failure = await AuthenticationTests.StartupFailureAsync(() => HubApp.StartLocalAsync(
            upstream, overrides: new Dictionary<string, string?> { ["Hub:Upstream:Url"] = "", ["Hub:Upstream:ClientSecret"] = "" }));

        failure.Should().Contain("Hub:Upstream:Url").And.Contain("Hub:Upstream:ClientSecret");

        var noCell = await AuthenticationTests.StartupFailureAsync(() => HubApp.StartLocalAsync(
            upstream, overrides: new Dictionary<string, string?> { ["Hub:LocalCellId"] = "" }));
        noCell.Should().Contain("Hub:LocalCellId");
    }
}
