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

public class NonDoctorWorkflowsMilestone1AdversarialTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_milestone1_adversarial";

    public NonDoctorWorkflowsMilestone1AdversarialTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffId.Returns(Guid.NewGuid());
    }

    #region CheckInPatientCommand Adversarial & Boundary Tests

    [Theory]
    [InlineData(QueueStatus.Waiting)]
    [InlineData(QueueStatus.Triaged)]
    [InlineData(QueueStatus.InConsultation)]
    [InlineData(QueueStatus.PendingProcedure)]
    [InlineData(QueueStatus.ReEvaluation)]
    [InlineData(QueueStatus.OnHold)]
    public async Task CheckIn_DuplicateActiveConsultationTicket_AcrossAllActiveStatuses_RejectsWithConflict(QueueStatus activeStatus)
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var identity = Substitute.For<IClinicIdentityProvider>();
        var publisher = Substitute.For<IPatientAppointmentPublisher>();

        var patientId = Guid.NewGuid();
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
            PatientName = "Adversarial Active Patient",
            Status = activeStatus,
            VisitType = VisitType.Consultation
        };
        await context.Set<QueueItem>().AddAsync(existingTicket);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new CheckInPatientCommandHandler(queueRepo, apptRepo, uow, _clinicContext, identity, publisher);
        var command = new CheckInPatientCommand(
            PatientId: patientId,
            PatientName: "Adversarial Active Patient",
            VisitType: VisitType.Consultation);

        // Act & Assert
        var ex = await Assert.ThrowsAsync<ActiveQueueTicketConflictException>(() =>
            handler.Handle(command, CancellationToken.None));

        ex.TicketId.Should().Be(existingTicket.Id);
        ex.QueueNumber.Should().Be("Q-001");
        ex.Status.Should().Be(activeStatus.ToString());
    }

    [Theory]
    [InlineData(QueueStatus.DischargedNonDoctor)]
    [InlineData(QueueStatus.Diverted)]
    [InlineData(QueueStatus.Completed)]
    [InlineData(QueueStatus.Cancelled)]
    [InlineData(QueueStatus.NoShow)]
    public async Task CheckIn_AfterTerminalStatusTicket_AllowsSameDayConsultationCheckIn(QueueStatus terminalStatus)
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var identity = Substitute.For<IClinicIdentityProvider>();
        var publisher = Substitute.For<IPatientAppointmentPublisher>();

        var patientId = Guid.NewGuid();
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
            PatientName = "Returning Patient",
            Status = terminalStatus,
            VisitType = VisitType.Consultation,
            DischargedAt = DateTime.UtcNow.AddHours(-1)
        };
        await context.Set<QueueItem>().AddAsync(priorTicket);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new CheckInPatientCommandHandler(queueRepo, apptRepo, uow, _clinicContext, identity, publisher);
        var command = new CheckInPatientCommand(
            PatientId: patientId,
            PatientName: "Returning Patient",
            VisitType: VisitType.Consultation);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.QueueNumber.Should().Be("Q-002");
        result.Status.Should().Be(QueueStatus.Waiting);
        result.VisitType.Should().Be(VisitType.Consultation);
    }

    [Fact]
    public async Task CheckIn_MultipleConcurrentNonConsultationVisits_AllowedWithoutConflict()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var identity = Substitute.For<IClinicIdentityProvider>();
        var publisher = Substitute.For<IPatientAppointmentPublisher>();

        var patientId = Guid.NewGuid();
        var handler = new CheckInPatientCommandHandler(queueRepo, apptRepo, uow, _clinicContext, identity, publisher);

        // Act: Patient checks in for Vitals, then Retail, then Laboratory Specimen concurrently
        var vitalsResult = await handler.Handle(new CheckInPatientCommand(patientId, "Multi-intent Patient", VisitType: VisitType.VitalsCheckOnly), CancellationToken.None);
        var retailResult = await handler.Handle(new CheckInPatientCommand(patientId, "Multi-intent Patient", VisitType: VisitType.RetailPurchase), CancellationToken.None);
        var labResult = await handler.Handle(new CheckInPatientCommand(patientId, "Multi-intent Patient", VisitType: VisitType.LaboratorySpecimen), CancellationToken.None);

        // Assert
        vitalsResult.QueueNumber.Should().Be("Q-001");
        retailResult.QueueNumber.Should().Be("Q-002");
        labResult.QueueNumber.Should().Be("Q-003");

        var allItems = await context.Set<QueueItem>().Where(q => q.PatientId == patientId).ToListAsync();
        allItems.Should().HaveCount(3);
        allItems.Select(q => q.VisitType).Should().BeEquivalentTo(new[]
        {
            VisitType.VitalsCheckOnly,
            VisitType.RetailPurchase,
            VisitType.LaboratorySpecimen
        });
    }

    [Theory]
    [InlineData(VisitType.Consultation)]
    [InlineData(VisitType.VitalsCheckOnly)]
    [InlineData(VisitType.RetailPurchase)]
    [InlineData(VisitType.StandaloneProcedure)]
    [InlineData(VisitType.LaboratorySpecimen)]
    [InlineData(VisitType.AdministrativeDocument)]
    [InlineData(VisitType.CashierSettlement)]
    public async Task CheckIn_All7VisitTypeEnumValues_PersistCorrectlyToDatabase(VisitType visitType)
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var identity = Substitute.For<IClinicIdentityProvider>();
        var publisher = Substitute.For<IPatientAppointmentPublisher>();

        var handler = new CheckInPatientCommandHandler(queueRepo, apptRepo, uow, _clinicContext, identity, publisher);
        var command = new CheckInPatientCommand(Guid.NewGuid(), $"Patient {visitType}", VisitType: visitType);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.VisitType.Should().Be(visitType);
        var dbItem = await context.Set<QueueItem>().FirstAsync(q => q.Id == result.Id);
        dbItem.VisitType.Should().Be(visitType);
    }

    #endregion

    #region Priority Persistence & Escalation Tests

    [Fact]
    public async Task RecordTriageVitals_EmergencyPriority_PersistsAndUpgradesRoutineToEmergency()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var queueItemId = Guid.NewGuid();
        var queueItem = new QueueItem
        {
            Id = queueItemId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Severe Asthma Patient",
            QueueNumber = "Q-001",
            Priority = QueuePriority.Routine,
            Status = QueueStatus.Waiting
        };
        await context.Set<QueueItem>().AddAsync(queueItem);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new RecordTriageVitalsCommandHandler(queueRepo, vitalsRepo, patientRepo, uow, _clinicContext);
        var command = new RecordTriageVitalsCommand(
            QueueItemId: queueItemId,
            NurseId: Guid.NewGuid(),
            RecordedByNurseName: "Triage Nurse",
            SystolicBp: 90,
            DiastolicBp: 60,
            HeartRateBpm: 140,
            TemperatureCelsius: 37.0m,
            RespiratoryRateBreathsPerMin: 36,
            OxygenSaturationPercent: 82m,
            HeightCm: 165m,
            WeightKg: 60m,
            PainScore: 8,
            Notes: "Severe respiratory distress with SpO2 82% on room air",
            Priority: QueuePriority.Emergency,
            TriageAcuityReason: "Severe respiratory distress with SpO2 82% on room air");

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        var reloaded = await context.Set<QueueItem>().FirstAsync(q => q.Id == queueItemId);
        reloaded.Priority.Should().Be(QueuePriority.Emergency);
        reloaded.Status.Should().Be(QueueStatus.Triaged);
    }

    [Fact]
    public async Task RecordTriageVitals_NullPriority_PreservesExistingTicketPriority()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var queueItemId = Guid.NewGuid();
        var queueItem = new QueueItem
        {
            Id = queueItemId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Pre-Triaged Urgent Patient",
            QueueNumber = "Q-002",
            Priority = QueuePriority.Urgent,
            Status = QueueStatus.Waiting
        };
        await context.Set<QueueItem>().AddAsync(queueItem);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new RecordTriageVitalsCommandHandler(queueRepo, vitalsRepo, patientRepo, uow, _clinicContext);
        var command = new RecordTriageVitalsCommand(
            QueueItemId: queueItemId,
            NurseId: Guid.NewGuid(),
            RecordedByNurseName: "Triage Nurse",
            SystolicBp: 120,
            DiastolicBp: 80,
            HeartRateBpm: 75,
            TemperatureCelsius: 36.8m,
            RespiratoryRateBreathsPerMin: 18,
            OxygenSaturationPercent: 98m,
            HeightCm: 170m,
            WeightKg: 70m,
            PainScore: 2,
            Notes: "Normal vitals recorded",
            Priority: null); // Null priority supplied

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        var reloaded = await context.Set<QueueItem>().FirstAsync(q => q.Id == queueItemId);
        reloaded.Priority.Should().Be(QueuePriority.Urgent); // Preserved!
        reloaded.Status.Should().Be(QueueStatus.Triaged);
    }

    [Fact]
    public async Task EscalateQueueItemPriority_WithNullTriageVitals_SucceedsWithoutNullReferenceException()
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
            PatientName = "Un-triaged Escalation Patient",
            QueueNumber = "Q-003",
            Priority = QueuePriority.Routine,
            Status = QueueStatus.Waiting,
            TriageVitals = null // No vitals entity yet
        };
        await context.Set<QueueItem>().AddAsync(queueItem);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new EscalateQueueItemPriorityCommandHandler(queueRepo, uow, _clinicContext);
        var command = new EscalateQueueItemPriorityCommand(
            queueItemId,
            QueuePriority.Emergency,
            "Patient suddenly collapsed in waiting room");

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.Priority.Should().Be(QueuePriority.Emergency);

        var reloaded = await context.Set<QueueItem>().FirstAsync(q => q.Id == queueItemId);
        reloaded.Priority.Should().Be(QueuePriority.Emergency);
    }

    [Fact]
    public async Task EscalateQueueItemPriority_InvalidId_ThrowsNotFoundException()
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
    public async Task EscalateQueueItemPriority_CrossClinicIsolation_ThrowsNotFoundException()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var foreignClinicId = Guid.NewGuid();
        var foreignQueueItemId = Guid.NewGuid();
        var foreignQueueItem = new QueueItem
        {
            Id = foreignQueueItemId,
            TenantId = _tenantId,
            ClinicId = foreignClinicId, // Different clinic!
            PatientId = Guid.NewGuid(),
            PatientName = "Foreign Clinic Patient",
            QueueNumber = "Q-999",
            Priority = QueuePriority.Routine,
            Status = QueueStatus.Waiting
        };
        await context.Set<QueueItem>().AddAsync(foreignQueueItem);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new EscalateQueueItemPriorityCommandHandler(queueRepo, uow, _clinicContext);
        var command = new EscalateQueueItemPriorityCommand(foreignQueueItemId, QueuePriority.Emergency, "STAT");

        // Act & Assert: Cross-clinic access must be blocked by tenant/clinic filter
        await Assert.ThrowsAsync<NotFoundException>(() => handler.Handle(command, CancellationToken.None));
    }

    #endregion

    #region Public TV Display Filtering & Priority Sorting Tests

    [Fact]
    public async Task TvDisplay_PriorityOrdering_EmergencyBeforeUrgentBeforeRoutine()
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
            ClinicName = "Priority Sorting Clinic",
            TenantSlug = "sorting-clinic",
            FacilitySlug = "main",
            TvDisplayMaskPatientNames = false
        };
        await settingsRepo.AddAsync(clinicSettings, CancellationToken.None);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        // Routine patient checked in first (Sequence 1)
        var routineTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-001",
            SequenceNumber = 1,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Routine Patient",
            Status = QueueStatus.Waiting,
            Priority = QueuePriority.Routine,
            VisitType = VisitType.Consultation
        };

        // Urgent patient checked in second (Sequence 2)
        var urgentTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-002",
            SequenceNumber = 2,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Urgent Patient",
            Status = QueueStatus.Waiting,
            Priority = QueuePriority.Urgent,
            VisitType = VisitType.Consultation
        };

        // Emergency patient checked in third (Sequence 3)
        var emergencyTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-003",
            SequenceNumber = 3,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Emergency Patient",
            Status = QueueStatus.Waiting,
            Priority = QueuePriority.Emergency,
            VisitType = VisitType.Consultation
        };

        await queueRepo.AddAsync(routineTicket, CancellationToken.None);
        await queueRepo.AddAsync(urgentTicket, CancellationToken.None);
        await queueRepo.AddAsync(emergencyTicket, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetPublicQueueDisplayQueryHandler(queueRepo, settingsRepo, _clinicContext);

        // Act
        var result = await handler.Handle(new GetPublicQueueDisplayQuery(ClinicId: _clinicId, Date: today), CancellationToken.None);

        // Assert: Emergency (Q-003) must lead, followed by Urgent (Q-002), then Routine (Q-001)
        result.Should().NotBeNull();
        result!.UpNext.Select(u => u.TicketNumber).Should().ContainInOrder("Q-003", "Q-002", "Q-001");
    }

    [Theory]
    [InlineData(VisitType.VitalsCheckOnly)]
    [InlineData(VisitType.RetailPurchase)]
    [InlineData(VisitType.StandaloneProcedure)]
    [InlineData(VisitType.LaboratorySpecimen)]
    [InlineData(VisitType.AdministrativeDocument)]
    [InlineData(VisitType.CashierSettlement)]
    public async Task TvDisplay_StrictlyExcludesAllNonConsultationVisitTypes_WhenInWaitingOrTriaged(VisitType nonConsultVisitType)
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
            ClinicName = "TV Filtering Clinic",
            TvDisplayMaskPatientNames = false
        };
        await settingsRepo.AddAsync(clinicSettings, CancellationToken.None);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var nonConsultTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-NC01",
            SequenceNumber = 1,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Non Consult Patient",
            Status = QueueStatus.Waiting,
            Priority = QueuePriority.Emergency, // Even with Emergency priority, non-consultation should NOT appear on doctor UpNext!
            VisitType = nonConsultVisitType
        };

        var consultTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-C01",
            SequenceNumber = 2,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Consult Patient",
            Status = QueueStatus.Waiting,
            Priority = QueuePriority.Routine,
            VisitType = VisitType.Consultation
        };

        await queueRepo.AddAsync(nonConsultTicket, CancellationToken.None);
        await queueRepo.AddAsync(consultTicket, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetPublicQueueDisplayQueryHandler(queueRepo, settingsRepo, _clinicContext);

        // Act
        var result = await handler.Handle(new GetPublicQueueDisplayQuery(ClinicId: _clinicId, Date: today), CancellationToken.None);

        // Assert: UpNext must ONLY contain the Consultation ticket, strictly excluding the non-consultation ticket
        result.Should().NotBeNull();
        result!.UpNext.Should().ContainSingle(u => u.TicketNumber == "Q-C01");
        result.UpNext.Should().NotContain(u => u.TicketNumber == "Q-NC01");
    }

    [Theory]
    [InlineData(QueueStatus.DischargedNonDoctor)]
    [InlineData(QueueStatus.Diverted)]
    [InlineData(QueueStatus.Completed)]
    [InlineData(QueueStatus.Cancelled)]
    [InlineData(QueueStatus.NoShow)]
    public async Task TvDisplay_ExcludesAllTerminalStatuses_FromBothNowServingAndUpNext(QueueStatus terminalStatus)
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
            ClinicName = "TV Terminal Shield Clinic",
            TvDisplayMaskPatientNames = false
        };
        await settingsRepo.AddAsync(clinicSettings, CancellationToken.None);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var terminalTicket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-TERM",
            SequenceNumber = 1,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Terminal Status Patient",
            Status = terminalStatus,
            VisitType = VisitType.Consultation,
            CalledTime = DateTime.UtcNow.AddMinutes(-10),
            CompletedTime = DateTime.UtcNow.AddMinutes(-5)
        };

        await queueRepo.AddAsync(terminalTicket, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetPublicQueueDisplayQueryHandler(queueRepo, settingsRepo, _clinicContext);

        // Act
        var result = await handler.Handle(new GetPublicQueueDisplayQuery(ClinicId: _clinicId, Date: today), CancellationToken.None);

        // Assert: Terminal status ticket must NOT appear in NowServing or UpNext
        result.Should().NotBeNull();
        result!.NowServing.Should().BeEmpty();
        result.UpNext.Should().BeEmpty();
        result.PatientsWaitingCount.Should().Be(0);
    }

    #endregion

    #region EOD Reconciliation Adversarial Tests

    [Fact]
    public async Task ReconcileEod_ShieldsDischargedNonDoctorAndDiverted_WhileAutoClosingAllOtherWaitingVisits()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<EodReconciliationAudit>(context, sieve);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var dischargedAt = DateTime.UtcNow.AddHours(-2);

        var ticketDischargedNonDoc = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-ND01",
            SequenceNumber = 1,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Discharged By Nurse",
            Status = QueueStatus.DischargedNonDoctor,
            VisitType = VisitType.VitalsCheckOnly,
            DischargedAt = dischargedAt,
            DischargeNotes = "Vitals taken, cleared."
        };

        var ticketDiverted = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-DIV01",
            SequenceNumber = 2,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Transferred ER Patient",
            Status = QueueStatus.Diverted,
            VisitType = VisitType.Consultation,
            DischargedAt = dischargedAt,
            DischargeNotes = "Diverted to St. Luke's ER."
        };

        var ticketActiveProcedure = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-PR01",
            SequenceNumber = 3,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Leftover Standalone Procedure",
            Status = QueueStatus.Waiting,
            VisitType = VisitType.StandaloneProcedure
        };

        var ticketActiveConsult = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-CO01",
            SequenceNumber = 4,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Leftover Consultation",
            Status = QueueStatus.Waiting,
            VisitType = VisitType.Consultation
        };

        await queueRepo.AddAsync(ticketDischargedNonDoc, CancellationToken.None);
        await queueRepo.AddAsync(ticketDiverted, CancellationToken.None);
        await queueRepo.AddAsync(ticketActiveProcedure, CancellationToken.None);
        await queueRepo.AddAsync(ticketActiveConsult, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ReconcileEodCommandHandler(queueRepo, auditRepo, uow, _clinicContext);

        // Act
        var result = await handler.Handle(new ReconcileEodCommand(today), CancellationToken.None);

        // Assert: 2 active tickets processed; 2 terminal tickets untouched
        result.ReconciledCount.Should().Be(2);
        result.AffectedTicketNumbers.Should().BeEquivalentTo(new[] { "Q-PR01", "Q-CO01" });

        var reloadedND = await context.Set<QueueItem>().FirstAsync(q => q.Id == ticketDischargedNonDoc.Id);
        reloadedND.Status.Should().Be(QueueStatus.DischargedNonDoctor);
        reloadedND.DischargeNotes.Should().Be("Vitals taken, cleared.");

        var reloadedDIV = await context.Set<QueueItem>().FirstAsync(q => q.Id == ticketDiverted.Id);
        reloadedDIV.Status.Should().Be(QueueStatus.Diverted);
        reloadedDIV.DischargeNotes.Should().Be("Diverted to St. Luke's ER.");

        var reloadedPR = await context.Set<QueueItem>().FirstAsync(q => q.Id == ticketActiveProcedure.Id);
        reloadedPR.Status.Should().Be(QueueStatus.Cancelled);
        reloadedPR.DischargeNotes.Should().Be("Auto-closed during EOD reconciliation.");

        var reloadedCO = await context.Set<QueueItem>().FirstAsync(q => q.Id == ticketActiveConsult.Id);
        reloadedCO.Status.Should().Be(QueueStatus.NoShow);
    }

    #endregion
}
