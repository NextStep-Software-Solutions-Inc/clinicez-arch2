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
/// E2E Verification for Requirement R4, R6, R8 and Scenarios 26 & 29:
/// Media Broker platform message rules:
/// - Facilities may send media.room.requested to Party.Media
/// - Portal may send media.entitlement.updated to Party.Media
/// - Media Broker may send media.room.responded to the requesting facility
/// - Media Broker may send media.usage.recorded to Portal
/// - Any other sender, recipient or message type is rejected
/// </summary>
public class CommsMediaBrokerPlatformRulesTests
{
    private const string Media = InteropServices.Media;

    [Fact]
    public async Task AFacility_MayRequestMediaRoom_AndOnlyMediaBrokerReceivesIt()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-a"));

        var callId = Guid.NewGuid();
        var request = Envelope(
            InteropTypes.MediaRoomRequested,
            clinic.Party,
            Party.Media,
            new MediaRoomRequestedPayload(
                TenantId: "tenant-a",
                CallId: callId,
                RoomName: $"room-{callId:N}",
                ParticipantIdentities: ["staff:alice", "patient:bob"]
            )
        );

        var result = await SendAsync(cell, InteropServices.Clinic, request);
        result.Status.Should().Be(SendResult.Accepted, "facilities are permitted to request room tokens from media-broker");

        var pulled = await cell.Hub.NewSdk(Media).PullAsync(Media, 10, 0, CancellationToken.None);
        var message = pulled.Should().ContainSingle().Subject;
        message.Envelope.From.Should().BeEquivalentTo(clinic.Party);
        message.Envelope.Type.Should().Be(InteropTypes.MediaRoomRequested);

        var mailboxes = await cell.Hub.DbAsync(db => db.Messages
            .Where(m => m.Type == InteropTypes.MediaRoomRequested)
            .Select(m => m.Mailbox)
            .ToListAsync());

        mailboxes.Should().OnlyContain(mailbox => mailbox.EndsWith(":" + Media));
    }

    [Fact]
    public async Task Portal_MayUpdateMediaEntitlement_AndOnlyMediaBrokerReceivesIt()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-a"));

        var update = Envelope(
            InteropTypes.MediaEntitlementUpdated,
            Party.Portal,
            Party.Media,
            new MediaEntitlementUpdatedPayload(
                TenantId: "tenant-a",
                CallMinutesMonthly: 1200,
                IsActive: true,
                Version: 1,
                UpdatedAtUtc: DateTime.UtcNow
            )
        );

        var result = await SendAsync(cell, InteropServices.Portal, update);
        result.Status.Should().Be(SendResult.Accepted, "portal is permitted to update media entitlements");

        var pulled = await cell.Hub.NewSdk(Media).PullAsync(Media, 10, 0, CancellationToken.None);
        var message = pulled.Should().ContainSingle().Subject;
        message.Envelope.From.Should().BeEquivalentTo(Party.Portal);
        message.Envelope.Type.Should().Be(InteropTypes.MediaEntitlementUpdated);

        var mailboxes = await cell.Hub.DbAsync(db => db.Messages
            .Where(m => m.Type == InteropTypes.MediaEntitlementUpdated)
            .Select(m => m.Mailbox)
            .ToListAsync());

        mailboxes.Should().OnlyContain(mailbox => mailbox.EndsWith(":" + Media));
    }

    [Fact]
    public async Task MediaBroker_MayRespondToFacility_WithRoomTokens()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-a"));

        var callId = Guid.NewGuid();
        var response = Envelope(
            InteropTypes.MediaRoomResponded,
            Party.Media,
            clinic.Party,
            new MediaRoomRespondedPayload(
                CallId: callId,
                RoomName: $"room-{callId:N}",
                RelayUrl: "wss://media.clinicez.internal",
                ParticipantTokens: new Dictionary<string, string>
                {
                    ["staff:alice"] = "jwt-staff-token",
                    ["patient:bob"] = "jwt-patient-token"
                },
                Success: true,
                ErrorMessage: null
            )
        );

        var result = await SendAsync(cell, Media, response);
        result.Status.Should().Be(SendResult.Accepted, "media broker may respond to facilities with room tokens");

        var delivered = await cell.Hub.DbAsync(db => db.Messages
            .Where(m => m.Type == InteropTypes.MediaRoomResponded)
            .Select(m => m.Mailbox)
            .ToListAsync());

        delivered.Should().ContainSingle().Which.Should().EndWith(":" + InteropServices.Clinic);
    }

    [Fact]
    public async Task MediaBroker_MayReportUsage_ToPortalOnly()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-a"));

        var usage = Envelope(
            InteropTypes.MediaUsageRecorded,
            Party.Media,
            Party.Portal,
            new MediaUsageRecordedPayload(
                CallId: Guid.NewGuid(),
                TenantId: "tenant-a",
                DurationMinutes: 15,
                CallStartedAtUtc: DateTime.UtcNow.AddMinutes(-15),
                CallEndedAtUtc: DateTime.UtcNow
            )
        );

        var result = await SendAsync(cell, Media, usage);
        result.Status.Should().Be(SendResult.Accepted, "media broker may report usage to portal");

        var delivered = await cell.Hub.DbAsync(db => db.Messages
            .Where(m => m.Type == InteropTypes.MediaUsageRecorded)
            .Select(m => m.Mailbox)
            .ToListAsync());

        delivered.Should().ContainSingle().Which.Should().EndWith(":" + InteropServices.Portal);
    }

    [Fact]
    public async Task AFacility_CannotUseMediaBrokerForAnythingElse()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-a"));

        var forbidden = new[]
        {
            Envelope(InteropTypes.LabOrderIssued, clinic.Party, Party.Media, new { }),
            Envelope(InteropTypes.CommsMessageSubmit, clinic.Party, Party.Media, new { }),
            Envelope(InteropTypes.PhilHealthRequest, clinic.Party, Party.Media, new { }),
            Envelope(InteropTypes.MediaEntitlementUpdated, clinic.Party, Party.Media, new MediaEntitlementUpdatedPayload("tenant-a", 100, true, 1, DateTime.UtcNow))
        };

        foreach (var envelope in forbidden)
        {
            var result = await SendAsync(cell, InteropServices.Clinic, envelope);
            result.Status.Should().Be(SendResult.Rejected, $"{envelope.Type} from a facility to Media: {result.Reason}");
        }

        (await cell.Hub.NewSdk(Media).PullAsync(Media, 10, 0, CancellationToken.None)).Should().BeEmpty();
    }

    [Fact]
    public async Task MediaBroker_CannotSendToUnauthorizedRecipients()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-a"));

        var forbidden = new[]
        {
            // Media cannot send usage to a facility
            Envelope(InteropTypes.MediaUsageRecorded, Party.Media, clinic.Party, new MediaUsageRecordedPayload(Guid.NewGuid(), "tenant-a", 10, DateTime.UtcNow, DateTime.UtcNow)),
            // Media cannot send room responses to the portal
            Envelope(InteropTypes.MediaRoomResponded, Party.Media, Party.Portal, new MediaRoomRespondedPayload(Guid.NewGuid(), "r1", "url", new Dictionary<string, string>(), true, null)),
            // Media cannot send non-media messages
            Envelope(InteropTypes.LabOrderStatusChanged, Party.Media, clinic.Party, new { })
        };

        foreach (var envelope in forbidden)
        {
            var result = await SendAsync(cell, Media, envelope);
            result.Status.Should().Be(SendResult.Rejected, $"{envelope.Type} from Media: {result.Reason}");
        }
    }

    private static InteropEnvelope Envelope<T>(string type, Party from, Party to, T payload) =>
        InteropEnvelope.Create(type, from, to, Guid.NewGuid(), payload);

    private static async Task<SendResult> SendAsync(TestCell cell, string service, InteropEnvelope envelope)
    {
        var results = await cell.Hub.NewSdk(service).SendAsync([envelope], CancellationToken.None);
        return results.Should().ContainSingle().Subject;
    }
}
