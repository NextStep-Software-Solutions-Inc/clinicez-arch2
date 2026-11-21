using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Text;
using ClinicEz.Clinic.Application.Tests.Teleconsult_E2E.Fixtures;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Shared.Interop.Contracts;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Teleconsult_E2E.Tier3_CrossFeatureInteractions;

using static TeleconsultContracts;
using static TeleconsultTestHarness;

/// <summary>
/// Tier 3: Cross-Feature Interactions & Multi-Feature Integration Workflows.
/// Verifies pairwise and end-to-end multi-feature journeys connecting F1 through F13.
/// </summary>
public class Tier3_TeleconsultCrossFeatureInteractionTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant-cross-t3";
    private readonly Guid _patientId = Guid.NewGuid();
    private readonly Guid _staffId = Guid.NewGuid();
    private readonly Guid _doctorId = Guid.NewGuid();

    [Fact]
    public void Flow1_FullPrepaidLifecycle_FromSettingsToBookingCashierSignalingAndVault()
    {
        // Step 1: F2 - Facility Settings configuration
        var currentSettings = new FacilityTeleconsultSettingsDto(_clinicId, _tenantId);
        var settingsCmd = new UpdateFacilityTeleconsultSettingsCommand(
            TeleconsultRecordingPolicy: "WorkspaceVaultOnly",
            TeleconsultRecordingRetentionDays: 90,
            TeleconsultRecordingConsentRequired: true,
            TeleconsultPaymentPolicy: "Prepaid",
            TeleconsultDefaultFee: 450.00m);
        var settings = FacilitySettingsEngine.ApplyUpdate(currentSettings, settingsCmd);

        // Step 2: F3 - Booking teleconsultation
        var appointments = new List<Appointment>();
        var invoices = new List<Invoice>();
        var events = new List<string>();

        var bookingReq = new CreateTeleconsultAppointmentDto(
            _clinicId, _tenantId, _patientId, "Leandro Locsin",
            DateTime.UtcNow.AddDays(1), 30, AppointmentType: "Teleconsult", CashierMode: "CashierCounter");
        var bookingResult = BookingAndBillingEngine.CreateAppointment(bookingReq, settings, appointments, invoices, events);

        bookingResult.IsTeleconsult.Should().BeTrue();
        bookingResult.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Pending);
        bookingResult.BilledAmount.Should().Be(450.00m);
        events.Should().Contain(e => e.StartsWith("billing.invoice.requested:"));

        // Step 3: F4 - Metadata projection verification
        var apt = appointments[0];
        var dto = MetadataProjectionEngine.Project(apt);
        dto.IsTeleconsult.Should().BeTrue();
        dto.PaymentStatus.Should().Be("Pending");

        // Step 4: F5 - Cashier payment settlement
        var paymentCmd = new CashierPaymentCommandDto(
            bookingResult.InvoiceId!.Value, apt.Id, 450.00m, "Cash", "RCP-FLOW1-001", _staffId, DateTime.UtcNow);
        var paymentResult = CashierPaymentEngine.RecordPayment(paymentCmd, invoices, appointments, events);

        paymentResult.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Paid);
        events.Should().Contain(e => e.StartsWith($"comms.call.payment.cleared:{apt.CallId}:"));

        // Step 5: F9 - Join call
        var joinReq = new JoinTeleconsultCallRequest(apt.Id, _doctorId, "staff", "Dr. Ramon");
        var joinResult = MediaSignalingEngine.JoinCall(joinReq, apt, simulateTimeout10s: false, events);
        joinResult.RoomName.Should().Be($"call-{apt.CallId!.Value:N}");

        // Step 6: F10 - Encrypted Vault recording chunk upload
        var sessionId = Guid.NewGuid();
        var rawPayload = Encoding.UTF8.GetBytes("AUDIO_VIDEO_PAYLOAD_FLOW1");
        var segmentResult = VaultEncryptionEngine.EncryptAndStoreSegment(sessionId, Guid.NewGuid(), 0, rawPayload);
        segmentResult.SidecarKeyPath.Should().EndWith(".key");

        // Verify on-the-fly decryption
        var decrypted = VaultEncryptionEngine.DecryptSegment(
            segmentResult.Ciphertext, segmentResult.Iv, segmentResult.AuthTag, segmentResult.EncryptedDek);
        decrypted.Should().Equal(rawPayload);

        // Step 7: F12 - Consultation encounter linkage
        var consultationId = Guid.NewGuid();
        var session = new TeleconsultRecordingSession
        {
            Id = sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            AppointmentId = apt.Id,
            PatientId = _patientId,
            PatientName = "Leandro Locsin",
            DoctorId = _doctorId,
            DoctorName = "Dr. Ramon"
        };
        var linkageResult = EncounterLinkageEngine.LinkEncounter(consultationId, apt.Id, new List<TeleconsultRecordingSession> { session });
        linkageResult.LinkageSuccessful.Should().BeTrue();
        session.ConsultationId.Should().Be(consultationId);

        // Step 8: F9 - End call and audit log
        var audits = new List<AuditEntry>();
        var endResult = MediaSignalingEngine.EndCall(new EndTeleconsultCallRequest(apt.Id, _doctorId), apt, audits, events);
        endResult.Status.Should().Be("Ended");
        audits.Should().ContainSingle(a => a.Action == "teleconsult.call.ended");
    }

    [Fact]
    public void Flow2_YakapEnlistmentWithStaffPolicySwitchToExempt()
    {
        // Step 1: Patient with active Yakap enlistment
        var patient = new Patient
        {
            Id = _patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-FLOW2",
            FirstName = "Carlos",
            LastName = "Romulo",
            ContactNumber = "+639171234567",
            DateOfBirth = new DateOnly(1899, 1, 14)
        };
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            EffectiveYear = 2026,
            EnlistmentDate = new DateOnly(2026, 1, 1),
            ValidUntil = new DateOnly(2026, 12, 31),
            Status = YakapEnlistmentStatus.Active
        });

        // Step 2: Book prepaid appointment
        var settings = new FacilityTeleconsultSettingsDto(_clinicId, _tenantId);
        var appointments = new List<Appointment>();
        var invoices = new List<Invoice>();
        var events = new List<string>();

        var bookingReq = new CreateTeleconsultAppointmentDto(
            _clinicId, _tenantId, _patientId, "Carlos Romulo",
            new DateTime(2026, 6, 1, 10, 0, 0, DateTimeKind.Utc), 30, AppointmentType: "Teleconsult");
        var bookingResult = BookingAndBillingEngine.CreateAppointment(bookingReq, settings, appointments, invoices, events);

        // Step 3: F6 - Yakap Evaluation surfaces badge without mutating appointment
        var apt = appointments[0];
        var yakapEval = YakapStatusEngine.Evaluate(apt, patient, new DateOnly(2026, 6, 1));
        yakapEval.HasActiveYakapEnlistment.Should().BeTrue();
        yakapEval.PolicyWasMutated.Should().BeFalse();
        apt.PaymentPolicy.Should().Be(TeleconsultPaymentPolicy.Prepaid);
        apt.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Pending);

        // Step 4: F8 - Staff switches policy to Exempt after seeing badge
        var switchResult = PaymentPolicySwitchEngine.SwitchPolicy(apt, "Exempt", invoices);
        switchResult.NewPolicy.Should().Be(TeleconsultPaymentPolicy.Exempt);
        switchResult.UpdatedStatus.Should().Be(TeleconsultPaymentStatus.Exempt);
        apt.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Exempt);

        // Step 5: F9 - Join call proceeds without prepayment lock
        var joinResult = MediaSignalingEngine.JoinCall(
            new JoinTeleconsultCallRequest(apt.Id, _patientId, "patient"), apt, false, events);
        joinResult.RoomName.Should().StartWith("call-");
    }

    [Fact]
    public void Flow3_EmergencyPlainNoteOverrideAndImmediateAdmission()
    {
        // Step 1: Book prepaid appointment (Pending status)
        var settings = new FacilityTeleconsultSettingsDto(_clinicId, _tenantId);
        var appointments = new List<Appointment>();
        var invoices = new List<Invoice>();
        var events = new List<string>();

        var bookingReq = new CreateTeleconsultAppointmentDto(
            _clinicId, _tenantId, _patientId, "Lorenzo Tañada",
            DateTime.UtcNow, 30, AppointmentType: "Teleconsult", PaymentPolicy: "Prepaid");
        BookingAndBillingEngine.CreateAppointment(bookingReq, settings, appointments, invoices, events);

        var apt = appointments[0];
        apt.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Pending);

        // Step 2: F7 - Staff with ConsultationsWrite applies plain-note override (>= 5 chars)
        var audits = new List<AuditEntry>();
        var overrideReq = new PlainNoteAdmissionOverrideRequest(
            apt.Id, "Patient presents acute chest pain, immediate emergency teleconsultation authorized.");
        var overrideResult = AdmissionOverrideEngine.ExecuteOverride(
            overrideReq, apt, hasConsultationsWrite: true, hasConsultationsSign: false,
            _staffId, "Nurse Santos", audits, events);

        overrideResult.IsEmergencyOverride.Should().BeTrue();
        overrideResult.ReasonCode.Should().Be("STAFF-OVERRIDE"); // defaulted!
        overrideResult.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Overridden);
        audits.Should().ContainSingle(a => a.Severity == ClinicAuditSeverities.Emergency);
        events.Should().Contain(e => e.StartsWith($"comms.call.payment.cleared:{apt.CallId}:STAFF-OVERRIDE"));

        // Step 3: F9 - Patient joins call immediately
        var joinResult = MediaSignalingEngine.JoinCall(
            new JoinTeleconsultCallRequest(apt.Id, _patientId, "patient"), apt, false, events);
        joinResult.AccessToken.Should().NotBeNullOrWhiteSpace();

        // Step 4: F10 - Encrypt recording
        var sessionId = Guid.NewGuid();
        var enc = VaultEncryptionEngine.EncryptAndStoreSegment(sessionId, Guid.NewGuid(), 0, Encoding.UTF8.GetBytes("DATA"));
        enc.SidecarKeyPath.Should().EndWith(".key");
    }

    [Fact]
    public void Flow4_LegalHoldDefenseAndSweeperLifecycle()
    {
        var sessionId = Guid.NewGuid();
        var seg1 = $"recordings/{sessionId:N}/segments/seg_00000.mp4";
        var seg1Key = $"{seg1}.key";
        var manifest = $"recordings/{sessionId:N}/manifest.json";
        var manifestKey = $"{manifest}.key";

        var bucket = new HashSet<string> { seg1, seg1Key, manifest, manifestKey };

        var session = new TeleconsultRecordingSession
        {
            Id = sessionId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Claro Recto",
            DoctorId = _doctorId,
            DoctorName = "Dr. Recto",
            ManifestStorageKey = manifest,
            IsLegalHold = true,
            LegalHoldReason = "Court Subpoena 2026-A"
        };

        var segments = new List<TeleconsultRecordingSegment>
        {
            new() { Id = Guid.NewGuid(), SessionId = sessionId, StorageKey = seg1, SegmentIndex = 0, Sha256Checksum = "s", IvBase64 = "iv", TagBase64 = "t" }
        };

        // Sweep 1: Defended by legal hold
        var res1 = RecordingSweeperEngine.ExecuteRetentionPurge(session, segments, bucket, retentionDays: 90);
        res1.IsLegalHoldProtected.Should().BeTrue();
        res1.SegmentsPurged.Should().Be(0);
        bucket.Should().HaveCount(4);

        // Legal hold released
        session.IsLegalHold = false;

        // Sweep 2: Complete purge of media segments AND .key sidecars
        var res2 = RecordingSweeperEngine.ExecuteRetentionPurge(session, segments, bucket, retentionDays: 90);
        res2.IsLegalHoldProtected.Should().BeFalse();
        res2.SegmentsPurged.Should().Be(1);
        res2.SidecarKeysPurged.Should().Be(1);
        res2.ManifestPurged.Should().BeTrue();
        res2.ManifestSidecarPurged.Should().BeTrue();
        bucket.Should().BeEmpty();
    }

    [Fact]
    public void Flow5_PostpaidBookingToPrepaidSwitchAndCashiering()
    {
        var settings = new FacilityTeleconsultSettingsDto(_clinicId, _tenantId);
        var appointments = new List<Appointment>();
        var invoices = new List<Invoice>();
        var events = new List<string>();

        // Book postpaid
        var bookingReq = new CreateTeleconsultAppointmentDto(
            _clinicId, _tenantId, _patientId, "Vicente Lim",
            DateTime.UtcNow, 30, AppointmentType: "Teleconsult", PaymentPolicy: "Postpaid");
        BookingAndBillingEngine.CreateAppointment(bookingReq, settings, appointments, invoices, events);

        var apt = appointments[0];
        apt.InvoiceId.Should().BeNull();

        // Switch to Prepaid
        var switchRes = PaymentPolicySwitchEngine.SwitchPolicy(apt, "Prepaid", invoices, defaultFee: 500.00m);
        switchRes.NewPolicy.Should().Be(TeleconsultPaymentPolicy.Prepaid);
        apt.InvoiceId.Should().NotBeNull();
        invoices.Should().ContainSingle(i => i.Id == apt.InvoiceId.Value);

        // Pay at cashier
        var payCmd = new CashierPaymentCommandDto(
            apt.InvoiceId.Value, apt.Id, 500.00m, "CreditCard", "RCP-CC-901", _staffId, DateTime.UtcNow);
        var payRes = CashierPaymentEngine.RecordPayment(payCmd, invoices, appointments, events);
        payRes.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Paid);
        apt.PaymentStatus.Should().Be(TeleconsultPaymentStatus.Paid);
    }

    [Fact]
    public void Flow6_MediaSignalingAndInteropConsentPlaybackTicketFlow()
    {
        var callId = Guid.NewGuid();
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = _patientId,
            PatientName = "Juan Sumulong",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            CallId = callId
        };

        var events = new List<string>();
        var roomStore = new ConcurrentDictionary<Guid, string>();
        var consentStore = new ConcurrentDictionary<Guid, HashSet<Guid>>();

        // Signaling Join
        var join = MediaSignalingEngine.JoinCall(new JoinTeleconsultCallRequest(apt.Id, _staffId, "staff"), apt, false, events);

        // Interop handler: Room Responded
        InteropHandlersEngine.HandleMediaRoomResponded(
            new MediaRoomRespondedPayloadDto(callId, join.RoomName, "Ready", "RM_livekit_sid_flow6", DateTime.UtcNow), roomStore);
        roomStore[callId].Should().Be("RM_livekit_sid_flow6");

        // Interop handler: Consent Logged
        InteropHandlersEngine.HandleRecordingConsentLogged(
            new CommsRecordingConsentLoggedPayloadDto(callId, _patientId, "patient", true, DateTime.UtcNow), consentStore);
        consentStore[callId].Should().Contain(_patientId);

        // Vault Recording: Generate 15-minute Playback Ticket
        var sessionId = Guid.NewGuid();
        var ticket = VaultEncryptionEngine.GeneratePlaybackTicket(sessionId, durationMinutes: 15);
        bool ticketValid = VaultEncryptionEngine.ValidatePlaybackTicket(ticket.Ticket, sessionId);
        ticketValid.Should().BeTrue();
    }
}
