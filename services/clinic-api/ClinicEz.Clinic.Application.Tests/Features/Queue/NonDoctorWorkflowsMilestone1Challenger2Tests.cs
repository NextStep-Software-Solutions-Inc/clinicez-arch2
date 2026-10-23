using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Queue.Commands;
using ClinicEz.Clinic.Application.Tests;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Queue;

public class NonDoctorWorkflowsMilestone1Challenger2Tests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_challenger2_test";
    private readonly Guid _staffId = Guid.NewGuid();

    public NonDoctorWorkflowsMilestone1Challenger2Tests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffId.Returns(_staffId);
    }

    [Fact]
    public async Task ReconcileEod_DiverseStatusesBatch_ShieldsTerminalAndDifferentiatesConsultationFromNonConsultation()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<EodReconciliationAudit>(context, sieve);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var pastDischargedAt = DateTime.UtcNow.AddHours(-4);
        var pastCompletedTime = DateTime.UtcNow.AddHours(-3);

        // 1. Waiting (Consultation) -> should become NoShow
        var ticketWaitingConsult = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-C01",
            SequenceNumber = 1,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Consultation Waiting Patient",
            Status = QueueStatus.Waiting,
            VisitType = VisitType.Consultation
        };

        // 2. Waiting (VitalsCheckOnly) -> should become Cancelled with notes, NOT NoShow
        var ticketWaitingVitals = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-V01",
            SequenceNumber = 2,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Vitals Check Patient",
            Status = QueueStatus.Waiting,
            VisitType = VisitType.VitalsCheckOnly
        };

        // 3. Waiting (RetailPurchase) -> should become Cancelled with notes, NOT NoShow
        var ticketWaitingRetail = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-R01",
            SequenceNumber = 3,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Retail Guest",
            Status = QueueStatus.Waiting,
            VisitType = VisitType.RetailPurchase
        };

        // 4. DischargedNonDoctor -> MUST REMAIN UNTOUCHED
        var ticketDischargedNonDoc = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-ND01",
            SequenceNumber = 4,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Nurse Discharged Patient",
            Status = QueueStatus.DischargedNonDoctor,
            VisitType = VisitType.VitalsCheckOnly,
            DischargedAt = pastDischargedAt,
            DischargeNotes = "Vitals within normal limits; discharged by nurse."
        };

        // 5. Diverted -> MUST REMAIN UNTOUCHED
        var ticketDiverted = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-DIV01",
            SequenceNumber = 5,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Emergency Diverted Patient",
            Status = QueueStatus.Diverted,
            VisitType = VisitType.Consultation,
            DischargedAt = pastDischargedAt,
            DischargeNotes = "Ambulance transfer to tertiary ER."
        };

        // 6. Completed -> MUST REMAIN UNTOUCHED
        var ticketCompleted = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-DONE01",
            SequenceNumber = 6,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Finished Doctor Consultation",
            Status = QueueStatus.Completed,
            VisitType = VisitType.Consultation,
            CompletedTime = pastCompletedTime
        };

        await queueRepo.AddAsync(ticketWaitingConsult, CancellationToken.None);
        await queueRepo.AddAsync(ticketWaitingVitals, CancellationToken.None);
        await queueRepo.AddAsync(ticketWaitingRetail, CancellationToken.None);
        await queueRepo.AddAsync(ticketDischargedNonDoc, CancellationToken.None);
        await queueRepo.AddAsync(ticketDiverted, CancellationToken.None);
        await queueRepo.AddAsync(ticketCompleted, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ReconcileEodCommandHandler(queueRepo, auditRepo, uow, _clinicContext);

        // Act
        var result = await handler.Handle(new ReconcileEodCommand(today, TriggerType: "Manual"), CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.ReconciledCount.Should().Be(3);
        result.AffectedTicketNumbers.Should().BeEquivalentTo(new[] { "Q-C01", "Q-V01", "Q-R01" });

        // 1. Waiting (Consultation) -> NoShow
        var reloadedConsult = await context.Set<QueueItem>().FirstAsync(q => q.Id == ticketWaitingConsult.Id);
        reloadedConsult.Status.Should().Be(QueueStatus.NoShow);
        reloadedConsult.CompletedTime.Should().NotBeNull();
        reloadedConsult.UpdatedBy.Should().Be(_staffId.ToString());

        // 2. Waiting (VitalsCheckOnly) -> Cancelled, NOT NoShow
        var reloadedVitals = await context.Set<QueueItem>().FirstAsync(q => q.Id == ticketWaitingVitals.Id);
        reloadedVitals.Status.Should().Be(QueueStatus.Cancelled);
        reloadedVitals.Status.Should().NotBe(QueueStatus.NoShow);
        reloadedVitals.DischargeNotes.Should().Be("Auto-closed during EOD reconciliation.");
        reloadedVitals.CompletedTime.Should().NotBeNull();

        // 3. Waiting (RetailPurchase) -> Cancelled, NOT NoShow
        var reloadedRetail = await context.Set<QueueItem>().FirstAsync(q => q.Id == ticketWaitingRetail.Id);
        reloadedRetail.Status.Should().Be(QueueStatus.Cancelled);
        reloadedRetail.Status.Should().NotBe(QueueStatus.NoShow);
        reloadedRetail.DischargeNotes.Should().Be("Auto-closed during EOD reconciliation.");
        reloadedRetail.CompletedTime.Should().NotBeNull();

        // 4. DischargedNonDoctor -> UNTOUCHED
        var reloadedND = await context.Set<QueueItem>().FirstAsync(q => q.Id == ticketDischargedNonDoc.Id);
        reloadedND.Status.Should().Be(QueueStatus.DischargedNonDoctor);
        reloadedND.DischargedAt.Should().Be(pastDischargedAt);
        reloadedND.DischargeNotes.Should().Be("Vitals within normal limits; discharged by nurse.");

        // 5. Diverted -> UNTOUCHED
        var reloadedDIV = await context.Set<QueueItem>().FirstAsync(q => q.Id == ticketDiverted.Id);
        reloadedDIV.Status.Should().Be(QueueStatus.Diverted);
        reloadedDIV.DischargedAt.Should().Be(pastDischargedAt);
        reloadedDIV.DischargeNotes.Should().Be("Ambulance transfer to tertiary ER.");

        // 6. Completed -> UNTOUCHED
        var reloadedCompleted = await context.Set<QueueItem>().FirstAsync(q => q.Id == ticketCompleted.Id);
        reloadedCompleted.Status.Should().Be(QueueStatus.Completed);
        reloadedCompleted.CompletedTime.Should().Be(pastCompletedTime);
    }

    [Theory]
    [InlineData(VisitType.StandaloneProcedure)]
    [InlineData(VisitType.LaboratorySpecimen)]
    [InlineData(VisitType.AdministrativeDocument)]
    [InlineData(VisitType.CashierSettlement)]
    public async Task ReconcileEod_AllNonConsultationVisitTypes_AreCancelledWithoutNoShow(VisitType nonConsultType)
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
            QueueNumber = $"Q-{nonConsultType}",
            SequenceNumber = 1,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = $"Patient {nonConsultType}",
            Status = QueueStatus.Waiting,
            VisitType = nonConsultType
        };
        await queueRepo.AddAsync(ticket, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ReconcileEodCommandHandler(queueRepo, auditRepo, uow, _clinicContext);

        // Act
        var result = await handler.Handle(new ReconcileEodCommand(today), CancellationToken.None);

        // Assert
        result.ReconciledCount.Should().Be(1);
        var reloaded = await context.Set<QueueItem>().FirstAsync(q => q.Id == ticket.Id);
        reloaded.Status.Should().Be(QueueStatus.Cancelled);
        reloaded.Status.Should().NotBe(QueueStatus.NoShow);
        reloaded.DischargeNotes.Should().Be("Auto-closed during EOD reconciliation.");
    }

    [Fact]
    public async Task ReconcileEod_PreservesExistingDischargeNotes_WhenAutoClosingNonConsultation()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<EodReconciliationAudit>(context, sieve);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        const string customNote = "Patient walked away while nurse was fetching equipment.";
        var ticket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-V-CUSTOM",
            SequenceNumber = 1,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Custom Note Patient",
            Status = QueueStatus.Triaged,
            VisitType = VisitType.VitalsCheckOnly,
            DischargeNotes = customNote
        };
        await queueRepo.AddAsync(ticket, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new ReconcileEodCommandHandler(queueRepo, auditRepo, uow, _clinicContext);

        // Act
        var result = await handler.Handle(new ReconcileEodCommand(today), CancellationToken.None);

        // Assert
        result.ReconciledCount.Should().Be(1);
        var reloaded = await context.Set<QueueItem>().FirstAsync(q => q.Id == ticket.Id);
        reloaded.Status.Should().Be(QueueStatus.Cancelled);
        reloaded.DischargeNotes.Should().Be(customNote); // preserved, not overwritten
    }
}
