using System.Net;
using ClinicEz.Interop.Application;
using ClinicEz.Interop.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Transport;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Interop.Tests;

/// <summary>The cross-tenant policy: Private targets are closed, everything else needs an Active link that covers the message kind.</summary>
public class CrossTenantPolicyTests
{
    private static Task<SendResult> OrderAsync(HubApp hub, Party from, Party to, Guid? correlation = null, string type = InteropTypes.LabOrderIssued) =>
        hub.SendAsync(from.TenantId == W.TenantA || from.TenantId == W.TenantB ? ClientFor(from) : "edge-hub", W.Env(type, from, to, correlation));

    private static string ClientFor(Party party) => party.FacilityType switch
    {
        FacilityType.Laboratory => "lab",
        FacilityType.Pharmacy => "pharmacy",
        _ => "clinic"
    };

    [Fact]
    public async Task Without_a_link_a_network_facility_cannot_be_addressed()
    {
        await using var hub = await HubApp.StartCloudAsync();

        var result = await OrderAsync(hub, W.A1Clinic, W.B1Lab);

        result.Status.Should().Be(SendResult.Rejected);
        result.Reason.Should().Contain("No active link");
        (await hub.MessageCountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task An_active_link_delivers_and_records_the_conversation()
    {
        await using var hub = await HubApp.StartCloudAsync();
        await hub.UpsertLinkAsync(Guid.NewGuid(), W.A1Clinic, W.B1Lab);
        var correlation = Guid.NewGuid();

        (await OrderAsync(hub, W.A1Clinic, W.B1Lab, correlation)).Status.Should().Be(SendResult.Accepted);

        var pulled = (await hub.PullAsync("lab", "laboratory")).Single();
        pulled.Envelope.From.Should().BeEquivalentTo(W.A1Clinic);
        (await hub.DbAsync(db => db.Conversations.CountAsync(c => c.CorrelationId == correlation))).Should().Be(1);
    }

    [Theory]
    [InlineData(LinkStatus.Pending)]
    [InlineData(LinkStatus.Rejected)]
    [InlineData(LinkStatus.Revoked)]
    public async Task A_link_that_is_not_active_does_not_authorise(LinkStatus status)
    {
        await using var hub = await HubApp.StartCloudAsync();
        await hub.UpsertLinkAsync(Guid.NewGuid(), W.A1Clinic, W.B1Lab, status);

        (await OrderAsync(hub, W.A1Clinic, W.B1Lab)).Status.Should().Be(SendResult.Rejected);
    }

    [Theory]
    [InlineData(InteropTypes.LabOrderIssued, LinkScopes.LabOrder, true)]
    [InlineData(InteropTypes.LabOrderIssued, LinkScopes.Prescription | LinkScopes.Referral | LinkScopes.Result, false)]
    [InlineData(InteropTypes.RxIssued, LinkScopes.Prescription, true)]
    [InlineData(InteropTypes.RxIssued, LinkScopes.LabOrder, false)]
    [InlineData("clinic.referral.sent", LinkScopes.Referral, true)]
    [InlineData("clinic.referral.sent", LinkScopes.LabOrder, false)]
    [InlineData(InteropTypes.LabResultFinalized, LinkScopes.Result, true)]
    [InlineData(InteropTypes.LabResultFinalized, LinkScopes.LabOrder, false)]
    public async Task A_link_only_authorises_the_kinds_of_work_in_its_scope(string type, LinkScopes scopes, bool allowed)
    {
        await using var hub = await HubApp.StartCloudAsync();
        await hub.UpsertLinkAsync(Guid.NewGuid(), W.A1Clinic, W.B1Lab, LinkStatus.Active, scopes);

        var result = await OrderAsync(hub, W.A1Clinic, W.B1Lab, type: type);

        result.Status.Should().Be(allowed ? SendResult.Accepted : SendResult.Rejected, result.Reason);
    }

    [Fact]
    public async Task A_private_facility_cannot_be_addressed_even_with_an_active_link()
    {
        await using var hub = await HubApp.StartCloudAsync();
        await hub.UpsertLinkAsync(Guid.NewGuid(), W.A1Clinic, W.B2Clinic);

        var result = await OrderAsync(hub, W.A1Clinic, W.B2Clinic, type: "clinic.referral.sent");

        result.Status.Should().Be(SendResult.Rejected);
        result.Reason.Should().Contain("private");
    }

    [Fact]
    public async Task A_public_facility_still_needs_a_link()
    {
        await using var hub = await HubApp.StartCloudAsync();
        await hub.UpsertFacilityAsync(W.B1Lab, FacilityVisibility.Public);

        (await OrderAsync(hub, W.A1Clinic, W.B1Lab)).Status.Should().Be(SendResult.Rejected);

        await hub.UpsertLinkAsync(Guid.NewGuid(), W.A1Clinic, W.B1Lab);
        (await OrderAsync(hub, W.A1Clinic, W.B1Lab)).Status.Should().Be(SendResult.Accepted);
    }

    [Fact]
    public async Task Types_without_a_scope_cross_tenants_only_as_a_reply()
    {
        await using var hub = await HubApp.StartCloudAsync();
        await hub.UpsertLinkAsync(Guid.NewGuid(), W.A1Clinic, W.B1Lab);

        var result = await OrderAsync(hub, W.A1Clinic, W.B1Lab, type: "clinic.note");

        result.Status.Should().Be(SendResult.Rejected);
        result.Reason.Should().Contain("reply");
    }

    [Fact]
    public async Task A_result_may_flow_back_along_the_link_the_requester_holds()
    {
        await using var hub = await HubApp.StartCloudAsync();
        await hub.UpsertFacilityAsync(W.A1Clinic, FacilityVisibility.Network);

        (await OrderAsync(hub, W.B1Lab, W.A1Clinic, type: InteropTypes.LabResultFinalized)).Status.Should().Be(SendResult.Rejected, "no link yet");

        await hub.UpsertLinkAsync(Guid.NewGuid(), W.A1Clinic, W.B1Lab, LinkStatus.Active, LinkScopes.Result);
        (await OrderAsync(hub, W.B1Lab, W.A1Clinic, type: InteropTypes.LabResultFinalized)).Status.Should().Be(SendResult.Accepted, "the clinic holds the link (source)");
        (await OrderAsync(hub, W.B1Lab, W.A1Clinic, type: InteropTypes.LabOrderAccepted)).Status.Should().Be(SendResult.Rejected, "the link only covers results");
    }

    [Fact]
    public async Task A_link_held_by_the_sender_with_result_scope_also_lets_results_flow_to_the_target()
    {
        await using var hub = await HubApp.StartCloudAsync();
        await hub.UpsertFacilityAsync(W.A1Clinic, FacilityVisibility.Network);
        await hub.UpsertLinkAsync(Guid.NewGuid(), W.B1Lab, W.A1Clinic, LinkStatus.Active, LinkScopes.Result);

        (await OrderAsync(hub, W.B1Lab, W.A1Clinic, type: InteropTypes.LabResultFinalized)).Status.Should().Be(SendResult.Accepted);
    }

    [Fact]
    public async Task A_reply_on_the_same_correlation_survives_revoking_the_link_but_new_work_does_not()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var linkId = Guid.NewGuid();
        await hub.UpsertLinkAsync(linkId, W.A1Clinic, W.B1Lab);
        var correlation = Guid.NewGuid();
        (await OrderAsync(hub, W.A1Clinic, W.B1Lab, correlation)).Status.Should().Be(SendResult.Accepted);

        await hub.UpsertLinkAsync(linkId, W.A1Clinic, W.B1Lab, LinkStatus.Revoked);

        var reply = await OrderAsync(hub, W.B1Lab, W.A1Clinic, correlation, InteropTypes.LabOrderAccepted);
        reply.Status.Should().Be(SendResult.Accepted, "the clinic started this conversation, so the lab may finish it");
        var result = await OrderAsync(hub, W.B1Lab, W.A1Clinic, correlation, InteropTypes.LabResultFinalized);
        result.Status.Should().Be(SendResult.Accepted);

        (await OrderAsync(hub, W.B1Lab, W.A1Clinic, Guid.NewGuid(), InteropTypes.LabOrderAccepted)).Status.Should().Be(SendResult.Rejected, "another correlation is not a reply");
        (await OrderAsync(hub, W.A1Clinic, W.B1Lab, Guid.NewGuid())).Status.Should().Be(SendResult.Rejected, "new work needs an active link");
    }

    [Fact]
    public async Task A_reply_is_only_allowed_back_to_whoever_started_the_conversation()
    {
        await using var hub = await HubApp.StartCloudAsync();
        await hub.UpsertLinkAsync(Guid.NewGuid(), W.A1Clinic, W.B1Lab);
        await hub.UpsertFacilityAsync(W.A3Pharmacy, FacilityVisibility.Network);
        var correlation = Guid.NewGuid();
        (await OrderAsync(hub, W.A1Clinic, W.B1Lab, correlation)).Status.Should().Be(SendResult.Accepted);

        var otherParty = await OrderAsync(hub, W.B1Lab, W.A3Pharmacy, correlation, InteropTypes.LabOrderAccepted);

        otherParty.Status.Should().Be(SendResult.Rejected);
    }

    [Fact]
    public async Task Same_tenant_messages_never_need_a_link_and_a_private_facility_can_talk_to_its_own_workspace()
    {
        await using var hub = await HubApp.StartCloudAsync();

        (await OrderAsync(hub, W.A1Clinic, W.A2Lab)).Status.Should().Be(SendResult.Accepted);
        (await OrderAsync(hub, W.A2Lab, W.A1Clinic, type: InteropTypes.LabResultFinalized)).Status.Should().Be(SendResult.Accepted);
    }

    [Fact]
    public async Task A_facility_in_an_edge_cell_is_reached_through_the_cell_inbox_of_its_cell()
    {
        await using var hub = await HubApp.StartCloudAsync();
        await hub.UpsertLinkAsync(Guid.NewGuid(), W.A1Clinic, W.E2Lab);
        var envelope = W.Env(InteropTypes.LabOrderIssued, W.A1Clinic, W.E2Lab);

        (await hub.SendAsync("clinic", envelope)).Status.Should().Be(SendResult.Accepted);

        (await hub.MessageRowAsync(envelope.MessageId)).Mailbox.Should().Be("edge-1:cell-inbox");
        (await hub.PullAsync("lab", "laboratory")).Should().BeEmpty();
        var inbox = await hub.PullCellInboxAsync();
        inbox.Should().ContainSingle().Which.Envelope.To.FacilityId.Should().Be("e-lab");
        (await hub.PullCellInboxAsync()).Should().BeEmpty("the delivery is invisible until acked or timed out");

        (await hub.AckCellInboxAsync("edge-hub", inbox.Single().DeliveryId)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await hub.MessageRowAsync(envelope.MessageId)).AckedAtUtc.Should().NotBeNull();
    }

    [Fact]
    public async Task Only_edge_cell_clients_have_a_cell_inbox_and_they_cannot_ack_other_mailboxes_through_it()
    {
        await using var hub = await HubApp.StartCloudAsync();
        await hub.UpsertLinkAsync(Guid.NewGuid(), W.A1Clinic, W.E2Lab);
        await hub.SendAsync("clinic", W.Env(InteropTypes.LabOrderIssued, W.A1Clinic, W.E2Lab));
        var inboxDelivery = (await hub.PullCellInboxAsync()).Single().DeliveryId;

        (await hub.RawAs("clinic").GetAsync("/v1/cell-inbox")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await hub.AckCellInboxAsync("clinic", inboxDelivery)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await hub.RawAs("edge-hub").GetAsync("/v1/cell-inbox")).StatusCode.Should().Be(HttpStatusCode.OK);

        await hub.SendAsync("clinic", W.Env("clinic.note", W.A1Clinic, W.A2Lab));
        var labDelivery = (await hub.PullAsync("lab", "laboratory")).Single().DeliveryId;
        (await hub.AckCellInboxAsync("edge-hub", labDelivery)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await hub.DbAsync(db => db.Messages.CountAsync(m => m.AckedAtUtc != null))).Should().Be(0);
    }
}

public class RoutingUnitTests
{
    [Theory]
    [InlineData("lab.order.issued", LinkScopes.LabOrder)]
    [InlineData("lab.order.accepted", LinkScopes.LabOrder)]
    [InlineData("rx.issued", LinkScopes.Prescription)]
    [InlineData("clinic.referral.sent", LinkScopes.Referral)]
    [InlineData("lab.result.finalized", LinkScopes.Result)]
    [InlineData("patient.record.shared", LinkScopes.None)]
    [InlineData("billing.invoice.requested", LinkScopes.None)]
    public void Envelope_types_map_to_link_scopes(string type, LinkScopes expected) =>
        MessageScopes.For(type).Should().Be(expected);

    [Theory]
    [InlineData("clinic", true)]
    [InlineData("billing-2", true)]
    [InlineData("Clinic", false)]
    [InlineData("1clinic", false)]
    [InlineData("a:b", false)]
    [InlineData("", false)]
    [InlineData("cell-inbox", false)]
    [InlineData("hub", false)]
    public void Only_well_formed_service_names_are_mailboxes(string service, bool valid) =>
        MailboxNames.IsValidService(service).Should().Be(valid);
}
