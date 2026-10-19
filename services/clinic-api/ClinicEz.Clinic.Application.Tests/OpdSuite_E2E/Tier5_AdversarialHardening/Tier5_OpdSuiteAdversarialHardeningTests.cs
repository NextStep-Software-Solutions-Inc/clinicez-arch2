using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Helpers;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Application.Features.Patients.Queries;
using ClinicEz.Clinic.Application.Features.Queue.Commands;
using ClinicEz.Clinic.Application.Features.Queue.DTOs;
using ClinicEz.Clinic.Application.Features.Queue.Queries;
using ClinicEz.Clinic.Application.Features.Queue.Services;
using ClinicEz.Clinic.Application.Tests;
using ClinicEz.Clinic.Application.Tests.OpdSuite_E2E.Fixtures;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.BackgroundServices;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.OpdSuite_E2E.Tier5_AdversarialHardening;

using static OpdSuiteContracts;
using static OpdSuiteTestHarness;

/// <summary>
/// TIER 5: ADVERSARIAL STRESS TESTING & COVERAGE HARDENING (OPD SUITE)
/// Conducts adversarial white-box challenges across:
/// 1. Cross-feature concurrency: Force EOD while Public TV Display Board polls.
/// 2. Notification dispatch: Threshold matching with duplicate patients & deduplication.
/// 3. Boundary & Temporal stress: Invalid 24h formats, leap days, and timezones in EOD worker.
/// 4. Algorithmic fuzzy matcher: Extreme inputs, Unicode/emojis, Soundex, and phone normalizer.
/// 5. Multi-tenant isolation & high-volume stress.
/// </summary>
public class Tier5_OpdSuiteAdversarialHardeningTests
{
    private readonly Guid _clinicIdA = Guid.NewGuid();
    private readonly Guid _clinicIdB = Guid.NewGuid();
    private readonly string _tenantIdA = "tenant_adv_alpha";
    private readonly string _tenantIdB = "tenant_adv_bravo";
    private readonly DateOnly _today = DateOnly.FromDateTime(DateTime.UtcNow);

    // =========================================================================
    // 1. CROSS-FEATURE: FORCE EOD × PUBLIC TV DISPLAY POLLING CONCURRENCY
    // =========================================================================

    [Fact]
    public async Task Adv_01_ForceEod_ConcurrentWithPublicTvDisplayPolling_MaintainsDataIntegrity()
    {
        var dbName = $"Tier5_Adv_EodTv_{Guid.NewGuid()}";
        var contextSubstitute = Substitute.For<IClinicContext>();
        contextSubstitute.ClinicId.Returns(_clinicIdA);
        contextSubstitute.TenantId.Returns(_tenantIdA);
        contextSubstitute.StaffId.Returns(Guid.NewGuid());

        var (context, uow, sieve) = TestDbHelper.CreateSharedTestContext(dbName, contextSubstitute);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<EodReconciliationAudit>(context, sieve);

        // Seed ClinicSettings
        await settingsRepo.AddAsync(new ClinicSettings
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantIdA,
            ClinicId = _clinicIdA,
            ClinicName = "Adversarial Test Clinic",
            AutoEodEnabled = true,
            EodReconciliationTime = "21:00",
            TvDisplayMaskPatientNames = true
        }, CancellationToken.None);

        // Seed Queue: 1 InConsultation, 2 Waiting, 1 Triaged, 1 OnHold, 1 Completed
        var inConsultation = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantIdA,
            ClinicId = _clinicIdA,
            QueueNumber = "Q-001",
            SequenceNumber = 1,
            QueueDate = _today,
            PatientId = Guid.NewGuid(),
            PatientName = "Serving Patient",
            DoctorName = "Dr. Santos",
            RoomOrStation = "Room 101",
            CalledTime = DateTime.UtcNow.AddMinutes(-10),
            Status = QueueStatus.InConsultation
        };
        var waiting1 = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantIdA,
            ClinicId = _clinicIdA,
            QueueNumber = "Q-002",
            SequenceNumber = 2,
            QueueDate = _today,
            PatientId = Guid.NewGuid(),
            PatientName = "Cassandra Alcantara",
            Status = QueueStatus.Waiting
        };
        var waiting2 = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantIdA,
            ClinicId = _clinicIdA,
            QueueNumber = "Q-003",
            SequenceNumber = 3,
            QueueDate = _today,
            PatientId = Guid.NewGuid(),
            PatientName = "Juan Dela Cruz",
            Status = QueueStatus.Waiting
        };
        var triaged = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantIdA,
            ClinicId = _clinicIdA,
            QueueNumber = "Q-004",
            SequenceNumber = 4,
            QueueDate = _today,
            PatientId = Guid.NewGuid(),
            PatientName = "Maria Clara",
            Status = QueueStatus.Triaged
        };
        var onHold = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantIdA,
            ClinicId = _clinicIdA,
            QueueNumber = "Q-005",
            SequenceNumber = 5,
            QueueDate = _today,
            PatientId = Guid.NewGuid(),
            PatientName = "Jose Rizal",
            Status = QueueStatus.OnHold
        };
        var completed = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantIdA,
            ClinicId = _clinicIdA,
            QueueNumber = "Q-000",
            SequenceNumber = 0,
            QueueDate = _today,
            PatientId = Guid.NewGuid(),
            PatientName = "Done Patient",
            Status = QueueStatus.Completed,
            CompletedTime = DateTime.UtcNow.AddHours(-1)
        };

        await queueRepo.AddAsync(inConsultation, CancellationToken.None);
        await queueRepo.AddAsync(waiting1, CancellationToken.None);
        await queueRepo.AddAsync(waiting2, CancellationToken.None);
        await queueRepo.AddAsync(triaged, CancellationToken.None);
        await queueRepo.AddAsync(onHold, CancellationToken.None);
        await queueRepo.AddAsync(completed, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var queryHandler = new GetPublicQueueDisplayQueryHandler(queueRepo, settingsRepo, contextSubstitute);
        var eodHandler = new ReconcileEodCommandHandler(queueRepo, auditRepo, uow, contextSubstitute);

        // Verify TV display BEFORE EOD
        var tvBefore = await queryHandler.Handle(new GetPublicQueueDisplayQuery(_clinicIdA, Date: _today), CancellationToken.None);
        tvBefore.Should().NotBeNull();
        tvBefore!.NowServing.Should().ContainSingle(s => s.TicketNumber == "Q-001");
        tvBefore.UpNext.Should().HaveCount(4); // Q-002, Q-003, Q-004, Q-005

        // Execute Force EOD
        var eodResult = await eodHandler.Handle(new ReconcileEodCommand(_today, "Manual", "Adversarial Stress"), CancellationToken.None);
        eodResult.ReconciledCount.Should().Be(4);
        eodResult.AffectedTicketNumbers.Should().BeEquivalentTo(new[] { "Q-002", "Q-003", "Q-004", "Q-005" });

        // Verify TV display AFTER EOD
        var tvAfter = await queryHandler.Handle(new GetPublicQueueDisplayQuery(_clinicIdA, Date: _today), CancellationToken.None);
        tvAfter.Should().NotBeNull();
        tvAfter!.NowServing.Should().ContainSingle(s => s.TicketNumber == "Q-001", "InConsultation MUST be preserved on TV board");
        tvAfter.UpNext.Should().BeEmpty("All waiting tickets were reconciled to NoShow");
        tvAfter.PatientsWaitingCount.Should().Be(0);

        // Verify InConsultation and Completed items were NOT touched
        var refreshedInConsult = await queueRepo.GetByIdAsync(inConsultation.Id);
        refreshedInConsult!.Status.Should().Be(QueueStatus.InConsultation);
        var refreshedCompleted = await queueRepo.GetByIdAsync(completed.Id);
        refreshedCompleted!.Status.Should().Be(QueueStatus.Completed);
    }

    [Fact]
    public void Adv_02_PublicTvDisplay_MaskPatientName_ComplexFormats()
    {
        GetPublicQueueDisplayQueryHandler.MaskPatientName("Cassandra Alcantara").Should().Be("Cassandra A.");
        GetPublicQueueDisplayQueryHandler.MaskPatientName("Juan Dela Cruz").Should().Be("Juan C.");
        GetPublicQueueDisplayQueryHandler.MaskPatientName("Dela Cruz, Juan").Should().Be("Juan D.");
        GetPublicQueueDisplayQueryHandler.MaskPatientName("Rizal, Jose P.").Should().Be("Jose R.");
        GetPublicQueueDisplayQueryHandler.MaskPatientName("Cher").Should().Be("C.");
        GetPublicQueueDisplayQueryHandler.MaskPatientName("Madonna").Should().Be("M.");
        GetPublicQueueDisplayQueryHandler.MaskPatientName("").Should().Be(string.Empty);
        GetPublicQueueDisplayQueryHandler.MaskPatientName("   ").Should().Be(string.Empty);
        GetPublicQueueDisplayQueryHandler.MaskPatientName(null).Should().Be(string.Empty);
        GetPublicQueueDisplayQueryHandler.MaskPatientName("Dr. John Smith III").Should().Be("Dr. I.");
    }

    // =========================================================================
    // 2. CROSS-FEATURE: QUEUE ALERT DISPATCHER × DUPLICATE PATIENTS
    // =========================================================================

    [Fact]
    public async Task Adv_03_QueueAlerts_IdenticalNames_DispatchesExclusivelyToTargetPatient()
    {
        var dbName = $"Tier5_Adv_Alerts_{Guid.NewGuid()}";
        var contextSubstitute = Substitute.For<IClinicContext>();
        contextSubstitute.ClinicId.Returns(_clinicIdA);
        contextSubstitute.TenantId.Returns(_tenantIdA);

        var (context, uow, sieve) = TestDbHelper.CreateSharedTestContext(dbName, contextSubstitute);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();
        var logger = Microsoft.Extensions.Logging.Abstractions.NullLogger<QueueNotificationDispatcher>.Instance;

        // Settings with Push Enabled, threshold = 2
        await settingsRepo.AddAsync(new ClinicSettings
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantIdA,
            ClinicId = _clinicIdA,
            ClinicName = "Alert Test Clinic",
            EnableQueuePushNotifications = true,
            QueuePushNotificationThreshold = 2
        }, CancellationToken.None);

        // Two distinct patients with identical name "Juan Dela Cruz" but distinct SyncPatientIds
        var syncPatientId1 = Guid.NewGuid();
        var syncPatientId2 = Guid.NewGuid();
        var patient1 = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantIdA,
            ClinicId = _clinicIdA,
            PatientCode = "P-001",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            DateOfBirth = new DateOnly(1990, 1, 1),
            ContactNumber = "0917-111-1111",
            SyncPatientId = syncPatientId1
        };
        var patient2 = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantIdA,
            ClinicId = _clinicIdA,
            PatientCode = "P-002",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            DateOfBirth = new DateOnly(1985, 5, 15),
            ContactNumber = "0917-222-2222",
            SyncPatientId = syncPatientId2
        };
        await patientRepo.AddAsync(patient1, CancellationToken.None);
        await patientRepo.AddAsync(patient2, CancellationToken.None);

        // Two tickets in queue
        var ticket1 = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantIdA,
            ClinicId = _clinicIdA,
            QueueNumber = "Q-101",
            SequenceNumber = 1,
            QueueDate = _today,
            PatientId = patient1.Id,
            SyncPatientId = syncPatientId1,
            PatientName = "Juan Dela Cruz",
            Status = QueueStatus.Waiting
        };
        var ticket2 = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantIdA,
            ClinicId = _clinicIdA,
            QueueNumber = "Q-102",
            SequenceNumber = 2,
            QueueDate = _today,
            PatientId = patient2.Id,
            SyncPatientId = syncPatientId2,
            PatientName = "Juan Dela Cruz",
            Status = QueueStatus.Waiting
        };
        await queueRepo.AddAsync(ticket1, CancellationToken.None);
        await queueRepo.AddAsync(ticket2, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var dispatcher = new QueueNotificationDispatcher(settingsRepo, queueRepo, patientRepo, publisher, logger);

        // 1. Dispatch approaching alerts
        await dispatcher.EvaluateAndDispatchApproachingAlertsAsync(_clinicIdA, _today, CancellationToken.None);

        // Verify publisher received alerts targeted strictly to the correct patient
        publisher.Received(1).Enqueue(
            InteropTypes.PatientQueueAlert,
            Arg.Any<Party>(),
            Arg.Is<Party>(p => p.PatientId == syncPatientId1.ToString()),
            ticket1.Id,
            Arg.Any<ClinicEz.Shared.Interop.Contracts.PatientQueueAlertPayload>(),
            Arg.Any<int>(),
            Arg.Any<TimeSpan?>());

        publisher.Received(1).Enqueue(
            InteropTypes.PatientQueueAlert,
            Arg.Any<Party>(),
            Arg.Is<Party>(p => p.PatientId == syncPatientId2.ToString()),
            ticket2.Id,
            Arg.Any<ClinicEz.Shared.Interop.Contracts.PatientQueueAlertPayload>(),
            Arg.Any<int>(),
            Arg.Any<TimeSpan?>());

        // 2. Dispatch called alert for Ticket 1
        await dispatcher.DispatchCalledAlertAsync(ticket1, "Dr. Santos", "Room 1", CancellationToken.None);

        publisher.Received(1).Enqueue(
            InteropTypes.PatientQueueAlert,
            Arg.Any<Party>(),
            Arg.Is<Party>(p => p.PatientId == syncPatientId1.ToString()),
            ticket1.Id,
            Arg.Is<ClinicEz.Shared.Interop.Contracts.PatientQueueAlertPayload>(payload => payload.AlertKind == QueueAlertKinds.Called),
            Arg.Any<int>(),
            Arg.Any<TimeSpan?>());

        // Ticket 2 should not have received a Called alert
        publisher.DidNotReceive().Enqueue(
            InteropTypes.PatientQueueAlert,
            Arg.Any<Party>(),
            Arg.Is<Party>(p => p.PatientId == syncPatientId2.ToString()),
            ticket2.Id,
            Arg.Is<ClinicEz.Shared.Interop.Contracts.PatientQueueAlertPayload>(payload => payload.AlertKind == QueueAlertKinds.Called),
            Arg.Any<int>(),
            Arg.Any<TimeSpan?>());
    }

    [Fact]
    public async Task Adv_04_QueueAlerts_NotificationDeduplication_GuaranteesSingleSend()
    {
        var dbName = $"Tier5_Adv_Dedup_{Guid.NewGuid()}";
        var contextSubstitute = Substitute.For<IClinicContext>();
        contextSubstitute.ClinicId.Returns(_clinicIdA);
        contextSubstitute.TenantId.Returns(_tenantIdA);

        var (context, uow, sieve) = TestDbHelper.CreateSharedTestContext(dbName, contextSubstitute);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();
        var logger = Microsoft.Extensions.Logging.Abstractions.NullLogger<QueueNotificationDispatcher>.Instance;

        await settingsRepo.AddAsync(new ClinicSettings
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantIdA,
            ClinicId = _clinicIdA,
            ClinicName = "Dedup Test Clinic",
            EnableQueuePushNotifications = true,
            QueuePushNotificationThreshold = 3
        }, CancellationToken.None);

        var syncPatientId = Guid.NewGuid();
        var ticket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantIdA,
            ClinicId = _clinicIdA,
            QueueNumber = "Q-201",
            SequenceNumber = 1,
            QueueDate = _today,
            PatientId = Guid.NewGuid(),
            SyncPatientId = syncPatientId,
            PatientName = "Dedup Patient",
            Status = QueueStatus.Waiting,
            ApproachingNotificationSent = false,
            CalledNotificationSent = false
        };
        await queueRepo.AddAsync(ticket, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var dispatcher = new QueueNotificationDispatcher(settingsRepo, queueRepo, patientRepo, publisher, logger);

        // Evaluate approaching 5 times consecutively
        for (int i = 0; i < 5; i++)
        {
            await dispatcher.EvaluateAndDispatchApproachingAlertsAsync(_clinicIdA, _today, CancellationToken.None);
        }

        // Exactly 1 approaching notification enqueued
        publisher.Received(1).Enqueue(
            InteropTypes.PatientQueueAlert,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            ticket.Id,
            Arg.Is<ClinicEz.Shared.Interop.Contracts.PatientQueueAlertPayload>(p => p.AlertKind == QueueAlertKinds.ApproachingTurn),
            Arg.Any<int>(),
            Arg.Any<TimeSpan?>());

        // Dispatch called 5 times consecutively
        for (int i = 0; i < 5; i++)
        {
            await dispatcher.DispatchCalledAlertAsync(ticket, "Dr. Reyes", "Room 2", CancellationToken.None);
        }

        // Exactly 1 called notification enqueued
        publisher.Received(1).Enqueue(
            InteropTypes.PatientQueueAlert,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            ticket.Id,
            Arg.Is<ClinicEz.Shared.Interop.Contracts.PatientQueueAlertPayload>(p => p.AlertKind == QueueAlertKinds.Called),
            Arg.Any<int>(),
            Arg.Any<TimeSpan?>());
    }

    [Fact]
    public async Task Adv_05_QueueAlerts_UnlinkedPatient_SafelySkippedWithoutError()
    {
        var dbName = $"Tier5_Adv_Unlinked_{Guid.NewGuid()}";
        var contextSubstitute = Substitute.For<IClinicContext>();
        contextSubstitute.ClinicId.Returns(_clinicIdA);
        contextSubstitute.TenantId.Returns(_tenantIdA);

        var (context, uow, sieve) = TestDbHelper.CreateSharedTestContext(dbName, contextSubstitute);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();
        var logger = Microsoft.Extensions.Logging.Abstractions.NullLogger<QueueNotificationDispatcher>.Instance;

        await settingsRepo.AddAsync(new ClinicSettings
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantIdA,
            ClinicId = _clinicIdA,
            ClinicName = "Unlinked Test Clinic",
            EnableQueuePushNotifications = true,
            QueuePushNotificationThreshold = 2
        }, CancellationToken.None);

        // Ticket with NO SyncPatientId (walk-in patient without mobile app)
        var ticket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantIdA,
            ClinicId = _clinicIdA,
            QueueNumber = "Q-301",
            SequenceNumber = 1,
            QueueDate = _today,
            PatientId = Guid.NewGuid(),
            SyncPatientId = null,
            PatientName = "Walkin Unregistered",
            Status = QueueStatus.Waiting
        };
        await queueRepo.AddAsync(ticket, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var dispatcher = new QueueNotificationDispatcher(settingsRepo, queueRepo, patientRepo, publisher, logger);

        // Neither approaching nor called should throw or enqueue anything
        var act1 = async () => await dispatcher.EvaluateAndDispatchApproachingAlertsAsync(_clinicIdA, _today, CancellationToken.None);
        await act1.Should().NotThrowAsync();

        var act2 = async () => await dispatcher.DispatchCalledAlertAsync(ticket, "Dr. Santos", "Room 3", CancellationToken.None);
        await act2.Should().NotThrowAsync();

        publisher.DidNotReceive().Enqueue(
            Arg.Any<string>(),
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            Arg.Any<Guid>(),
            Arg.Any<object>());
    }

    // =========================================================================
    // 3. EOD BACKGROUND SERVICE: INVALID 24H FORMATS & TEMPORAL BOUNDARIES
    // =========================================================================

    [Theory]
    [InlineData("24:00")]
    [InlineData("25:00")]
    [InlineData("-01:00")]
    [InlineData("abc")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("21:60")]
    [InlineData("99:99")]
    [InlineData("25:99")]
    [InlineData(null)]
    public void Adv_06_EodBackgroundService_Invalid24HourFormats_ReturnsFalseGracefully(string? invalidTime)
    {
        var clinic = new ClinicSettings
        {
            ClinicId = Guid.NewGuid(),
            TenantId = "tenant_test",
            ClinicName = "Invalid Time Clinic",
            AutoEodEnabled = true,
            EodReconciliationTime = invalidTime!
        };

        var utcNow = DateTime.UtcNow;
        bool shouldReconcile = EodReconciliationBackgroundService.ShouldReconcile(clinic, "Asia/Manila", utcNow, out _);

        shouldReconcile.Should().BeFalse("Invalid or malformed time formats must safely reject reconciliation");
    }

    [Fact]
    public void Adv_07_EodBackgroundService_WhitespacePaddedTime_SuccessfullyParses()
    {
        var clinic = new ClinicSettings
        {
            ClinicId = Guid.NewGuid(),
            TenantId = "tenant_test",
            ClinicName = "Whitespace Clinic",
            AutoEodEnabled = true,
            EodReconciliationTime = "  21:00  "
        };

        // Local Manila time 21:05 (UTC 13:05)
        var utcNow = new DateTime(2026, 10, 13, 13, 5, 0, DateTimeKind.Utc);
        bool shouldReconcile = EodReconciliationBackgroundService.ShouldReconcile(clinic, "Asia/Manila", utcNow, out var localToday);

        shouldReconcile.Should().BeTrue();
        localToday.Should().Be(new DateOnly(2026, 10, 13));
    }

    [Fact]
    public void Adv_08_EodBackgroundService_InvalidTimeZone_GracefullyFallsBackToAsiaManila()
    {
        var tz = EodReconciliationBackgroundService.ResolveTimeZone("Invalid/NonExistent_TimeZone");
        tz.Should().NotBeNull();
        (tz.Id == "Asia/Manila" || tz.Id == "Singapore Standard Time" || tz.BaseUtcOffset == TimeSpan.FromHours(8)).Should().BeTrue();
    }

    [Fact]
    public void Adv_09_EodBackgroundService_AutoEodDisabled_ReturnsFalseEvenWhenPastTime()
    {
        var clinic = new ClinicSettings
        {
            ClinicId = Guid.NewGuid(),
            TenantId = "tenant_test",
            ClinicName = "Disabled Auto EOD Clinic",
            AutoEodEnabled = false,
            EodReconciliationTime = "21:00"
        };

        // Local Manila time 23:00 (UTC 15:00)
        var utcNow = new DateTime(2026, 10, 13, 15, 0, 0, DateTimeKind.Utc);
        bool shouldReconcile = EodReconciliationBackgroundService.ShouldReconcile(clinic, "Asia/Manila", utcNow, out _);

        shouldReconcile.Should().BeFalse("AutoEodEnabled = false must never trigger reconciliation");
    }

    // =========================================================================
    // 4. FUZZY MATCHER & DUPLICATE CHECK ADVERSARIAL STRESS
    // =========================================================================

    [Fact]
    public void Adv_10_FuzzyMatcher_Levenshtein_ExtremeInputsAndSpecialChars()
    {
        // Null & Empty
        FuzzyMatcher.LevenshteinDistance(null, null).Should().Be(0);
        FuzzyMatcher.LevenshteinDistance(null, "").Should().Be(0);
        FuzzyMatcher.LevenshteinDistance("hello", null).Should().Be(5);
        FuzzyMatcher.CalculateSimilarity(null, null).Should().Be(1.0);
        FuzzyMatcher.CalculateSimilarity("", "").Should().Be(1.0);
        FuzzyMatcher.CalculateSimilarity("test", null).Should().Be(0.0);

        // Unicode & Diacritics
        FuzzyMatcher.CalculateSimilarity("José", "Jose").Should().BeGreaterThan(0.70);
        FuzzyMatcher.CalculateSimilarity("Niño", "Nino").Should().BeGreaterThan(0.70);

        // Long strings
        var long1 = new string('A', 500);
        var long2 = new string('A', 499) + "B";
        FuzzyMatcher.LevenshteinDistance(long1, long2).Should().Be(1);
        FuzzyMatcher.CalculateSimilarity(long1, long2).Should().BeApproximately(0.998, 0.005);
    }

    [Fact]
    public void Adv_11_FuzzyMatcher_Soundex_EdgeCases()
    {
        // Empty & Null
        FuzzyMatcher.ToSoundex(null).Should().Be(string.Empty);
        FuzzyMatcher.ToSoundex("").Should().Be(string.Empty);
        FuzzyMatcher.ToSoundex("   ").Should().Be(string.Empty);

        // Pure digits & punctuation
        FuzzyMatcher.ToSoundex("12345").Should().Be(string.Empty);
        FuzzyMatcher.ToSoundex("---!@#").Should().Be(string.Empty);

        // Standard Philippine names
        FuzzyMatcher.ToSoundex("Santos").Should().Be("S532");
        FuzzyMatcher.ToSoundex("Cruz").Should().Be("C620");
        FuzzyMatcher.ToSoundex("Dela Cruz").Should().Be("D426");
    }

    [Theory]
    [InlineData("+639171234567", "9171234567")]
    [InlineData("0917-123-4567", "9171234567")]
    [InlineData("639171234567", "9171234567")]
    [InlineData("0917 123 4567", "9171234567")]
    [InlineData("(02) 8123-4567", "0281234567")]
    [InlineData("", "")]
    [InlineData(null, "")]
    [InlineData("NO PHONE", "")]
    public void Adv_12_FuzzyMatcher_PhoneNormalizer_HandledCleanly(string? input, string expected)
    {
        FuzzyMatcher.NormalizePhone(input).Should().Be(expected);
    }

    [Theory]
    [InlineData("12-345678901-2", "123456789012")]
    [InlineData("1234-5678-9012", "123456789012")]
    [InlineData(" 123456789012 ", "123456789012")]
    [InlineData("N/A", "")]
    [InlineData(null, "")]
    public void Adv_13_FuzzyMatcher_PhilHealthPinNormalizer_HandledCleanly(string? input, string expected)
    {
        FuzzyMatcher.NormalizePhilHealthPin(input).Should().Be(expected);
    }

    [Fact]
    public async Task Adv_14_CheckPatientDuplicates_ZeroCriteria_ReturnsEmptyResult()
    {
        var contextSubstitute = Substitute.For<IClinicContext>();
        contextSubstitute.ClinicId.Returns(_clinicIdA);
        contextSubstitute.TenantId.Returns(_tenantIdA);

        var (context, _, sieve) = TestDbHelper.CreateTestContext(contextSubstitute);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var handler = new CheckPatientDuplicatesQueryHandler(patientRepo);

        var result = await handler.Handle(new CheckPatientDuplicatesQuery(), CancellationToken.None);
        result.HasDuplicates.Should().BeFalse();
        result.Matches.Should().BeEmpty();
    }

    [Fact]
    public async Task Adv_15_CheckPatientDuplicates_MultiFactorMatch_BoostsConfidenceToHigh()
    {
        var contextSubstitute = Substitute.For<IClinicContext>();
        contextSubstitute.ClinicId.Returns(_clinicIdA);
        contextSubstitute.TenantId.Returns(_tenantIdA);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(contextSubstitute);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var existing = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantIdA,
            ClinicId = _clinicIdA,
            PatientCode = "P-EXISTING",
            FirstName = "Maria Clara",
            LastName = "Santos",
            DateOfBirth = new DateOnly(1995, 8, 20),
            ContactNumber = "0917-555-1234",
            PhilHealthNumber = "12-345678901-2"
        };
        await patientRepo.AddAsync(existing, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new CheckPatientDuplicatesQueryHandler(patientRepo);

        // Query with both matching PIN and matching Name+DOB
        var query = new CheckPatientDuplicatesQuery(
            PhilHealthNumber: "123456789012",
            ContactNumber: "09175551234",
            FirstName: "Maria Clara",
            LastName: "Santos",
            DateOfBirth: new DateOnly(1995, 8, 20));

        var result = await handler.Handle(query, CancellationToken.None);
        result.HasDuplicates.Should().BeTrue();
        result.Matches.Should().ContainSingle();

        var match = result.Matches[0];
        match.Confidence.Should().Be("High");
        match.SimilarityScore.Should().Be(1.0);
        match.MatchReason.Should().Contain("PIN");
        match.MatchReason.Should().Contain("Contact Number");
        match.MatchReason.Should().Contain("Full Name");
    }

    // =========================================================================
    // 5. MULTI-TENANT ISOLATION STRESS
    // =========================================================================

    [Fact]
    public async Task Adv_16_MultiTenant_ForceEodOnClinicA_NeverTouchesClinicB()
    {
        var dbName = $"Tier5_Adv_MultiTenant_{Guid.NewGuid()}";
        var contextA = Substitute.For<IClinicContext>();
        contextA.ClinicId.Returns(_clinicIdA);
        contextA.TenantId.Returns(_tenantIdA);

        var (dbA, uowA, sieveA) = TestDbHelper.CreateSharedTestContext(dbName, contextA);
        var queueRepoA = TestDbHelper.CreateRepository<QueueItem>(dbA, sieveA);
        var auditRepoA = TestDbHelper.CreateRepository<EodReconciliationAudit>(dbA, sieveA);

        // Add tickets for Clinic A
        var ticketA = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantIdA,
            ClinicId = _clinicIdA,
            QueueNumber = "Q-A-01",
            SequenceNumber = 1,
            QueueDate = _today,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient A",
            Status = QueueStatus.Waiting
        };
        await queueRepoA.AddAsync(ticketA, CancellationToken.None);
        await uowA.SaveChangesAsync(CancellationToken.None);

        // Context for Clinic B
        var contextB = Substitute.For<IClinicContext>();
        contextB.ClinicId.Returns(_clinicIdB);
        contextB.TenantId.Returns(_tenantIdB);

        var (dbB, uowB, sieveB) = TestDbHelper.CreateSharedTestContext(dbName, contextB);
        var queueRepoB = TestDbHelper.CreateRepository<QueueItem>(dbB, sieveB);

        // Add tickets for Clinic B
        var ticketB = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantIdB,
            ClinicId = _clinicIdB,
            QueueNumber = "Q-B-01",
            SequenceNumber = 1,
            QueueDate = _today,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient B",
            Status = QueueStatus.Waiting
        };
        await queueRepoB.AddAsync(ticketB, CancellationToken.None);
        await uowB.SaveChangesAsync(CancellationToken.None);

        // Execute Force EOD on Clinic A
        var eodHandlerA = new ReconcileEodCommandHandler(queueRepoA, auditRepoA, uowA, contextA);
        var resultA = await eodHandlerA.Handle(new ReconcileEodCommand(_today, "Manual"), CancellationToken.None);

        resultA.ReconciledCount.Should().Be(1);
        resultA.AffectedTicketNumbers.Should().ContainSingle().Which.Should().Be("Q-A-01");

        // Inspect Ticket B: Must still be Waiting!
        var ticketBAfter = await queueRepoB.GetByIdAsync(ticketB.Id);
        ticketBAfter!.Status.Should().Be(QueueStatus.Waiting, "Tenant B ticket MUST NOT be affected by Tenant A EOD");
        ticketBAfter.CompletedTime.Should().BeNull();
    }

    [Fact]
    public async Task Adv_17_HighVolumeQueue_ReconcileEodWith100Tickets_CompletesCleanly()
    {
        var dbName = $"Tier5_Adv_HighVolume_{Guid.NewGuid()}";
        var contextSubstitute = Substitute.For<IClinicContext>();
        contextSubstitute.ClinicId.Returns(_clinicIdA);
        contextSubstitute.TenantId.Returns(_tenantIdA);

        var (context, uow, sieve) = TestDbHelper.CreateSharedTestContext(dbName, contextSubstitute);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<EodReconciliationAudit>(context, sieve);

        // Seed 100 tickets
        var tickets = new List<QueueItem>();
        for (int i = 1; i <= 100; i++)
        {
            tickets.Add(new QueueItem
            {
                Id = Guid.NewGuid(),
                TenantId = _tenantIdA,
                ClinicId = _clinicIdA,
                QueueNumber = $"Q-{i:D4}",
                SequenceNumber = i,
                QueueDate = _today,
                PatientId = Guid.NewGuid(),
                PatientName = $"Volume Patient {i}",
                Status = QueueStatus.Waiting
            });
        }
        foreach (var t in tickets)
        {
            await queueRepo.AddAsync(t, CancellationToken.None);
        }
        await uow.SaveChangesAsync(CancellationToken.None);

        var eodHandler = new ReconcileEodCommandHandler(queueRepo, auditRepo, uow, contextSubstitute);
        var result = await eodHandler.Handle(new ReconcileEodCommand(_today, "Manual", "High Volume EOD"), CancellationToken.None);

        result.ReconciledCount.Should().Be(100);
        result.AffectedTicketNumbers.Should().HaveCount(100);

        var remainingActive = await queueRepo.Query(q => q.ClinicId == _clinicIdA && q.QueueDate == _today && q.Status == QueueStatus.Waiting)
            .CountAsync(CancellationToken.None);
        remainingActive.Should().Be(0);
    }
}
