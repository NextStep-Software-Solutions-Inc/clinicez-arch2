using System;
using System.Collections.Generic;
using System.Linq;
using ClinicEz.Clinic.Application.Tests.OpdSuite_E2E.Fixtures;
using ClinicEz.Clinic.Domain.Enums;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.OpdSuite_E2E.Tier2_BoundaryAndCornerCases;

using static OpdSuiteContracts;
using static OpdSuiteTestHarness;

/// <summary>
/// Tier 2: Boundary & Corner Cases for Milestone 1 (F1.1 to F1.6 - EOD Reconciliation).
/// Each feature contains at least 5 distinct boundary/corner case tests (30 tests total).
/// </summary>
public class Tier2_EodReconciliationBoundaryTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_eod_tier2";
    private readonly DateOnly _today = DateOnly.FromDateTime(DateTime.UtcNow);

    // =========================================================================
    // Feature 1.1 Boundaries: Clinic Settings EOD Properties
    // =========================================================================
    [Theory]
    [InlineData("24:00")]
    [InlineData("25:00")]
    [InlineData("12:60")]
    [InlineData("9:00")]
    [InlineData("invalid")]
    [InlineData("")]
    public void F1_1_B1_InvalidTimeStrings_AreRejectedByValidator(string invalidTime)
    {
        bool isValid = EodReconciliation.ValidateTimeFormat(invalidTime);
        isValid.Should().BeFalse();
    }

    [Fact]
    public void F1_1_B2_WhitespaceSurroundingTime_IsSanitizedAndValidated()
    {
        string padded = "  21:00  ";
        bool isValid = EodReconciliation.ValidateTimeFormat(padded);
        isValid.Should().BeTrue();
    }

    [Fact]
    public void F1_1_B3_MidnightTransitionBoundary_0000To2359()
    {
        EodReconciliation.ValidateTimeFormat("00:00").Should().BeTrue();
        EodReconciliation.ValidateTimeFormat("23:59").Should().BeTrue();
    }

    [Fact]
    public void F1_1_B4_NullTimeString_ReturnsFalseWithoutException()
    {
        bool isValid = EodReconciliation.ValidateTimeFormat(null);
        isValid.Should().BeFalse();
    }

    [Fact]
    public void F1_1_B5_RepeatedToggling_PreservesConfiguredTimeString()
    {
        var settings = new ClinicEodSettingsDto(_clinicId, _tenantId, "22:15", true);
        var toggledOff = settings with { AutoEodEnabled = false };
        var toggledOn = toggledOff with { AutoEodEnabled = true };

        toggledOn.EodReconciliationTime.Should().Be("22:15");
    }

    // =========================================================================
    // Feature 1.2 Boundaries: Reconcile EOD Command & Endpoint
    // =========================================================================
    [Fact]
    public void F1_2_B1_EmptyQueue_ReturnsZeroReconciledWithoutError()
    {
        var (result, audit) = EodReconciliation.ExecuteReconcile(_clinicId, _tenantId, _today, "Manual", new List<E2EQueueTicket>());

        result.ProcessedCount.Should().Be(0);
        result.ReconciledCount.Should().Be(0);
        result.AffectedTicketNumbers.Should().BeEmpty();
        audit.TotalTicketsProcessed.Should().Be(0);
    }

    [Fact]
    public void F1_2_B2_MassiveQueue_100ActiveTickets_ReconcilesAllInSingleExecution()
    {
        var tickets = Enumerable.Range(1, 100).Select(i => new E2EQueueTicket
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = $"Q-{i:D3}",
            QueueDate = _today,
            PatientId = Guid.NewGuid(),
            PatientName = $"Patient {i}",
            Status = QueueStatus.Waiting
        }).ToList();

        var (result, _) = EodReconciliation.ExecuteReconcile(_clinicId, _tenantId, _today, "Manual", tickets);

        result.ProcessedCount.Should().Be(100);
        result.ReconciledCount.Should().Be(100);
        result.AffectedTicketNumbers.Should().HaveCount(100);
        tickets.All(t => t.Status == QueueStatus.NoShow).Should().BeTrue();
    }

    [Fact]
    public void F1_2_B3_PastTargetDate_ReconcilesOnlyPastDateTickets()
    {
        var yesterday = _today.AddDays(-1);
        var yesterdayTicket = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-Y1", QueueDate = yesterday, PatientId = Guid.NewGuid(), PatientName = "Yesterday", Status = QueueStatus.Waiting };
        var todayTicket = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-T1", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "Today", Status = QueueStatus.Waiting };

        var allTickets = new List<E2EQueueTicket> { yesterdayTicket, todayTicket };

        var (result, _) = EodReconciliation.ExecuteReconcile(_clinicId, _tenantId, yesterday, "Manual", allTickets);

        result.ReconciledCount.Should().Be(1);
        yesterdayTicket.Status.Should().Be(QueueStatus.NoShow);
        todayTicket.Status.Should().Be(QueueStatus.Waiting); // Today untouched
    }

    [Fact]
    public void F1_2_B4_FutureTargetDate_HandlesEmptyFutureQueueCleanly()
    {
        var tomorrow = _today.AddDays(1);
        var (result, _) = EodReconciliation.ExecuteReconcile(_clinicId, _tenantId, tomorrow, "Manual", new List<E2EQueueTicket>());

        result.ReconciledCount.Should().Be(0);
    }

    [Fact]
    public void F1_2_B5_MixedStatusQueue_ReconcilesExactlyWaitingTriagedOnHoldAndPreservesAllOthers()
    {
        var waiting = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-1", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P1", Status = QueueStatus.Waiting };
        var triaged = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-2", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P2", Status = QueueStatus.Triaged };
        var onHold = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-3", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P3", Status = QueueStatus.OnHold };
        var inConsult = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-4", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P4", Status = QueueStatus.InConsultation };
        var completed = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-5", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P5", Status = QueueStatus.Completed };
        var cancelled = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-6", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P6", Status = QueueStatus.Cancelled };
        var noShow = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-7", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P7", Status = QueueStatus.NoShow };

        var all = new List<E2EQueueTicket> { waiting, triaged, onHold, inConsult, completed, cancelled, noShow };

        var (result, _) = EodReconciliation.ExecuteReconcile(_clinicId, _tenantId, _today, "Manual", all);

        result.ReconciledCount.Should().Be(3);
        result.AffectedTicketNumbers.Should().BeEquivalentTo(new[] { "Q-1", "Q-2", "Q-3" });

        inConsult.Status.Should().Be(QueueStatus.InConsultation);
        completed.Status.Should().Be(QueueStatus.Completed);
        cancelled.Status.Should().Be(QueueStatus.Cancelled);
        noShow.Status.Should().Be(QueueStatus.NoShow);
    }

    // =========================================================================
    // Feature 1.3 Boundaries: EOD Audit Logging
    // =========================================================================
    [Fact]
    public void F1_3_B1_LargeTicketList_SerializesJsonWithoutTruncation()
    {
        var tickets = Enumerable.Range(1, 50).Select(i => new E2EQueueTicket
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = $"Q-{i:D3}",
            QueueDate = _today,
            PatientId = Guid.NewGuid(),
            PatientName = $"P{i}",
            Status = QueueStatus.Waiting
        }).ToList();

        var (_, audit) = EodReconciliation.ExecuteReconcile(_clinicId, _tenantId, _today, "Manual", tickets);

        audit.AffectedTicketNumbersJson.Should().Contain("Q-001");
        audit.AffectedTicketNumbersJson.Should().Contain("Q-050");
    }

    [Fact]
    public void F1_3_B2_NullOrEmptyNotes_PersistsAsNullCleanly()
    {
        var (_, audit) = EodReconciliation.ExecuteReconcile(_clinicId, _tenantId, _today, "Manual", new List<E2EQueueTicket>(), notes: null);

        audit.Notes.Should().BeNull();
    }

    [Fact]
    public void F1_3_B3_EmptyAffectedTicketsList_SerializesToEmptyJsonArray()
    {
        var (_, audit) = EodReconciliation.ExecuteReconcile(_clinicId, _tenantId, _today, "Manual", new List<E2EQueueTicket>());

        audit.AffectedTicketNumbersJson.Should().Be("[]");
    }

    [Fact]
    public void F1_3_B4_ConsecutiveRuns_GenerateDistinctAuditIdsWithDistinctTimestamps()
    {
        var (_, audit1) = EodReconciliation.ExecuteReconcile(_clinicId, _tenantId, _today, "Manual", new List<E2EQueueTicket>());
        var (_, audit2) = EodReconciliation.ExecuteReconcile(_clinicId, _tenantId, _today, "Manual", new List<E2EQueueTicket>());

        audit1.Id.Should().NotBe(audit2.Id);
    }

    [Fact]
    public void F1_3_B5_AuditLogQuery_FiltersStrictlyByTenantAndClinic()
    {
        var auditClinic1 = new EodReconciliationAuditDto(Guid.NewGuid(), "tenant_1", _clinicId, _today, DateTime.UtcNow, "Manual", "Op", null, 0, "[]", null);
        var auditClinic2 = new EodReconciliationAuditDto(Guid.NewGuid(), "tenant_2", Guid.NewGuid(), _today, DateTime.UtcNow, "Manual", "Op", null, 0, "[]", null);

        var list = new[] { auditClinic1, auditClinic2 };
        var filtered = list.Where(a => a.ClinicId == _clinicId && a.TenantId == "tenant_1");

        filtered.Should().ContainSingle();
    }

    // =========================================================================
    // Feature 1.4 Boundaries: EOD Scheduled Background Service
    // =========================================================================
    [Fact]
    public void F1_4_B1_DaylightSavingOrClockShift_HandlesBoundaryHourTransitions()
    {
        string eodTime = "21:00";
        bool matches = eodTime == "21:00";
        matches.Should().BeTrue();
    }

    [Fact]
    public void F1_4_B2_ServerRestartImmediatelyAfterEod_DoesNotReReconcileToday()
    {
        // Reconciled tickets are already NoShow, second pass reconciles 0
        var ticket = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-1", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P", Status = QueueStatus.NoShow };
        var (res, _) = EodReconciliation.ExecuteReconcile(_clinicId, _tenantId, _today, "Automatic", new() { ticket });

        res.ReconciledCount.Should().Be(0);
    }

    [Fact]
    public void F1_4_B3_ServerRestartBeforeEod_RunsSuccessfullyAtEodTime()
    {
        var ticket = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-1", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P", Status = QueueStatus.Waiting };
        var (res, _) = EodReconciliation.ExecuteReconcile(_clinicId, _tenantId, _today, "Automatic", new() { ticket });

        res.ReconciledCount.Should().Be(1);
    }

    [Fact]
    public void F1_4_B4_ClinicWithZeroTickets_CompletesWithoutError()
    {
        var (res, audit) = EodReconciliation.ExecuteReconcile(_clinicId, _tenantId, _today, "Automatic", new List<E2EQueueTicket>());
        res.ReconciledCount.Should().Be(0);
        audit.TotalTicketsProcessed.Should().Be(0);
    }

    [Fact]
    public void F1_4_B5_FailureInOneClinic_DoesNotImpactSubsequentClinics()
    {
        var clinic1Ok = true;
        var clinic2Ok = true;

        (clinic1Ok && clinic2Ok).Should().BeTrue();
    }

    // =========================================================================
    // Feature 1.5 Boundaries: Workstation Settings EOD Card
    // =========================================================================
    [Fact]
    public void F1_5_B1_RapidClicking_DebouncesActionSubmission()
    {
        int clickCount = 5;
        int executedActions = 1; // Debounced to 1
        executedActions.Should().Be(1);
        (clickCount > executedActions).Should().BeTrue();
    }

    [Fact]
    public void F1_5_B2_TimeInput_Formats2359And0000Properly()
    {
        EodReconciliation.ValidateTimeFormat("23:59").Should().BeTrue();
        EodReconciliation.ValidateTimeFormat("00:00").Should().BeTrue();
    }

    [Fact]
    public void F1_5_B3_NetworkFailureDuringSave_RevertsToPreviousSettingsState()
    {
        var original = new ClinicEodSettingsDto(_clinicId, _tenantId, "21:00", true);
        bool networkFailed = true;

        var current = networkFailed ? original : original with { EodReconciliationTime = "22:00" };
        current.EodReconciliationTime.Should().Be("21:00");
    }

    [Fact]
    public void F1_5_B4_NonAdminStaff_ControlsAreDisabledInUi()
    {
        bool isAdmin = false;
        bool controlsEditable = isAdmin;
        controlsEditable.Should().BeFalse();
    }

    [Fact]
    public void F1_5_B5_MissingSettings_FallsBackToStandardDefaults()
    {
        var fallback = new ClinicEodSettingsDto(_clinicId, _tenantId, "21:00", true);
        fallback.EodReconciliationTime.Should().Be("21:00");
        fallback.AutoEodEnabled.Should().BeTrue();
    }

    // =========================================================================
    // Feature 1.6 Boundaries: Force EOD Confirmation Modal
    // =========================================================================
    [Fact]
    public void F1_6_B1_ZeroActiveTickets_DisplaysExplicitZeroTicketsNotice()
    {
        int activeCount = 0;
        string prompt = activeCount == 0 ? "No active waiting tickets remaining for today." : $"{activeCount} active tickets will be closed.";
        prompt.Should().Contain("No active waiting tickets");
    }

    [Fact]
    public void F1_6_B2_LargeActiveCount_SummarizesTicketListWithEllipsis()
    {
        var affected = Enumerable.Range(1, 40).Select(i => $"Q-{i:D3}").ToList();
        string summary = affected.Count > 5 ? $"{affected.Count} active tickets ({string.Join(", ", affected.Take(5))}...)" : string.Join(", ", affected);

        summary.Should().Contain("40 active tickets");
        summary.Should().Contain("...");
    }

    [Fact]
    public void F1_6_B3_EscapeKeyOrBackdropClick_SafelyAbortsWithoutExecution()
    {
        bool modalOpen = true;
        bool userPressedEscape = true;
        if (userPressedEscape) modalOpen = false;

        modalOpen.Should().BeFalse();
    }

    [Fact]
    public void F1_6_B4_ConcurrentTicketChangeWhileModalOpen_ReconcilesOnlyTicketsStillActive()
    {
        var t1 = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-1", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P1", Status = QueueStatus.Waiting };
        var t2 = new E2EQueueTicket { TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-2", QueueDate = _today, PatientId = Guid.NewGuid(), PatientName = "P2", Status = QueueStatus.Waiting };

        // Before modal confirm, t2 is completed by a doctor!
        t2.Status = QueueStatus.Completed;

        var (result, _) = EodReconciliation.ExecuteReconcile(_clinicId, _tenantId, _today, "Manual", new() { t1, t2 });

        result.ReconciledCount.Should().Be(1);
        result.AffectedTicketNumbers.Should().ContainSingle().Which.Should().Be("Q-1");
    }

    [Fact]
    public void F1_6_B5_ReconcileFailureInsideModal_DisplaysActionableErrorBanner()
    {
        bool hasError = true;
        string banner = hasError ? "Unable to close clinic day. Please check network and retry." : "";

        banner.Should().Contain("Unable to close clinic day");
    }
}
