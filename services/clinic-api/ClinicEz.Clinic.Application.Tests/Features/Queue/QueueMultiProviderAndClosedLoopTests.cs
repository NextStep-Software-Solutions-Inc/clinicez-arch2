using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Procedures.Commands;
using ClinicEz.Clinic.Application.Features.Queue.Queries;
using ClinicEz.Clinic.Application.Tests;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Queue;

public class QueueMultiProviderAndClosedLoopTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_queue_test";

    public QueueMultiProviderAndClosedLoopTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
    }

    [Fact]
    public async Task ClosedLoop_OrderProcedure_TransitionsQueueToPendingProcedure_AndExecutionTransitionsToReEvaluation()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);

        var patientId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();
        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-001",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            PatientId = patientId,
            PatientName = "Juan Dela Cruz",
            DoctorId = doctorId,
            DoctorName = "Dr. Santos",
            Status = QueueStatus.InConsultation
        };
        await queueRepo.AddAsync(queueItem, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var orderHandler = new OrderProcedureCommandHandler(procRepo, uow, _clinicContext, queueRepo);
        var recordHandler = new RecordProcedureExecutionCommandHandler(procRepo, uow, _clinicContext, queueRepo);

        // Act 1: Doctor orders in-clinic procedure
        var orderCommand = new OrderProcedureCommand(
            PatientId: patientId,
            PatientName: "Juan Dela Cruz",
            QueueItemId: queueItem.Id,
            ProcedureName: "Nebulization Therapy",
            Category: "Respiratory",
            OrderedByDoctorId: doctorId,
            OrderedByDoctorName: "Dr. Santos"
        );
        var procDto = await orderHandler.Handle(orderCommand, CancellationToken.None);

        // Assert 1: Queue item transitioned to PendingProcedure
        var pendingItem = await queueRepo.Query(q => q.Id == queueItem.Id).FirstOrDefaultAsync();
        pendingItem!.Status.Should().Be(QueueStatus.PendingProcedure, "Doctor ordering in-clinic procedure must advance queue to PendingProcedure for nurse execution");

        // Act 2: Nurse performs and records procedure execution
        var execCommand = new RecordProcedureExecutionCommand(
            ProcedureId: procDto.Id,
            PerformedByStaffName: "Nurse Joy",
            ClinicalNotes: "Salbutamol 1 neb administered with good chest expansion"
        );
        await recordHandler.Handle(execCommand, CancellationToken.None);

        // Assert 2: Queue item transitioned to ReEvaluation
        var reEvalItem = await queueRepo.Query(q => q.Id == queueItem.Id).FirstOrDefaultAsync();
        reEvalItem!.Status.Should().Be(QueueStatus.ReEvaluation, "Nurse execution must handoff patient back to ReEvaluation for doctor review");
    }

    [Fact]
    public async Task MultiProviderFiltering_DoctorIdAndRoomOrStation_FiltersCorrectly()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var doctor1Id = Guid.NewGuid();
        var doctor2Id = Guid.NewGuid();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var item1 = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-001",
            SequenceNumber = 1,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient 1",
            DoctorId = doctor1Id,
            DoctorName = "Dr. Santos",
            RoomOrStation = "Exam Room 1",
            Status = QueueStatus.Triaged
        };

        var item2 = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-002",
            SequenceNumber = 2,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient 2",
            DoctorId = doctor2Id,
            DoctorName = "Dr. Reyes",
            RoomOrStation = "Exam Room 2",
            Status = QueueStatus.Triaged
        };

        await queueRepo.AddAsync(item1, CancellationToken.None);
        await queueRepo.AddAsync(item2, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetQueueQueryHandler(queueRepo, _clinicContext);

        // Act - Filter by Doctor 1
        var doctor1Queue = await handler.Handle(new GetQueueQuery(DoctorId: doctor1Id), CancellationToken.None);
        doctor1Queue.Should().HaveCount(1);
        doctor1Queue[0].DoctorName.Should().Be("Dr. Santos");
        doctor1Queue[0].RoomOrStation.Should().Be("Exam Room 1");

        // Act - Filter by Room 2
        var room2Queue = await handler.Handle(new GetQueueQuery(RoomOrStation: "Exam Room 2"), CancellationToken.None);
        room2Queue.Should().HaveCount(1);
        room2Queue[0].DoctorName.Should().Be("Dr. Reyes");
    }

    [Fact]
    public async Task MultiProviderFiltering_ViewFilters_ReturnsTargetWorkflowStages()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var waitingItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-010",
            SequenceNumber = 10,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient Waiting",
            Status = QueueStatus.Waiting
        };

        var triagedItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-011",
            SequenceNumber = 11,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient Triaged",
            Status = QueueStatus.Triaged
        };

        var reEvalItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-012",
            SequenceNumber = 12,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient ReEval",
            Status = QueueStatus.ReEvaluation
        };

        var pendingProcItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-013",
            SequenceNumber = 13,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient Pending Proc",
            Status = QueueStatus.PendingProcedure
        };

        await queueRepo.AddAsync(waitingItem, CancellationToken.None);
        await queueRepo.AddAsync(triagedItem, CancellationToken.None);
        await queueRepo.AddAsync(reEvalItem, CancellationToken.None);
        await queueRepo.AddAsync(pendingProcItem, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetQueueQueryHandler(queueRepo, _clinicContext);

        // View: WaitingForDoctor (should include Triaged + ReEvaluation)
        var waitingForDoctor = await handler.Handle(new GetQueueQuery(View: "WaitingForDoctor"), CancellationToken.None);
        waitingForDoctor.Select(q => q.PatientName).Should().BeEquivalentTo(new[] { "Patient Triaged", "Patient ReEval" });

        // View: Triage (should include Waiting)
        var triageView = await handler.Handle(new GetQueueQuery(View: "Triage"), CancellationToken.None);
        triageView.Select(q => q.PatientName).Should().BeEquivalentTo(new[] { "Patient Waiting" });

        // View: PendingProcedure (should include PendingProcedure)
        var procView = await handler.Handle(new GetQueueQuery(View: "PendingProcedure"), CancellationToken.None);
        procView.Select(q => q.PatientName).Should().BeEquivalentTo(new[] { "Patient Pending Proc" });
    }
}
