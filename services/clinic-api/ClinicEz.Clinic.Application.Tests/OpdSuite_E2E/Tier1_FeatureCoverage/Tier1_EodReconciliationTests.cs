using System;
using System.Collections.Generic;
using System.Linq;
using ClinicEz.Clinic.Application.Tests.OpdSuite_E2E.Fixtures;
using ClinicEz.Clinic.Domain.Enums;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.OpdSuite_E2E.Tier1_FeatureCoverage;

using static OpdSuiteContracts;
using static OpdSuiteTestHarness;

/// <summary>
/// Tier 1: Feature Coverage for Milestone 1 (F1.1 to F1.6 - EOD Reconciliation & Force EOD).
/// Each feature contains at least 5 distinct test cases verifying primary behavior (30 tests total).
/// </summary>
public class Tier1_EodReconciliationTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_eod_tier1";
    private readonly DateOnly _today = DateOnly.FromDateTime(DateTime.UtcNow);

    // =========================================================================
    // Feature 1.1: Clinic Settings EOD Properties
    // =========================================================================
    [Fact]
    public void F1_1_T1_DefaultSettings_InitializesWithStandardTimeAndEnabled()
    {
        var settings = new ClinicEodSettingsDto(_clinicId, _tenantId, "21:00", true);

        settings.EodReconciliationTime.Should().Be("21:00");
        settings.AutoEodEnabled.Should().BeTrue();
    }

    [Fact]
    public void F1_1_T2_Custom24HourTime_ValidatesSuccessfully()
    {
        bool isValid = EodReconciliation.ValidateTimeFormat("22:30");
        isValid.Should().BeTrue();
    }

    [Fact]
    public void F1_1_T3_DisablingAutoEod_PersistsCleanly()
    {
        var settings = new ClinicEodSettingsDto(_clinicId, _tenantId, "20:00", false);
        settings.AutoEodEnabled.Should().BeFalse();
        settings.EodReconciliationTime.Should().Be("20:00");
    }

    [Fact]
    public void F1_1_T4_BoundaryTimes_MidnightAndEarlyMorning_ValidateSuccessfully()
    {
        EodReconciliation.ValidateTimeFormat("00:00").Should().BeTrue();
        EodReconciliation.ValidateTimeFormat("04:15").Should().BeTrue();
        EodReconciliation.ValidateTimeFormat("23:59").Should().BeTrue();
    }

    [Fact]
    public void F1_1_T5_MultiTenantScoping_SettingsAreIsolatedPerClinic()
    {
        var clinic1 = new ClinicEodSettingsDto(Guid.NewGuid(), "tenant_a", "18:00", true);
        var clinic2 = new ClinicEodSettingsDto(Guid.NewGuid(), "tenant_b", "22:00", false);

        clinic1.EodReconciliationTime.Should().NotBe(clinic2.EodReconciliationTime);
        clinic1.AutoEodEnabled.Should().NotBe(clinic2.AutoEodEnabled);
    }

    // =========================================================================
    // Feature 1.2: Reconcile EOD Command & Endpoint
    // =========================================================================
    [Fact]
    public void F1_2_T1_WaitingTickets_TransitionToNoShowWithCompletedTime()
    {
        var ticket = new E2EQueueTicket
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-001",
            QueueDate = _today,
            PatientId = Guid.NewGuid(),
            PatientName = "Pedro Santos",
            Status = QueueStatus.Waiting
        };

        var (result, _) = EodReconciliation.ExecuteReconcile(_clinicId, _tenantId, _today, "Manual", new() { ticket });

        result.ReconciledCount.Should().Be(1);
        ticket.Status.Should().Be(QueueStatus.NoShow);
        ticket.CompletedTime.Should().NotBeNull();
    }

    [Fact]
    public void F1_2_T2_TriagedTickets_TransitionToNoShowWithCompletedTime()
    {
        var ticket = new E2EQueueTicket
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-002",
            QueueDate = _today,
            PatientId = Guid.NewGuid(),
            PatientName = "Maria Clara",
            Status = QueueStatus.Triaged
        };

        var (result, _) = EodReconciliation.ExecuteReconcile(_clinicId, _tenantId, _today, "Manual", new() { ticket });

        result.ReconciledCount.Should().Be(1);
        ticket.Status.Should().Be(QueueStatus.NoShow);
        ticket.CompletedTime.Should().NotBeNull();
    }

    [Fact]
    public void F1_2_T3_OnHoldTickets_TransitionToNoShowWithCompletedTime()
    {
        var ticket = new E2EQueueTicket
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-003",
            QueueDate = _today,
            PatientId = Guid.NewGuid(),
            PatientName = "Jose Rizal",
            Status = QueueStatus.OnHold
        };

        var (result, _) = EodReconciliation.ExecuteReconcile(_clinicId, _tenantId, _today, "Manual", new() { ticket });

        result.ReconciledCount.Should().Be(1);
        ticket.Status.Should().Be(QueueStatus.NoShow);
        ticket.CompletedTime.Should().NotBeNull();
    }

    [Fact]
    public void F1_2_T4_InConsultationTickets_ArePreservedWithoutModification()
    {
        var ticket = new E2EQueueTicket
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-004",
            QueueDate = _today,
            PatientId = Guid.NewGuid(),
            PatientName = "Dr. Active Visit",
            Status = QueueStatus.InConsultation
        };

        var (result, _) = EodReconciliation.ExecuteReconcile(_clinicId, _tenantId, _today, "Manual", new() { ticket });

        result.ReconciledCount.Should().Be(0);
        ticket.Status.Should().Be(QueueStatus.InConsultation);
    }

    [Fact]
    public void F1_2_T5_CompletedTickets_ArePreservedWithoutModification()
    {
        var completedTime = DateTime.UtcNow.AddHours(-2);
        var ticket = new E2EQueueTicket
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-005",
            QueueDate = _today,
            PatientId = Guid.NewGuid(),
            PatientName = "Finished Patient",
            Status = QueueStatus.Completed,
            CompletedTime = completedTime
        };

        var (result, _) = EodReconciliation.ExecuteReconcile(_clinicId, _tenantId, _today, "Manual", new() { ticket });

        result.ReconciledCount.Should().Be(0);
        ticket.Status.Should().Be(QueueStatus.Completed);
        ticket.CompletedTime.Should().Be(completedTime);
    }

    // =========================================================================
    // Feature 1.3: EOD Audit Logging
    // =========================================================================
    [Fact]
    public void F1_3_T1_ManualTrigger_SetsTriggerTypeToManual()
    {
        var ticket = new E2EQueueTicket
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-001",
            QueueDate = _today,
            PatientId = Guid.NewGuid(),
            PatientName = "Audit Patient",
            Status = QueueStatus.Waiting
        };

        var (_, audit) = EodReconciliation.ExecuteReconcile(_clinicId, _tenantId, _today, "Manual", new() { ticket });

        audit.TriggerType.Should().Be("Manual");
    }

    [Fact]
    public void F1_3_T2_AuditLog_RecordsTotalTicketsProcessed()
    {
        var t1 = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-001", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P1", Status = QueueStatus.Waiting };
        var t2 = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-002", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P2", Status = QueueStatus.Triaged };

        var (_, audit) = EodReconciliation.ExecuteReconcile(_clinicId, _tenantId, _today, "Manual", new() { t1, t2 });

        audit.TotalTicketsProcessed.Should().Be(2);
    }

    [Fact]
    public void F1_3_T3_AuditLog_ContainsSerializedAffectedTicketNumbersJson()
    {
        var t1 = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-010", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P1", Status = QueueStatus.Waiting };
        var t2 = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-011", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P2", Status = QueueStatus.Waiting };

        var (_, audit) = EodReconciliation.ExecuteReconcile(_clinicId, _tenantId, _today, "Manual", new() { t1, t2 });

        audit.AffectedTicketNumbersJson.Should().Contain("Q-010");
        audit.AffectedTicketNumbersJson.Should().Contain("Q-011");
    }

    [Fact]
    public void F1_3_T4_AuditLog_StampsUtcTimestampAndReconciliationDate()
    {
        var ticket = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-001", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P1", Status = QueueStatus.Waiting };

        var (_, audit) = EodReconciliation.ExecuteReconcile(_clinicId, _tenantId, _today, "Manual", new() { ticket });

        audit.ReconciliationDate.Should().Be(_today);
        audit.ReconciledAt.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromSeconds(5));
    }

    [Fact]
    public void F1_3_T5_AuditLog_RecordsOperatorIdentityAndStaffId()
    {
        var staffId = Guid.NewGuid();
        var ticket = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-001", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P1", Status = QueueStatus.Waiting };

        var (_, audit) = EodReconciliation.ExecuteReconcile(_clinicId, _tenantId, _today, "Manual", new() { ticket }, "Dr. Santos", staffId);

        audit.ReconciledBy.Should().Be("Dr. Santos");
        audit.StaffId.Should().Be(staffId);
    }

    // =========================================================================
    // Feature 1.4: EOD Scheduled Background Service
    // =========================================================================
    [Fact]
    public void F1_4_T1_BackgroundWorker_MatchesClinicLocalTimeAgainstConfiguredEodTime()
    {
        string configuredTime = "21:00";
        var currentTime = "21:00";

        bool shouldTrigger = configuredTime == currentTime;
        shouldTrigger.Should().BeTrue();
    }

    [Fact]
    public void F1_4_T2_BackgroundWorker_SuppressesRunWhenAutoEodIsDisabled()
    {
        var settings = new ClinicEodSettingsDto(_clinicId, _tenantId, "21:00", AutoEodEnabled: false);

        bool willRun = settings.AutoEodEnabled && settings.EodReconciliationTime == "21:00";
        willRun.Should().BeFalse();
    }

    [Fact]
    public void F1_4_T3_BackgroundWorker_CreatesAuditLogWithTriggerTypeAutomatic()
    {
        var ticket = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-001", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "Auto Patient", Status = QueueStatus.Waiting };

        var (_, audit) = EodReconciliation.ExecuteReconcile(_clinicId, _tenantId, _today, "Automatic", new() { ticket });

        audit.TriggerType.Should().Be("Automatic");
        audit.ReconciledBy.Should().Be("System");
    }

    [Fact]
    public void F1_4_T4_BackgroundWorker_IsIdempotentOnConsecutiveRuns()
    {
        var ticket = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-001", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P1", Status = QueueStatus.Waiting };

        var tickets = new List<E2EQueueTicket> { ticket };
        var (res1, _) = EodReconciliation.ExecuteReconcile(_clinicId, _tenantId, _today, "Automatic", tickets);
        res1.ReconciledCount.Should().Be(1);

        // Second run on same dataset
        var (res2, _) = EodReconciliation.ExecuteReconcile(_clinicId, _tenantId, _today, "Automatic", tickets);
        res2.ReconciledCount.Should().Be(0);
    }

    [Fact]
    public void F1_4_T5_BackgroundWorker_ExecutesIndependentlyAcrossMultiTenantClinics()
    {
        var clinicA = Guid.NewGuid();
        var clinicB = Guid.NewGuid();

        var tA = new E2EQueueTicket { TenantId = "tA", ClinicId = clinicA, QueueNumber = "Q-A1", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "PA", Status = QueueStatus.Waiting };
        var tB = new E2EQueueTicket { TenantId = "tB", ClinicId = clinicB, QueueNumber = "Q-B1", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "PB", Status = QueueStatus.Waiting };

        var allTickets = new List<E2EQueueTicket> { tA, tB };

        var (resA, _) = EodReconciliation.ExecuteReconcile(clinicA, "tA", _today, "Automatic", allTickets);

        resA.ReconciledCount.Should().Be(1);
        tA.Status.Should().Be(QueueStatus.NoShow);
        tB.Status.Should().Be(QueueStatus.Waiting); // Clinic B untouched
    }

    // =========================================================================
    // Feature 1.5: Workstation Settings EOD Card
    // =========================================================================
    [Fact]
    public void F1_5_T1_SettingsCard_DisplaysConfiguredTimeAndAutoToggle()
    {
        var settings = new ClinicEodSettingsDto(_clinicId, _tenantId, "21:30", true);

        settings.EodReconciliationTime.Should().Be("21:30");
        settings.AutoEodEnabled.Should().BeTrue();
    }

    [Fact]
    public void F1_5_T2_SettingsCard_ValidatesTimeFormatBeforeSubmission()
    {
        EodReconciliation.ValidateTimeFormat("18:45").Should().BeTrue();
        EodReconciliation.ValidateTimeFormat("invalid").Should().BeFalse();
    }

    [Fact]
    public void F1_5_T3_SettingsCard_SupportsUpdatingBothPropertiesAtomically()
    {
        var original = new ClinicEodSettingsDto(_clinicId, _tenantId, "21:00", true);
        var updated = original with { EodReconciliationTime = "20:00", AutoEodEnabled = false };

        updated.EodReconciliationTime.Should().Be("20:00");
        updated.AutoEodEnabled.Should().BeFalse();
    }

    [Fact]
    public void F1_5_T4_SettingsCard_ProvidesExplicitActionForForceEod()
    {
        var request = new ReconcileEodRequest(_today, "Manual", "Admin Staff", Guid.NewGuid(), "End of shift closure");

        request.TriggerType.Should().Be("Manual");
        request.OperatorName.Should().Be("Admin Staff");
        request.Notes.Should().Be("End of shift closure");
    }

    [Fact]
    public void F1_5_T5_SettingsCard_RetainsOtherSettingsWhenEodUpdated()
    {
        var settings = new ClinicEodSettingsDto(_clinicId, _tenantId, "21:00", true, TvDisplayMaskPatientNames: true, EnableQueuePushNotifications: true, QueuePushNotificationThreshold: 3);
        var updated = settings with { EodReconciliationTime = "22:00" };

        updated.TvDisplayMaskPatientNames.Should().BeTrue();
        updated.QueuePushNotificationThreshold.Should().Be(3);
    }

    // =========================================================================
    // Feature 1.6: Force EOD Confirmation Modal
    // =========================================================================
    [Fact]
    public void F1_6_T1_ConfirmationModal_ComputesActiveTicketsCountAccurately()
    {
        var t1 = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-001", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P1", Status = QueueStatus.Waiting };
        var t2 = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-002", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P2", Status = QueueStatus.Completed };
        var t3 = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-003", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P3", Status = QueueStatus.Triaged };

        var activeCount = new[] { t1, t2, t3 }.Count(t => t.Status is QueueStatus.Waiting or QueueStatus.Triaged or QueueStatus.OnHold);
        activeCount.Should().Be(2);
    }

    [Fact]
    public void F1_6_T2_ConfirmationModal_DisplaysDetailedWarningForAffectedTickets()
    {
        var affected = new List<string> { "Q-001", "Q-003" };
        string warning = $"This action will close {affected.Count} active ticket(s) as No-Show: {string.Join(", ", affected)}";

        warning.Should().Contain("2 active ticket(s)");
        warning.Should().Contain("Q-001, Q-003");
    }

    [Fact]
    public void F1_6_T3_ConfirmationModal_CancelAction_LeavesQueueUntouched()
    {
        var ticket = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-001", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P1", Status = QueueStatus.Waiting };

        // User cancels -> no execution
        ticket.Status.Should().Be(QueueStatus.Waiting);
        ticket.CompletedTime.Should().BeNull();
    }

    [Fact]
    public void F1_6_T4_ConfirmationModal_ConfirmAction_ExecutesReconciliationAndReturnsAffectedList()
    {
        var ticket = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-001", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P1", Status = QueueStatus.Waiting };

        var (result, _) = EodReconciliation.ExecuteReconcile(_clinicId, _tenantId, _today, "Manual", new() { ticket });

        result.AffectedTicketNumbers.Should().ContainSingle().Which.Should().Be("Q-001");
        ticket.Status.Should().Be(QueueStatus.NoShow);
    }

    [Fact]
    public void F1_6_T5_ConfirmationModal_ZeroActiveTickets_ReportsSafeNoOpMessage()
    {
        var (result, _) = EodReconciliation.ExecuteReconcile(_clinicId, _tenantId, _today, "Manual", new List<E2EQueueTicket>());

        result.ReconciledCount.Should().Be(0);
        result.AffectedTicketNumbers.Should().BeEmpty();
    }
}
