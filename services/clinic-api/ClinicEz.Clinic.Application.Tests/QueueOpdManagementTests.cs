using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Middlewares;
using ClinicEz.Clinic.Application.Common.DTOs;
using ClinicEz.Clinic.Application.Common.Exceptions;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Consultations.Commands;
using ClinicEz.Clinic.Application.Features.Queue.Commands;
using ClinicEz.Clinic.Application.Features.Queue.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class QueueOpdManagementTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_opd_test";

    public QueueOpdManagementTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
    }

    [Theory]
    [InlineData(QueueStatus.Waiting)]
    [InlineData(QueueStatus.Triaged)]
    [InlineData(QueueStatus.InConsultation)]
    [InlineData(QueueStatus.PendingProcedure)]
    [InlineData(QueueStatus.ReEvaluation)]
    [InlineData(QueueStatus.OnHold)]
    public async Task CheckIn_WithActiveTicketToday_ThrowsActiveQueueTicketConflictException_WithExactDetails(QueueStatus activeStatus)
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var identity = Substitute.For<IClinicIdentityProvider>();
        var publisher = Substitute.For<IPatientAppointmentPublisher>();

        var patientId = Guid.NewGuid();
        var patientName = "Juan Dela Cruz";
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
            CheckInTime = DateTime.UtcNow.AddMinutes(-30)
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
    }

    [Theory]
    [InlineData(QueueStatus.Completed)]
    [InlineData(QueueStatus.Cancelled)]
    [InlineData(QueueStatus.NoShow)]
    public async Task CheckIn_WhenPriorTicketTodayIsTerminal_SucceedsAndCreatesSecondTicket(QueueStatus terminalStatus)
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var identity = Substitute.For<IClinicIdentityProvider>();
        var publisher = Substitute.For<IPatientAppointmentPublisher>();

        var patientId = Guid.NewGuid();
        var patientName = "Maria Santos";
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var priorTicket = new QueueItem
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
            CheckInTime = DateTime.UtcNow.AddHours(-3),
            CompletedTime = DateTime.UtcNow.AddHours(-2)
        };
        await queueRepo.AddAsync(priorTicket, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new CheckInPatientCommandHandler(queueRepo, apptRepo, uow, _clinicContext, identity, publisher);
        var command = new CheckInPatientCommand(patientId, patientName, ChiefComplaint: "Follow-up visit");

        // Act
        var secondTicket = await handler.Handle(command, CancellationToken.None);

        // Assert
        secondTicket.Should().NotBeNull();
        secondTicket.QueueNumber.Should().Be("Q-002");
        secondTicket.SequenceNumber.Should().Be(2);
        secondTicket.Status.Should().Be(QueueStatus.Waiting);
        secondTicket.PatientId.Should().Be(patientId);

        var allTickets = await queueRepo.Query(q => q.PatientId == patientId && q.QueueDate == today).ToListAsync();
        allTickets.Should().HaveCount(2);
    }

    [Fact]
    public async Task MarkQueueItemNoShow_SetsStatusNoShow_AndRecordsCompletedTime()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var item = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-003",
            SequenceNumber = 3,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            PatientId = Guid.NewGuid(),
            PatientName = "Pedro Penduko",
            Status = QueueStatus.Waiting,
            CheckInTime = DateTime.UtcNow.AddMinutes(-40)
        };
        await queueRepo.AddAsync(item, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new MarkQueueItemNoShowCommandHandler(queueRepo, uow, _clinicContext);

        // Act
        var result = await handler.Handle(new MarkQueueItemNoShowCommand(item.Id), CancellationToken.None);

        // Assert
        result.Status.Should().Be(QueueStatus.NoShow);
        result.CompletedTime.Should().NotBeNull();

        var updated = await queueRepo.Query(q => q.Id == item.Id).FirstAsync();
        updated.Status.Should().Be(QueueStatus.NoShow);
        updated.CompletedTime.Should().NotBeNull();
    }

    [Fact]
    public async Task PutQueueItemOnHold_SetsStatusOnHold_PreservesCompletedTimeAsNull()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var item = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-004",
            SequenceNumber = 4,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            PatientId = Guid.NewGuid(),
            PatientName = "Liza Soberano",
            Status = QueueStatus.Waiting,
            CheckInTime = DateTime.UtcNow.AddMinutes(-20)
        };
        await queueRepo.AddAsync(item, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new PutQueueItemOnHoldCommandHandler(queueRepo, uow, _clinicContext);

        // Act
        var result = await handler.Handle(new PutQueueItemOnHoldCommand(item.Id), CancellationToken.None);

        // Assert
        result.Status.Should().Be(QueueStatus.OnHold);
        result.CompletedTime.Should().BeNull();

        var updated = await queueRepo.Query(q => q.Id == item.Id).FirstAsync();
        updated.Status.Should().Be(QueueStatus.OnHold);
        updated.CompletedTime.Should().BeNull();
    }

    [Fact]
    public async Task ReactivateQueueItem_FromOnHold_RestoresToWaiting_AtTopOfLine()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        // Waiting items with sequence 1 and 2
        var waiting1 = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-001",
            SequenceNumber = 1,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient One",
            Status = QueueStatus.Waiting
        };
        var waiting2 = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-002",
            SequenceNumber = 2,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient Two",
            Status = QueueStatus.Waiting
        };

        // OnHold item that was originally sequence 5
        var holdItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-005",
            SequenceNumber = 5,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient Five (On Hold)",
            Status = QueueStatus.OnHold
        };

        await queueRepo.AddAsync(waiting1, CancellationToken.None);
        await queueRepo.AddAsync(waiting2, CancellationToken.None);
        await queueRepo.AddAsync(holdItem, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ReactivateQueueItemCommandHandler(queueRepo, uow, _clinicContext);

        // Act
        var result = await handler.Handle(new ReactivateQueueItemCommand(holdItem.Id), CancellationToken.None);

        // Assert
        result.Status.Should().Be(QueueStatus.Waiting);
        result.QueueNumber.Should().Be("Q-005", "Original ticket number must be preserved");
        result.SequenceNumber.Should().BeLessThan(1, "Reactivated ticket sequence must be less than minWaitingSeq (1 - 1 = 0)");
        result.CompletedTime.Should().BeNull();

        // Verify ordering in GetQueueQuery: reactivated ticket must appear first
        var queryHandler = new GetQueueQueryHandler(queueRepo, _clinicContext);
        var queueList = await queryHandler.Handle(new GetQueueQuery(today), CancellationToken.None);
        queueList.First().QueueNumber.Should().Be("Q-005", "Reactivated ticket should be at the top of the waiting list");
    }

    [Fact]
    public async Task ReactivateQueueItem_FromNoShow_RestoresToWaiting_AndClearsCompletedTime()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var noShowItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-007",
            SequenceNumber = 7,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Late Patient",
            Status = QueueStatus.NoShow,
            CompletedTime = DateTime.UtcNow.AddMinutes(-10)
        };
        await queueRepo.AddAsync(noShowItem, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ReactivateQueueItemCommandHandler(queueRepo, uow, _clinicContext);

        // Act
        var result = await handler.Handle(new ReactivateQueueItemCommand(noShowItem.Id), CancellationToken.None);

        // Assert
        result.Status.Should().Be(QueueStatus.Waiting);
        result.CompletedTime.Should().BeNull();
        result.QueueNumber.Should().Be("Q-007");

        var updated = await queueRepo.Query(q => q.Id == noShowItem.Id).FirstAsync();
        updated.Status.Should().Be(QueueStatus.Waiting);
        updated.CompletedTime.Should().BeNull();
    }

    [Theory]
    [InlineData(QueueStatus.Waiting)]
    [InlineData(QueueStatus.Triaged)]
    [InlineData(QueueStatus.InConsultation)]
    [InlineData(QueueStatus.Completed)]
    public async Task ReactivateQueueItem_WhenStatusIsNotOnHoldOrNoShow_ThrowsBadRequestException(QueueStatus invalidStatus)
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var item = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-008",
            SequenceNumber = 8,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            PatientId = Guid.NewGuid(),
            PatientName = "Invalid Reactivation Patient",
            Status = invalidStatus
        };
        await queueRepo.AddAsync(item, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ReactivateQueueItemCommandHandler(queueRepo, uow, _clinicContext);

        // Act & Assert
        await Assert.ThrowsAsync<BadRequestException>(() =>
            handler.Handle(new ReactivateQueueItemCommand(item.Id), CancellationToken.None));
    }

    [Fact]
    public async Task CancelQueueTicket_SetsStatusCancelled_AndRecordsCompletedTime()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var item = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-009",
            SequenceNumber = 9,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            PatientId = Guid.NewGuid(),
            PatientName = "Walkout Patient",
            Status = QueueStatus.Waiting
        };
        await queueRepo.AddAsync(item, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new CancelQueueTicketCommandHandler(queueRepo, uow, _clinicContext);

        // Act
        var result = await handler.Handle(new CancelQueueTicketCommand(item.Id, "Patient left without being seen (LWBS)"), CancellationToken.None);

        // Assert
        result.Status.Should().Be(QueueStatus.Cancelled);
        result.CompletedTime.Should().NotBeNull();

        var updated = await queueRepo.Query(q => q.Id == item.Id).FirstAsync();
        updated.Status.Should().Be(QueueStatus.Cancelled);
        updated.CompletedTime.Should().NotBeNull();
    }

    [Fact]
    public async Task GetQueueMetrics_ExcludesCancelledAndNoShowTickets_FromAverageWaitTime()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var baseTime = DateTime.UtcNow.Date.AddHours(9); // 09:00

        // 1. Waiting ticket (no call time yet)
        var itemWaiting = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-001",
            SequenceNumber = 1,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Waiting 1",
            Status = QueueStatus.Waiting,
            CheckInTime = baseTime
        };

        // 2. InConsultation ticket (wait time = 20 minutes)
        var itemInConsult = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-002",
            SequenceNumber = 2,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "In Consult",
            Status = QueueStatus.InConsultation,
            CheckInTime = baseTime,
            CalledTime = baseTime.AddMinutes(20)
        };

        // 3. Completed ticket (wait time = 40 minutes)
        var itemCompleted = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-003",
            SequenceNumber = 3,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Completed 1",
            Status = QueueStatus.Completed,
            CheckInTime = baseTime,
            CalledTime = baseTime.AddMinutes(40),
            CompletedTime = baseTime.AddMinutes(60)
        };

        // 4. Cancelled ticket (called after 100 minutes, but CANCELLED -> MUST BE EXCLUDED from average)
        var itemCancelled = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-004",
            SequenceNumber = 4,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Cancelled 1",
            Status = QueueStatus.Cancelled,
            CheckInTime = baseTime,
            CalledTime = baseTime.AddMinutes(100),
            CompletedTime = baseTime.AddMinutes(105)
        };

        // 5. NoShow ticket (called after 200 minutes, but NOSHOW -> MUST BE EXCLUDED from average)
        var itemNoShow = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-005",
            SequenceNumber = 5,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "NoShow 1",
            Status = QueueStatus.NoShow,
            CheckInTime = baseTime,
            CalledTime = baseTime.AddMinutes(200),
            CompletedTime = baseTime.AddMinutes(205)
        };

        // 6. OnHold ticket (included in InQueue count)
        var itemOnHold = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-006",
            SequenceNumber = 6,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "OnHold 1",
            Status = QueueStatus.OnHold,
            CheckInTime = baseTime
        };

        await queueRepo.AddAsync(itemWaiting, CancellationToken.None);
        await queueRepo.AddAsync(itemInConsult, CancellationToken.None);
        await queueRepo.AddAsync(itemCompleted, CancellationToken.None);
        await queueRepo.AddAsync(itemCancelled, CancellationToken.None);
        await queueRepo.AddAsync(itemNoShow, CancellationToken.None);
        await queueRepo.AddAsync(itemOnHold, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetQueueMetricsQueryHandler(queueRepo, _clinicContext);

        // Act
        var metrics = await handler.Handle(new GetQueueMetricsQuery(today), CancellationToken.None);

        // Assert
        // InQueue: Waiting (1) + InConsultation (1) + OnHold (1) = 3
        metrics.InQueue.Should().Be(3);
        metrics.CompletedToday.Should().Be(1);
        metrics.TotalCheckedIn.Should().Be(6);

        // Eligible wait times: 20 min (InConsultation) + 40 min (Completed) = avg 30.0 min.
        // If Cancelled (100) and NoShow (200) were mistakenly included, avg would be (20+40+100+200)/4 = 90.0 min.
        metrics.AverageWaitTimeMinutes.Should().Be(30.0);
    }

    [Fact]
    public async Task SignConsultation_WhenQueueItemIdIsNull_FindsActiveTicketTodayAndMarksCompleted()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultationRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var identity = Substitute.For<IClinicIdentityProvider>();
        identity.GetAsync(Arg.Any<CancellationToken>()).Returns(new ClinicIdentity(_tenantId, _clinicId, "Apex Clinic"));
        var apptPublisher = Substitute.For<IPatientAppointmentPublisher>();
        var rxPublisher = Substitute.For<IPrescriptionPublisher>();
        var claims = Phase3TestKit.Claims();
        var documents = Phase3TestKit.Documents(context);

        var patientId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        // Active queue ticket today for patient with InConsultation status
        var activeTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-010",
            SequenceNumber = 10,
            QueueDate = today,
            PatientId = patientId,
            PatientName = "Cardo Dalisay",
            Status = QueueStatus.InConsultation,
            CheckInTime = DateTime.UtcNow.AddMinutes(-30)
        };
        await queueRepo.AddAsync(activeTicket, CancellationToken.None);

        // Doctor staff record
        var doctor = new StaffMember
        {
            Id = doctorId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            FirstName = "Gregory",
            LastName = "House",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-123456"
        };
        await staffRepo.AddAsync(doctor, CancellationToken.None);

        // Encounter created without explicit QueueItemId linked
        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Cardo Dalisay",
            DoctorId = doctorId,
            DoctorName = "Dr. Gregory House",
            QueueItemId = null, // Notice: null QueueItemId
            Subjective = "Subj",
            Objective = "Obj",
            Assessment = "I10",
            Plan = "Plan",
            IsSigned = false
        };
        await consultationRepo.AddAsync(encounter, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new SignConsultationCommandHandler(
            consultationRepo, staffRepo, queueRepo, apptRepo, patientRepo, uow, _clinicContext,
            identity, apptPublisher, rxPublisher, claims, documents);

        // Act
        var result = await handler.Handle(new SignConsultationCommand(encounter.Id), CancellationToken.None);

        // Assert
        result.IsSigned.Should().BeTrue();

        var updatedTicket = await queueRepo.Query(q => q.Id == activeTicket.Id).FirstAsync();
        updatedTicket.Status.Should().Be(QueueStatus.Completed, "Signing consultation must auto-complete active queue ticket");
        updatedTicket.CompletedTime.Should().NotBeNull();

        var updatedEncounter = await consultationRepo.Query(c => c.Id == encounter.Id).FirstAsync();
        updatedEncounter.QueueItemId.Should().Be(activeTicket.Id, "Encounter should be linked to the resolved active queue ticket");
    }

    [Fact]
    public async Task ClinicExceptionHandler_HandlesActiveQueueTicketConflictException_Returns409WithStructuredJson()
    {
        // Arrange
        var handler = new ClinicExceptionHandler();
        var context = new DefaultHttpContext();
        context.Response.Body = new MemoryStream();

        var ticketId = Guid.NewGuid();
        var queueNumber = "Q-015";
        var status = "Waiting";
        var patientName = "Maria Clara";

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
}
