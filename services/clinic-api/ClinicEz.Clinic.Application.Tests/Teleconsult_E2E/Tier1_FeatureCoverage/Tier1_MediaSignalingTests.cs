using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using ClinicEz.Clinic.Application.Tests.Teleconsult_E2E.Fixtures;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Teleconsult_E2E.Tier1_FeatureCoverage;

using static TeleconsultContracts;
using static TeleconsultTestHarness;

/// <summary>
/// Tier 1: Feature Coverage for F9 (Media Signaling Join/End Call) and F13 (Interop Handlers & Registration).
/// Minimum 5 tests per feature (10 tests total).
/// </summary>
public class Tier1_MediaSignalingTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant-media-t1";
    private readonly Guid _patientId = Guid.NewGuid();
    private readonly Guid _staffId = Guid.NewGuid();
    private readonly Guid _callId = Guid.NewGuid();

    // =========================================================================
    // Feature 9: Media Signaling Join/End Call
    // =========================================================================

    [Fact]
    public void F9_T1_JoinCall_GeneratesZeroPhiRoomName()
    {
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Pedro Paterno",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            CallId = _callId
        };

        var req = new JoinTeleconsultCallRequest(apt.Id, _staffId, "staff", "Dr. Paterno");
        var events = new List<string>();

        var result = MediaSignalingEngine.JoinCall(req, apt, simulateTimeout10s: false, events);

        result.RoomName.Should().MatchRegex(@"^call-[0-9a-fA-F\-]{32,36}$");
        result.RoomName.Should().Be($"call-{_callId:N}");
    }

    [Fact]
    public void F9_T2_JoinCall_GeneratesZeroPhiParticipantIdentity()
    {
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Mariano Ponce",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            CallId = _callId
        };

        var req = new JoinTeleconsultCallRequest(apt.Id, _patientId, "patient", "Patient Ponce");
        var events = new List<string>();

        var result = MediaSignalingEngine.JoinCall(req, apt, simulateTimeout10s: false, events);

        result.ParticipantIdentity.Should().MatchRegex(@"^(staff|patient|guest|participant)(:|-)[0-9a-zA-Z\-_]{1,64}$");
        result.ParticipantIdentity.Should().Be($"patient:{_patientId:N}");
    }

    [Fact]
    public void F9_T3_JoinCall_EnqueuesCommsCallStateChangedEvent()
    {
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Galicano Apacible",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            CallId = _callId
        };

        var req = new JoinTeleconsultCallRequest(apt.Id, _staffId, "staff");
        var events = new List<string>();

        var result = MediaSignalingEngine.JoinCall(req, apt, simulateTimeout10s: false, events);

        events.Should().Contain(e => e.StartsWith($"comms.call.state.changed:{_callId}:Joined:"));
    }

    [Fact]
    public void F9_T4_EndCall_TransitionsStatusToEndedAndEnqueuesStateChanged()
    {
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Felipe Calderon",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            CallId = _callId
        };

        var req = new EndTeleconsultCallRequest(apt.Id, _staffId, "Consultation completed");
        var audits = new List<AuditEntry>();
        var events = new List<string>();

        var result = MediaSignalingEngine.EndCall(req, apt, audits, events);

        result.Status.Should().Be("Ended");
        result.CommsCallStateChangedEnqueued.Should().BeTrue();
        events.Should().Contain($"comms.call.state.changed:{_callId}:Ended");
    }

    [Fact]
    public void F9_T5_EndCall_WritesWormAuditEntry()
    {
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Epifanio de los Santos",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            CallId = _callId
        };

        var req = new EndTeleconsultCallRequest(apt.Id, _staffId, "Completed SOAP documentation");
        var audits = new List<AuditEntry>();
        var events = new List<string>();

        var result = MediaSignalingEngine.EndCall(req, apt, audits, events);

        result.WormAuditLogged.Should().BeTrue();
        audits.Should().ContainSingle();
        var entry = audits[0];
        entry.Action.Should().Be("teleconsult.call.ended");
        entry.TargetEntityType.Should().Be("Appointment");
        entry.TargetEntityId.Should().Be(apt.Id.ToString());
    }

    // =========================================================================
    // Feature 13: Interop Handlers & Registration
    // =========================================================================

    [Fact]
    public void F13_T1_MediaRoomResponded_StoresRoomSid()
    {
        var store = new ConcurrentDictionary<Guid, string>();
        var payload = new MediaRoomRespondedPayloadDto(_callId, $"call-{_callId:N}", "Ready", "RM_livekit_sid_12345", DateTime.UtcNow);

        bool handled = InteropHandlersEngine.HandleMediaRoomResponded(payload, store);

        handled.Should().BeTrue();
        store[_callId].Should().Be("RM_livekit_sid_12345");
    }

    [Fact]
    public void F13_T2_MediaRoomResponded_DuplicateDelivery_IsIdempotent()
    {
        var store = new ConcurrentDictionary<Guid, string>();
        var payload1 = new MediaRoomRespondedPayloadDto(_callId, $"call-{_callId:N}", "Ready", "RM_livekit_sid_9999", DateTime.UtcNow);
        var payload2 = new MediaRoomRespondedPayloadDto(_callId, $"call-{_callId:N}", "Ready", "RM_livekit_sid_9999", DateTime.UtcNow.AddSeconds(1));

        InteropHandlersEngine.HandleMediaRoomResponded(payload1, store);
        bool handledAgain = InteropHandlersEngine.HandleMediaRoomResponded(payload2, store);

        handledAgain.Should().BeTrue();
        store[_callId].Should().Be("RM_livekit_sid_9999");
    }

    [Fact]
    public void F13_T3_RecordingConsentLogged_ConsentGranted_AddsParticipant()
    {
        var consented = new ConcurrentDictionary<Guid, HashSet<Guid>>();
        var payload = new CommsRecordingConsentLoggedPayloadDto(_callId, _patientId, "patient", true, DateTime.UtcNow);

        bool handled = InteropHandlersEngine.HandleRecordingConsentLogged(payload, consented);

        handled.Should().BeTrue();
        consented[_callId].Should().Contain(_patientId);
    }

    [Fact]
    public void F13_T4_RecordingConsentLogged_ConsentRevoked_RemovesParticipant()
    {
        var consented = new ConcurrentDictionary<Guid, HashSet<Guid>>();
        var grantPayload = new CommsRecordingConsentLoggedPayloadDto(_callId, _patientId, "patient", true, DateTime.UtcNow);
        var revokePayload = new CommsRecordingConsentLoggedPayloadDto(_callId, _patientId, "patient", false, DateTime.UtcNow.AddMinutes(5));

        InteropHandlersEngine.HandleRecordingConsentLogged(grantPayload, consented);
        bool revoked = InteropHandlersEngine.HandleRecordingConsentLogged(revokePayload, consented);

        revoked.Should().BeTrue();
        consented[_callId].Should().NotContain(_patientId);
    }

    [Fact]
    public void F13_T5_MediaRoomResponded_EmptyRoomSid_ReturnsFalse()
    {
        var store = new ConcurrentDictionary<Guid, string>();
        var payload = new MediaRoomRespondedPayloadDto(_callId, $"call-{_callId:N}", "Failed", "", DateTime.UtcNow);

        bool handled = InteropHandlersEngine.HandleMediaRoomResponded(payload, store);

        handled.Should().BeFalse();
        store.Should().NotContainKey(_callId);
    }
}
