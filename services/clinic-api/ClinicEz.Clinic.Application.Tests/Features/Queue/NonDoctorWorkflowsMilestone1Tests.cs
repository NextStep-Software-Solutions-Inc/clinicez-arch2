using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Exceptions;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Queue.Commands;
using ClinicEz.Clinic.Application.Features.Queue.DTOs;
using ClinicEz.Clinic.Application.Features.Queue.Queries;
using ClinicEz.Clinic.Application.Features.Triage.Commands;
using ClinicEz.Clinic.Application.Tests;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Queue;

public class NonDoctorWorkflowsMilestone1Tests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_milestone1_test";

    public NonDoctorWorkflowsMilestone1Tests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffId.Returns(Guid.NewGuid());
    }

    [Theory]
    [InlineData(VisitType.Consultation)]
    [InlineData(VisitType.VitalsCheckOnly)]
    [InlineData(VisitType.RetailPurchase)]
    [InlineData(VisitType.StandaloneProcedure)]
    [InlineData(VisitType.LaboratorySpecimen)]
    [InlineData(VisitType.AdministrativeDocument)]
    [InlineData(VisitType.CashierSettlement)]
    public async Task CheckIn_AllVisitTypes_SuccessfullySetsVisitType(VisitType visitType)
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var identity = Substitute.For<IClinicIdentityProvider>();
        var publisher = Substitute.For<IPatientAppointmentPublisher>();

        var handler = new CheckInPatientCommandHandler(queueRepo, apptRepo, uow, _clinicContext, identity, publisher);
        var patientId = Guid.NewGuid();
        var command = new CheckInPatientCommand(
            PatientId: patientId,
            PatientName: $"Patient {visitType}",
            VisitType: visitType);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.VisitType.Should().Be(visitType);

        var savedItem = await context.Set<QueueItem>().FirstOrDefaultAsync(q => q.Id == result.Id);
        savedItem.Should().NotBeNull();
        savedItem!.VisitType.Should().Be(visitType);
        savedItem.Status.Should().Be(QueueStatus.Waiting);
    }

    [Fact]
    public async Task CheckIn_DuplicateConsultationActiveTicket_ThrowsActiveQueueTicketConflictException()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var identity = Substitute.For<IClinicIdentityProvider>();
        var publisher = Substitute.For<IPatientAppointmentPublisher>();

        var patientId = Guid.NewGuid();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var activeItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-001",
            SequenceNumber = 1,
            QueueDate = today,
            PatientId = patientId,
            PatientName = "Maria Clara",
            Status = QueueStatus.Waiting,
            VisitType = VisitType.Consultation
        };
        await context.Set<QueueItem>().AddAsync(activeItem);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new CheckInPatientCommandHandler(queueRepo, apptRepo, uow, _clinicContext, identity, publisher);
        var command = new CheckInPatientCommand(
            PatientId: patientId,
            PatientName: "Maria Clara",
            VisitType: VisitType.Consultation);

        // Act & Assert
        var ex = await Assert.ThrowsAsync<ActiveQueueTicketConflictException>(() =>
            handler.Handle(command, CancellationToken.None));

        ex.TicketId.Should().Be(activeItem.Id);
        ex.QueueNumber.Should().Be("Q-001");
    }

    [Fact]
    public async Task CheckIn_NonConsultationVisit_WhenActiveConsultationTicketExists_SucceedsWithoutConflict()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var identity = Substitute.For<IClinicIdentityProvider>();
        var publisher = Substitute.For<IPatientAppointmentPublisher>();

        var patientId = Guid.NewGuid();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var activeConsultTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-001",
            SequenceNumber = 1,
            QueueDate = today,
            PatientId = patientId,
            PatientName = "Crisostomo Ibarra",
            Status = QueueStatus.Waiting,
            VisitType = VisitType.Consultation
        };
        await context.Set<QueueItem>().AddAsync(activeConsultTicket);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new CheckInPatientCommandHandler(queueRepo, apptRepo, uow, _clinicContext, identity, publisher);
        var retailCommand = new CheckInPatientCommand(
            PatientId: patientId,
            PatientName: "Crisostomo Ibarra",
            VisitType: VisitType.RetailPurchase);

        // Act
        var result = await handler.Handle(retailCommand, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.VisitType.Should().Be(VisitType.RetailPurchase);
        result.QueueNumber.Should().Be("Q-002");
    }

    [Fact]
    public async Task CheckIn_AfterNonDoctorDischarged_AllowsSameDayRepeatCheckIn()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var identity = Substitute.For<IClinicIdentityProvider>();
        var publisher = Substitute.For<IPatientAppointmentPublisher>();

        var patientId = Guid.NewGuid();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        // Previous visit earlier today that was completed by non-doctor staff
        var morningDischargedTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-001",
            SequenceNumber = 1,
            QueueDate = today,
            PatientId = patientId,
            PatientName = "Basilio Sison",
            Status = QueueStatus.DischargedNonDoctor,
            VisitType = VisitType.VitalsCheckOnly,
            DischargedAt = DateTime.UtcNow.AddHours(-2),
            DischargeNotes = "Vitals check normal; patient cleared."
        };
        await context.Set<QueueItem>().AddAsync(morningDischargedTicket);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new CheckInPatientCommandHandler(queueRepo, apptRepo, uow, _clinicContext, identity, publisher);
        var afternoonConsultCommand = new CheckInPatientCommand(
            PatientId: patientId,
            PatientName: "Basilio Sison",
            VisitType: VisitType.Consultation);

        // Act
        var result = await handler.Handle(afternoonConsultCommand, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.QueueNumber.Should().Be("Q-002");
        result.VisitType.Should().Be(VisitType.Consultation);
        result.Status.Should().Be(QueueStatus.Waiting);
    }

    [Fact]
    public async Task RecordTriageVitals_WithPriority_PersistsPriorityAndStatusToPostgreSql()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var queueItemId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        var queueItem = new QueueItem
        {
            Id = queueItemId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Elias Salgado",
            QueueNumber = "Q-005",
            Priority = QueuePriority.Routine,
            Status = QueueStatus.Waiting
        };
        await context.Set<QueueItem>().AddAsync(queueItem);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new RecordTriageVitalsCommandHandler(queueRepo, vitalsRepo, patientRepo, uow, _clinicContext);
        var command = new RecordTriageVitalsCommand(
            QueueItemId: queueItemId,
            NurseId: Guid.NewGuid(),
            RecordedByNurseName: "Nurse Joy",
            SystolicBp: 150,
            DiastolicBp: 95,
            HeartRateBpm: 110,
            TemperatureCelsius: 38.5m,
            RespiratoryRateBreathsPerMin: 22,
            OxygenSaturationPercent: 94m,
            HeightCm: 175m,
            WeightKg: 75m,
            PainScore: 7,
            Notes: "Severe headache and fever",
            TriageAcuityReason: "Hypertensive urgency with high fever",
            Priority: QueuePriority.Urgent);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();

        var reloadedItem = await context.Set<QueueItem>().FirstAsync(q => q.Id == queueItemId);
        reloadedItem.Priority.Should().Be(QueuePriority.Urgent);
        reloadedItem.Status.Should().Be(QueueStatus.Triaged);
    }

    [Fact]
    public async Task EscalateQueueItemPriority_UpdatesPriorityAndTriageAcuityReason()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var queueItemId = Guid.NewGuid();
        var queueItem = new QueueItem
        {
            Id = queueItemId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Simoun Ibarra",
            QueueNumber = "Q-010",
            Priority = QueuePriority.Routine,
            Status = QueueStatus.Triaged,
            TriageVitals = new TriageVitals
            {
                Id = Guid.NewGuid(),
                TenantId = _tenantId,
                ClinicId = _clinicId,
                QueueItemId = queueItemId,
                PatientId = Guid.NewGuid(),
                TriageAcuityReason = "Routine check"
            }
        };
        await context.Set<QueueItem>().AddAsync(queueItem);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new EscalateQueueItemPriorityCommandHandler(queueRepo, uow, _clinicContext);
        var command = new EscalateQueueItemPriorityCommand(
            queueItemId,
            QueuePriority.Emergency,
            "Patient suddenly dyspneic with central cyanosis, SpO2 84%");

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.Priority.Should().Be(QueuePriority.Emergency);

        var reloadedItem = await context.Set<QueueItem>()
            .Include(q => q.TriageVitals)
            .FirstAsync(q => q.Id == queueItemId);

        reloadedItem.Priority.Should().Be(QueuePriority.Emergency);
        reloadedItem.TriageVitals.Should().NotBeNull();
        reloadedItem.TriageVitals!.TriageAcuityReason.Should().Be("Patient suddenly dyspneic with central cyanosis, SpO2 84%");
    }

    [Fact]
    public async Task EscalateQueueItemPriority_NonExistentItem_ThrowsNotFoundException()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var handler = new EscalateQueueItemPriorityCommandHandler(queueRepo, uow, _clinicContext);

        var missingId = Guid.NewGuid();
        var command = new EscalateQueueItemPriorityCommand(missingId, QueuePriority.Emergency, "STAT");

        // Act & Assert
        await Assert.ThrowsAsync<NotFoundException>(() => handler.Handle(command, CancellationToken.None));
    }

    [Fact]
    public async Task GetPublicQueueDisplay_FiltersNonConsultationVisitsFromUpNext()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        var clinicSettings = new ClinicSettings
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Polymorphic Community Health Center",
            TenantSlug = "polymorphic-health",
            FacilitySlug = "main",
            TvDisplayMaskPatientNames = false
        };
        await settingsRepo.AddAsync(clinicSettings, CancellationToken.None);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        // Ticket 1: Active Doctor Consultation (Now Serving)
        var ticketServing = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-001",
            SequenceNumber = 1,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Serving Patient",
            DoctorName = "Dr. Santos",
            RoomOrStation = "Exam Room 1",
            Status = QueueStatus.InConsultation,
            CalledTime = DateTime.UtcNow.AddMinutes(-5),
            VisitType = VisitType.Consultation
        };

        // Ticket 2: Consultation in Waiting (Should appear in Up Next)
        var ticketConsultWaiting = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-002",
            SequenceNumber = 2,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Consultation Waiting",
            Status = QueueStatus.Waiting,
            Priority = QueuePriority.Routine,
            VisitType = VisitType.Consultation
        };

        // Ticket 3: VitalsCheckOnly in Waiting (Should be EXCLUDED from Up Next)
        var ticketVitalsOnly = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-003",
            SequenceNumber = 3,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Vitals Check Walk-In",
            Status = QueueStatus.Waiting,
            Priority = QueuePriority.Routine,
            VisitType = VisitType.VitalsCheckOnly
        };

        // Ticket 4: RetailPurchase in Triaged (Should be EXCLUDED from Up Next)
        var ticketRetail = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-004",
            SequenceNumber = 4,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Retail Guest",
            Status = QueueStatus.Triaged,
            Priority = QueuePriority.Routine,
            VisitType = VisitType.RetailPurchase
        };

        // Ticket 5: PendingProcedure (Should appear in Up Next)
        var ticketProcedure = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-005",
            SequenceNumber = 5,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Procedure Patient",
            Status = QueueStatus.PendingProcedure,
            Priority = QueuePriority.Urgent,
            VisitType = VisitType.Consultation
        };

        await queueRepo.AddAsync(ticketServing, CancellationToken.None);
        await queueRepo.AddAsync(ticketConsultWaiting, CancellationToken.None);
        await queueRepo.AddAsync(ticketVitalsOnly, CancellationToken.None);
        await queueRepo.AddAsync(ticketRetail, CancellationToken.None);
        await queueRepo.AddAsync(ticketProcedure, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetPublicQueueDisplayQueryHandler(queueRepo, settingsRepo, _clinicContext);

        // Act
        var result = await handler.Handle(new GetPublicQueueDisplayQuery(ClinicId: _clinicId, Date: today), CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result!.NowServing.Should().ContainSingle(s => s.TicketNumber == "Q-001");

        // UpNext should contain Q-005 (PendingProcedure, Urgent) and Q-002 (Consultation, Routine)
        // It must NOT contain Q-003 (VitalsCheckOnly) or Q-004 (RetailPurchase)
        result.UpNext.Select(u => u.TicketNumber).Should().BeEquivalentTo(new[] { "Q-005", "Q-002" });
        result.UpNext.Should().NotContain(u => u.TicketNumber == "Q-003");
        result.UpNext.Should().NotContain(u => u.TicketNumber == "Q-004");
    }

    [Fact]
    public async Task ReconcileEod_ShieldsDischargedNonDoctorAndDiverted_FromNoShow()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<EodReconciliationAudit>(context, sieve);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var dischargedAt = DateTime.UtcNow.AddHours(-3);
        var dischargedTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-001",
            SequenceNumber = 1,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient Discharged Non-Doc",
            Status = QueueStatus.DischargedNonDoctor,
            VisitType = VisitType.VitalsCheckOnly,
            DischargedAt = dischargedAt,
            DischargeNotes = "Vitals taken by nurse, normal BP."
        };

        var divertedTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-002",
            SequenceNumber = 2,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient Diverted to Hospital",
            Status = QueueStatus.Diverted,
            VisitType = VisitType.Consultation,
            DischargedAt = dischargedAt,
            DischargeNotes = "Transferred to General Hospital ER via Ambulance."
        };

        var consultationWaitingTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-003",
            SequenceNumber = 3,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Unattended Consultation Patient",
            Status = QueueStatus.Waiting,
            VisitType = VisitType.Consultation
        };

        await queueRepo.AddAsync(dischargedTicket, CancellationToken.None);
        await queueRepo.AddAsync(divertedTicket, CancellationToken.None);
        await queueRepo.AddAsync(consultationWaitingTicket, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ReconcileEodCommandHandler(queueRepo, auditRepo, uow, _clinicContext);

        // Act
        var result = await handler.Handle(new ReconcileEodCommand(today), CancellationToken.None);

        // Assert
        result.ReconciledCount.Should().Be(1);
        result.AffectedTicketNumbers.Should().ContainSingle().Which.Should().Be("Q-003");

        var reloadedDischarged = await context.Set<QueueItem>().FirstAsync(q => q.Id == dischargedTicket.Id);
        reloadedDischarged.Status.Should().Be(QueueStatus.DischargedNonDoctor);
        reloadedDischarged.DischargedAt.Should().Be(dischargedAt);
        reloadedDischarged.DischargeNotes.Should().Be("Vitals taken by nurse, normal BP.");

        var reloadedDiverted = await context.Set<QueueItem>().FirstAsync(q => q.Id == divertedTicket.Id);
        reloadedDiverted.Status.Should().Be(QueueStatus.Diverted);
        reloadedDiverted.DischargedAt.Should().Be(dischargedAt);

        var reloadedConsult = await context.Set<QueueItem>().FirstAsync(q => q.Id == consultationWaitingTicket.Id);
        reloadedConsult.Status.Should().Be(QueueStatus.NoShow);
    }

    [Fact]
    public async Task ReconcileEod_CancelsStaleNonConsultationVisits_WithAutoClosedDischargeNotes()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<EodReconciliationAudit>(context, sieve);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var staleVitalsTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-V01",
            SequenceNumber = 1,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Stale Vitals Patient",
            Status = QueueStatus.Waiting,
            VisitType = VisitType.VitalsCheckOnly
        };

        var staleRetailTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-R01",
            SequenceNumber = 2,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Stale Retail Patient",
            Status = QueueStatus.Triaged,
            VisitType = VisitType.RetailPurchase
        };

        var staleConsultTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-C01",
            SequenceNumber = 3,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Stale Doctor Consult",
            Status = QueueStatus.Waiting,
            VisitType = VisitType.Consultation
        };

        await queueRepo.AddAsync(staleVitalsTicket, CancellationToken.None);
        await queueRepo.AddAsync(staleRetailTicket, CancellationToken.None);
        await queueRepo.AddAsync(staleConsultTicket, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ReconcileEodCommandHandler(queueRepo, auditRepo, uow, _clinicContext);

        // Act
        var result = await handler.Handle(new ReconcileEodCommand(today), CancellationToken.None);

        // Assert
        result.ReconciledCount.Should().Be(3);

        var reloadedVitals = await context.Set<QueueItem>().FirstAsync(q => q.Id == staleVitalsTicket.Id);
        reloadedVitals.Status.Should().Be(QueueStatus.Cancelled);
        reloadedVitals.DischargeNotes.Should().Be("Auto-closed during EOD reconciliation.");

        var reloadedRetail = await context.Set<QueueItem>().FirstAsync(q => q.Id == staleRetailTicket.Id);
        reloadedRetail.Status.Should().Be(QueueStatus.Cancelled);
        reloadedRetail.DischargeNotes.Should().Be("Auto-closed during EOD reconciliation.");

        var reloadedConsult = await context.Set<QueueItem>().FirstAsync(q => q.Id == staleConsultTicket.Id);
        reloadedConsult.Status.Should().Be(QueueStatus.NoShow);
    }
}
