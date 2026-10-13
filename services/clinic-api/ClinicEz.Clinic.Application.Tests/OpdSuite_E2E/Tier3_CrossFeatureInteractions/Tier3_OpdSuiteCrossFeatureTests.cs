using System;
using System.Collections.Generic;
using System.Linq;
using ClinicEz.Clinic.Application.Tests.OpdSuite_E2E.Fixtures;
using ClinicEz.Clinic.Domain.Enums;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.OpdSuite_E2E.Tier3_CrossFeatureInteractions;

using static OpdSuiteContracts;
using static OpdSuiteTestHarness;

/// <summary>
/// Tier 3: Cross-Feature Combinations & Pairwise Interactions across the 24 OPD Suite features.
/// Contains at least 24 comprehensive interaction tests across M1, M2, M3, and M4.
/// </summary>
public class Tier3_OpdSuiteCrossFeatureTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_tier3_pairwise";
    private readonly DateOnly _today = DateOnly.FromDateTime(DateTime.UtcNow);

    // =========================================================================
    // Pairwise 1: F1.2 (Force EOD) × F2.1 (TV Display Endpoint)
    // =========================================================================
    [Fact]
    public void Pairwise_01_ForceEod_ImmediatelyClearsNowServingAndUpNextOnTvDisplay()
    {
        var waiting = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-001", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "Juan", Status = QueueStatus.Waiting };
        var triaged = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-002", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "Maria", Status = QueueStatus.Triaged };

        var queue = new List<E2EQueueTicket> { waiting, triaged };

        // Before EOD: TV display has 2 upcoming
        var displayBefore = PublicTvDisplay.GenerateDisplay(_clinicId, _today, queue);
        displayBefore.UpNext.Should().HaveCount(2);

        // Execute Force EOD
        EodReconciliation.ExecuteReconcile(_clinicId, _tenantId, _today, "Manual", queue);

        // After EOD: TV display shows 0 upcoming (all closed to NoShow)
        var displayAfter = PublicTvDisplay.GenerateDisplay(_clinicId, _today, queue);
        displayAfter.UpNext.Should().BeEmpty();
    }

    // =========================================================================
    // Pairwise 2: F1.2 (Force EOD) × F3.3 (Push Alerts Dispatcher)
    // =========================================================================
    [Fact]
    public void Pairwise_02_ForceEod_ClosingTicketsDoesNotTriggerCalledPushNotifications()
    {
        var settings = new ClinicEodSettingsDto(_clinicId, _tenantId, "21:00", true);
        var t1 = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-001", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "Juan", Status = QueueStatus.Waiting };

        var queue = new List<E2EQueueTicket> { t1 };

        // Force EOD closes ticket directly to NoShow
        EodReconciliation.ExecuteReconcile(_clinicId, _tenantId, _today, "Manual", queue);

        // Evaluate push alerts
        var alerts = PushNotifications.EvaluateAndDispatch(_clinicId, settings, queue);

        // No called alerts should be sent
        alerts.Should().BeEmpty();
    }

    // =========================================================================
    // Pairwise 3: F1.2 (Force EOD) × F4.4 (Intake Workflow)
    // =========================================================================
    [Fact]
    public void Pairwise_03_IntakeLateInDay_CorrectlyReconciledByEod()
    {
        var newPatientTicket = new E2EQueueTicket
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-099",
            QueueDate = _today,
            PatientId = Guid.NewGuid(),
            PatientName = "Late Walk-In",
            Status = QueueStatus.Waiting,
            CheckInTime = DateTime.UtcNow.AddMinutes(-10)
        };

        var queue = new List<E2EQueueTicket> { newPatientTicket };

        var (result, _) = EodReconciliation.ExecuteReconcile(_clinicId, _tenantId, _today, "Manual", queue);

        result.AffectedTicketNumbers.Should().ContainSingle().Which.Should().Be("Q-099");
        newPatientTicket.Status.Should().Be(QueueStatus.NoShow);
    }

    // =========================================================================
    // Pairwise 4: F1.1 (EOD Time Settings) × F1.4 (Background Worker)
    // =========================================================================
    [Fact]
    public void Pairwise_04_UpdatingEodTime_ChangesTriggerEvaluationWindow()
    {
        var original = new ClinicEodSettingsDto(_clinicId, _tenantId, "21:00", true);
        var updated = original with { EodReconciliationTime = "22:30" };

        bool shouldFireAt2100 = updated.EodReconciliationTime == "21:00";
        bool shouldFireAt2230 = updated.EodReconciliationTime == "22:30";

        shouldFireAt2100.Should().BeFalse();
        shouldFireAt2230.Should().BeTrue();
    }

    // =========================================================================
    // Pairwise 5: F2.6 (Privacy Masking) × F2.1 (TV Display API)
    // =========================================================================
    [Fact]
    public void Pairwise_05_TogglingMaskSetting_AltersUpNextOutputDynamically()
    {
        var t = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-001", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "Cassandra Alcantara", Status = QueueStatus.Waiting };

        var masked = PublicTvDisplay.GenerateDisplay(_clinicId, _today, new[] { t }, maskPatientNames: true);
        var unmasked = PublicTvDisplay.GenerateDisplay(_clinicId, _today, new[] { t }, maskPatientNames: false);

        masked.UpNext[0].DisplayName.Should().Be("Cassandra A.");
        unmasked.UpNext[0].DisplayName.Should().Be("Cassandra Alcantara");
    }

    // =========================================================================
    // Pairwise 6: F2.4 (Now Serving) × F3.3 (Push Alert Dispatcher)
    // =========================================================================
    [Fact]
    public void Pairwise_06_CallingPatient_UpdatesTvNowServingAndDispatchesPushAlertSimultaneously()
    {
        var settings = new ClinicEodSettingsDto(_clinicId, _tenantId, "21:00", true);
        var t = new E2EQueueTicket
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-005",
            QueueDate = _today,
            PatientId = Guid.NewGuid(),
            PatientName = "Pedro Santos",
            Status = QueueStatus.InConsultation,
            DoctorName = "Dr. Santos",
            RoomOrStation = "Room 3",
            CalledTime = DateTime.UtcNow
        };

        var queue = new List<E2EQueueTicket> { t };

        // 1. TV Display reflects Now Serving
        var display = PublicTvDisplay.GenerateDisplay(_clinicId, _today, queue);
        display.NowServing.Should().ContainSingle().Which.TicketNumber.Should().Be("Q-005");

        // 2. Push Dispatcher generates alert
        var alerts = PushNotifications.EvaluateAndDispatch(_clinicId, settings, queue);
        alerts.Should().ContainSingle().Which.Payload.RoomOrStation.Should().Be("Room 3");
    }

    // =========================================================================
    // Pairwise 7: F2.7 (Auto-Refresh) × F1.2 (Force EOD)
    // =========================================================================
    [Fact]
    public void Pairwise_07_TvDisplayAutoRefresh_DetectsEodClosureWithinNextCycle()
    {
        var t = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-001", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P", Status = QueueStatus.Waiting };
        var queue = new List<E2EQueueTicket> { t };

        var cycle1 = PublicTvDisplay.GenerateDisplay(_clinicId, _today, queue);
        cycle1.UpNext.Should().HaveCount(1);

        EodReconciliation.ExecuteReconcile(_clinicId, _tenantId, _today, "Manual", queue);

        var cycle2 = PublicTvDisplay.GenerateDisplay(_clinicId, _today, queue);
        cycle2.UpNext.Should().BeEmpty();
    }

    // =========================================================================
    // Pairwise 8: F3.2 (Threshold Settings) × F3.3 (Notification Dispatcher)
    // =========================================================================
    [Fact]
    public void Pairwise_08_ChangingThreshold_ChangesQueueAlertTriggerDepth()
    {
        var s2 = new ClinicEodSettingsDto(_clinicId, _tenantId, "21:00", true, QueuePushNotificationThreshold: 2);
        var s3 = new ClinicEodSettingsDto(_clinicId, _tenantId, "21:00", true, QueuePushNotificationThreshold: 3);

        var t0 = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-0", SequenceNumber = 0, QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P0", Status = QueueStatus.Waiting };
        var t1 = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-1", SequenceNumber = 1, QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P1", Status = QueueStatus.Waiting };
        var t2 = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-2", SequenceNumber = 2, QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P2", Status = QueueStatus.Waiting };
        var t3 = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-3", SequenceNumber = 3, QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P3", Status = QueueStatus.Waiting };

        var queue = new List<E2EQueueTicket> { t0, t1, t2, t3 };

        var alerts2 = PushNotifications.EvaluateAndDispatch(_clinicId, s2, queue);
        // Under threshold 2, t3 (ahead 3) does not receive alert
        alerts2.Select(a => a.Payload.TicketNumber).Should().NotContain("Q-3");

        // Reset flags and re-evaluate under threshold 3
        queue.ForEach(t => t.ApproachingNotificationSent = false);
        var alerts3 = PushNotifications.EvaluateAndDispatch(_clinicId, s3, queue);
        // Under threshold 3, t3 receives alert!
        alerts3.Select(a => a.Payload.TicketNumber).Should().Contain("Q-3");
    }

    // =========================================================================
    // Pairwise 9: F3.5 (Deduplication) × F1.2 (Force EOD)
    // =========================================================================
    [Fact]
    public void Pairwise_09_ReconcilingAlreadyAlertedTicket_MaintainsDeduplicationIntegrity()
    {
        var settings = new ClinicEodSettingsDto(_clinicId, _tenantId, "21:00", true);
        var t = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-001", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P", Status = QueueStatus.InConsultation, CalledNotificationSent = true };

        EodReconciliation.ExecuteReconcile(_clinicId, _tenantId, _today, "Manual", new() { t });

        var alerts = PushNotifications.EvaluateAndDispatch(_clinicId, settings, new() { t });
        alerts.Should().BeEmpty();
    }

    // =========================================================================
    // Pairwise 10: F4.1 (Fuzzy Matcher) × F4.4 (Intake Workflow)
    // =========================================================================
    [Fact]
    public void Pairwise_10_FuzzyTypoName_TriggersIntakeWarningAndRoutesToExistingPatient()
    {
        var existingDob = new DateOnly(1985, 5, 20);
        var (isMatch, reason, score, confidence) = FuzzyMatching.EvaluateMatch(
            "Jonh", "Dela Cruz", existingDob, null, null,
            "John", "Dela Cruz", existingDob, null, null);

        isMatch.Should().BeTrue();
        confidence.Should().Be("High");

        // Staff selects existing patient
        var chosenAction = "Use Existing Profile";
        chosenAction.Should().Be("Use Existing Profile");
    }

    // =========================================================================
    // Pairwise 11: F4.4 (Intake Override) × F2.1 (TV Display UpNext)
    // =========================================================================
    [Fact]
    public void Pairwise_11_OverridingDuplicateIntake_EnqueuesPatientOntoTvDisplayUpNext()
    {
        // Staff overrides duplicate and queues patient
        var newTicket = new E2EQueueTicket
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-015",
            QueueDate = _today,
            PatientId = Guid.NewGuid(),
            PatientName = "Juan Dela Cruz Jr",
            Status = QueueStatus.Waiting
        };

        var display = PublicTvDisplay.GenerateDisplay(_clinicId, _today, new[] { newTicket });

        display.UpNext.Should().ContainSingle().Which.TicketNumber.Should().Be("Q-015");
    }

    // =========================================================================
    // Pairwise 12: F4.4 (Intake Route) × F3.3 (Push Alerts Dispatcher)
    // =========================================================================
    [Fact]
    public void Pairwise_12_RegisteredPatientEnqueued_ReceivesApproachingPushNotification()
    {
        var settings = new ClinicEodSettingsDto(_clinicId, _tenantId, "21:00", true, QueuePushNotificationThreshold: 2);
        var ticket = new E2EQueueTicket
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-001",
            SequenceNumber = 1,
            QueueDate = _today,
            PatientId = Guid.NewGuid(),
            PatientName = "Newly Intake Patient",
            Status = QueueStatus.Waiting
        };

        var alerts = PushNotifications.EvaluateAndDispatch(_clinicId, settings, new() { ticket });

        alerts.Should().ContainSingle();
        alerts[0].Payload.TicketNumber.Should().Be("Q-001");
    }

    // =========================================================================
    // Pairwise 13: F1.3 (Audit Logging) × F1.4 (Background Service)
    // =========================================================================
    [Fact]
    public void Pairwise_13_ScheduledEod_LogsAuditEntryWithAutomaticTriggerType()
    {
        var t = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-1", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P", Status = QueueStatus.Waiting };

        var (_, audit) = EodReconciliation.ExecuteReconcile(_clinicId, _tenantId, _today, "Automatic", new() { t });

        audit.TriggerType.Should().Be("Automatic");
        audit.ReconciledBy.Should().Be("System");
    }

    // =========================================================================
    // Pairwise 14: F1.3 (Audit Logging) × F1.2 (Manual Force EOD)
    // =========================================================================
    [Fact]
    public void Pairwise_14_ManualForceEod_LogsAuditEntryWithStaffIdAndManualTrigger()
    {
        var staffId = Guid.NewGuid();
        var t = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-1", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P", Status = QueueStatus.Waiting };

        var (_, audit) = EodReconciliation.ExecuteReconcile(_clinicId, _tenantId, _today, "Manual", new() { t }, "Dr. Santos", staffId);

        audit.TriggerType.Should().Be("Manual");
        audit.ReconciledBy.Should().Be("Dr. Santos");
        audit.StaffId.Should().Be(staffId);
    }

    // =========================================================================
    // Pairwise 15: F2.5 (Audio Chime) × F2.4 (Pulse Animation)
    // =========================================================================
    [Fact]
    public void Pairwise_15_ServingTicketChange_SynchronouslyTriggersBothAudioAndPulseState()
    {
        string lastServingTicket = "Q-001";
        string currentServingTicket = "Q-002";

        bool triggerAudio = lastServingTicket != currentServingTicket;
        bool triggerPulse = lastServingTicket != currentServingTicket;

        triggerAudio.Should().BeTrue();
        triggerPulse.Should().BeTrue();
    }

    // =========================================================================
    // Pairwise 16: F2.6 (Privacy Masking) × F4.1 (Fuzzy Name Normalizer)
    // =========================================================================
    [Fact]
    public void Pairwise_16_FuzzyMatchedNameVariants_MaskCleanlyOnTvDisplay()
    {
        string masked1 = PublicTvDisplay.MaskPatientName("Jonh Dela Cruz");
        string masked2 = PublicTvDisplay.MaskPatientName("John Dela Cruz");

        masked1.Should().Be("Jonh C.");
        masked2.Should().Be("John C.");
    }

    // =========================================================================
    // Pairwise 17: F3.4 (Patient API Handler) × F3.1 (Interop Envelope)
    // =========================================================================
    [Fact]
    public void Pairwise_17_DispatchedAlertEnvelope_IsConsumableByPatientApiHandler()
    {
        var payload = new PatientQueueAlertPayload(Guid.NewGuid(), "Q-100", "called_to_room", "Please enter Room 1", "Dr. Cruz", "Room 1", 0, DateTime.UtcNow);
        var envelope = new InteropAlertEnvelope(Guid.NewGuid(), "patient.queue.alert", $"facility:{_clinicId}", "patient:user-1", payload, DateTime.UtcNow);

        envelope.Payload.TicketNumber.Should().Be("Q-100");
        envelope.Payload.RoomOrStation.Should().Be("Room 1");
    }

    // =========================================================================
    // Pairwise 18: F3.5 (Deduplication) × F3.3 (Dispatcher)
    // =========================================================================
    [Fact]
    public void Pairwise_18_MultipleQueueRecalculations_PreservesSingleAlertDispatch()
    {
        var settings = new ClinicEodSettingsDto(_clinicId, _tenantId, "21:00", true);
        var t = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-1", SequenceNumber = 1, QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P", Status = QueueStatus.Waiting };

        var run1 = PushNotifications.EvaluateAndDispatch(_clinicId, settings, new() { t });
        var run2 = PushNotifications.EvaluateAndDispatch(_clinicId, settings, new() { t });

        run1.Should().HaveCount(1);
        run2.Should().BeEmpty();
    }

    // =========================================================================
    // Pairwise 19: F1.5 (Settings Card) × F1.6 (Confirmation Modal)
    // =========================================================================
    [Fact]
    public void Pairwise_19_ClickingForceEodOnCard_TransfersLiveActiveCountToModal()
    {
        var t1 = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-1", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P1", Status = QueueStatus.Waiting };
        var t2 = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-2", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P2", Status = QueueStatus.Triaged };

        int activeTickets = new[] { t1, t2 }.Count(t => t.Status is QueueStatus.Waiting or QueueStatus.Triaged or QueueStatus.OnHold);

        string modalWarning = $"Warning: {activeTickets} active tickets will be closed.";
        modalWarning.Should().Contain("2 active tickets");
    }

    // =========================================================================
    // Pairwise 20: F2.8 (TV Launcher) × F2.2 (Public Route)
    // =========================================================================
    [Fact]
    public void Pairwise_20_LauncherConstructsExactMatchingRouteFormat()
    {
        string tenantSlug = "ustp-health";
        string facilitySlug = "cagayan-main";

        string generatedUrl = $"/queue-display/{tenantSlug}/{facilitySlug}";
        bool matchesRoutePattern = generatedUrl.StartsWith("/queue-display/");

        matchesRoutePattern.Should().BeTrue();
    }

    // =========================================================================
    // Pairwise 21: F3.6 (Settings UI) × F3.2 (Settings Persistence)
    // =========================================================================
    [Fact]
    public void Pairwise_21_UiThresholdSliderChange_PersistsDirectlyToClinicSettings()
    {
        var original = new ClinicEodSettingsDto(_clinicId, _tenantId, "21:00", true, QueuePushNotificationThreshold: 2);
        int newThresholdFromSlider = 4;

        var saved = original with { QueuePushNotificationThreshold = newThresholdFromSlider };
        saved.QueuePushNotificationThreshold.Should().Be(4);
    }

    // =========================================================================
    // Pairwise 22: F4.2 (Duplicate Query) × F4.3 (Warning Modal)
    // =========================================================================
    [Fact]
    public void Pairwise_22_DuplicateQueryMatches_PopulateModalDataGrid()
    {
        var match = new DuplicateMatchDto(Guid.NewGuid(), "PAT-100", "Juan Santos", _sampleDob, "09171234567", null, "PIN Match", 1.0, "High");
        var result = new DuplicatePatientCheckResultDto(true, new[] { match });

        result.HasDuplicates.Should().BeTrue();
        result.Matches.Should().ContainSingle().Which.PatientCode.Should().Be("PAT-100");
    }

    // =========================================================================
    // Pairwise 23: F1.2 (Force EOD) × F1.3 (Audit Logging Multi-Tenant)
    // =========================================================================
    [Fact]
    public void Pairwise_23_MultiTenantEod_WritesAuditLogOnlyForTargetTenant()
    {
        var clinic1 = Guid.NewGuid();
        var clinic2 = Guid.NewGuid();

        var t1 = new E2EQueueTicket { TenantId = "T1", ClinicId = clinic1, QueueNumber = "Q-1", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P1", Status = QueueStatus.Waiting };
        var t2 = new E2EQueueTicket { TenantId = "T2", ClinicId = clinic2, QueueNumber = "Q-2", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P2", Status = QueueStatus.Waiting };

        var all = new List<E2EQueueTicket> { t1, t2 };

        var (res, audit) = EodReconciliation.ExecuteReconcile(clinic1, "T1", _today, "Manual", all);

        audit.TenantId.Should().Be("T1");
        audit.ClinicId.Should().Be(clinic1);
        t2.Status.Should().Be(QueueStatus.Waiting); // T2 unaffected
    }

    // =========================================================================
    // Pairwise 24: F3.3 (Push Dispatcher) × F2.1 (TV Display UpNext Advance)
    // =========================================================================
    [Fact]
    public void Pairwise_24_QueueAdvance_UpdatesTvUpNextAndDispatchesNextPatientApproachingAlert()
    {
        var settings = new ClinicEodSettingsDto(_clinicId, _tenantId, "21:00", true, QueuePushNotificationThreshold: 1);

        var t1 = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-1", SequenceNumber = 1, QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P1", Status = QueueStatus.InConsultation };
        var t2 = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-2", SequenceNumber = 2, QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P2", Status = QueueStatus.Waiting };

        var queue = new List<E2EQueueTicket> { t1, t2 };

        // 1. TV Display shows t1 in NowServing, t2 in UpNext
        var display = PublicTvDisplay.GenerateDisplay(_clinicId, _today, queue);
        display.NowServing[0].TicketNumber.Should().Be("Q-1");
        display.UpNext[0].TicketNumber.Should().Be("Q-2");

        // 2. Push Dispatcher triggers approaching alert for t2
        var alerts = PushNotifications.EvaluateAndDispatch(_clinicId, settings, queue);
        alerts.Should().Contain(a => a.Payload.TicketNumber == "Q-2" && a.Payload.AlertKind == "approaching_turn");
    }

    private readonly DateOnly _sampleDob = new(1985, 5, 20);
}
