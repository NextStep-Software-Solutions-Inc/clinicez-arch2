using System;
using System.Linq;
using System.Text.Json;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Shared.Tests.Interop;

public class TeleconsultContractsTests
{
    [Fact]
    public void CommsCallStateChangedPayload_Defaults_RelayUrl_To_Null()
    {
        var callId = Guid.NewGuid();
        var payload = new CommsCallStateChangedPayload(
            CallId: callId,
            ConversationId: null,
            TenantId: "tenant-1",
            FacilityId: "clinic-1",
            Kind: CallKind.Teleconsult,
            Status: "Admitted",
            RoomName: "call-room-1",
            JoinToken: "token-abc",
            StateVersion: 1,
            ChangedAtUtc: DateTime.UtcNow
        );

        payload.RelayUrl.Should().BeNull();
    }

    [Fact]
    public void CommsCallStateChangedPayload_Can_Initialize_With_RelayUrl()
    {
        var callId = Guid.NewGuid();
        var relayUrl = "wss://livekit.clinicez.internal";
        var payload = new CommsCallStateChangedPayload(
            CallId: callId,
            ConversationId: null,
            TenantId: "tenant-1",
            FacilityId: "clinic-1",
            Kind: CallKind.Teleconsult,
            Status: "Admitted",
            RoomName: "call-room-1",
            JoinToken: "token-abc",
            StateVersion: 1,
            ChangedAtUtc: DateTime.UtcNow,
            RelayUrl: relayUrl
        );

        payload.RelayUrl.Should().Be(relayUrl);
    }

    [Fact]
    public void CommsCallStateChangedPayload_Serialization_Omits_RelayUrl_When_Null()
    {
        var payload = new CommsCallStateChangedPayload(
            CallId: Guid.NewGuid(),
            ConversationId: null,
            TenantId: "tenant-1",
            FacilityId: "clinic-1",
            Kind: CallKind.Teleconsult,
            Status: "Admitted",
            RoomName: "room-1",
            JoinToken: "tok-1",
            StateVersion: 1,
            ChangedAtUtc: DateTime.UtcNow,
            RelayUrl: null
        );

        var json = JsonSerializer.Serialize(payload, InteropJson.Options);
        json.Should().NotContain("relayUrl");
    }

    [Fact]
    public void CommsCallStateChangedPayload_Serialization_Includes_CamelCase_RelayUrl_When_Set()
    {
        var payload = new CommsCallStateChangedPayload(
            CallId: Guid.NewGuid(),
            ConversationId: null,
            TenantId: "tenant-1",
            FacilityId: "clinic-1",
            Kind: CallKind.Teleconsult,
            Status: "Admitted",
            RoomName: "room-1",
            JoinToken: "tok-1",
            StateVersion: 1,
            ChangedAtUtc: DateTime.UtcNow,
            RelayUrl: "wss://media.clinicez.internal"
        );

        var json = JsonSerializer.Serialize(payload, InteropJson.Options);
        json.Should().Contain("\"relayUrl\":\"wss://media.clinicez.internal\"");
    }

    [Fact]
    public void CommsCallStateChangedPayload_Deserialization_LegacyJson_Without_RelayUrl_Defaults_To_Null()
    {
        var callId = Guid.NewGuid();
        var legacyJson = $$"""
        {
            "callId": "{{callId}}",
            "conversationId": null,
            "tenantId": "tenant-1",
            "facilityId": "clinic-1",
            "kind": "Teleconsult",
            "status": "Admitted",
            "roomName": "room-legacy",
            "joinToken": "token-legacy",
            "stateVersion": 1,
            "changedAtUtc": "2026-11-13T10:00:00Z"
        }
        """;

        var deserialized = JsonSerializer.Deserialize<CommsCallStateChangedPayload>(legacyJson, InteropJson.Options);
        deserialized.Should().NotBeNull();
        deserialized!.CallId.Should().Be(callId);
        deserialized.RelayUrl.Should().BeNull();
    }

    [Fact]
    public void CommsCallStateChangedPayload_InteropEnvelope_Roundtrip_Preserves_RelayUrl()
    {
        var callId = Guid.NewGuid();
        var payload = new CommsCallStateChangedPayload(
            CallId: callId,
            ConversationId: null,
            TenantId: "tenant-1",
            FacilityId: "clinic-1",
            Kind: CallKind.Teleconsult,
            Status: "Admitted",
            RoomName: "room-1",
            JoinToken: "token-1",
            StateVersion: 1,
            ChangedAtUtc: DateTime.UtcNow,
            RelayUrl: "wss://livekit.cloud.example.com"
        );

        var envelope = InteropEnvelope.Create(
            InteropTypes.CommsCallStateChanged,
            Party.ForFacility("tenant-1", "clinic-1", FacilityType.Clinic),
            Party.ForPatient(Guid.NewGuid().ToString()),
            callId,
            payload
        );

        var roundtrip = envelope.GetPayload<CommsCallStateChangedPayload>();
        roundtrip.Should().NotBeNull();
        roundtrip!.RelayUrl.Should().Be("wss://livekit.cloud.example.com");
    }

    [Fact]
    public void InteropTypes_GuestTeleconsultInviteIssued_Constant_Matches_Specification()
    {
        InteropTypes.GuestTeleconsultInviteIssued.Should().Be("portal.teleconsult.guest_invite_issued");
    }

    [Fact]
    public void GuestTeleconsultInviteIssuedPayload_Can_Initialize_With_All_Required_Fields()
    {
        var appointmentId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        var now = DateTime.UtcNow;
        var expires = now.AddMinutes(60);

        var payload = new GuestTeleconsultInviteIssuedPayload(
            AppointmentId: appointmentId,
            CallId: callId,
            TenantId: "tenant-hospital",
            FacilityId: "clinic-branch-1",
            InviteTokenHash: "a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890",
            ExpectedDobHash: "b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890a1",
            OtpHash: "c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890a1b2",
            ExpiresAtUtc: expires,
            IssuedAtUtc: now
        );

        payload.AppointmentId.Should().Be(appointmentId);
        payload.CallId.Should().Be(callId);
        payload.TenantId.Should().Be("tenant-hospital");
        payload.FacilityId.Should().Be("clinic-branch-1");
        payload.InviteTokenHash.Should().Be("a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890");
        payload.ExpectedDobHash.Should().Be("b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890a1");
        payload.OtpHash.Should().Be("c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890a1b2");
        payload.ExpiresAtUtc.Should().Be(expires);
        payload.IssuedAtUtc.Should().Be(now);
    }

    [Fact]
    public void GuestTeleconsultInviteIssuedPayload_Enforces_Zero_Phi_Contract_Boundary()
    {
        var properties = typeof(GuestTeleconsultInviteIssuedPayload).GetProperties();
        var propertyNames = properties.Select(p => p.Name).ToList();

        propertyNames.Should().NotContain("DateOfBirth", "Raw date of birth must never be transmitted across interop boundary");
        propertyNames.Should().NotContain("Otp", "Plain-text OTP must never be transmitted across interop boundary");
        propertyNames.Should().NotContain("InviteToken", "Plain-text invite token must never be transmitted across interop boundary");
        propertyNames.Should().NotContain("PatientName", "Patient name is PHI and prohibited on interop wire");
        propertyNames.Should().NotContain("Mrn", "Patient MRN is PHI and prohibited on interop wire");

        propertyNames.Should().Contain("InviteTokenHash");
        propertyNames.Should().Contain("ExpectedDobHash");
        propertyNames.Should().Contain("OtpHash");
    }

    [Fact]
    public void GuestTeleconsultInviteIssuedPayload_InteropEnvelope_Roundtrip()
    {
        var appointmentId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        var payload = new GuestTeleconsultInviteIssuedPayload(
            AppointmentId: appointmentId,
            CallId: callId,
            TenantId: "tenant-1",
            FacilityId: "facility-1",
            InviteTokenHash: "hash-token",
            ExpectedDobHash: "hash-dob",
            OtpHash: "hash-otp",
            ExpiresAtUtc: now.AddHours(1),
            IssuedAtUtc: now
        );

        var envelope = InteropEnvelope.Create(
            InteropTypes.GuestTeleconsultInviteIssued,
            Party.ForFacility("tenant-1", "facility-1", FacilityType.Clinic),
            Party.Portal,
            appointmentId,
            payload
        );

        envelope.Type.Should().Be("portal.teleconsult.guest_invite_issued");
        envelope.To.Should().Be(Party.Portal);

        var restored = envelope.GetPayload<GuestTeleconsultInviteIssuedPayload>();
        restored.Should().NotBeNull();
        restored!.AppointmentId.Should().Be(appointmentId);
        restored.InviteTokenHash.Should().Be("hash-token");
        restored.ExpectedDobHash.Should().Be("hash-dob");
        restored.OtpHash.Should().Be("hash-otp");
    }
}
