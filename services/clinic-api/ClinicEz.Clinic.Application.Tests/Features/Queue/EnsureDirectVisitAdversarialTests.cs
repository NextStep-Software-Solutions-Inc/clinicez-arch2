using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Patients.Queries;
using ClinicEz.Clinic.Application.Features.Queue.Commands;
using ClinicEz.Clinic.Application.Features.Queue.Queries;
using ClinicEz.Clinic.Application.Features.Queue.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Queue;

public class EnsureDirectVisitAdversarialTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_dv_adversarial";

    public EnsureDirectVisitAdversarialTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffId.Returns(Guid.NewGuid());
    }

    [Fact]
    public async Task Handle_DifferentClinic_DoesNotReuse_CreatesNewDV()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientId = Guid.NewGuid();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var otherClinicId = Guid.NewGuid();

        var otherClinicVisit = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = otherClinicId,
            PatientId = patientId,
            PatientName = "Dela Cruz, Juan",
            QueueNumber = "DV-001",
            SequenceNumber = 0,
            QueueDate = today,
            Status = QueueStatus.InConsultation,
            VisitType = VisitType.RoutineCheckup,
            IsDirectVisit = true,
            CheckInTime = DateTime.UtcNow
        };
        await context.Set<QueueItem>().AddAsync(otherClinicVisit);
        await uow.SaveChangesAsync(CancellationToken.None);

        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var handler = new EnsureDirectVisitCommandHandler(queueRepo, uow, _clinicContext, encounterRepo, invoiceRepo);

        var command = new EnsureDirectVisitCommand(
            PatientId: patientId,
            PatientName: "Dela Cruz, Juan");

        var result = await handler.Handle(command, CancellationToken.None);

        result.Id.Should().NotBe(otherClinicVisit.Id);
        result.ClinicId.Should().Be(_clinicId);
        result.QueueNumber.Should().Be("DV-001");
    }

    [Fact]
    public async Task Handle_DifferentPatient_DoesNotReuse_CreatesNewDV()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patient1 = Guid.NewGuid();
        var patient2 = Guid.NewGuid();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var visit1 = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patient1,
            PatientName = "Patient One",
            QueueNumber = "DV-001",
            SequenceNumber = 0,
            QueueDate = today,
            Status = QueueStatus.InConsultation,
            VisitType = VisitType.RoutineCheckup,
            IsDirectVisit = true,
            CheckInTime = DateTime.UtcNow
        };
        await context.Set<QueueItem>().AddAsync(visit1);
        await uow.SaveChangesAsync(CancellationToken.None);

        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var handler = new EnsureDirectVisitCommandHandler(queueRepo, uow, _clinicContext, encounterRepo, invoiceRepo);

        var command = new EnsureDirectVisitCommand(
            PatientId: patient2,
            PatientName: "Patient Two");

        var result = await handler.Handle(command, CancellationToken.None);

        result.Id.Should().NotBe(visit1.Id);
        result.PatientId.Should().Be(patient2);
        result.QueueNumber.Should().Be("DV-002");
    }

    [Theory]
    [InlineData(-1)] // Yesterday
    [InlineData(1)]  // Tomorrow
    public async Task Handle_DifferentDate_DoesNotReuse_CreatesNewDV(int dayOffset)
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientId = Guid.NewGuid();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var otherDate = today.AddDays(dayOffset);

        var otherDateVisit = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Dela Cruz, Juan",
            QueueNumber = "DV-001",
            SequenceNumber = 0,
            QueueDate = otherDate,
            Status = QueueStatus.InConsultation,
            VisitType = VisitType.RoutineCheckup,
            IsDirectVisit = true,
            CheckInTime = DateTime.UtcNow.AddDays(dayOffset)
        };
        await context.Set<QueueItem>().AddAsync(otherDateVisit);
        await uow.SaveChangesAsync(CancellationToken.None);

        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var handler = new EnsureDirectVisitCommandHandler(queueRepo, uow, _clinicContext, encounterRepo, invoiceRepo);

        var command = new EnsureDirectVisitCommand(
            PatientId: patientId,
            PatientName: "Dela Cruz, Juan",
            QueueDate: today);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Id.Should().NotBe(otherDateVisit.Id);
        result.QueueDate.Should().Be(today);
        result.QueueNumber.Should().Be("DV-001"); // DV-001 for today because the other visit was on otherDate
    }

    [Theory]
    [InlineData(QueueStatus.Completed)]
    [InlineData(QueueStatus.Cancelled)]
    [InlineData(QueueStatus.NoShow)]
    [InlineData(QueueStatus.DischargedNonDoctor)]
    [InlineData(QueueStatus.Diverted)]
    public async Task Handle_TerminalStatuses_DoNotReuse_CreatesNewDV(QueueStatus terminalStatus)
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientId = Guid.NewGuid();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var terminalVisit = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Dela Cruz, Juan",
            QueueNumber = "DV-001",
            SequenceNumber = 0,
            QueueDate = today,
            Status = terminalStatus,
            VisitType = VisitType.RoutineCheckup,
            IsDirectVisit = true,
            CheckInTime = DateTime.UtcNow
        };
        await context.Set<QueueItem>().AddAsync(terminalVisit);
        await uow.SaveChangesAsync(CancellationToken.None);

        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var handler = new EnsureDirectVisitCommandHandler(queueRepo, uow, _clinicContext, encounterRepo, invoiceRepo);

        var command = new EnsureDirectVisitCommand(
            PatientId: patientId,
            PatientName: "Dela Cruz, Juan",
            QueueDate: today);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Id.Should().NotBe(terminalVisit.Id);
        result.QueueNumber.Should().Be("DV-002");
    }

    [Theory]
    [InlineData(QueueStatus.Waiting)]
    [InlineData(QueueStatus.Triaged)]
    [InlineData(QueueStatus.InConsultation)]
    [InlineData(QueueStatus.PendingProcedure)]
    [InlineData(QueueStatus.ReEvaluation)]
    [InlineData(QueueStatus.OnHold)]
    public async Task Handle_NonTerminalStatuses_ReusesExistingVisit(QueueStatus nonTerminalStatus)
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientId = Guid.NewGuid();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var activeVisit = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Dela Cruz, Juan",
            QueueNumber = "DV-001",
            SequenceNumber = 0,
            QueueDate = today,
            Status = nonTerminalStatus,
            VisitType = VisitType.RoutineCheckup,
            IsDirectVisit = true,
            CheckInTime = DateTime.UtcNow
        };
        await context.Set<QueueItem>().AddAsync(activeVisit);
        await uow.SaveChangesAsync(CancellationToken.None);

        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var handler = new EnsureDirectVisitCommandHandler(queueRepo, uow, _clinicContext, encounterRepo, invoiceRepo);

        var command = new EnsureDirectVisitCommand(
            PatientId: patientId,
            PatientName: "Dela Cruz, Juan",
            QueueDate: today);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Id.Should().Be(activeVisit.Id);
        result.QueueNumber.Should().Be("DV-001");
    }

    [Theory]
    [InlineData((VisitType)6)]
    [InlineData((VisitType)7)]
    [InlineData((VisitType)99)]
    public async Task Handle_NonClinicalVisitTypes_DoNotReuse_CreatesNewDV(VisitType nonClinicalVisitType)
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientId = Guid.NewGuid();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var nonClinicalVisit = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Dela Cruz, Juan",
            QueueNumber = "DV-001",
            SequenceNumber = 0,
            QueueDate = today,
            Status = QueueStatus.Triaged,
            VisitType = nonClinicalVisitType,
            IsDirectVisit = true,
            CheckInTime = DateTime.UtcNow
        };
        await context.Set<QueueItem>().AddAsync(nonClinicalVisit);
        await uow.SaveChangesAsync(CancellationToken.None);

        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var handler = new EnsureDirectVisitCommandHandler(queueRepo, uow, _clinicContext, encounterRepo, invoiceRepo);

        var command = new EnsureDirectVisitCommand(
            PatientId: patientId,
            PatientName: "Dela Cruz, Juan",
            VisitType: VisitType.RoutineCheckup,
            QueueDate: today);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Id.Should().NotBe(nonClinicalVisit.Id);
        result.QueueNumber.Should().Be("DV-002");
    }

    [Theory]
    [InlineData(VisitType.RoutineCheckup)]
    [InlineData(VisitType.AcuteIllnessConsultation)]
    [InlineData(VisitType.ChronicDiseaseFollowUp)]
    [InlineData(VisitType.PreventiveHealthAssessment)]
    [InlineData(VisitType.UrgentCareVisit)]
    public async Task Handle_ClinicalVisitTypes_ReusesExistingVisit(VisitType clinicalVisitType)
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientId = Guid.NewGuid();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var clinicalVisit = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Dela Cruz, Juan",
            QueueNumber = "DV-001",
            SequenceNumber = 0,
            QueueDate = today,
            Status = QueueStatus.Triaged,
            VisitType = clinicalVisitType,
            IsDirectVisit = true,
            CheckInTime = DateTime.UtcNow
        };
        await context.Set<QueueItem>().AddAsync(clinicalVisit);
        await uow.SaveChangesAsync(CancellationToken.None);

        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var handler = new EnsureDirectVisitCommandHandler(queueRepo, uow, _clinicContext, encounterRepo, invoiceRepo);

        var command = new EnsureDirectVisitCommand(
            PatientId: patientId,
            PatientName: "Dela Cruz, Juan",
            QueueDate: today);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Id.Should().Be(clinicalVisit.Id);
        result.QueueNumber.Should().Be("DV-001");
    }

    [Fact]
    public async Task Handle_UnsignedEncounter_ReusesExistingVisit()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientId = Guid.NewGuid();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var visit = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Dela Cruz, Juan",
            QueueNumber = "DV-001",
            SequenceNumber = 0,
            QueueDate = today,
            Status = QueueStatus.InConsultation,
            VisitType = VisitType.RoutineCheckup,
            IsDirectVisit = true,
            CheckInTime = DateTime.UtcNow
        };
        await context.Set<QueueItem>().AddAsync(visit);

        var draftEncounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Dela Cruz, Juan",
            QueueItemId = visit.Id,
            IsSigned = false,
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Test"
        };
        await context.Set<ConsultationEncounter>().AddAsync(draftEncounter);
        await uow.SaveChangesAsync(CancellationToken.None);

        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var handler = new EnsureDirectVisitCommandHandler(queueRepo, uow, _clinicContext, encounterRepo, invoiceRepo);

        var command = new EnsureDirectVisitCommand(
            PatientId: patientId,
            PatientName: "Dela Cruz, Juan",
            QueueDate: today);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Id.Should().Be(visit.Id);
    }

    [Fact]
    public async Task Handle_MultipleVisits_OneSignedOneUnsigned_ReusesUnsignedVisit()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientId = Guid.NewGuid();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        // Visit 1 (Signed earlier today)
        var visit1 = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Dela Cruz, Juan",
            QueueNumber = "DV-001",
            SequenceNumber = 0,
            QueueDate = today,
            Status = QueueStatus.InConsultation,
            VisitType = VisitType.RoutineCheckup,
            IsDirectVisit = true,
            CheckInTime = DateTime.UtcNow.AddHours(-3)
        };
        await context.Set<QueueItem>().AddAsync(visit1);

        var signedEncounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Dela Cruz, Juan",
            QueueItemId = visit1.Id,
            IsSigned = true,
            SignedAt = DateTime.UtcNow.AddHours(-2),
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Test"
        };
        await context.Set<ConsultationEncounter>().AddAsync(signedEncounter);

        // Visit 2 (Active unsigned later today)
        var visit2 = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Dela Cruz, Juan",
            QueueNumber = "DV-002",
            SequenceNumber = 0,
            QueueDate = today,
            Status = QueueStatus.Triaged,
            VisitType = VisitType.RoutineCheckup,
            IsDirectVisit = true,
            CheckInTime = DateTime.UtcNow.AddMinutes(-30)
        };
        await context.Set<QueueItem>().AddAsync(visit2);
        await uow.SaveChangesAsync(CancellationToken.None);

        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var handler = new EnsureDirectVisitCommandHandler(queueRepo, uow, _clinicContext, encounterRepo, invoiceRepo);

        var command = new EnsureDirectVisitCommand(
            PatientId: patientId,
            PatientName: "Dela Cruz, Juan",
            QueueDate: today);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Id.Should().Be(visit2.Id);
        result.QueueNumber.Should().Be("DV-002");
    }

    [Theory]
    [InlineData(InvoiceStatus.Draft)]
    [InlineData(InvoiceStatus.PartiallyPaid)]
    [InlineData(InvoiceStatus.Voided)]
    [InlineData(InvoiceStatus.Refunded)]
    public async Task Handle_UnpaidInvoiceStatuses_ReusesExistingVisit(InvoiceStatus unpaidStatus)
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientId = Guid.NewGuid();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var visit = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Dela Cruz, Juan",
            QueueNumber = "DV-001",
            SequenceNumber = 0,
            QueueDate = today,
            Status = QueueStatus.InConsultation,
            VisitType = VisitType.RoutineCheckup,
            IsDirectVisit = true,
            CheckInTime = DateTime.UtcNow
        };
        await context.Set<QueueItem>().AddAsync(visit);

        var unpaidInvoice = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Dela Cruz, Juan",
            QueueItemId = visit.Id,
            InvoiceNumber = "INV-001",
            Status = unpaidStatus,
            InvoiceDate = DateTime.UtcNow,
            IsDeleted = false
        };
        await context.Set<Invoice>().AddAsync(unpaidInvoice);
        await uow.SaveChangesAsync(CancellationToken.None);

        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var handler = new EnsureDirectVisitCommandHandler(queueRepo, uow, _clinicContext, encounterRepo, invoiceRepo);

        var command = new EnsureDirectVisitCommand(
            PatientId: patientId,
            PatientName: "Dela Cruz, Juan",
            QueueDate: today);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Id.Should().Be(visit.Id);
    }

    [Fact]
    public async Task Handle_DeletedPaidInvoice_ReusesExistingVisit()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientId = Guid.NewGuid();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var visit = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Dela Cruz, Juan",
            QueueNumber = "DV-001",
            SequenceNumber = 0,
            QueueDate = today,
            Status = QueueStatus.InConsultation,
            VisitType = VisitType.RoutineCheckup,
            IsDirectVisit = true,
            CheckInTime = DateTime.UtcNow
        };
        await context.Set<QueueItem>().AddAsync(visit);

        var deletedPaidInvoice = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Dela Cruz, Juan",
            QueueItemId = visit.Id,
            InvoiceNumber = "INV-001",
            Status = InvoiceStatus.Paid,
            InvoiceDate = DateTime.UtcNow,
            IsDeleted = true // Deleted!
        };
        await context.Set<Invoice>().AddAsync(deletedPaidInvoice);
        await uow.SaveChangesAsync(CancellationToken.None);

        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var handler = new EnsureDirectVisitCommandHandler(queueRepo, uow, _clinicContext, encounterRepo, invoiceRepo);

        var command = new EnsureDirectVisitCommand(
            PatientId: patientId,
            PatientName: "Dela Cruz, Juan",
            QueueDate: today);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Id.Should().Be(visit.Id);
    }

    [Fact]
    public async Task Handle_LobbyQueueItemsExist_DoNotInterfereWithDVSequenceNumbering()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientId = Guid.NewGuid();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        // Regular lobby tickets Q-001, Q-002, Q-100
        var lobbyTickets = new[]
        {
            new QueueItem { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, PatientId = Guid.NewGuid(), PatientName = "Lobby 1", QueueNumber = "Q-001", SequenceNumber = 1, QueueDate = today, Status = QueueStatus.Waiting, VisitType = VisitType.RoutineCheckup, IsDirectVisit = false, CheckInTime = DateTime.UtcNow },
            new QueueItem { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, PatientId = Guid.NewGuid(), PatientName = "Lobby 2", QueueNumber = "Q-002", SequenceNumber = 2, QueueDate = today, Status = QueueStatus.Waiting, VisitType = VisitType.RoutineCheckup, IsDirectVisit = false, CheckInTime = DateTime.UtcNow },
            new QueueItem { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, PatientId = Guid.NewGuid(), PatientName = "Lobby 100", QueueNumber = "Q-100", SequenceNumber = 100, QueueDate = today, Status = QueueStatus.Waiting, VisitType = VisitType.RoutineCheckup, IsDirectVisit = false, CheckInTime = DateTime.UtcNow }
        };
        await context.Set<QueueItem>().AddRangeAsync(lobbyTickets);
        await uow.SaveChangesAsync(CancellationToken.None);

        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var handler = new EnsureDirectVisitCommandHandler(queueRepo, uow, _clinicContext, encounterRepo, invoiceRepo);

        var command = new EnsureDirectVisitCommand(
            PatientId: patientId,
            PatientName: "Dela Cruz, Juan",
            QueueDate: today);

        var result = await handler.Handle(command, CancellationToken.None);

        result.QueueNumber.Should().Be("DV-001");
        result.SequenceNumber.Should().Be(0);
        result.IsDirectVisit.Should().BeTrue();
    }

    [Fact]
    public async Task Handle_NonConsecutiveDVNumbers_AllocatesMaxPlusOne()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientId = Guid.NewGuid();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var dvTickets = new[]
        {
            new QueueItem { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, PatientId = Guid.NewGuid(), PatientName = "P1", QueueNumber = "DV-001", SequenceNumber = 0, QueueDate = today, Status = QueueStatus.Completed, VisitType = VisitType.RoutineCheckup, IsDirectVisit = true, CheckInTime = DateTime.UtcNow },
            new QueueItem { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, PatientId = Guid.NewGuid(), PatientName = "P5", QueueNumber = "DV-005", SequenceNumber = 0, QueueDate = today, Status = QueueStatus.Completed, VisitType = VisitType.RoutineCheckup, IsDirectVisit = true, CheckInTime = DateTime.UtcNow }
        };
        await context.Set<QueueItem>().AddRangeAsync(dvTickets);
        await uow.SaveChangesAsync(CancellationToken.None);

        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var handler = new EnsureDirectVisitCommandHandler(queueRepo, uow, _clinicContext, encounterRepo, invoiceRepo);

        var command = new EnsureDirectVisitCommand(
            PatientId: patientId,
            PatientName: "Dela Cruz, Juan",
            QueueDate: today);

        var result = await handler.Handle(command, CancellationToken.None);

        result.QueueNumber.Should().Be("DV-006");
        result.SequenceNumber.Should().Be(0);
    }

    [Fact]
    public async Task GetPublicQueueDisplay_DirectVisitsAreCompletelyOmitted_FromNowServingAndUpNext()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Test Clinic",
            FacilitySlug = "main",
            TenantSlug = "test",
            TvDisplayMaskPatientNames = false
        };
        await context.Set<FacilitySettings>().AddAsync(settings);

        // 1. Regular lobby serving item (Q-001)
        var regularServing = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Juan Dela Cruz",
            QueueNumber = "Q-001",
            SequenceNumber = 1,
            QueueDate = today,
            Status = QueueStatus.InConsultation,
            VisitType = VisitType.RoutineCheckup,
            IsDirectVisit = false,
            CalledTime = DateTime.UtcNow.AddMinutes(-5),
            CheckInTime = DateTime.UtcNow.AddMinutes(-20)
        };

        // 2. Direct visit serving item (DV-001)
        var directServing = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Maria Santos",
            QueueNumber = "DV-001",
            SequenceNumber = 0,
            QueueDate = today,
            Status = QueueStatus.InConsultation,
            VisitType = VisitType.RoutineCheckup,
            IsDirectVisit = true,
            CalledTime = DateTime.UtcNow.AddMinutes(-3),
            CheckInTime = DateTime.UtcNow.AddMinutes(-10)
        };

        // 3. Regular lobby waiting item (Q-002)
        var regularWaiting = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Pedro Penduko",
            QueueNumber = "Q-002",
            SequenceNumber = 2,
            QueueDate = today,
            Status = QueueStatus.Triaged,
            VisitType = VisitType.RoutineCheckup,
            IsDirectVisit = false,
            CheckInTime = DateTime.UtcNow.AddMinutes(-15)
        };

        // 4. Direct visit waiting item (DV-002)
        var directWaiting = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Ana Reyes",
            QueueNumber = "DV-002",
            SequenceNumber = 0,
            QueueDate = today,
            Status = QueueStatus.Triaged,
            VisitType = VisitType.RoutineCheckup,
            IsDirectVisit = true,
            CheckInTime = DateTime.UtcNow.AddMinutes(-5)
        };

        await context.Set<QueueItem>().AddRangeAsync(regularServing, directServing, regularWaiting, directWaiting);
        await uow.SaveChangesAsync(CancellationToken.None);

        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var handler = new GetPublicQueueDisplayQueryHandler(queueRepo, settingsRepo, _clinicContext);

        var query = new GetPublicQueueDisplayQuery(
            ClinicId: _clinicId,
            Date: today);

        var result = await handler.Handle(query, CancellationToken.None);

        result.Should().NotBeNull();

        // Assert NowServing strictly contains Q-001 and NEVER DV-001
        result!.NowServing.Should().HaveCount(1);
        result.NowServing.First().TicketNumber.Should().Be("Q-001");
        result.NowServing.Should().NotContain(x => x.TicketNumber == "DV-001");

        // Assert UpNext strictly contains Q-002 and NEVER DV-002
        result.UpNext.Should().HaveCount(1);
        result.UpNext.First().TicketNumber.Should().Be("Q-002");
        result.UpNext.Should().NotContain(x => x.TicketNumber == "DV-002");

        // Assert PatientsWaitingCount matches strictly lobby upNext
        result.PatientsWaitingCount.Should().Be(1);
    }

    [Fact]
    public async Task CallQueueItem_DirectVisit_SuppressesLobbyPushNotification()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var directItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Direct Patient",
            QueueNumber = "DV-001",
            SequenceNumber = 0,
            QueueDate = today,
            Status = QueueStatus.Triaged,
            VisitType = VisitType.RoutineCheckup,
            IsDirectVisit = true,
            CheckInTime = DateTime.UtcNow
        };
        var lobbyItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Lobby Patient",
            QueueNumber = "Q-001",
            SequenceNumber = 1,
            QueueDate = today,
            Status = QueueStatus.Triaged,
            VisitType = VisitType.RoutineCheckup,
            IsDirectVisit = false,
            CheckInTime = DateTime.UtcNow
        };

        await context.Set<QueueItem>().AddRangeAsync(directItem, lobbyItem);
        await uow.SaveChangesAsync(CancellationToken.None);

        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var notificationDispatcher = Substitute.For<IQueueNotificationDispatcher>();
        var handler = new CallQueueItemCommandHandler(queueRepo, uow, _clinicContext, notificationDispatcher);

        await handler.Handle(new CallQueueItemCommand(directItem.Id, Guid.NewGuid(), "Dr. Direct", "Room 1"), CancellationToken.None);
        await notificationDispatcher.DidNotReceive().DispatchCalledAlertAsync(
            Arg.Any<QueueItem>(), Arg.Any<string?>(), Arg.Any<string?>(), Arg.Any<CancellationToken>());

        await handler.Handle(new CallQueueItemCommand(lobbyItem.Id, Guid.NewGuid(), "Dr. Lobby", "Room 2"), CancellationToken.None);
        await notificationDispatcher.Received(1).DispatchCalledAlertAsync(
            Arg.Is<QueueItem>(q => q.Id == lobbyItem.Id), "Dr. Lobby", "Room 2", Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task GetClinicPatients_ActiveQueueTickets_ExcludesSignedEncountersAndPaidInvoices()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var patientId = Guid.NewGuid();

        var patient = new Patient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-DV-001",
            FirstName = "Clarisse",
            LastName = "Alvarado",
            DateOfBirth = new DateOnly(1985, 5, 10),
            Sex = BiologicalSex.Female,
            ContactNumber = "09171234567"
        };

        var signedVisit = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Alvarado, Clarisse",
            QueueNumber = "DV-001",
            SequenceNumber = 0,
            QueueDate = today,
            Status = QueueStatus.InConsultation,
            VisitType = VisitType.RoutineCheckup,
            IsDirectVisit = true,
            CheckInTime = DateTime.UtcNow.AddHours(-2)
        };
        var paidVisit = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Alvarado, Clarisse",
            QueueNumber = "DV-002",
            SequenceNumber = 0,
            QueueDate = today,
            Status = QueueStatus.PendingProcedure,
            VisitType = VisitType.PreventiveHealthAssessment,
            IsDirectVisit = true,
            CheckInTime = DateTime.UtcNow.AddHours(-1)
        };
        var openVisit = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Alvarado, Clarisse",
            QueueNumber = "DV-003",
            SequenceNumber = 0,
            QueueDate = today,
            Status = QueueStatus.Triaged,
            VisitType = VisitType.RoutineCheckup,
            IsDirectVisit = true,
            CheckInTime = DateTime.UtcNow
        };

        var signedEncounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Alvarado, Clarisse",
            QueueItemId = signedVisit.Id,
            IsSigned = true,
            SignedAt = DateTime.UtcNow.AddHours(-1),
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Signed"
        };

        var paidInvoice = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Alvarado, Clarisse",
            QueueItemId = paidVisit.Id,
            InvoiceNumber = "INV-DV-002",
            Status = InvoiceStatus.Paid,
            InvoiceDate = DateTime.UtcNow
        };

        await context.Set<Patient>().AddAsync(patient);
        await context.Set<QueueItem>().AddRangeAsync(signedVisit, paidVisit, openVisit);
        await context.Set<ConsultationEncounter>().AddAsync(signedEncounter);
        await context.Set<Invoice>().AddAsync(paidInvoice);
        await uow.SaveChangesAsync(CancellationToken.None);

        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);

        var handler = new GetClinicPatientsQueryHandler(patientRepo, queueRepo, encounterRepo, invoiceRepo);
        var results = await handler.Handle(new GetClinicPatientsQuery(QueueDate: today), CancellationToken.None);

        results.Should().ContainSingle(p => p.Id == patientId);
        var dto = results.Single(p => p.Id == patientId);
        dto.ActiveQueueTickets.Should().NotBeNull();
        dto.ActiveQueueTickets!.Should().ContainSingle();
        dto.ActiveQueueTickets![0].Id.Should().Be(openVisit.Id);
        dto.ActiveQueueTickets![0].QueueNumber.Should().Be("DV-003");
        dto.ActiveQueueTickets![0].IsDirectVisit.Should().BeTrue();
    }
}
