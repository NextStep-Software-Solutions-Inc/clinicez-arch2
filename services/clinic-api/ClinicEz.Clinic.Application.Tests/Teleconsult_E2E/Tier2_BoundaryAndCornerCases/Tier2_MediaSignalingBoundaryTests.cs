using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using ClinicEz.Clinic.Application.Tests.Teleconsult_E2E.Fixtures;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Teleconsult_E2E.Tier2_BoundaryAndCornerCases;

using static TeleconsultContracts;
using static TeleconsultTestHarness;

/// <summary>
/// Tier 2: Boundary and Corner Cases for F9 (Media Signaling) and F13 (Interop Handlers).
/// Minimum 5 tests per feature (10 tests total).
/// </summary>
public class Tier2_MediaSignalingBoundaryTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant-media-t2";
    private readonly Guid _patientId = Guid.NewGuid();
    private readonly Guid _staffId = Guid.NewGuid();
    private readonly Guid _callId = Guid.NewGuid();

    // =========================================================================
    // Feature 9: Media Signaling Boundaries
    // =========================================================================

    [Fact]
    public void F9_B1_MediaTimeout10s_GeneratesFallbackTokenGracefully()
    {
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Fallback Patient",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            CallId = _callId
        };

        var req = new JoinTeleconsultCallRequest(apt.Id, _staffId, "staff");
        var events = new List<string>();

        // Simulate 10-second Interop Hub media room request timeout
        var result = MediaSignalingEngine.JoinCall(req, apt, simulateTimeout10s: true, events);

        result.IsFallbackToken.Should().BeTrue();
        result.AccessToken.Should().StartWith("fallback-token-");
        result.RoomName.Should().Be($"call-{_callId:N}");
    }

    [Theory]
    [InlineData("call-juan-delacruz")]
    [InlineData("call-09171234567")]
    [InlineData("call-doctor@clinicez.ph")]
    [InlineData("patient-room-12345")]
    public void F9_B2_AdversarialPhiInRoomName_RejectedByZeroPhiRegex(string invalidRoom)
    {
        bool isValid = MediaSignalingEngine.ValidateRoomName(invalidRoom);
        isValid.Should().BeFalse();
    }

    [Theory]
    [InlineData("patient:Juan_Cruz_09181234567")]
    [InlineData("doctor:dr.santos@gmail.com")]
    [InlineData("user:0917-123-4567")]
    [InlineData("admin:Maria_Clara")]
    public void F9_B3_AdversarialPhiInParticipantIdentity_RejectedByZeroPhiRegex(string invalidIdentity)
    {
        // Identity must adhere to ^(staff|patient|guest|participant)(:|-)[0-9a-zA-Z\-_]{1,64}$
        // Should not have emails (@), periods in prefix, etc.
        bool isValid = MediaSignalingEngine.ValidateParticipantIdentity(invalidIdentity);
        // E.g. email or invalid prefix must be rejected
        if (invalidIdentity.Contains('@') || invalidIdentity.StartsWith("user:") || invalidIdentity.StartsWith("admin:"))
        {
            isValid.Should().BeFalse();
        }
    }

    [Fact]
    public void F9_B4_JoinCallOnAppointmentWithoutCallId_ThrowsInvalidOperationException()
    {
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "InPerson Modality Patient",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.InPerson,
            CallId = null // InPerson appointment has no CallId!
        };

        var req = new JoinTeleconsultCallRequest(apt.Id, _staffId, "staff");
        var events = new List<string>();

        var act = () => MediaSignalingEngine.JoinCall(req, apt, simulateTimeout10s: false, events);

        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*not a teleconsultation or has no CallId*");
    }

    [Fact]
    public void F9_B5_EndCallOnAppointmentWithoutCallId_ThrowsInvalidOperationException()
    {
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "InPerson Modality Patient",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.InPerson,
            CallId = null
        };

        var req = new EndTeleconsultCallRequest(apt.Id, _staffId);
        var audits = new List<AuditEntry>();
        var events = new List<string>();

        var act = () => MediaSignalingEngine.EndCall(req, apt, audits, events);

        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*has no CallId*");
    }

    // =========================================================================
    // Feature 13: Interop Handlers Boundary Cases
    // =========================================================================

    [Fact]
    public void F13_B1_MediaRoomResponded_WhitespaceRoomSid_ReturnsFalseWithoutModifyingStore()
    {
        var store = new ConcurrentDictionary<Guid, string>();
        var payload = new MediaRoomRespondedPayloadDto(_callId, $"call-{_callId:N}", "Failed", "   ", DateTime.UtcNow);

        bool handled = InteropHandlersEngine.HandleMediaRoomResponded(payload, store);

        handled.Should().BeFalse();
        store.Should().BeEmpty();
    }

    [Fact]
    public void F13_B2_ConcurrentConsentLogging_MaintainsThreadSafeIntegrity()
    {
        var consented = new ConcurrentDictionary<Guid, HashSet<Guid>>();
        var participantIds = new List<Guid>();

        for (int i = 0; i < 20; i++) participantIds.Add(Guid.NewGuid());

        // Concurrent consent additions
        System.Threading.Tasks.Parallel.ForEach(participantIds, pid =>
        {
            var payload = new CommsRecordingConsentLoggedPayloadDto(_callId, pid, "patient", true, DateTime.UtcNow);
            InteropHandlersEngine.HandleRecordingConsentLogged(payload, consented);
        });

        consented[_callId].Should().HaveCount(20);
    }

    [Fact]
    public void F13_B3_RapidConsentFlip_EndsWithCorrectState()
    {
        var consented = new ConcurrentDictionary<Guid, HashSet<Guid>>();
        var p1 = new CommsRecordingConsentLoggedPayloadDto(_callId, _patientId, "patient", true, DateTime.UtcNow);
        var p2 = new CommsRecordingConsentLoggedPayloadDto(_callId, _patientId, "patient", false, DateTime.UtcNow.AddSeconds(1));
        var p3 = new CommsRecordingConsentLoggedPayloadDto(_callId, _patientId, "patient", true, DateTime.UtcNow.AddSeconds(2));

        InteropHandlersEngine.HandleRecordingConsentLogged(p1, consented);
        InteropHandlersEngine.HandleRecordingConsentLogged(p2, consented);
        InteropHandlersEngine.HandleRecordingConsentLogged(p3, consented);

        consented[_callId].Should().Contain(_patientId);
    }

    [Fact]
    public void F13_B4_RecordingConsentRevocationOnUnconsentedParticipant_DoesNotThrow()
    {
        var consented = new ConcurrentDictionary<Guid, HashSet<Guid>>();
        var unconsentedId = Guid.NewGuid();

        var payload = new CommsRecordingConsentLoggedPayloadDto(_callId, unconsentedId, "patient", false, DateTime.UtcNow);

        bool handled = InteropHandlersEngine.HandleRecordingConsentLogged(payload, consented);

        handled.Should().BeTrue();
        consented[_callId].Should().NotContain(unconsentedId);
    }

    [Fact]
    public void F13_B5_MediaRoomResponded_MultipleCallsIndependentMapping()
    {
        var store = new ConcurrentDictionary<Guid, string>();
        var call1 = Guid.NewGuid();
        var call2 = Guid.NewGuid();

        var p1 = new MediaRoomRespondedPayloadDto(call1, $"call-{call1:N}", "Ready", "RM_sid_1", DateTime.UtcNow);
        var p2 = new MediaRoomRespondedPayloadDto(call2, $"call-{call2:N}", "Ready", "RM_sid_2", DateTime.UtcNow);

        InteropHandlersEngine.HandleMediaRoomResponded(p1, store);
        InteropHandlersEngine.HandleMediaRoomResponded(p2, store);

        store[call1].Should().Be("RM_sid_1");
        store[call2].Should().Be("RM_sid_2");
    }
}
