using System.Net;
using ClinicEz.Interop.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Transport;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Interop.Tests;

public class OwnershipAndRoutingTests
{
    private const string Chatter = "clinic.note";

    [Fact]
    public async Task A_facility_client_may_only_send_as_facilities_of_its_own_cell()
    {
        await using var hub = await HubApp.StartCloudAsync();

        var asEdgeFacility = await hub.SendAsync("clinic", W.Env(Chatter, W.E1Clinic, W.A2Lab));
        asEdgeFacility.Status.Should().Be(SendResult.Rejected);
        asEdgeFacility.Reason.Should().Contain("cell");

        var asUnknown = await hub.SendAsync("clinic", W.Env(Chatter, Party.ForFacility(W.TenantA, "ghost", FacilityType.Clinic), W.A2Lab));
        asUnknown.Status.Should().Be(SendResult.Rejected);
        asUnknown.Reason.Should().Contain("not a registered facility");

        var asPortal = await hub.SendAsync("clinic", W.Env(Chatter, Party.Portal, W.A2Lab));
        asPortal.Status.Should().Be(SendResult.Rejected);

        var asPatient = await hub.SendAsync("clinic", W.Env(Chatter, Party.ForPatient("p1"), W.A2Lab));
        asPatient.Status.Should().Be(SendResult.Rejected);

        (await hub.MessageCountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task An_inactive_facility_cannot_send_or_be_addressed()
    {
        await using var hub = await HubApp.StartCloudAsync();
        await hub.UpsertFacilityAsync(W.A3Pharmacy, FacilityVisibility.Private, active: false);

        var asInactive = await hub.SendAsync("pharmacy", W.Env(Chatter, W.A3Pharmacy, W.A1Clinic));
        asInactive.Status.Should().Be(SendResult.Rejected);
        asInactive.Reason.Should().Contain("inactive");

        var toInactive = await hub.SendAsync("clinic", W.Env(Chatter, W.A1Clinic, W.A3Pharmacy));
        toInactive.Status.Should().Be(SendResult.Rejected);
        toInactive.Reason.Should().Contain("inactive");
    }

    [Fact]
    public async Task The_control_plane_may_only_send_as_the_portal_or_the_hub_and_the_patient_plane_only_as_patients()
    {
        await using var hub = await HubApp.StartCloudAsync();

        (await hub.SendAsync("portal", W.Env(Chatter, W.A1Clinic, W.A2Lab))).Status.Should().Be(SendResult.Rejected);
        (await hub.SendAsync("portal", W.Env(Chatter, Party.ForPatient("p1"), W.A1Clinic))).Status.Should().Be(SendResult.Rejected);
        (await hub.SendAsync("portal", W.Env(Chatter, Party.Portal, W.A1Clinic))).Status.Should().Be(SendResult.Accepted);
        (await hub.SendAsync("portal", W.Env(Chatter, Party.Hub, W.A1Clinic))).Status.Should().Be(SendResult.Accepted);

        (await hub.SendAsync("patient", W.Env(Chatter, W.A1Clinic, W.A2Lab))).Status.Should().Be(SendResult.Rejected);
        (await hub.SendAsync("patient", W.Env(Chatter, Party.Portal, W.A1Clinic))).Status.Should().Be(SendResult.Rejected);
        (await hub.SendAsync("patient", W.Env(Chatter, Party.ForPatient("p1"), W.A1Clinic))).Status.Should().Be(SendResult.Accepted);
        var patientService = new Party { Kind = PartyKind.ControlPlane, Service = InteropServices.Patient };
        (await hub.SendAsync("patient", W.Env(Chatter, patientService, W.A1Clinic))).Status.Should().Be(SendResult.Accepted);
    }

    [Fact]
    public async Task Same_tenant_messages_land_in_the_mailbox_of_the_target_facility_type()
    {
        await using var hub = await HubApp.StartCloudAsync();

        var toLab = W.Env(Chatter, W.A1Clinic, W.A2Lab);
        var toPharmacy = W.Env(Chatter, W.A1Clinic, W.A3Pharmacy);
        var toClinic = W.Env(Chatter, W.A2Lab, W.A1Clinic);
        foreach (var envelope in new[] { toLab, toPharmacy })
            (await hub.SendAsync("clinic", envelope)).Status.Should().Be(SendResult.Accepted);
        (await hub.SendAsync("lab", toClinic)).Status.Should().Be(SendResult.Accepted);

        (await hub.PullAsync("lab", "laboratory")).Select(m => m.Envelope.MessageId).Should().Equal(toLab.MessageId);
        (await hub.PullAsync("pharmacy", "pharmacy")).Select(m => m.Envelope.MessageId).Should().Equal(toPharmacy.MessageId);
        (await hub.PullAsync("clinic", "clinic")).Select(m => m.Envelope.MessageId).Should().Equal(toClinic.MessageId);
    }

    [Fact]
    public async Task To_Service_selects_another_service_mailbox_of_the_facilitys_cell()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var toBilling = Party.ForFacility(W.TenantA, "a-clinic", FacilityType.Clinic, InteropServices.Billing);

        (await hub.SendAsync("clinic", W.Env(InteropTypes.BillingInvoiceRequested, W.A1Clinic, toBilling))).Status.Should().Be(SendResult.Accepted);

        (await hub.PullAsync("clinic", "clinic")).Should().BeEmpty();
        (await hub.PullAsync("billing", "billing")).Should().ContainSingle();

        var badService = Party.ForFacility(W.TenantA, "a-clinic", FacilityType.Clinic, "Not A Service!");
        var rejected = await hub.SendAsync("clinic", W.Env(Chatter, W.A2Lab, badService));
        rejected.Status.Should().Be(SendResult.Rejected);
        rejected.Reason.Should().Contain("service");
    }

    [Fact]
    public async Task Patients_and_the_portal_have_their_own_mailboxes()
    {
        await using var hub = await HubApp.StartCloudAsync();

        (await hub.SendAsync("clinic", W.Env(InteropTypes.ClinicAppointmentUpdated, W.A1Clinic, Party.ForPatient("p1")))).Status.Should().Be(SendResult.Accepted);
        (await hub.SendAsync("clinic", W.Env(InteropTypes.NotificationEmailRequested, W.A1Clinic, Party.Portal))).Status.Should().Be(SendResult.Accepted);
        (await hub.SendAsync("patient", W.Env(InteropTypes.PatientAppointmentBooked, Party.ForPatient("p1"), W.A1Clinic))).Status.Should().Be(SendResult.Accepted);

        (await hub.PullAsync("patient", "patient")).Should().ContainSingle().Which.Envelope.To.PatientId.Should().Be("p1");
        (await hub.PullAsync("portal", "portal")).Should().ContainSingle().Which.Envelope.Type.Should().Be(InteropTypes.NotificationEmailRequested);
        (await hub.PullAsync("clinic", "clinic")).Should().ContainSingle().Which.Envelope.Type.Should().Be(InteropTypes.PatientAppointmentBooked);

        var patientToPatient = await hub.SendAsync("patient", W.Env(Chatter, Party.ForPatient("p1"), Party.ForPatient("p2")));
        patientToPatient.Status.Should().Be(SendResult.Rejected);
    }

    [Fact]
    public async Task Unknown_or_malformed_targets_are_rejected()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var ghost = Party.ForFacility(W.TenantA, "ghost", FacilityType.Laboratory);

        (await hub.SendAsync("clinic", W.Env(Chatter, W.A1Clinic, ghost))).Reason.Should().Contain("Unknown or inactive");
        (await hub.SendAsync("clinic", W.Env(Chatter, W.A1Clinic, new Party { Kind = PartyKind.Facility }))).Status.Should().Be(SendResult.Rejected);
        (await hub.SendAsync("clinic", W.Env(Chatter, W.A1Clinic, new Party { Kind = PartyKind.Patient }))).Status.Should().Be(SendResult.Rejected);
        (await hub.SendAsync("clinic", W.Env(Chatter, W.A1Clinic, new Party { Kind = PartyKind.ControlPlane, Service = "elsewhere" }))).Status.Should().Be(SendResult.Rejected);
        (await hub.SendAsync("clinic", W.Env(Chatter, W.A1Clinic, W.A2Lab) with { Type = "" })).Status.Should().Be(SendResult.Rejected);
        (await hub.SendAsync("clinic", W.Env(Chatter, W.A1Clinic, W.A2Lab, messageId: Guid.Empty))).Status.Should().Be(SendResult.Rejected);
    }

    [Fact]
    public async Task A_client_cannot_read_the_mailbox_of_another_service()
    {
        await using var hub = await HubApp.StartCloudAsync();

        await hub.Sdk("clinic").PullAsync("laboratory", 10, 0, CancellationToken.None).ShouldFailWithAsync(HttpStatusCode.Forbidden);
        await hub.Sdk("clinic").PullAsync("portal", 10, 0, CancellationToken.None).ShouldFailWithAsync(HttpStatusCode.Forbidden);
        await hub.Sdk("edge-hub").PullAsync("cell-inbox", 10, 0, CancellationToken.None).ShouldFailWithAsync(HttpStatusCode.Forbidden);
        (await hub.RawAs("clinic").GetAsync("/v1/inbox")).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await hub.RawAs("clinic").GetAsync("/v1/cell-inbox")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Directory_messages_are_hub_internal_control_plane_only_and_never_reach_a_mailbox()
    {
        await using var hub = await HubApp.StartCloudAsync();

        var fromClinic = W.Env(InteropTypes.DirectoryFacilityUpserted, W.A1Clinic, Party.Hub, payload: new { tenantId = "x", facilityId = "y", cellId = "cloud" });
        var denied = await hub.SendAsync("clinic", fromClinic);
        denied.Status.Should().Be(SendResult.Rejected);
        denied.Reason.Should().Contain("control-plane");

        var unknownType = await hub.SendAsync("portal", W.Env("clinic.note", Party.Portal, Party.Hub));
        unknownType.Status.Should().Be(SendResult.Rejected);
        unknownType.Reason.Should().Contain("Unknown hub message type");

        var emptyFacility = await hub.SendAsync("portal", W.Env(InteropTypes.DirectoryFacilityUpserted, Party.Portal, Party.Hub, payload: new { tenantId = "", facilityId = "", cellId = "" }));
        emptyFacility.Status.Should().Be(SendResult.Rejected);

        var notAnObject = await hub.SendAsync("portal", W.Env(InteropTypes.DirectoryLinkUpserted, Party.Portal, Party.Hub, payload: "just a string"));
        notAnObject.Status.Should().Be(SendResult.Rejected);

        await hub.UpsertFacilityAsync(Party.ForFacility("tenant-z", "z-lab", FacilityType.Laboratory), FacilityVisibility.Public);
        (await hub.MessageCountAsync()).Should().Be(0, "directory.* envelopes are applied by the hub and never stored in a mailbox");
        (await hub.PullAsync("portal", "portal")).Should().BeEmpty();
    }
}

public class DeliveryTests
{
    private const string Chatter = "clinic.note";

    private static async Task<InteropEnvelope> SendToLabAsync(HubApp hub, Guid? id = null)
    {
        var envelope = W.Env(Chatter, W.A1Clinic, W.A2Lab, messageId: id);
        (await hub.SendAsync("clinic", envelope)).Status.Should().Be(SendResult.Accepted);
        return envelope;
    }

    [Fact]
    public async Task Messages_come_out_in_the_order_they_went_in()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var sent = new List<Guid>();
        for (var i = 0; i < 5; i++) sent.Add((await SendToLabAsync(hub)).MessageId);

        (await hub.PullAsync("lab", "laboratory")).Select(m => m.Envelope.MessageId).Should().Equal(sent);
    }

    [Fact]
    public async Task A_resent_MessageId_is_a_duplicate_even_after_the_original_was_acked()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var envelope = await SendToLabAsync(hub);

        (await hub.SendAsync("clinic", envelope)).Status.Should().Be(SendResult.Duplicate);
        (await hub.MessageCountAsync()).Should().Be(1);

        var pulled = await hub.PullAsync("lab", "laboratory");
        await hub.Sdk("lab").AckAsync([pulled.Single().DeliveryId], CancellationToken.None);

        (await hub.SendAsync("clinic", envelope)).Status.Should().Be(SendResult.Duplicate);
        (await hub.PullAsync("lab", "laboratory")).Should().BeEmpty("a duplicate must not be delivered again");
        (await hub.MessageCountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task Sending_the_same_MessageId_concurrently_accepts_exactly_one()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var envelope = W.Env(Chatter, W.A1Clinic, W.A2Lab);

        var results = await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => hub.SendAsync("clinic", envelope)));

        results.Count(r => r.Status == SendResult.Accepted).Should().Be(1);
        results.Count(r => r.Status == SendResult.Duplicate).Should().Be(7);
        (await hub.MessageCountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task An_oversized_envelope_is_rejected_and_one_under_the_limit_is_accepted()
    {
        await using var hub = await HubApp.StartCloudAsync();

        var big = await hub.SendAsync("clinic", W.Env(Chatter, W.A1Clinic, W.A2Lab, payload: new { blob = new string('x', 9000) }));
        big.Status.Should().Be(SendResult.Rejected);
        big.Reason.Should().Contain("limit").And.Contain("8192");

        (await hub.SendAsync("clinic", W.Env(Chatter, W.A1Clinic, W.A2Lab, payload: new { blob = new string('x', 5000) }))).Status.Should().Be(SendResult.Accepted);
        (await hub.MessageCountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task An_already_expired_envelope_is_rejected_and_a_short_ttl_wins_over_the_hub_default()
    {
        await using var hub = await HubApp.StartCloudAsync();

        var expired = InteropEnvelope.Create(Chatter, W.A1Clinic, W.A2Lab, Guid.NewGuid(), new { }) with
        {
            ExpiresAtUtc = hub.Clock.GetUtcNow().UtcDateTime - TimeSpan.FromSeconds(5)
        };
        (await hub.SendAsync("clinic", expired)).Reason.Should().Be("expired");

        var shortLived = InteropEnvelope.Create(Chatter, W.A1Clinic, W.A2Lab, Guid.NewGuid(), new { }, ttl: TimeSpan.FromMinutes(1));
        (await hub.SendAsync("clinic", shortLived)).Status.Should().Be(SendResult.Accepted);
        hub.Clock.Advance(TimeSpan.FromMinutes(2));

        (await hub.PullAsync("lab", "laboratory")).Should().BeEmpty();
    }

    [Fact]
    public async Task A_batch_gets_one_verdict_per_envelope_and_an_oversized_batch_is_refused()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var good = W.Env(Chatter, W.A1Clinic, W.A2Lab);
        var bad = W.Env(Chatter, W.A1Clinic, Party.ForFacility(W.TenantA, "ghost", FacilityType.Clinic));

        var results = await hub.Sdk("clinic").SendAsync([good, bad, good], CancellationToken.None);

        results.Select(r => r.Status).Should().Equal(SendResult.Accepted, SendResult.Rejected, SendResult.Duplicate);
        results.Select(r => r.MessageId).Should().Equal(good.MessageId, bad.MessageId, good.MessageId);

        var tooMany = Enumerable.Range(0, 101).Select(_ => W.Env(Chatter, W.A1Clinic, W.A2Lab)).ToList();
        await hub.Sdk("clinic").SendAsync(tooMany, CancellationToken.None).ShouldFailWithAsync(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Ack_purges_the_envelope_but_keeps_an_id_only_tombstone()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var envelope = await SendToLabAsync(hub);
        var pulled = (await hub.PullAsync("lab", "laboratory")).Single();
        pulled.Attempt.Should().Be(1);
        (await hub.MessageRowAsync(envelope.MessageId)).Envelope.Should().NotBeEmpty();

        await hub.Sdk("lab").AckAsync([pulled.DeliveryId], CancellationToken.None);

        var row = await hub.MessageRowAsync(envelope.MessageId);
        row.Envelope.Should().BeEmpty();
        row.AckedAtUtc.Should().NotBeNull();
        row.DeliveryId.Should().BeNull();
        hub.Clock.Advance(TimeSpan.FromHours(1));
        (await hub.PullAsync("lab", "laboratory")).Should().BeEmpty();
    }

    [Fact]
    public async Task A_client_cannot_ack_or_nack_a_delivery_of_someone_elses_mailbox()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var envelope = await SendToLabAsync(hub);
        var pulled = (await hub.PullAsync("lab", "laboratory")).Single();

        await hub.Sdk("clinic").AckAsync([pulled.DeliveryId], CancellationToken.None);
        await hub.Sdk("clinic").NackAsync([new NackItem(pulled.DeliveryId, "not mine")], CancellationToken.None);

        var row = await hub.MessageRowAsync(envelope.MessageId);
        row.AckedAtUtc.Should().BeNull();
        row.Envelope.Should().NotBeEmpty();
        row.DeliveryId.Should().Be(pulled.DeliveryId);
        row.LastError.Should().BeNull();
    }

    [Fact]
    public async Task An_unacked_message_is_hidden_during_the_visibility_timeout_and_then_redelivered()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var envelope = await SendToLabAsync(hub);

        var first = (await hub.PullAsync("lab", "laboratory")).Single();
        (await hub.PullAsync("lab", "laboratory")).Should().BeEmpty("the message is invisible while it is being processed");

        hub.Clock.Advance(TimeSpan.FromSeconds(31));
        var second = (await hub.PullAsync("lab", "laboratory")).Single();

        second.Envelope.MessageId.Should().Be(envelope.MessageId);
        second.Attempt.Should().Be(2);
        second.DeliveryId.Should().NotBe(first.DeliveryId);

        await hub.Sdk("lab").AckAsync([first.DeliveryId], CancellationToken.None);
        (await hub.MessageRowAsync(envelope.MessageId)).AckedAtUtc.Should().BeNull("the first delivery id is stale");
        await hub.Sdk("lab").AckAsync([second.DeliveryId], CancellationToken.None);
        (await hub.MessageRowAsync(envelope.MessageId)).AckedAtUtc.Should().NotBeNull();
    }

    [Fact]
    public async Task A_nacked_message_is_redelivered_and_dead_lettered_after_the_last_attempt()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var envelope = await SendToLabAsync(hub);

        for (var attempt = 1; attempt <= 3; attempt++)
        {
            var pulled = (await hub.PullAsync("lab", "laboratory")).Single();
            pulled.Attempt.Should().Be(attempt);
            await hub.Sdk("lab").NackAsync([new NackItem(pulled.DeliveryId, "boom")], CancellationToken.None);
        }

        var row = await hub.MessageRowAsync(envelope.MessageId);
        row.DeadLetteredAtUtc.Should().NotBeNull();
        row.LastError.Should().Be("boom");
        hub.Clock.Advance(TimeSpan.FromHours(1));
        (await hub.PullAsync("lab", "laboratory")).Should().BeEmpty();
    }

    [Fact]
    public async Task A_consumer_that_keeps_crashing_without_nacking_ends_up_dead_lettered_by_maintenance()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var envelope = await SendToLabAsync(hub);

        for (var attempt = 1; attempt <= 3; attempt++)
        {
            (await hub.PullAsync("lab", "laboratory")).Single().Attempt.Should().Be(attempt);
            hub.Clock.Advance(TimeSpan.FromSeconds(31));
        }

        (await hub.PullAsync("lab", "laboratory")).Should().BeEmpty("no attempts are left");
        var report = await hub.MaintainAsync();

        report.DeadLettered.Should().Be(1);
        var row = await hub.MessageRowAsync(envelope.MessageId);
        row.DeadLetteredAtUtc.Should().NotBeNull();
        row.LastError.Should().Contain("exhausted");
    }

    [Fact]
    public async Task Maintenance_purges_messages_after_their_ttl_and_dead_letters_after_their_retention()
    {
        await using var hub = await HubApp.StartCloudAsync();
        var expiring = await SendToLabAsync(hub);
        var dead = await SendToLabAsync(hub);
        var pulled = await hub.PullAsync("lab", "laboratory");
        var deadDelivery = pulled.Single(m => m.Envelope.MessageId == dead.MessageId).DeliveryId;
        for (var i = 0; i < 3; i++)
        {
            await hub.Sdk("lab").NackAsync([new NackItem(deadDelivery, "x")], CancellationToken.None);
            deadDelivery = (await hub.PullAsync("lab", "laboratory")).SingleOrDefault(m => m.Envelope.MessageId == dead.MessageId)?.DeliveryId ?? deadDelivery;
        }

        hub.Clock.Advance(TimeSpan.FromDays(8));
        var afterTtl = await hub.MaintainAsync();
        afterTtl.ExpiredPurged.Should().BeGreaterThanOrEqualTo(1);
        (await hub.DbAsync(db => db.Messages.CountAsync(m => m.MessageId == expiring.MessageId))).Should().Be(0);
        (await hub.DbAsync(db => db.Messages.CountAsync(m => m.MessageId == dead.MessageId))).Should().Be(1, "dead letters are kept for inspection");

        hub.Clock.Advance(TimeSpan.FromDays(7));
        (await hub.MaintainAsync()).DeadLettersPurged.Should().Be(1);
        (await hub.MessageCountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task A_long_poll_returns_as_soon_as_a_message_arrives()
    {
        await using var hub = await HubApp.StartCloudAsync();

        var waiting = hub.Sdk("lab").PullAsync("laboratory", 10, 10, CancellationToken.None);
        await Task.Delay(300);
        waiting.IsCompleted.Should().BeFalse();
        var envelope = await SendToLabAsync(hub);

        var pulled = await waiting.WaitAsync(TimeSpan.FromSeconds(8));
        pulled.Should().ContainSingle().Which.Envelope.MessageId.Should().Be(envelope.MessageId);
    }

    [Fact]
    public async Task A_long_poll_on_an_empty_mailbox_returns_empty_after_the_wait()
    {
        await using var hub = await HubApp.StartCloudAsync();

        var started = DateTime.UtcNow;
        var pulled = await hub.Sdk("lab").PullAsync("laboratory", 10, 1, CancellationToken.None);

        pulled.Should().BeEmpty();
        (DateTime.UtcNow - started).Should().BeGreaterThan(TimeSpan.FromMilliseconds(800));
    }

    [Fact]
    public async Task Concurrent_consumers_never_receive_the_same_message_twice()
    {
        await using var hub = await HubApp.StartCloudAsync();
        for (var i = 0; i < 12; i++) await SendToLabAsync(hub);

        var batches = await Task.WhenAll(Enumerable.Range(0, 6).Select(_ => hub.PullAsync("lab", "laboratory", 4)));
        var rest = await hub.PullAsync("lab", "laboratory");

        var ids = batches.SelectMany(b => b).Concat(rest).Select(m => m.Envelope.MessageId).ToList();
        ids.Should().OnlyHaveUniqueItems();
        ids.Should().HaveCount(12);
        batches.Should().OnlyContain(b => b.Count <= 4);
    }

    [Fact]
    public async Task Envelopes_are_encrypted_at_rest_when_a_payload_key_is_configured()
    {
        var key = Convert.ToBase64String(Enumerable.Range(1, 32).Select(i => (byte)i).ToArray());
        await using var hub = await HubApp.StartCloudAsync(new Dictionary<string, string?> { ["Hub:PayloadEncryptionKey"] = key });
        var envelope = W.Env(Chatter, W.A1Clinic, W.A2Lab, payload: new { secretNote = "sensitive-text" });
        (await hub.SendAsync("clinic", envelope)).Status.Should().Be(SendResult.Accepted);

        var stored = (await hub.MessageRowAsync(envelope.MessageId)).Envelope;
        stored.Should().StartWith("enc1:").And.NotContain("sensitive-text");

        var pulled = (await hub.PullAsync("lab", "laboratory")).Single();
        pulled.Envelope.Payload.GetProperty("secretNote").GetString().Should().Be("sensitive-text");
    }
}
