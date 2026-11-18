using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Queue.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Queue;

public class EnsureDirectVisitCommandTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_dv_test";

    public EnsureDirectVisitCommandTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffId.Returns(Guid.NewGuid());
    }

    [Fact]
    public async Task Handle_WhenNoActiveVisitExists_CreatesNewDirectVisitWithDVNumberAndSequenceZero()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var patientId = Guid.NewGuid();

        var handler = new EnsureDirectVisitCommandHandler(queueRepo, uow, _clinicContext, encounterRepo, invoiceRepo);

        var command = new EnsureDirectVisitCommand(
            PatientId: patientId,
            PatientName: "Dela Cruz, Juan",
            VisitType: VisitType.RoutineCheckup,
            InitialStatus: QueueStatus.InConsultation);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.IsDirectVisit.Should().BeTrue();
        result.SequenceNumber.Should().Be(0);
        result.QueueNumber.Should().Be("DV-001");
        result.Status.Should().Be(QueueStatus.InConsultation);
        result.PatientId.Should().Be(patientId);

        var persisted = await context.Set<QueueItem>().FirstOrDefaultAsync(q => q.Id == result.Id);
        persisted.Should().NotBeNull();
        persisted!.IsDirectVisit.Should().BeTrue();
        persisted.QueueNumber.Should().Be("DV-001");
        persisted.SequenceNumber.Should().Be(0);
    }

    [Fact]
    public async Task Handle_WhenActiveUnsignedUnpaidVisitExists_ReusesExistingVisit()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientId = Guid.NewGuid();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var existingVisit = new QueueItem
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
            VisitType = VisitType.RoutineCheckup,
            IsDirectVisit = true,
            CheckInTime = DateTime.UtcNow
        };
        await context.Set<QueueItem>().AddAsync(existingVisit);
        await uow.SaveChangesAsync(CancellationToken.None);

        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var handler = new EnsureDirectVisitCommandHandler(queueRepo, uow, _clinicContext, encounterRepo, invoiceRepo);

        var command = new EnsureDirectVisitCommand(
            PatientId: patientId,
            PatientName: "Dela Cruz, Juan",
            VisitType: VisitType.RoutineCheckup,
            InitialStatus: QueueStatus.InConsultation);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.Id.Should().Be(existingVisit.Id);
        result.QueueNumber.Should().Be("DV-001");

        var allQueueItems = await context.Set<QueueItem>().ToListAsync();
        allQueueItems.Should().HaveCount(1);
    }

    [Fact]
    public async Task Handle_WhenActiveVisitExistsButAllowDuplicateActiveIsTrue_CreatesSeparateDirectVisit()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var patientId = Guid.NewGuid();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var existingVisit = new QueueItem
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
        await context.Set<QueueItem>().AddAsync(existingVisit);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new EnsureDirectVisitCommandHandler(queueRepo, uow, _clinicContext, encounterRepo, invoiceRepo);

        var command = new EnsureDirectVisitCommand(
            PatientId: patientId,
            PatientName: "Dela Cruz, Juan",
            VisitType: VisitType.RoutineCheckup,
            InitialStatus: QueueStatus.InConsultation,
            AllowDuplicateActive: true);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.Id.Should().NotBe(existingVisit.Id);
        result.QueueNumber.Should().Be("DV-002");
        result.IsDirectVisit.Should().BeTrue();

        var allQueueItems = await context.Set<QueueItem>().ToListAsync();
        allQueueItems.Should().HaveCount(2);
    }

    [Fact]
    public async Task Handle_WhenActiveVisitExistsButEncounterIsSigned_CreatesSeparateDirectVisit()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var patientId = Guid.NewGuid();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var signedVisit = new QueueItem
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
        await context.Set<QueueItem>().AddAsync(signedVisit);

        var signedEncounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Dela Cruz, Juan",
            QueueItemId = signedVisit.Id,
            IsSigned = true,
            SignedAt = DateTime.UtcNow,
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Test"
        };
        await context.Set<ConsultationEncounter>().AddAsync(signedEncounter);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new EnsureDirectVisitCommandHandler(queueRepo, uow, _clinicContext, encounterRepo, invoiceRepo);

        var command = new EnsureDirectVisitCommand(
            PatientId: patientId,
            PatientName: "Dela Cruz, Juan",
            VisitType: VisitType.RoutineCheckup,
            InitialStatus: QueueStatus.InConsultation);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.Id.Should().NotBe(signedVisit.Id);
        result.QueueNumber.Should().Be("DV-002");
    }

    [Fact]
    public async Task Handle_WhenActiveVisitExistsButInvoiceIsPaid_CreatesSeparateDirectVisit()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var patientId = Guid.NewGuid();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var paidVisit = new QueueItem
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
        await context.Set<QueueItem>().AddAsync(paidVisit);

        var paidInvoice = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Dela Cruz, Juan",
            QueueItemId = paidVisit.Id,
            InvoiceNumber = "INV-001",
            Status = InvoiceStatus.Paid,
            InvoiceDate = DateTime.UtcNow
        };
        await context.Set<Invoice>().AddAsync(paidInvoice);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new EnsureDirectVisitCommandHandler(queueRepo, uow, _clinicContext, encounterRepo, invoiceRepo);

        var command = new EnsureDirectVisitCommand(
            PatientId: patientId,
            PatientName: "Dela Cruz, Juan",
            VisitType: VisitType.RoutineCheckup,
            InitialStatus: QueueStatus.InConsultation);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.Id.Should().NotBe(paidVisit.Id);
        result.QueueNumber.Should().Be("DV-002");
    }
}
