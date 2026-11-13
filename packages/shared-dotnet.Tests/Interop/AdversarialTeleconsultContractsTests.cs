using System;
using System.Text.Json;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Shared.Tests.Interop;

public class AdversarialTeleconsultContractsTests
{
    [Fact]
    public void CommsCallStateChangedPayload_ForwardCompatibility_IgnoresUnknownFutureFields()
    {
        var callId = Guid.NewGuid();
        var futureJson = $$"""
        {
            "callId": "{{callId}}",
            "conversationId": null,
            "tenantId": "tenant-future",
            "facilityId": "clinic-future",
            "kind": "Teleconsult",
            "status": "InCall",
            "roomName": "call-room-99",
            "joinToken": "token-xyz",
            "stateVersion": 5,
            "changedAtUtc": "2026-11-13T12:00:00Z",
            "relayUrl": "wss://future.media.clinicez.internal",
            "futureUnrecognizedFeatureFlag": true,
            "futureBandwidthCapKbps": 12000,
            "futureMetadata": { "aiTranscriptionEnabled": true }
        }
        """;

        var payload = JsonSerializer.Deserialize<CommsCallStateChangedPayload>(futureJson, InteropJson.Options);

        payload.Should().NotBeNull();
        payload!.CallId.Should().Be(callId);
        payload.RelayUrl.Should().Be("wss://future.media.clinicez.internal");
        payload.StateVersion.Should().Be(5);
    }

    [Fact]
    public void GuestTeleconsultInviteIssuedPayload_EmitsStrictCamelCaseProperties()
    {
        var aptId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        var now = DateTime.UtcNow;
        var expires = now.AddHours(2);

        var payload = new GuestTeleconsultInviteIssuedPayload(
            AppointmentId: aptId,
            CallId: callId,
            TenantId: "tenant-cc",
            FacilityId: "fac-cc",
            InviteTokenHash: "hash-token-123",
            ExpectedDobHash: "hash-dob-456",
            OtpHash: "hash-otp-789",
            ExpiresAtUtc: expires,
            IssuedAtUtc: now
        );

        var json = JsonSerializer.Serialize(payload, InteropJson.Options);

        json.Should().Contain("\"appointmentId\":\"");
        json.Should().Contain("\"callId\":\"");
        json.Should().Contain("\"tenantId\":\"tenant-cc\"");
        json.Should().Contain("\"facilityId\":\"fac-cc\"");
        json.Should().Contain("\"inviteTokenHash\":\"hash-token-123\"");
        json.Should().Contain("\"expectedDobHash\":\"hash-dob-456\"");
        json.Should().Contain("\"otpHash\":\"hash-otp-789\"");
        json.Should().Contain("\"expiresAtUtc\":\"");
        json.Should().Contain("\"issuedAtUtc\":\"");

        // Assert no PascalCase keys leak into the wire format
        json.Should().NotContain("\"AppointmentId\":");
        json.Should().NotContain("\"InviteTokenHash\":");
    }

    [Fact]
    public void GuestTeleconsultInviteIssuedPayload_ForwardCompatibility_IgnoresUnknownFutureFields()
    {
        var aptId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        var futureJson = $$"""
        {
            "appointmentId": "{{aptId}}",
            "callId": "{{callId}}",
            "tenantId": "tenant-future",
            "facilityId": "fac-future",
            "inviteTokenHash": "hash-tok",
            "expectedDobHash": "hash-dob",
            "otpHash": "hash-otp",
            "expiresAtUtc": "2026-11-13T14:00:00Z",
            "issuedAtUtc": "2026-11-13T13:00:00Z",
            "futureEscortRequirement": "ParentOrGuardian",
            "futureLanguagePreference": "tl-PH"
        }
        """;

        var payload = JsonSerializer.Deserialize<GuestTeleconsultInviteIssuedPayload>(futureJson, InteropJson.Options);

        payload.Should().NotBeNull();
        payload!.AppointmentId.Should().Be(aptId);
        payload.CallId.Should().Be(callId);
        payload.InviteTokenHash.Should().Be("hash-tok");
    }

    [Fact]
    public void InteropEnvelope_FullJsonWireSerializationRoundtrip_WithGuestTeleconsultInvite()
    {
        var aptId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        var payload = new GuestTeleconsultInviteIssuedPayload(
            AppointmentId: aptId,
            CallId: callId,
            TenantId: "tenant-wire",
            FacilityId: "fac-wire",
            InviteTokenHash: "tokhash",
            ExpectedDobHash: "dobhash",
            OtpHash: "otphash",
            ExpiresAtUtc: now.AddHours(1),
            IssuedAtUtc: now
        );

        var originalEnvelope = InteropEnvelope.Create(
            InteropTypes.GuestTeleconsultInviteIssued,
            Party.ForFacility("tenant-wire", "fac-wire", FacilityType.Clinic),
            Party.Portal,
            aptId,
            payload
        );

        // Serialize envelope to raw wire JSON
        var wireJson = JsonSerializer.Serialize(originalEnvelope, InteropJson.Options);

        // Deserialize envelope from raw wire JSON
        var parsedEnvelope = JsonSerializer.Deserialize<InteropEnvelope>(wireJson, InteropJson.Options);
        parsedEnvelope.Should().NotBeNull();
        parsedEnvelope!.Type.Should().Be("portal.teleconsult.guest_invite_issued");
        parsedEnvelope.To.Should().Be(Party.Portal);

        // Extract typed payload
        var restoredPayload = parsedEnvelope.GetPayload<GuestTeleconsultInviteIssuedPayload>();
        restoredPayload.Should().NotBeNull();
        restoredPayload!.AppointmentId.Should().Be(aptId);
        restoredPayload.CallId.Should().Be(callId);
        restoredPayload.InviteTokenHash.Should().Be("tokhash");
    }

    [Fact]
    public void CommsCallStateChangedPayload_MalformedGuid_ThrowsJsonException()
    {
        var malformedJson = """
        {
            "callId": "not-a-valid-guid",
            "tenantId": "t1",
            "facilityId": "f1",
            "kind": "Teleconsult",
            "status": "Admitted",
            "stateVersion": 1,
            "changedAtUtc": "2026-11-13T10:00:00Z"
        }
        """;

        var act = () => JsonSerializer.Deserialize<CommsCallStateChangedPayload>(malformedJson, InteropJson.Options);
        act.Should().Throw<JsonException>();
    }
}
