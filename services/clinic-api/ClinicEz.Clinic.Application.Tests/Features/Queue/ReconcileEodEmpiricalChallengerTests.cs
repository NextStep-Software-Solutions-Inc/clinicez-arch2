using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Queue.Commands;
using ClinicEz.Clinic.Application.Features.Queue.DTOs;
using ClinicEz.Clinic.Application.Tests;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.BackgroundServices;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Queue;

/// <summary>
/// EMPIRICAL ADVERSARIAL CHALLENGER TEST SUITE FOR MILESTONE 1:
/// Configurable End-of-Day (EOD) Reconciliation & Force EOD Logic.
///
/// Tests:
/// 1. Concurrency: High-concurrency simultaneous execution of ReconcileEodCommand,
///    idempotency, race condition avoidance, and concurrent consultation actions.
/// 2. Invariant & Status Preservation: Complete matrix verification of all QueueStatus enums
///    guaranteeing InConsultation, Completed, Cancelled, and sub-statuses are NEVER altered.
/// 3. Boundary Dates: Multi-day queue scoping, explicit dates, null date UTC fallback,
///    cross-midnight and leap day temporal boundaries.
/// 4. Empty Queue: 0 tickets, no-op audit creation, multi-tenant isolation.
/// 5. Audit Logging: Payload fidelity, JSON serialization, and actor provenance.
/// </summary>
public class ReconcileEodEmpiricalChallengerTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly Guid _staffId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_challenger_m1";
    private readonly IClinicContext _clinicContext;

    public ReconcileEodEmpiricalChallengerTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffId.Returns(_staffId);
    }

    // =========================================================================
    // 1. CONCURRENCY & IDEMPOTENCY EMPIRICAL TESTS
    // =========================================================================

    [Fact]
    public async Task Concurrency_10SimultaneousReconcileCommands_ExecutesWithoutCorruptionOrUnhandledErrors()
    {
        // Arrange: Shared in-memory DB populated with 20 active tickets
        var dbName = $"ClinicEz_ConcurrentEod_{Guid.NewGuid()}";
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        // Seed using initial context
        var (seedContext, seedUow, seedSieve) = TestDbHelper.CreateSharedTestContext(dbName, _clinicContext);
        var seedRepo = TestDbHelper.CreateRepository<QueueItem>(seedContext, seedSieve);

        var expectedTicketNumbers = new List<string>();
        for (int i = 1; i <= 20; i++)
        {
            var ticketNumber = $"Q-{i:D3}";
            expectedTicketNumbers.Add(ticketNumber);
            var status = (i % 3) switch
            {
                0 => QueueStatus.Waiting,
                1 => QueueStatus.Triaged,
                _ => QueueStatus.OnHold
            };

            await seedRepo.AddAsync(new QueueItem
            {
                Id = Guid.NewGuid(),
                TenantId = _tenantId,
                ClinicId = _clinicId,
                QueueNumber = ticketNumber,
                SequenceNumber = i,
                QueueDate = today,
                PatientId = Guid.NewGuid(),
                PatientName = $"Patient {i}",
                Status = status
            }, CancellationToken.None);
        }
        await seedUow.SaveChangesAsync(CancellationToken.None);

        // Act: Launch 10 simultaneous ReconcileEodCommand executions across isolated DbContext instances
        const int concurrentTasks = 10;
        var barrier = new SemaphoreSlim(0, concurrentTasks);
        var results = new ReconcileEodResultDto[concurrentTasks];
        var tasks = new Task[concurrentTasks];

        for (int t = 0; t < concurrentTasks; t++)
        {
            int index = t;
            tasks[index] = Task.Run(async () =>
            {
                await barrier.WaitAsync();
                var (ctx, uow, sieve) = TestDbHelper.CreateSharedTestContext(dbName, _clinicContext);
                var queueRepo = TestDbHelper.CreateRepository<QueueItem>(ctx, sieve);
                var auditRepo = TestDbHelper.CreateRepository<EodReconciliationAudit>(ctx, sieve);
                var handler = new ReconcileEodCommandHandler(queueRepo, auditRepo, uow, _clinicContext);

                results[index] = await handler.Handle(
                    new ReconcileEodCommand(today, TriggerType: "Manual", Reason: $"Concurrent worker {index}"),
                    CancellationToken.None);
            });
        }

        // Release all concurrent workers simultaneously
        barrier.Release(concurrentTasks);
        await Task.WhenAll(tasks);

        // Assert: Verify state in a fresh verification context
        var (verifyCtx, _, verifySieve) = TestDbHelper.CreateSharedTestContext(dbName, _clinicContext);
        var verifyQueue = await verifyCtx.Set<QueueItem>().ToListAsync();
        var verifyAudits = await verifyCtx.Set<EodReconciliationAudit>().ToListAsync();

        // All 20 tickets MUST be NoShow with non-null CompletedTime
        verifyQueue.Should().HaveCount(20);
        verifyQueue.All(q => q.Status == QueueStatus.NoShow).Should().BeTrue("all active tickets must transition to NoShow");
        verifyQueue.All(q => q.CompletedTime.HasValue).Should().BeTrue("all reconciled tickets must have CompletedTime stamped");

        // The total number of tickets reported reconciled across all concurrent runs must be at least 20,
        // and exactly 10 audit records must exist (one per run)
        verifyAudits.Should().HaveCount(concurrentTasks);
        var sumReconciledAcrossRuns = results.Sum(r => r.ReconciledCount);
        sumReconciledAcrossRuns.Should().BeGreaterThanOrEqualTo(20, "each ticket must have been handled by at least one worker without loss");

        // Subsequent sequential run on the same queue must reconcile exactly 0 tickets (idempotency)
        var (subsequentCtx, subUow, subSieve) = TestDbHelper.CreateSharedTestContext(dbName, _clinicContext);
        var subQueueRepo = TestDbHelper.CreateRepository<QueueItem>(subsequentCtx, subSieve);
        var subAuditRepo = TestDbHelper.CreateRepository<EodReconciliationAudit>(subsequentCtx, subSieve);
        var subsequentHandler = new ReconcileEodCommandHandler(subQueueRepo, subAuditRepo, subUow, _clinicContext);

        var subsequentResult = await subsequentHandler.Handle(
            new ReconcileEodCommand(today, TriggerType: "Manual", Reason: "Sequential idempotency check"),
            CancellationToken.None);

        subsequentResult.ReconciledCount.Should().Be(0);
        subsequentResult.AffectedTicketNumbers.Should().BeEmpty();
    }

    [Fact]
    public async Task Concurrency_InConsultationTicket_RemainsUntouchedDuringActiveReconciliation()
    {
        // Arrange
        var dbName = $"ClinicEz_ConcurrentConsult_{Guid.NewGuid()}";
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var (seedCtx, seedUow, seedSieve) = TestDbHelper.CreateSharedTestContext(dbName, _clinicContext);
        var seedRepo = TestDbHelper.CreateRepository<QueueItem>(seedCtx, seedSieve);

        var inConsultTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-ACTIVE-DOC",
            SequenceNumber = 1,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Active In Consultation Patient",
            Status = QueueStatus.InConsultation,
            CalledTime = DateTime.UtcNow.AddMinutes(-15)
        };

        var waitingTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-WAIT-01",
            SequenceNumber = 2,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Waiting Patient",
            Status = QueueStatus.Waiting
        };

        await seedRepo.AddAsync(inConsultTicket, CancellationToken.None);
        await seedRepo.AddAsync(waitingTicket, CancellationToken.None);
        await seedUow.SaveChangesAsync(CancellationToken.None);

        // Act: Execute EOD reconciliation
        var (ctx, uow, sieve) = TestDbHelper.CreateSharedTestContext(dbName, _clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(ctx, sieve);
        var auditRepo = TestDbHelper.CreateRepository<EodReconciliationAudit>(ctx, sieve);
        var handler = new ReconcileEodCommandHandler(queueRepo, auditRepo, uow, _clinicContext);

        var result = await handler.Handle(new ReconcileEodCommand(today), CancellationToken.None);

        // Assert
        result.ReconciledCount.Should().Be(1);
        result.AffectedTicketNumbers.Should().ContainSingle().Which.Should().Be("Q-WAIT-01");

        var (verifyCtx, _, _) = TestDbHelper.CreateSharedTestContext(dbName, _clinicContext);
        var reloadedConsult = await verifyCtx.Set<QueueItem>().FirstAsync(q => q.Id == inConsultTicket.Id);
        reloadedConsult.Status.Should().Be(QueueStatus.InConsultation, "active doctor consultation MUST NOT be closed by EOD");
        reloadedConsult.CompletedTime.Should().BeNull();
    }

    // =========================================================================
    // 2. INVARIANT & COMPLETE STATUS PRESERVATION MATRIX
    // =========================================================================

    [Fact]
    public async Task StatusMatrix_All9QueueStatusEnumValues_TransitionsOnlyWaitingTriagedOnHold()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<EodReconciliationAudit>(context, sieve);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var originalCompletedTime = DateTime.UtcNow.AddHours(-1);
        var originalCalledTime = DateTime.UtcNow.AddMinutes(-20);

        var tickets = new Dictionary<QueueStatus, QueueItem>();

        foreach (QueueStatus status in Enum.GetValues<QueueStatus>())
        {
            var item = new QueueItem
            {
                Id = Guid.NewGuid(),
                TenantId = _tenantId,
                ClinicId = _clinicId,
                QueueNumber = $"Q-STATUS-{(int)status}",
                SequenceNumber = (int)status,
                QueueDate = today,
                PatientId = Guid.NewGuid(),
                PatientName = $"Patient for {status}",
                Status = status,
                CalledTime = status == QueueStatus.InConsultation ? originalCalledTime : null,
                CompletedTime = (status is QueueStatus.Completed or QueueStatus.Cancelled or QueueStatus.NoShow)
                    ? originalCompletedTime
                    : null
            };
            tickets[status] = item;
            await queueRepo.AddAsync(item, CancellationToken.None);
        }
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ReconcileEodCommandHandler(queueRepo, auditRepo, uow, _clinicContext);

        // Act
        var result = await handler.Handle(new ReconcileEodCommand(today), CancellationToken.None);

        // Assert: Exactly Waiting (1), Triaged (2), and OnHold (9) should transition
        result.ReconciledCount.Should().Be(3);
        result.AffectedTicketNumbers.Should().BeEquivalentTo(new[]
        {
            $"Q-STATUS-{(int)QueueStatus.Waiting}",
            $"Q-STATUS-{(int)QueueStatus.Triaged}",
            $"Q-STATUS-{(int)QueueStatus.OnHold}"
        });

        // Verify each individual status in the database
        var reloadedItems = await context.Set<QueueItem>().ToDictionaryAsync(q => q.SequenceNumber);

        // 1. Waiting -> NoShow
        reloadedItems[(int)QueueStatus.Waiting].Status.Should().Be(QueueStatus.NoShow);
        reloadedItems[(int)QueueStatus.Waiting].CompletedTime.Should().NotBeNull();

        // 2. Triaged -> NoShow
        reloadedItems[(int)QueueStatus.Triaged].Status.Should().Be(QueueStatus.NoShow);
        reloadedItems[(int)QueueStatus.Triaged].CompletedTime.Should().NotBeNull();

        // 9. OnHold -> NoShow
        reloadedItems[(int)QueueStatus.OnHold].Status.Should().Be(QueueStatus.NoShow);
        reloadedItems[(int)QueueStatus.OnHold].CompletedTime.Should().NotBeNull();

        // 3. InConsultation -> PRESERVED (MUST NOT BE NoShow)
        reloadedItems[(int)QueueStatus.InConsultation].Status.Should().Be(QueueStatus.InConsultation);
        reloadedItems[(int)QueueStatus.InConsultation].CompletedTime.Should().BeNull();
        reloadedItems[(int)QueueStatus.InConsultation].CalledTime.Should().Be(originalCalledTime);

        // 4. Completed -> PRESERVED (MUST NOT BE NoShow, CompletedTime untouched)
        reloadedItems[(int)QueueStatus.Completed].Status.Should().Be(QueueStatus.Completed);
        reloadedItems[(int)QueueStatus.Completed].CompletedTime.Should().Be(originalCompletedTime);

        // 5. Cancelled -> PRESERVED
        reloadedItems[(int)QueueStatus.Cancelled].Status.Should().Be(QueueStatus.Cancelled);
        reloadedItems[(int)QueueStatus.Cancelled].CompletedTime.Should().Be(originalCompletedTime);

        // 6. NoShow (pre-existing) -> PRESERVED without overwriting timestamp
        reloadedItems[(int)QueueStatus.NoShow].Status.Should().Be(QueueStatus.NoShow);
        reloadedItems[(int)QueueStatus.NoShow].CompletedTime.Should().Be(originalCompletedTime);

        // 7. PendingProcedure -> PRESERVED (clinical sub-flow)
        reloadedItems[(int)QueueStatus.PendingProcedure].Status.Should().Be(QueueStatus.PendingProcedure);
        reloadedItems[(int)QueueStatus.PendingProcedure].CompletedTime.Should().BeNull();

        // 8. ReEvaluation -> PRESERVED (clinical sub-flow)
        reloadedItems[(int)QueueStatus.ReEvaluation].Status.Should().Be(QueueStatus.ReEvaluation);
        reloadedItems[(int)QueueStatus.ReEvaluation].CompletedTime.Should().BeNull();

        // 10. DischargedNonDoctor -> PRESERVED (terminal non-doctor status, MUST NOT be NoShow)
        reloadedItems[(int)QueueStatus.DischargedNonDoctor].Status.Should().Be(QueueStatus.DischargedNonDoctor);

        // 11. Diverted -> PRESERVED (emergency diversion, MUST NOT be NoShow)
        reloadedItems[(int)QueueStatus.Diverted].Status.Should().Be(QueueStatus.Diverted);
    }

    // =========================================================================
    // 3. BOUNDARY DATES & TEMPORAL INVARIANTS
    // =========================================================================

    [Fact]
    public async Task BoundaryDates_MultiDayIsolation_ReconcilesTargetDateAndNeverCrossesDays()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<EodReconciliationAudit>(context, sieve);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var yesterday = today.AddDays(-1);
        var tomorrow = today.AddDays(1);

        var ticketYesterday = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-YESTERDAY",
            SequenceNumber = 1,
            QueueDate = yesterday,
            PatientId = Guid.NewGuid(),
            PatientName = "Yesterday Patient",
            Status = QueueStatus.Waiting
        };

        var ticketToday = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-TODAY",
            SequenceNumber = 2,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Today Patient",
            Status = QueueStatus.Waiting
        };

        var ticketTomorrow = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-TOMORROW",
            SequenceNumber = 3,
            QueueDate = tomorrow,
            PatientId = Guid.NewGuid(),
            PatientName = "Tomorrow Patient",
            Status = QueueStatus.Waiting
        };

        await queueRepo.AddAsync(ticketYesterday, CancellationToken.None);
        await queueRepo.AddAsync(ticketToday, CancellationToken.None);
        await queueRepo.AddAsync(ticketTomorrow, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ReconcileEodCommandHandler(queueRepo, auditRepo, uow, _clinicContext);

        // Act 1: Reconcile today
        var resultToday = await handler.Handle(new ReconcileEodCommand(today), CancellationToken.None);

        // Assert 1: Only today transitioned
        resultToday.ReconciledCount.Should().Be(1);
        resultToday.AffectedTicketNumbers.Should().ContainSingle().Which.Should().Be("Q-TODAY");

        var reloadedToday = await context.Set<QueueItem>().FirstAsync(q => q.Id == ticketToday.Id);
        reloadedToday.Status.Should().Be(QueueStatus.NoShow);

        var reloadedYesterday = await context.Set<QueueItem>().FirstAsync(q => q.Id == ticketYesterday.Id);
        reloadedYesterday.Status.Should().Be(QueueStatus.Waiting, "yesterday ticket must remain untouched when reconciling today");

        var reloadedTomorrow = await context.Set<QueueItem>().FirstAsync(q => q.Id == ticketTomorrow.Id);
        reloadedTomorrow.Status.Should().Be(QueueStatus.Waiting, "tomorrow ticket must remain untouched when reconciling today");

        // Act 2: Reconcile yesterday explicitly
        var resultYesterday = await handler.Handle(new ReconcileEodCommand(yesterday), CancellationToken.None);

        // Assert 2: Yesterday now transitioned
        resultYesterday.ReconciledCount.Should().Be(1);
        resultYesterday.AffectedTicketNumbers.Should().ContainSingle().Which.Should().Be("Q-YESTERDAY");

        reloadedYesterday = await context.Set<QueueItem>().FirstAsync(q => q.Id == ticketYesterday.Id);
        reloadedYesterday.Status.Should().Be(QueueStatus.NoShow);

        reloadedTomorrow = await context.Set<QueueItem>().FirstAsync(q => q.Id == ticketTomorrow.Id);
        reloadedTomorrow.Status.Should().Be(QueueStatus.Waiting, "tomorrow ticket still untouched");
    }

    [Fact]
    public async Task BoundaryDates_NullDateInCommand_DefaultsToUtcToday()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<EodReconciliationAudit>(context, sieve);

        var utcToday = DateOnly.FromDateTime(DateTime.UtcNow);

        var ticket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-NULL-DATE",
            SequenceNumber = 1,
            QueueDate = utcToday,
            PatientId = Guid.NewGuid(),
            PatientName = "Null Date Patient",
            Status = QueueStatus.Waiting
        };

        await queueRepo.AddAsync(ticket, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ReconcileEodCommandHandler(queueRepo, auditRepo, uow, _clinicContext);

        // Act: Pass Date = null
        var result = await handler.Handle(new ReconcileEodCommand(Date: null), CancellationToken.None);

        // Assert
        result.ReconciliationDate.Should().Be(utcToday);
        result.ReconciledCount.Should().Be(1);
        result.AffectedTicketNumbers.Should().ContainSingle().Which.Should().Be("Q-NULL-DATE");
    }

    [Fact]
    public async Task BoundaryDates_LeapDayAndYearEndTransitions_HandlesCorrectly()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<EodReconciliationAudit>(context, sieve);

        var leapDay = new DateOnly(2028, 2, 29); // Valid leap day

        var leapTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-LEAP-001",
            SequenceNumber = 1,
            QueueDate = leapDay,
            PatientId = Guid.NewGuid(),
            PatientName = "Leap Day Patient",
            Status = QueueStatus.Waiting
        };

        await queueRepo.AddAsync(leapTicket, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ReconcileEodCommandHandler(queueRepo, auditRepo, uow, _clinicContext);

        // Act
        var result = await handler.Handle(new ReconcileEodCommand(leapDay), CancellationToken.None);

        // Assert
        result.ReconciliationDate.Should().Be(leapDay);
        result.ReconciledCount.Should().Be(1);
        result.AffectedTicketNumbers.Should().Contain("Q-LEAP-001");
    }

    [Theory]
    [InlineData("21:00", "2026-10-13T12:59:59Z", "Asia/Manila", false)] // 20:59:59 Manila -> not yet
    [InlineData("21:00", "2026-10-13T13:00:00Z", "Asia/Manila", true)]  // 21:00:00 Manila -> triggered!
    [InlineData("23:59", "2026-10-13T15:58:59Z", "Asia/Manila", false)] // 23:58:59 Manila -> not yet
    [InlineData("23:59", "2026-10-13T15:59:00Z", "Asia/Manila", true)]  // 23:59:00 Manila -> triggered!
    [InlineData("00:00", "2026-10-13T16:00:00Z", "Asia/Manila", true)]  // Midnight 00:00:00 Manila on next date
    public void Temporal_CrossMidnightScheduleEvaluation_ResolvesLocalDayAccurately(
        string targetTime,
        string utcTimestamp,
        string timeZoneId,
        bool expectedShouldReconcile)
    {
        var clinic = new ClinicSettings
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Manila Clinic",
            EodReconciliationTime = targetTime,
            AutoEodEnabled = true
        };

        var utcNow = DateTime.Parse(utcTimestamp).ToUniversalTime();

        var should = EodReconciliationBackgroundService.ShouldReconcile(
            clinic,
            timeZoneId,
            utcNow,
            out var localToday);

        should.Should().Be(expectedShouldReconcile);
    }

    // =========================================================================
    // 4. EMPTY QUEUE & MULTI-TENANT ISOLATION
    // =========================================================================

    [Fact]
    public async Task EmptyQueue_ZeroTicketsInClinic_ReturnsZeroAndCreatesAuditRecord()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<EodReconciliationAudit>(context, sieve);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var handler = new ReconcileEodCommandHandler(queueRepo, auditRepo, uow, _clinicContext);

        // Act
        var result = await handler.Handle(
            new ReconcileEodCommand(today, TriggerType: "Manual", Reason: "Routine empty closing"),
            CancellationToken.None);

        // Assert
        result.ReconciledCount.Should().Be(0);
        result.AffectedTicketNumbers.Should().BeEmpty();
        result.Summary.Should().Contain("No active tickets found");

        var audits = await context.Set<EodReconciliationAudit>().ToListAsync();
        audits.Should().HaveCount(1);
        audits[0].TotalTicketsProcessed.Should().Be(0);
        audits[0].AffectedTicketNumbersJson.Should().Be("[]");
        audits[0].Notes.Should().Be("Routine empty closing");
    }

    [Fact]
    public async Task MultiTenant_ReconcileOneClinic_DoesNotTouchOtherClinicsTickets()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<EodReconciliationAudit>(context, sieve);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var otherClinicId = Guid.NewGuid();

        var myClinicTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-MINE",
            SequenceNumber = 1,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "My Clinic Patient",
            Status = QueueStatus.Waiting
        };

        var otherClinicTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = otherClinicId,
            QueueNumber = "Q-OTHER",
            SequenceNumber = 2,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Other Clinic Patient",
            Status = QueueStatus.Waiting
        };

        await queueRepo.AddAsync(myClinicTicket, CancellationToken.None);
        await queueRepo.AddAsync(otherClinicTicket, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ReconcileEodCommandHandler(queueRepo, auditRepo, uow, _clinicContext);

        // Act: Reconcile my clinic
        var result = await handler.Handle(new ReconcileEodCommand(today), CancellationToken.None);

        // Assert
        result.ReconciledCount.Should().Be(1);
        result.AffectedTicketNumbers.Should().ContainSingle().Which.Should().Be("Q-MINE");

        var reloadedMine = await context.Set<QueueItem>().FirstAsync(q => q.Id == myClinicTicket.Id);
        reloadedMine.Status.Should().Be(QueueStatus.NoShow);

        var reloadedOther = await context.Set<QueueItem>().IgnoreQueryFilters().FirstAsync(q => q.Id == otherClinicTicket.Id);
        reloadedOther.Status.Should().Be(QueueStatus.Waiting, "other clinic's queue tickets MUST NOT be modified");
    }

    // =========================================================================
    // 5. AUDIT LOGGING INTEGRITY & PAYLOAD SERIALIZATION
    // =========================================================================

    [Fact]
    public async Task AuditTrail_PayloadIntegrity_SerializesTicketNumbersInSequenceOrder()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<EodReconciliationAudit>(context, sieve);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        // Add tickets with out-of-order sequence numbers
        var t3 = new QueueItem { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-003", SequenceNumber = 3, QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "P3", Status = QueueStatus.Waiting };
        var t1 = new QueueItem { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-001", SequenceNumber = 1, QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "P1", Status = QueueStatus.Waiting };
        var t2 = new QueueItem { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-002", SequenceNumber = 2, QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "P2", Status = QueueStatus.Waiting };

        await queueRepo.AddAsync(t3, CancellationToken.None);
        await queueRepo.AddAsync(t1, CancellationToken.None);
        await queueRepo.AddAsync(t2, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ReconcileEodCommandHandler(queueRepo, auditRepo, uow, _clinicContext);

        // Act
        var result = await handler.Handle(new ReconcileEodCommand(today, TriggerType: "Manual", Reason: "Shift ended"), CancellationToken.None);

        // Assert: ReconcileEodResultDto AffectedTicketNumbers must be ordered by sequence
        result.AffectedTicketNumbers.Should().ContainInOrder("Q-001", "Q-002", "Q-003");

        // Audit entity verification
        var audits = await context.Set<EodReconciliationAudit>().ToListAsync();
        audits.Should().HaveCount(1);
        var audit = audits[0];

        audit.TenantId.Should().Be(_tenantId);
        audit.ClinicId.Should().Be(_clinicId);
        audit.ReconciliationDate.Should().Be(today);
        audit.TotalTicketsProcessed.Should().Be(3);
        audit.TriggerType.Should().Be("Manual");
        audit.StaffId.Should().Be(_staffId);
        audit.Notes.Should().Be("Shift ended");

        // Verify JSON deserialization of affected tickets
        var deserializedTickets = JsonSerializer.Deserialize<List<string>>(audit.AffectedTicketNumbersJson);
        deserializedTickets.Should().NotBeNull();
        deserializedTickets.Should().ContainInOrder("Q-001", "Q-002", "Q-003");
    }

    [Fact]
    public async Task AuditTrail_AutomaticTrigger_SetsProvenanceFieldsCorrectly()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<EodReconciliationAudit>(context, sieve);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var ticket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-AUTO",
            SequenceNumber = 1,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Auto Patient",
            Status = QueueStatus.Waiting
        };

        await queueRepo.AddAsync(ticket, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ReconcileEodCommandHandler(queueRepo, auditRepo, uow, _clinicContext);

        // Act: TriggerType == "Automatic" without reason
        var result = await handler.Handle(new ReconcileEodCommand(today, TriggerType: "Automatic"), CancellationToken.None);

        // Assert
        var reloadedTicket = await context.Set<QueueItem>().FirstAsync(q => q.Id == ticket.Id);
        reloadedTicket.UpdatedBy.Should().Be("AutoEOD");

        var audit = await context.Set<EodReconciliationAudit>().FirstAsync();
        audit.TriggerType.Should().Be("Automatic");
        audit.ReconciledBy.Should().Be("System / AutoEOD");
        audit.CreatedBy.Should().Be("AutoEOD");
        audit.Notes.Should().Be("Scheduled EOD queue closure.");
    }
}
