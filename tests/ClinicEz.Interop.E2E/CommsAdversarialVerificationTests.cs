using System;
using System.Collections.Generic;
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
/// Empirical Adversarial Verification battery for Milestone M1:
/// 1. Comprehensive cross-tenant staff chatter matrix across all 15 comms.* message types.
/// 2. Cross-facility target matrix (Clinic -> Clinic, Lab, Pharmacy, Org, Billing, Comms).
/// 3. Directory link scope resilience (LinkScopes.All, Orders, Referral, Result).
/// 4. Correlation ID reuse / reply piggybacking investigation.
/// 5. Media Broker platform rules attack matrix: invalid callers, unauthorized recipients, unrecognized types.
/// </summary>
public class CommsAdversarialVerificationTests
{
    private const string Media = InteropServices.Media;

    public static readonly string[] AllCommsMessageTypes =
    [
        InteropTypes.CommsEligibilityGranted,
        InteropTypes.CommsEligibilityRevoked,
        InteropTypes.CommsEligibilitySynced,
        InteropTypes.CommsRequestSubmit,
        InteropTypes.CommsMessageSubmit,
        InteropTypes.CommsMessageReplicate,
        InteropTypes.CommsMessageReceived,
        InteropTypes.CommsMessageAcknowledged,
        InteropTypes.CommsThreadStateChanged,
        InteropTypes.CommsCallStateChanged,
        InteropTypes.CommsCallEvent,
        InteropTypes.CommsCallPaymentCleared,
        InteropTypes.CommsRecordingConsentLogged,
        InteropTypes.CommsConversationArchived,
        InteropTypes.GuestCallJoinRequested
    ];

    [Theory]
    [MemberData(nameof(GetCommsMessageTypes))]
    public async Task CrossTenantStaff_All15CommsMessageTypes_AreStrictlyRejected_EvenWithLinkScopesAll(string messageType)
    {
        await using var cell = new TestCell();
        var clinicA = await cell.ProvisionAsync(Fac.Clinic("tenant-alpha", "Clinic Alpha"));
        var clinicB = await cell.ProvisionAsync(Fac.Clinic("tenant-beta", "Clinic Beta"), FacilityVisibility.Network);

        // Active directory link with all scopes
        await cell.Hub.UpsertLinkAsync(clinicA.Party, clinicB.Party, LinkScopes.All);

        var envelope = InteropEnvelope.Create(
            type: messageType,
            from: clinicA.Party,
            to: clinicB.Party,
            correlationId: Guid.NewGuid(),
            payload: new { SampleProperty = "AdversarialPayload" }
        );

        var result = await SendAsync(cell, InteropServices.Clinic, envelope);

        result.Status.Should().Be(SendResult.Rejected,
            $"message type '{messageType}' must NEVER cross tenants between facility staff");
        result.Reason.Should().NotBeNullOrWhiteSpace();

        // Verify zero messages entered any mailbox
        var count = await cell.Hub.DbAsync(db => db.Messages
            .CountAsync(m => m.Type == messageType && m.Mailbox.Contains(clinicB.FacilityId)));
        count.Should().Be(0, $"rejected message of type '{messageType}' must never be written to any mailbox");
    }

    [Theory]
    [InlineData(InteropServices.Clinic)]
    [InlineData(InteropServices.Laboratory)]
    [InlineData(InteropServices.Pharmacy)]
    [InlineData(InteropServices.Organization)]
    [InlineData(InteropServices.Billing)]
    [InlineData(InteropServices.Comms)]
    public async Task CrossTenantStaff_TargetingDifferentFacilityServices_AreAllRejected(string targetService)
    {
        await using var cell = new TestCell();
        var clinicA = await cell.ProvisionAsync(Fac.Clinic("tenant-alpha", "Clinic Alpha"));
        var targetFacility = await cell.ProvisionAsync(Fac.Clinic("tenant-beta", "Facility Beta"), FacilityVisibility.Network);

        await cell.Hub.UpsertLinkAsync(clinicA.Party, targetFacility.Party, LinkScopes.All);

        var toParty = Party.ForFacility("tenant-beta", targetFacility.FacilityId, FacilityType.Clinic, service: targetService);
        var envelope = InteropEnvelope.Create(
            type: InteropTypes.CommsMessageSubmit,
            from: clinicA.Party,
            to: toParty,
            correlationId: Guid.NewGuid(),
            payload: new { Text = "Cross tenant message attempt" }
        );

        var result = await SendAsync(cell, InteropServices.Clinic, envelope);

        result.Status.Should().Be(SendResult.Rejected,
            $"cross-tenant comms message targeting service '{targetService}' must be rejected");
    }

    [Theory]
    [InlineData(LinkScopes.None)]
    [InlineData(LinkScopes.Referral)]
    [InlineData(LinkScopes.LabOrder)]
    [InlineData(LinkScopes.Result)]
    [InlineData(LinkScopes.Prescription)]
    public async Task CrossTenantStaff_WithVariousLinkScopes_CannotChat(LinkScopes scopes)
    {
        await using var cell = new TestCell();
        var clinicA = await cell.ProvisionAsync(Fac.Clinic("tenant-alpha", "Clinic Alpha"));
        var labB = await cell.ProvisionAsync(Fac.Lab("tenant-beta", "Lab Beta"), FacilityVisibility.Network);

        if (scopes != LinkScopes.None)
        {
            await cell.Hub.UpsertLinkAsync(clinicA.Party, labB.Party, scopes);
        }

        var envelope = InteropEnvelope.Create(
            type: InteropTypes.CommsMessageSubmit,
            from: clinicA.Party,
            to: labB.Party,
            correlationId: Guid.NewGuid(),
            payload: new { Text = "Testing scope isolation" }
        );

        var result = await SendAsync(cell, InteropServices.Clinic, envelope);

        result.Status.Should().Be(SendResult.Rejected);
    }

    [Fact]
    public async Task CorrelationReuseAttack_CanCrossTenantStaffChatPiggybackOnExistingCorrelation()
    {
        await using var cell = new TestCell();
        var clinicA = await cell.ProvisionAsync(Fac.Clinic("tenant-alpha", "Clinic Alpha"));
        var labB = await cell.ProvisionAsync(Fac.Lab("tenant-beta", "Lab Beta"), FacilityVisibility.Network);

        // Provision link for orders
        await cell.Hub.UpsertLinkAsync(clinicA.Party, labB.Party, LinkScopes.LabOrder);

        var orderCorrelationId = Guid.NewGuid();

        // 1. Legitimate clinical transaction: Clinic A sends lab order to Lab B
        var legitimateOrder = InteropEnvelope.Create(
            type: InteropTypes.LabOrderIssued,
            from: clinicA.Party,
            to: labB.Party,
            correlationId: orderCorrelationId,
            payload: new { RequisitionId = Guid.NewGuid(), TestName = "CBC" }
        );

        var orderResult = await SendAsync(cell, InteropServices.Clinic, legitimateOrder);
        orderResult.Status.Should().Be(SendResult.Accepted);

        // Verify conversation was recorded
        var convCount = await cell.Hub.DbAsync(db => db.Conversations
            .CountAsync(c => c.CorrelationId == orderCorrelationId));
        convCount.Should().Be(1, "valid cross-tenant message must record conversation entry");

        // 2. Adversarial attack: Lab B tries to send comms.message.submit back to Clinic A using orderCorrelationId
        var attackMessage = InteropEnvelope.Create(
            type: InteropTypes.CommsMessageSubmit,
            from: labB.Party,
            to: clinicA.Party,
            correlationId: orderCorrelationId,
            payload: new { ContentText = "Piggybacked staff chatter on lab order correlation" }
        );

        var attackResult = await SendAsync(cell, InteropServices.Laboratory, attackMessage);

        // Assert that attack was rejected:
        attackResult.Status.Should().Be(SendResult.Rejected, "cross-tenant comms messages must never piggyback on prior clinical conversation correlations");
        attackResult.Reason.Should().Contain($"Cross-tenant messages of type '{attackMessage.Type}' are prohibited.");
    }

    [Fact]
    public async Task MediaBroker_InvalidCallers_AreAllRejected()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-a"));

        var callId = Guid.NewGuid();
        var reqPayload = new MediaRoomRequestedPayload("tenant-a", callId, "room-1", ["staff:1", "patient:2"]);

        // 1. PatientPlane caller attempting to request a room
        var patientParty = Party.ForPatient(Guid.NewGuid().ToString());
        var patientEnvelope = InteropEnvelope.Create(
            type: InteropTypes.MediaRoomRequested,
            from: patientParty,
            to: Party.Media,
            correlationId: callId,
            payload: reqPayload
        );

        var patientResult = await SendAsync(cell, InteropServices.Patient, patientEnvelope);
        patientResult.Status.Should().Be(SendResult.Rejected, "patient plane cannot request media rooms");
        patientResult.Reason.Should().Contain("must be sent by a facility");

        // 2. ControlPlane (Portal) caller attempting to request a room
        var portalEnvelope = InteropEnvelope.Create(
            type: InteropTypes.MediaRoomRequested,
            from: Party.Portal,
            to: Party.Media,
            correlationId: callId,
            payload: reqPayload
        );

        var portalResult = await SendAsync(cell, InteropServices.Portal, portalEnvelope);
        portalResult.Status.Should().Be(SendResult.Rejected, "portal cannot request media rooms");
        portalResult.Reason.Should().Contain("must be sent by a facility");
    }

    [Fact]
    public async Task MediaBroker_UnauthorizedRecipients_AreAllRejected()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-a"));

        // 1. Facility sending media.room.requested to Portal instead of Media
        var wrongRecipient1 = InteropEnvelope.Create(
            type: InteropTypes.MediaRoomRequested,
            from: clinic.Party,
            to: Party.Portal,
            correlationId: Guid.NewGuid(),
            payload: new { Room = "r1" }
        );

        var r1 = await SendAsync(cell, InteropServices.Clinic, wrongRecipient1);
        r1.Status.Should().Be(SendResult.Rejected);
        r1.Reason.Should().Contain("to the 'media' service");

        // 2. Facility sending media.room.requested to another facility
        var clinicB = await cell.ProvisionAsync(Fac.Clinic("tenant-b"));
        var wrongRecipient2 = InteropEnvelope.Create(
            type: InteropTypes.MediaRoomRequested,
            from: clinic.Party,
            to: clinicB.Party,
            correlationId: Guid.NewGuid(),
            payload: new { Room = "r1" }
        );

        var r2 = await SendAsync(cell, InteropServices.Clinic, wrongRecipient2);
        r2.Status.Should().Be(SendResult.Rejected);
        r2.Reason.Should().Contain("to the 'media' service");

        // 3. Media sending media.room.responded to Portal
        var mediaToPortal = InteropEnvelope.Create(
            type: InteropTypes.MediaRoomResponded,
            from: Party.Media,
            to: Party.Portal,
            correlationId: Guid.NewGuid(),
            payload: new MediaRoomRespondedPayload(Guid.NewGuid(), "r1", "wss://url", new Dictionary<string, string>(), true, null)
        );

        var r3 = await SendAsync(cell, Media, mediaToPortal);
        r3.Status.Should().Be(SendResult.Rejected);
        r3.Reason.Should().Contain("to a facility");

        // 4. Media sending media.room.responded to Patient
        var patientParty = Party.ForPatient(Guid.NewGuid().ToString());
        var mediaToPatient = InteropEnvelope.Create(
            type: InteropTypes.MediaRoomResponded,
            from: Party.Media,
            to: patientParty,
            correlationId: Guid.NewGuid(),
            payload: new MediaRoomRespondedPayload(Guid.NewGuid(), "r1", "wss://url", new Dictionary<string, string>(), true, null)
        );

        var r4 = await SendAsync(cell, Media, mediaToPatient);
        r4.Status.Should().Be(SendResult.Rejected);
        r4.Reason.Should().Contain("to a facility");
    }

    [Fact]
    public async Task MediaBroker_UnrecognizedMessageTypes_AreAllRejected()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-a"));

        // 1. Facility sends arbitrary message to Media
        var arbitrary = InteropEnvelope.Create(
            type: "media.fake.unrecognized",
            from: clinic.Party,
            to: Party.Media,
            correlationId: Guid.NewGuid(),
            payload: new { Test = "exploit" }
        );

        var r1 = await SendAsync(cell, InteropServices.Clinic, arbitrary);
        r1.Status.Should().Be(SendResult.Rejected);
        r1.Reason.Should().Contain("accepts only media.* messages");

        // 2. Facility sends PhilHealth request to Media
        var philhealthToMedia = InteropEnvelope.Create(
            type: InteropTypes.PhilHealthRequest,
            from: clinic.Party,
            to: Party.Media,
            correlationId: Guid.NewGuid(),
            payload: new { }
        );

        var r2 = await SendAsync(cell, InteropServices.Clinic, philhealthToMedia);
        r2.Status.Should().Be(SendResult.Rejected);

        // 3. Media attempts to send PhilHealth response to clinic
        var mediaPhilHealth = InteropEnvelope.Create(
            type: InteropTypes.PhilHealthResponse,
            from: Party.Media,
            to: clinic.Party,
            correlationId: Guid.NewGuid(),
            payload: new { }
        );

        var r3 = await SendAsync(cell, Media, mediaPhilHealth);
        r3.Status.Should().Be(SendResult.Rejected);

        // 4. Media attempts to send comms.message.submit to clinic
        var mediaComms = InteropEnvelope.Create(
            type: InteropTypes.CommsMessageSubmit,
            from: Party.Media,
            to: clinic.Party,
            correlationId: Guid.NewGuid(),
            payload: new { }
        );

        var r4 = await SendAsync(cell, Media, mediaComms);
        r4.Status.Should().Be(SendResult.Rejected);
        r4.Reason.Should().Contain("may only send media.* messages");
    }

    public static IEnumerable<object[]> GetCommsMessageTypes() =>
        AllCommsMessageTypes.Select(t => new object[] { t });

    private static async Task<SendResult> SendAsync(TestCell cell, string service, InteropEnvelope envelope)
    {
        var results = await cell.Hub.NewSdk(service).SendAsync([envelope], CancellationToken.None);
        return results.Should().ContainSingle().Subject;
    }
}
