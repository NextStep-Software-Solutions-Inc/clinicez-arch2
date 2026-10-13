using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Middlewares;
using ClinicEz.Clinic.Application.Common.Exceptions;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Consultations.Commands;
using ClinicEz.Clinic.Application.Features.Queue.Commands;
using ClinicEz.Clinic.Application.Features.Queue.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Empirical Adversarial Stress Test Suite for Outpatient Department (OPD) Queue Management System.
/// Validates active queue day uniqueness, duplicate check-in blocking, 409 conflict formatting,
/// multi-visit lifecycles, absence controls (No-Show, On Hold, Cancel, Reactivate), top-of-line
/// sequence math, cross-clinic isolation, and queue wait-time metrics.
/// </summary>
public class ChallengerOpdQueueAdversarialTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_adversarial_opd";

    public ChallengerOpdQueueAdversarialTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
    }

    // =========================================================================
    // 1. ACTIVE QUEUE UNIQUENESS & 409 CONFLICT RESPONSES
    // =========================================================================

    [Theory]
    [InlineData(QueueStatus.Waiting)]
    [InlineData(QueueStatus.Triaged)]
    [InlineData(QueueStatus.InConsultation)]
    [InlineData(QueueStatus.PendingProcedure)]
    [InlineData(QueueStatus.ReEvaluation)]
    [InlineData(QueueStatus.OnHold)]
    public async Task CheckIn_WhenPatientHasActiveTicketInAnyActiveStatus_ThrowsActiveQueueTicketConflictException(QueueStatus activeStatus)
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var identity = Substitute.For<IClinicIdentityProvider>();
        var publisher = Substitute.For<IPatientAppointmentPublisher>();

        var patientId = Guid.NewGuid();
        var patientName = "Corazon Aquino";
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var existingTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-001",
            SequenceNumber = 1,
            QueueDate = today,
            PatientId = patientId,
            PatientName = patientName,
            Status = activeStatus,
            CheckInTime = DateTime.UtcNow.AddMinutes(-45)
        };
        await queueRepo.AddAsync(existingTicket, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new CheckInPatientCommandHandler(queueRepo, apptRepo, uow, _clinicContext, identity, publisher);
        var command = new CheckInPatientCommand(patientId, patientName);

        // Act & Assert
        var ex = await Assert.ThrowsAsync<ActiveQueueTicketConflictException>(() =>
            handler.Handle(command, CancellationToken.None));

        ex.TicketId.Should().Be(existingTicket.Id);
        ex.QueueNumber.Should().Be("Q-001");
        ex.Status.Should().Be(activeStatus.ToString());
        ex.PatientName.Should().Be(patientName);
        ex.Message.Should().Be($"Patient {patientName} is already checked in as Q-001 ({activeStatus})");

        // Verify no second ticket was inserted into the database
        var totalTickets = await queueRepo.Query(q => q.ClinicId == _clinicId && q.PatientId == patientId).CountAsync();
        totalTickets.Should().Be(1);
    }

    [Fact]
    public async Task ClinicExceptionHandler_ActiveQueueConflict_ReturnsStatusCode409AndExactJsonPayload()
    {
        // Arrange
        var handler = new ClinicExceptionHandler();
        var context = new DefaultHttpContext();
        context.Response.Body = new MemoryStream();

        var ticketId = Guid.NewGuid();
        var queueNumber = "Q-088";
        var status = "OnHold";
        var patientName = "Ramon Magsaysay";

        var exception = new ActiveQueueTicketConflictException(ticketId, queueNumber, status, patientName);

        // Act
        var handled = await handler.TryHandleAsync(context, exception, CancellationToken.None);

        // Assert
        handled.Should().BeTrue();
        context.Response.StatusCode.Should().Be(409);

        context.Response.Body.Seek(0, SeekOrigin.Begin);
        var json = await new StreamReader(context.Response.Body).ReadToEndAsync();
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        root.GetProperty("succeeded").GetBoolean().Should().BeFalse();
        root.GetProperty("message").GetString().Should().Be($"Patient {patientName} is already checked in as {queueNumber} ({status})");
        root.GetProperty("errorCode").GetString().Should().Be("active_queue_ticket_exists");

        var data = root.GetProperty("data");
        data.GetProperty("ticketId").GetGuid().Should().Be(ticketId);
        data.GetProperty("queueNumber").GetString().Should().Be(queueNumber);
        data.GetProperty("status").GetString().Should().Be(status);
        data.GetProperty("patientName").GetString().Should().Be(patientName);
    }

    [Fact]
    public async Task CheckIn_CrossClinicIsolation_ActiveTicketInClinicA_DoesNotBlockCheckInInClinicB()
    {
        // Arrange
        var clinicAId = Guid.NewGuid();
        var clinicBId = Guid.NewGuid();
        var sharedDbName = $"SharedClinicIsolation_{Guid.NewGuid()}";

        var clinicContextA = Substitute.For<IClinicContext>();
        clinicContextA.ClinicId.Returns(clinicAId);
        clinicContextA.TenantId.Returns(_tenantId);

        var clinicContextB = Substitute.For<IClinicContext>();
        clinicContextB.ClinicId.Returns(clinicBId);
        clinicContextB.TenantId.Returns(_tenantId);

        var (contextA, uowA, sieveA) = TestDbHelper.CreateSharedTestContext(sharedDbName, clinicContextA);
        var (contextB, uowB, sieveB) = TestDbHelper.CreateSharedTestContext(sharedDbName, clinicContextB);

        var queueRepoA = TestDbHelper.CreateRepository<QueueItem>(contextA, sieveA);
        var queueRepoB = TestDbHelper.CreateRepository<QueueItem>(contextB, sieveB);
        var apptRepoB = TestDbHelper.CreateRepository<Appointment>(contextB, sieveB);

        var patientId = Guid.NewGuid();
        var patientName = "Manuel Quezon";
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        // Patient is actively Waiting in Clinic A
        var activeInClinicA = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = clinicAId,
            QueueNumber = "Q-001",
            SequenceNumber = 1,
            QueueDate = today,
            PatientId = patientId,
            PatientName = patientName,
            Status = QueueStatus.Waiting,
            CheckInTime = DateTime.UtcNow.AddMinutes(-10)
        };
        await queueRepoA.AddAsync(activeInClinicA, CancellationToken.None);
        await uowA.SaveChangesAsync(CancellationToken.None);

        var handlerB = new CheckInPatientCommandHandler(queueRepoB, apptRepoB, uowB, clinicContextB,
            Substitute.For<IClinicIdentityProvider>(), Substitute.For<IPatientAppointmentPublisher>());

        // Act: Patient checks in at Clinic B on the same day
        var resultB = await handlerB.Handle(new CheckInPatientCommand(patientId, patientName), CancellationToken.None);

        // Assert: Succeeds in Clinic B without collision
        resultB.Should().NotBeNull();
        resultB.ClinicId.Should().Be(clinicBId);
        resultB.QueueNumber.Should().Be("Q-001");
        resultB.Status.Should().Be(QueueStatus.Waiting);
    }

    [Fact]
    public async Task CheckIn_CrossDayIsolation_ActiveTicketFromYesterday_DoesNotBlockCheckInToday()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);

        var patientId = Guid.NewGuid();
        var patientName = "Emilio Aguinaldo";
        var yesterday = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1));
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        // Ticket from yesterday was left in Waiting
        var yesterdayTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-001",
            SequenceNumber = 1,
            QueueDate = yesterday,
            PatientId = patientId,
            PatientName = patientName,
            Status = QueueStatus.Waiting,
            CheckInTime = DateTime.UtcNow.AddDays(-1)
        };
        await queueRepo.AddAsync(yesterdayTicket, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new CheckInPatientCommandHandler(queueRepo, apptRepo, uow, _clinicContext,
            Substitute.For<IClinicIdentityProvider>(), Substitute.For<IPatientAppointmentPublisher>());

        // Act
        var resultToday = await handler.Handle(new CheckInPatientCommand(patientId, patientName), CancellationToken.None);

        // Assert
        resultToday.Should().NotBeNull();
        resultToday.QueueDate.Should().Be(today);
        resultToday.QueueNumber.Should().Be("Q-001");
        resultToday.Status.Should().Be(QueueStatus.Waiting);
    }

    // =========================================================================
    // 2. SECOND VISIT ALLOWANCE AFTER TERMINAL STATES
    // =========================================================================

    [Theory]
    [InlineData(QueueStatus.Completed)]
    [InlineData(QueueStatus.Cancelled)]
    [InlineData(QueueStatus.NoShow)]
    public async Task CheckIn_SecondVisitAfterTerminalState_SucceedsAndAllocatesNextTicket(QueueStatus terminalStatus)
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);

        var patientId = Guid.NewGuid();
        var patientName = "Apolinario Mabini";
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var firstTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-001",
            SequenceNumber = 1,
            QueueDate = today,
            PatientId = patientId,
            PatientName = patientName,
            Status = terminalStatus,
            CheckInTime = DateTime.UtcNow.AddHours(-2),
            CompletedTime = DateTime.UtcNow.AddHours(-1)
        };
        await queueRepo.AddAsync(firstTicket, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new CheckInPatientCommandHandler(queueRepo, apptRepo, uow, _clinicContext,
            Substitute.For<IClinicIdentityProvider>(), Substitute.For<IPatientAppointmentPublisher>());

        // Act
        var secondTicket = await handler.Handle(new CheckInPatientCommand(patientId, patientName), CancellationToken.None);

        // Assert
        secondTicket.Should().NotBeNull();
        secondTicket.QueueNumber.Should().Be("Q-002");
        secondTicket.SequenceNumber.Should().Be(2);
        secondTicket.Status.Should().Be(QueueStatus.Waiting);

        var count = await queueRepo.Query(q => q.PatientId == patientId && q.QueueDate == today).CountAsync();
        count.Should().Be(2);
    }

    [Fact]
    public async Task CheckIn_MultiVisitSequence_TripleVisitAllowed_ThenBlockedWhenActive()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var patientId = Guid.NewGuid();
        var patientName = "Gabriela Silang";

        // Visit 1: Completed earlier
        var visit1 = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-001",
            SequenceNumber = 1,
            QueueDate = today,
            PatientId = patientId,
            PatientName = patientName,
            Status = QueueStatus.Completed,
            CompletedTime = DateTime.UtcNow.AddHours(-4)
        };
        // Visit 2: Cancelled earlier
        var visit2 = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-002",
            SequenceNumber = 2,
            QueueDate = today,
            PatientId = patientId,
            PatientName = patientName,
            Status = QueueStatus.Cancelled,
            CompletedTime = DateTime.UtcNow.AddHours(-2)
        };
        await queueRepo.AddAsync(visit1, CancellationToken.None);
        await queueRepo.AddAsync(visit2, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new CheckInPatientCommandHandler(queueRepo, apptRepo, uow, _clinicContext,
            Substitute.For<IClinicIdentityProvider>(), Substitute.For<IPatientAppointmentPublisher>());

        // Act 1: Check in for Visit 3 (should succeed and allocate Q-003)
        var visit3 = await handler.Handle(new CheckInPatientCommand(patientId, patientName), CancellationToken.None);
        visit3.QueueNumber.Should().Be("Q-003");
        visit3.SequenceNumber.Should().Be(3);
        visit3.Status.Should().Be(QueueStatus.Waiting);

        // Act 2: Attempt 4th check-in while Visit 3 is still active (Waiting) -> BLOCKED
        var ex = await Assert.ThrowsAsync<ActiveQueueTicketConflictException>(() =>
            handler.Handle(new CheckInPatientCommand(patientId, patientName), CancellationToken.None));

        ex.QueueNumber.Should().Be("Q-003");
        ex.Status.Should().Be(QueueStatus.Waiting.ToString());
    }

    // =========================================================================
    // 3. ABSENCE CONTROLS & TRANSITIONS
    // =========================================================================

    [Fact]
    public async Task AbsenceControls_TenancyIsolation_ThrowsNotFound_WhenAccessingOtherClinicTicket()
    {
        // Arrange
        var otherClinicId = Guid.NewGuid();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var foreignItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = otherClinicId, // Belonging to foreign clinic
            QueueNumber = "Q-001",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            PatientId = Guid.NewGuid(),
            PatientName = "Foreign Patient",
            Status = QueueStatus.Waiting
        };
        await queueRepo.AddAsync(foreignItem, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var noShowHandler = new MarkQueueItemNoShowCommandHandler(queueRepo, uow, _clinicContext);
        var holdHandler = new PutQueueItemOnHoldCommandHandler(queueRepo, uow, _clinicContext);
        var reactivateHandler = new ReactivateQueueItemCommandHandler(queueRepo, uow, _clinicContext);
        var cancelHandler = new CancelQueueTicketCommandHandler(queueRepo, uow, _clinicContext);

        // Act & Assert
        await Assert.ThrowsAsync<NotFoundException>(() =>
            noShowHandler.Handle(new MarkQueueItemNoShowCommand(foreignItem.Id), CancellationToken.None));
        await Assert.ThrowsAsync<NotFoundException>(() =>
            holdHandler.Handle(new PutQueueItemOnHoldCommand(foreignItem.Id), CancellationToken.None));
        await Assert.ThrowsAsync<NotFoundException>(() =>
            reactivateHandler.Handle(new ReactivateQueueItemCommand(foreignItem.Id), CancellationToken.None));
        await Assert.ThrowsAsync<NotFoundException>(() =>
            cancelHandler.Handle(new CancelQueueTicketCommand(foreignItem.Id), CancellationToken.None));
    }

    [Fact]
    public async Task Reactivate_TopOfLineOrdering_MultipleReactivations_CascadesNegativeSequencesCorrectly()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        // Pre-existing waiting items: Sequence 1, 2, 3
        var w1 = new QueueItem { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-001", SequenceNumber = 1, QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "W1", Status = QueueStatus.Waiting };
        var w2 = new QueueItem { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-002", SequenceNumber = 2, QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "W2", Status = QueueStatus.Waiting };
        var w3 = new QueueItem { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-003", SequenceNumber = 3, QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "W3", Status = QueueStatus.Waiting };

        // Two items on hold
        var holdA = new QueueItem { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-010", SequenceNumber = 10, QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "HoldA", Status = QueueStatus.OnHold };
        var holdB = new QueueItem { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-011", SequenceNumber = 11, QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "HoldB", Status = QueueStatus.OnHold };

        await queueRepo.AddAsync(w1, CancellationToken.None);
        await queueRepo.AddAsync(w2, CancellationToken.None);
        await queueRepo.AddAsync(w3, CancellationToken.None);
        await queueRepo.AddAsync(holdA, CancellationToken.None);
        await queueRepo.AddAsync(holdB, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var reactivateHandler = new ReactivateQueueItemCommandHandler(queueRepo, uow, _clinicContext);

        // Act 1: Reactivate HoldA (minWaitingSeq is 1 -> HoldA becomes 1 - 1 = 0)
        var resultA = await reactivateHandler.Handle(new ReactivateQueueItemCommand(holdA.Id), CancellationToken.None);
        resultA.SequenceNumber.Should().Be(0);

        // Act 2: Reactivate HoldB (minWaitingSeq is now 0 -> HoldB becomes 0 - 1 = -1)
        var resultB = await reactivateHandler.Handle(new ReactivateQueueItemCommand(holdB.Id), CancellationToken.None);
        resultB.SequenceNumber.Should().Be(-1);

        // Act 3: Query queue through GetQueueQuery
        var queryHandler = new GetQueueQueryHandler(queueRepo, _clinicContext);
        var orderedList = await queryHandler.Handle(new GetQueueQuery(today, View: "Triage"), CancellationToken.None);

        // Assert: FIFO sequence at the top of the line: HoldB (-1), then HoldA (0), then W1 (1), W2 (2), W3 (3)
        orderedList.Select(q => q.QueueNumber).Should().ContainInOrder("Q-011", "Q-010", "Q-001", "Q-002", "Q-003");
    }

    [Fact]
    public async Task Reactivate_WhenNoWaitingTicketsExist_AssignsSequence1()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        // Only an OnHold item exists; no Waiting tickets exist
        var holdOnly = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-005",
            SequenceNumber = 5,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Sole OnHold Patient",
            Status = QueueStatus.OnHold
        };
        await queueRepo.AddAsync(holdOnly, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ReactivateQueueItemCommandHandler(queueRepo, uow, _clinicContext);

        // Act
        var result = await handler.Handle(new ReactivateQueueItemCommand(holdOnly.Id), CancellationToken.None);

        // Assert
        result.Status.Should().Be(QueueStatus.Waiting);
        result.SequenceNumber.Should().Be(1, "When minWaitingSeq is null, fallback sequence must be 1");
        result.QueueNumber.Should().Be("Q-005");
    }

    [Theory]
    [InlineData(QueueStatus.Waiting)]
    [InlineData(QueueStatus.Triaged)]
    [InlineData(QueueStatus.InConsultation)]
    [InlineData(QueueStatus.PendingProcedure)]
    [InlineData(QueueStatus.ReEvaluation)]
    [InlineData(QueueStatus.Completed)]
    [InlineData(QueueStatus.Cancelled)]
    public async Task Reactivate_FromDisallowedStatus_ThrowsBadRequestException(QueueStatus disallowedStatus)
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var item = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-099",
            SequenceNumber = 99,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            PatientId = Guid.NewGuid(),
            PatientName = "Disallowed Reactivation",
            Status = disallowedStatus
        };
        await queueRepo.AddAsync(item, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ReactivateQueueItemCommandHandler(queueRepo, uow, _clinicContext);

        // Act & Assert
        var ex = await Assert.ThrowsAsync<BadRequestException>(() =>
            handler.Handle(new ReactivateQueueItemCommand(item.Id), CancellationToken.None));

        ex.Message.Should().Contain("cannot be reactivated from status");
    }

    // =========================================================================
    // 4. QUEUE METRICS INTEGRITY (EXCLUSION OF CANCELLED & NOSHOW)
    // =========================================================================

    [Fact]
    public async Task GetQueueMetrics_AdversarialMetricsIntegrity_ExcludesCancelledAndNoShow_AndHandlesNegativeAnomalies()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var t0 = DateTime.UtcNow.Date.AddHours(8); // 08:00 AM

        var items = new List<QueueItem>
        {
            // Valid InConsultation: wait = 10 mins
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-001", SequenceNumber = 1, QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "P1", Status = QueueStatus.InConsultation, CheckInTime = t0, CalledTime = t0.AddMinutes(10) },
            // Valid Completed: wait = 30 mins
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-002", SequenceNumber = 2, QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "P2", Status = QueueStatus.Completed, CheckInTime = t0, CalledTime = t0.AddMinutes(30), CompletedTime = t0.AddMinutes(50) },
            // Cancelled: wait = 500 mins (adversarial outlier, MUST BE EXCLUDED)
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-003", SequenceNumber = 3, QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "P3", Status = QueueStatus.Cancelled, CheckInTime = t0, CalledTime = t0.AddMinutes(500), CompletedTime = t0.AddMinutes(505) },
            // NoShow: wait = 900 mins (adversarial outlier, MUST BE EXCLUDED)
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-004", SequenceNumber = 4, QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "P4", Status = QueueStatus.NoShow, CheckInTime = t0, CalledTime = t0.AddMinutes(900), CompletedTime = t0.AddMinutes(905) },
            // Clock Skew Anomaly: CalledTime earlier than CheckInTime (e.g. -15 mins) -> MUST BE EXCLUDED
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-005", SequenceNumber = 5, QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "P5", Status = QueueStatus.InConsultation, CheckInTime = t0.AddMinutes(30), CalledTime = t0.AddMinutes(15) },
            // Waiting Routine: no CalledTime
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-006", SequenceNumber = 6, QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "P6", Status = QueueStatus.Waiting, Priority = QueuePriority.Routine, CheckInTime = t0 },
            // Waiting Urgent: no CalledTime
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-007", SequenceNumber = 7, QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "P7", Status = QueueStatus.Waiting, Priority = QueuePriority.Urgent, CheckInTime = t0 },
            // OnHold item
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-008", SequenceNumber = 8, QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "P8", Status = QueueStatus.OnHold, Priority = QueuePriority.Routine, CheckInTime = t0 }
        };

        foreach (var it in items)
        {
            await queueRepo.AddAsync(it, CancellationToken.None);
        }
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetQueueMetricsQueryHandler(queueRepo, _clinicContext);

        // Act
        var metrics = await handler.Handle(new GetQueueMetricsQuery(today), CancellationToken.None);

        // Assert
        // InQueue: InConsultation (2) + Waiting (2) + OnHold (1) = 5
        metrics.InQueue.Should().Be(5);
        // UrgentTriage: only Waiting with Urgent/Emergency = 1 (Q-007)
        metrics.UrgentTriage.Should().Be(1);
        metrics.CompletedToday.Should().Be(1);
        metrics.TotalCheckedIn.Should().Be(8);

        // Average wait time: Only Q-001 (10) and Q-002 (30) count. Average is (10 + 30) / 2 = 20.0 minutes.
        // If Cancelled (500), NoShow (900), or negative anomaly was included, average would differ wildly.
        metrics.AverageWaitTimeMinutes.Should().Be(20.0);
    }

    [Fact]
    public async Task GetQueueMetrics_WhenNoEligibleCalledTicketsExist_ReturnsZeroWithoutDivisionByZero()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        // Only Cancelled and NoShow tickets exist
        var cancelled = new QueueItem { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-001", SequenceNumber = 1, QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "C1", Status = QueueStatus.Cancelled, CheckInTime = DateTime.UtcNow };
        var noShow = new QueueItem { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-002", SequenceNumber = 2, QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "N1", Status = QueueStatus.NoShow, CheckInTime = DateTime.UtcNow };

        await queueRepo.AddAsync(cancelled, CancellationToken.None);
        await queueRepo.AddAsync(noShow, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetQueueMetricsQueryHandler(queueRepo, _clinicContext);

        // Act
        var metrics = await handler.Handle(new GetQueueMetricsQuery(today), CancellationToken.None);

        // Assert
        metrics.AverageWaitTimeMinutes.Should().Be(0.0);
        metrics.InQueue.Should().Be(0);
        metrics.CompletedToday.Should().Be(0);
        metrics.TotalCheckedIn.Should().Be(2);
    }
}
