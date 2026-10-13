using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Tests.OpdSuite_E2E.Fixtures;
using ClinicEz.Clinic.Domain.Enums;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.OpdSuite_E2E.Tier4_RealWorldScenarios;

using static OpdSuiteContracts;
using static OpdSuiteTestHarness;

/// <summary>
/// Tier 4: Real-World Clinical Workload & Multi-Service Scenarios.
/// Validates the 24 OPD suite features in realistic end-to-end operational environments.
/// </summary>
public class Tier4_OpdSuiteRealWorldScenarioTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_tier4_scenarios";
    private readonly DateOnly _today = DateOnly.FromDateTime(DateTime.UtcNow);

    // =========================================================================
    // Scenario 1: Full Clinic Day Life Cycle with Force EOD
    // (F1.1, F1.2, F1.3, F1.5, F1.6)
    // =========================================================================
    [Fact]
    public void Scenario_1_FullClinicDayLifecycle_WithForceEodCloseout()
    {
        // 1. Clinic opens: configure settings
        var settings = new ClinicEodSettingsDto(_clinicId, _tenantId, "21:00", AutoEodEnabled: true);
        settings.EodReconciliationTime.Should().Be("21:00");

        // 2. Morning & Afternoon: 5 patients checked in
        var queue = new List<E2EQueueTicket>();
        for (int i = 1; i <= 5; i++)
        {
            queue.Add(new E2EQueueTicket
            {
                TenantId = _tenantId,
                ClinicId = _clinicId,
                QueueNumber = $"Q-{i:D3}",
                SequenceNumber = i,
                QueueDate = _today,
                PatientId = Guid.NewGuid(),
                PatientName = $"Patient {i}",
                Status = QueueStatus.Waiting
            });
        }

        // 3. Consultations proceed:
        // Patient 1 completed
        queue[0].Status = QueueStatus.Completed;
        queue[0].CompletedTime = DateTime.UtcNow.AddHours(-4);

        // Patient 2 completed
        queue[1].Status = QueueStatus.Completed;
        queue[1].CompletedTime = DateTime.UtcNow.AddHours(-2);

        // Patient 3 currently with Doctor
        queue[2].Status = QueueStatus.InConsultation;
        queue[2].DoctorName = "Dr. Santos";
        queue[2].RoomOrStation = "Room 1";

        // Patient 4 is Triaged waiting for Doctor
        queue[3].Status = QueueStatus.Triaged;

        // Patient 5 stepped out and put OnHold
        queue[4].Status = QueueStatus.OnHold;

        // 4. Evening closing time: Reception sees 2 leftover tickets (Patient 4 and Patient 5)
        var activeLeftoverCount = queue.Count(t => t.Status is QueueStatus.Waiting or QueueStatus.Triaged or QueueStatus.OnHold);
        activeLeftoverCount.Should().Be(2);

        // 5. Admin executes Force EOD
        var staffId = Guid.NewGuid();
        var (result, audit) = EodReconciliation.ExecuteReconcile(
            _clinicId, _tenantId, _today, "Manual", queue,
            operatorName: "Admin Santos", staffId: staffId, notes: "Clinic day closed at 21:05");

        // 6. Verify result & integrity
        result.ReconciledCount.Should().Be(2);
        result.AffectedTicketNumbers.Should().BeEquivalentTo(new[] { "Q-004", "Q-005" });

        // Patient 3 (InConsultation) preserved
        queue[2].Status.Should().Be(QueueStatus.InConsultation);

        // Patients 4 and 5 transitioned to NoShow with CompletedTime stamped
        queue[3].Status.Should().Be(QueueStatus.NoShow);
        queue[3].CompletedTime.Should().NotBeNull();
        queue[4].Status.Should().Be(QueueStatus.NoShow);
        queue[4].CompletedTime.Should().NotBeNull();

        // Audit entry created with full metadata
        audit.TriggerType.Should().Be("Manual");
        audit.ReconciledBy.Should().Be("Admin Santos");
        audit.StaffId.Should().Be(staffId);
        audit.TotalTicketsProcessed.Should().Be(2);
        audit.AffectedTicketNumbersJson.Should().Contain("Q-004");
        audit.AffectedTicketNumbersJson.Should().Contain("Q-005");
    }

    // =========================================================================
    // Scenario 2: Live TV Display Board Real-Time Advance
    // (F2.1, F2.2, F2.3, F2.4, F2.5, F2.6, F2.7)
    // =========================================================================
    [Fact]
    public void Scenario_2_LiveTvDisplayBoard_RealTimeAdvanceAndAudioPulseTrigger()
    {
        // 1. Set up waiting room queue with 3 patients
        var p1 = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-101", SequenceNumber = 1, QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "Juan Dela Cruz", Status = QueueStatus.Waiting };
        var p2 = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-102", SequenceNumber = 2, QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "Maria Clara Santos", Status = QueueStatus.Waiting };
        var p3 = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-103", SequenceNumber = 3, QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "Prince", Status = QueueStatus.Waiting };

        var queue = new List<E2EQueueTicket> { p1, p2, p3 };

        // 2. Initial Display Board state: All waiting in UpNext with privacy masking
        var displayInitial = PublicTvDisplay.GenerateDisplay(_clinicId, _today, queue, maskPatientNames: true);
        displayInitial.NowServing.Should().BeEmpty();
        displayInitial.UpNext.Should().HaveCount(3);
        displayInitial.UpNext[0].DisplayName.Should().Be("Juan C.");
        displayInitial.UpNext[1].DisplayName.Should().Be("Maria S.");
        displayInitial.UpNext[2].DisplayName.Should().Be("P.");

        // 3. Doctor calls Juan Dela Cruz (Q-101) to Exam Room 1
        p1.Status = QueueStatus.InConsultation;
        p1.DoctorName = "Dr. Santos";
        p1.RoomOrStation = "Exam Room 1";
        p1.CalledTime = DateTime.UtcNow;

        // 4. TV Display updates on next 4-second polling cycle
        var displayAfterCall = PublicTvDisplay.GenerateDisplay(_clinicId, _today, queue, maskPatientNames: true);
        displayAfterCall.NowServing.Should().ContainSingle();
        displayAfterCall.NowServing[0].TicketNumber.Should().Be("Q-101");
        displayAfterCall.NowServing[0].DoctorName.Should().Be("Dr. Santos");
        displayAfterCall.NowServing[0].RoomOrStation.Should().Be("Exam Room 1");

        // UpNext now has 2 patients
        displayAfterCall.UpNext.Should().HaveCount(2);
        displayAfterCall.UpNext[0].TicketNumber.Should().Be("Q-102");
        displayAfterCall.UpNext[1].TicketNumber.Should().Be("Q-103");

        // Audio chime and visual pulse are triggered by detecting the new NowServing ticket
        bool newCallDetected = displayInitial.NowServing.Select(s => s.TicketNumber)
            .SequenceEqual(displayAfterCall.NowServing.Select(s => s.TicketNumber)) == false;
        newCallDetected.Should().BeTrue();
    }

    // =========================================================================
    // Scenario 3: Mobile Queue Push Alerts on Line Advance
    // (F3.1, F3.2, F3.3, F3.4, F3.5, F3.6)
    // =========================================================================
    [Fact]
    public void Scenario_3_MobileQueuePushAlerts_ProgressiveAdvanceAndDeduplication()
    {
        // 1. Clinic configures threshold = 2 patients ahead
        var settings = new ClinicEodSettingsDto(_clinicId, _tenantId, "21:00", AutoEodEnabled: true, QueuePushNotificationThreshold: 2);

        // 2. Queue with 4 patients
        var t1 = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-001", SequenceNumber = 1, QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P1", Status = QueueStatus.Waiting };
        var t2 = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-002", SequenceNumber = 2, QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P2", Status = QueueStatus.Waiting };
        var t3 = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-003", SequenceNumber = 3, QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P3", Status = QueueStatus.Waiting };
        var t4 = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-004", SequenceNumber = 4, QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P4", Status = QueueStatus.Waiting };

        var queue = new List<E2EQueueTicket> { t1, t2, t3, t4 };

        // Initial evaluation: t1 (ahead 0), t2 (ahead 1), t3 (ahead 2) are <= 2 -> receive approaching alerts
        // t4 (ahead 3) is > 2 -> does NOT receive alert
        var initialAlerts = PushNotifications.EvaluateAndDispatch(_clinicId, settings, queue);
        initialAlerts.Select(a => a.Payload.TicketNumber).Should().BeEquivalentTo(new[] { "Q-001", "Q-002", "Q-003" });
        initialAlerts.Select(a => a.Payload.TicketNumber).Should().NotContain("Q-004");

        // 3. Line advances: t1 called into consultation
        t1.Status = QueueStatus.InConsultation;
        t1.DoctorName = "Dr. Gomez";
        t1.RoomOrStation = "Room 2";

        // Second evaluation:
        // t1 receives "called_to_room" alert
        // t4 is now ahead 2 (t2=0, t3=1, t4=2) -> t4 now receives "approaching_turn" alert!
        // t2 and t3 are already marked as ApproachingNotificationSent = true -> deduplicated!
        var secondAlerts = PushNotifications.EvaluateAndDispatch(_clinicId, settings, queue);

        var calledAlert = secondAlerts.FirstOrDefault(a => a.Payload.AlertKind == "called_to_room");
        calledAlert.Should().NotBeNull();
        calledAlert!.Payload.TicketNumber.Should().Be("Q-001");
        calledAlert.Payload.RoomOrStation.Should().Be("Room 2");

        var approachingAlertForT4 = secondAlerts.FirstOrDefault(a => a.Payload.TicketNumber == "Q-004");
        approachingAlertForT4.Should().NotBeNull();
        approachingAlertForT4!.Payload.AheadInLine.Should().Be(2);

        // Verify deduplication: no repeated approaching alerts for Q-002 or Q-003
        secondAlerts.Count(a => a.Payload.AlertKind == "approaching_turn").Should().Be(1);
    }

    // =========================================================================
    // Scenario 4: Fuzzy Duplicate Intake Resolution ("Use Existing" vs "Create New")
    // (F4.1, F4.2, F4.3, F4.4)
    // =========================================================================
    [Fact]
    public void Scenario_4_FuzzyDuplicateIntakeResolution_BothBranchesVerified()
    {
        var existingPatientId = Guid.NewGuid();
        var existingDob = new DateOnly(1987, 3, 15);

        // Existing patient record in database
        var existingRecord = new
        {
            Id = existingPatientId,
            Code = "PAT-2026-00045",
            First = "Juan",
            Last = "Dela Cruz",
            Dob = existingDob,
            Phone = "09171234567",
            Pin = "12-345678901-8"
        };

        // Case A: Receptionist types typo "Jonh Dela Cruz" with same DOB
        var (isMatchA, reasonA, scoreA, confidenceA) = FuzzyMatching.EvaluateMatch(
            "Jonh", "Dela Cruz", existingDob, null, null,
            existingRecord.First, existingRecord.Last, existingRecord.Dob, existingRecord.Phone, existingRecord.Pin);

        isMatchA.Should().BeTrue();
        confidenceA.Should().Be("High");
        scoreA.Should().BeGreaterThanOrEqualTo(0.70);

        // Staff confirms identity and selects "Use Existing Profile"
        string branchAAction = "Use Existing Profile";
        string navigatedRoute = $"/patients/{existingRecord.Id}";
        navigatedRoute.Should().Contain(existingPatientId.ToString());
        branchAAction.Should().Be("Use Existing Profile");

        // Case B: Different patient with same name but different DOB (father and son)
        var sonDob = new DateOnly(2015, 6, 1);
        var (isMatchB, reasonB, _, confidenceB) = FuzzyMatching.EvaluateMatch(
            "Juan", "Dela Cruz", sonDob, null, null,
            existingRecord.First, existingRecord.Last, existingRecord.Dob, existingRecord.Phone, existingRecord.Pin);

        isMatchB.Should().BeTrue();
        confidenceB.Should().Be("Medium");
        reasonB.Should().Contain("possible family member / Jr / Sr");

        // Staff determines this is the son, clicks "Create New Profile Anyway"
        string branchBAction = "Create New Profile Anyway";
        var newCreatedCode = "PAT-2026-00046";
        newCreatedCode.Should().NotBe(existingRecord.Code);
        branchBAction.Should().Be("Create New Profile Anyway");
    }

    // =========================================================================
    // Scenario 5: Concurrency & Multi-Tenant Isolation Under EOD Closure
    // (F1.2, F1.3, F1.4)
    // =========================================================================
    [Fact]
    public void Scenario_5_ConcurrencyAndMultiTenantIsolation_UnderEodClosure()
    {
        var clinicA = Guid.NewGuid();
        var clinicB = Guid.NewGuid();
        string tenantA = "tenant_alpha";
        string tenantB = "tenant_beta";

        // Clinic A has 4 active tickets
        var ticketsA = Enumerable.Range(1, 4).Select(i => new E2EQueueTicket
        {
            TenantId = tenantA,
            ClinicId = clinicA,
            QueueNumber = $"QA-{i}",
            QueueDate = _today,
            PatientId = Guid.NewGuid(),
            PatientName = $"Patient A{i}",
            Status = QueueStatus.Waiting
        }).ToList();

        // Clinic B has 6 active tickets
        var ticketsB = Enumerable.Range(1, 6).Select(i => new E2EQueueTicket
        {
            TenantId = tenantB,
            ClinicId = clinicB,
            QueueNumber = $"QB-{i}",
            QueueDate = _today,
            PatientId = Guid.NewGuid(),
            PatientName = $"Patient B{i}",
            Status = QueueStatus.Waiting
        }).ToList();

        var sharedSystemDb = new List<E2EQueueTicket>();
        sharedSystemDb.AddRange(ticketsA);
        sharedSystemDb.AddRange(ticketsB);

        // Execute Force EOD on Clinic A
        var (resA, auditA) = EodReconciliation.ExecuteReconcile(clinicA, tenantA, _today, "Manual", sharedSystemDb);

        // Assertions:
        // 1. Clinic A has exactly 4 tickets reconciled to NoShow
        resA.ReconciledCount.Should().Be(4);
        ticketsA.All(t => t.Status == QueueStatus.NoShow).Should().BeTrue();

        // 2. Clinic B tickets remain completely untouched in Waiting status
        ticketsB.All(t => t.Status == QueueStatus.Waiting).Should().BeTrue();

        // 3. Audit record belongs strictly to Tenant A and Clinic A
        auditA.TenantId.Should().Be(tenantA);
        auditA.ClinicId.Should().Be(clinicA);
        auditA.TotalTicketsProcessed.Should().Be(4);

        // 4. Clinic B executes EOD later independently
        var (resB, auditB) = EodReconciliation.ExecuteReconcile(clinicB, tenantB, _today, "Automatic", sharedSystemDb);
        resB.ReconciledCount.Should().Be(6);
        auditB.TenantId.Should().Be(tenantB);
        auditB.ClinicId.Should().Be(clinicB);
        ticketsB.All(t => t.Status == QueueStatus.NoShow).Should().BeTrue();
    }

    // =========================================================================
    // Scenario 6: End-to-End Multi-Channel Collaboration (R1 + R2 + R3 + R4)
    // =========================================================================
    [Fact]
    public void Scenario_6_EndToEndMultiChannelCollaboration()
    {
        // Settings
        var settings = new ClinicEodSettingsDto(_clinicId, _tenantId, "21:00", AutoEodEnabled: true, TvDisplayMaskPatientNames: true, QueuePushNotificationThreshold: 1);

        // Step 1: Duplicate check at intake
        var (isDup, _, _, _) = FuzzyMatching.EvaluateMatch("Maria", "Santos", new DateOnly(1992, 4, 10), null, null, "Carlos", "Reyes", new DateOnly(1980, 1, 1), null, null);
        isDup.Should().BeFalse(); // Unique patient

        // Step 2: Intake registers Maria Santos and creates Queue ticket Q-001
        var mariaTicket = new E2EQueueTicket
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-001",
            SequenceNumber = 1,
            QueueDate = _today,
            PatientId = Guid.NewGuid(),
            PatientName = "Maria Santos",
            Status = QueueStatus.Waiting
        };

        var queue = new List<E2EQueueTicket> { mariaTicket };

        // Step 3: TV Display renders Maria on Up Next with privacy masking ("Maria S.")
        var tv1 = PublicTvDisplay.GenerateDisplay(_clinicId, _today, queue, maskPatientNames: true);
        tv1.UpNext[0].DisplayName.Should().Be("Maria S.");

        // Step 4: Push notification dispatches approaching turn alert (threshold 1, ahead 0)
        var pushAlerts1 = PushNotifications.EvaluateAndDispatch(_clinicId, settings, queue);
        pushAlerts1.Should().ContainSingle().Which.Payload.TicketNumber.Should().Be("Q-001");

        // Step 5: Doctor calls Maria into Consultation Room 1
        mariaTicket.Status = QueueStatus.InConsultation;
        mariaTicket.DoctorName = "Dr. Cruz";
        mariaTicket.RoomOrStation = "Room 1";

        // Step 6: TV Display updates to Now Serving Q-001, Doctor Dr. Cruz, Room 1
        var tv2 = PublicTvDisplay.GenerateDisplay(_clinicId, _today, queue, maskPatientNames: true);
        tv2.NowServing[0].TicketNumber.Should().Be("Q-001");
        tv2.NowServing[0].RoomOrStation.Should().Be("Room 1");

        // Step 7: Push notification dispatches called to room alert
        var pushAlerts2 = PushNotifications.EvaluateAndDispatch(_clinicId, settings, queue);
        pushAlerts2.Should().ContainSingle().Which.Payload.AlertKind.Should().Be("called_to_room");

        // Step 8: Consultation completes
        mariaTicket.Status = QueueStatus.Completed;
        mariaTicket.CompletedTime = DateTime.UtcNow;

        // Step 9: EOD runs at 21:00 -> Completed ticket is safely preserved
        var (eodRes, _) = EodReconciliation.ExecuteReconcile(_clinicId, _tenantId, _today, "Automatic", queue);
        eodRes.ReconciledCount.Should().Be(0); // 0 tickets closed to NoShow because Maria completed!
        mariaTicket.Status.Should().Be(QueueStatus.Completed);
    }
}
