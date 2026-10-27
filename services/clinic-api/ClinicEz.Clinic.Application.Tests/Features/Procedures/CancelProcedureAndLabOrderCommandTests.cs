using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.LabOrders.Commands;
using ClinicEz.Clinic.Application.Features.Procedures.Commands;
using ClinicEz.Clinic.Application.Tests;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Procedures;

public class CancelProcedureAndLabOrderCommandTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_cancel_test";
    private readonly Guid _staffId = Guid.NewGuid();

    public CancelProcedureAndLabOrderCommandTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffId.Returns(_staffId);
    }

    [Fact]
    public async Task CancelProcedure_WhenOrdered_CancelsProcedureAndRevertsQueueStatusIfNoOtherProcedures()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(db, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(db, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(db, sieve);
        var roomRepo = TestDbHelper.CreateRepository<ClinicRoom>(db, sieve);

        var doctorId = Guid.NewGuid();
        var doctorRoom = new ClinicRoom
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            Name = "Consultation Room 1",
            Code = "CR-1",
            Type = ClinicRoomType.Consultation,
            DisplayOrder = 1,
            IsActive = true
        };
        await db.ClinicRooms.AddAsync(doctorRoom);

        var doctor = new StaffMember
        {
            Id = doctorId,
            ClinicId = _clinicId,
            TenantId = _tenantId,
            FirstName = "Doctor",
            LastName = "Who",
            Role = StaffRole.Doctor,
            IsActive = true
        };
        doctor.SetAssignedRoomIds(new[] { doctorRoom.Id });
        await db.StaffMembers.AddAsync(doctor);

        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            QueueNumber = "Q-101",
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            PatientId = Guid.NewGuid(),
            PatientName = "Jane Doe",
            Status = QueueStatus.PendingProcedure,
            DoctorId = doctorId,
            RoomId = Guid.NewGuid(),
            RoomOrStation = "Treatment Bay 1"
        };
        await db.QueueItems.AddAsync(queueItem);

        var procedure = new ClinicalProcedure
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = queueItem.PatientId,
            PatientName = "Jane Doe",
            QueueItemId = queueItem.Id,
            ProcedureName = "Nebulization Therapy",
            Category = "Procedure",
            Status = ProcedureStatus.Ordered,
            ScheduledAt = DateTime.UtcNow
        };
        await db.Procedures.AddAsync(procedure);
        await db.SaveChangesAsync();

        var handler = new CancelProcedureCommandHandler(
            procRepo,
            unitOfWork,
            _clinicContext,
            queueRepo,
            staffRepo,
            roomRepo
        );

        var result = await handler.Handle(
            new CancelProcedureCommand(procedure.Id, "Patient refused medication"),
            CancellationToken.None
        );

        result.Status.Should().Be(ProcedureStatus.Cancelled);
        var updatedProc = await db.Procedures.FindAsync(procedure.Id);
        updatedProc!.Status.Should().Be(ProcedureStatus.Cancelled);
        updatedProc.ClinicalNotes.Should().Contain("Cancelled: Patient refused medication");

        var updatedQueue = await db.QueueItems.FindAsync(queueItem.Id);
        updatedQueue!.Status.Should().Be(QueueStatus.InConsultation);
        updatedQueue.RoomId.Should().Be(doctorRoom.Id);
        updatedQueue.RoomOrStation.Should().Be("Consultation Room 1");
    }

    [Fact]
    public async Task CancelProcedure_WhenCompleted_ThrowsValidationException()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(db, sieve);

        var procedure = new ClinicalProcedure
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Jane Doe",
            ProcedureName = "Suture Removal",
            Category = "Procedure",
            Status = ProcedureStatus.Completed,
            ScheduledAt = DateTime.UtcNow
        };
        await db.Procedures.AddAsync(procedure);
        await db.SaveChangesAsync();

        var handler = new CancelProcedureCommandHandler(
            procRepo,
            unitOfWork,
            _clinicContext
        );

        var act = () => handler.Handle(new CancelProcedureCommand(procedure.Id), CancellationToken.None);
        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage("*Completed procedures cannot be cancelled*");
    }

    [Fact]
    public async Task RecordProcedureExecution_WithMultipleProcedures_KeepsPendingProcedureUntilAllCompleted()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(db, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(db, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(db, sieve);
        var roomRepo = TestDbHelper.CreateRepository<ClinicRoom>(db, sieve);

        var doctorId = Guid.NewGuid();
        var doctorRoom = new ClinicRoom
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            Name = "Consultation Room 1",
            Code = "CR-1",
            Type = ClinicRoomType.Consultation,
            DisplayOrder = 1,
            IsActive = true
        };
        await db.ClinicRooms.AddAsync(doctorRoom);

        var doctor = new StaffMember
        {
            Id = doctorId,
            ClinicId = _clinicId,
            TenantId = _tenantId,
            FirstName = "Doctor",
            LastName = "Who",
            Role = StaffRole.Doctor,
            IsActive = true
        };
        doctor.SetAssignedRoomIds(new[] { doctorRoom.Id });
        await db.StaffMembers.AddAsync(doctor);

        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            QueueNumber = "Q-002",
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            PatientId = Guid.NewGuid(),
            PatientName = "Abellana, Makisig S.",
            Status = QueueStatus.PendingProcedure,
            DoctorId = doctorId,
            RoomId = Guid.NewGuid(),
            RoomOrStation = "Treatment Room"
        };
        await db.QueueItems.AddAsync(queueItem);

        var proc1 = new ClinicalProcedure
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = queueItem.PatientId,
            PatientName = "Abellana, Makisig S.",
            QueueItemId = queueItem.Id,
            ProcedureName = "Surgical Odontectomy",
            Category = "Dental",
            Status = ProcedureStatus.Ordered,
            OrderedByDoctorId = doctorId,
            ScheduledAt = DateTime.UtcNow
        };
        var proc2 = new ClinicalProcedure
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = queueItem.PatientId,
            PatientName = "Abellana, Makisig S.",
            QueueItemId = queueItem.Id,
            ProcedureName = "Oral Prophylaxis",
            Category = "Dental",
            Status = ProcedureStatus.Ordered,
            OrderedByDoctorId = doctorId,
            ScheduledAt = DateTime.UtcNow
        };
        await db.Procedures.AddRangeAsync(proc1, proc2);
        await db.SaveChangesAsync();

        var execHandler = new RecordProcedureExecutionCommandHandler(
            procRepo,
            unitOfWork,
            _clinicContext,
            queueRepo,
            staffRepo,
            roomRepo
        );

        // Step 1: Complete proc1 — proc2 is still pending, so status must remain PendingProcedure
        await execHandler.Handle(
            new RecordProcedureExecutionCommand(proc1.Id, RequiresDoctorReEvaluation: true),
            CancellationToken.None
        );

        var qAfterFirst = await db.QueueItems.FindAsync(queueItem.Id);
        qAfterFirst!.Status.Should().Be(QueueStatus.PendingProcedure, "because proc2 is still in Ordered status in the treatment room");

        // Step 2: Complete proc2 — no more pending procedures, so status transitions to ReEvaluation
        await execHandler.Handle(
            new RecordProcedureExecutionCommand(proc2.Id, RequiresDoctorReEvaluation: true),
            CancellationToken.None
        );

        var qAfterSecond = await db.QueueItems.FindAsync(queueItem.Id);
        qAfterSecond!.Status.Should().Be(QueueStatus.ReEvaluation, "because all procedures are now completed");
        qAfterSecond.RoomOrStation.Should().Be("Consultation Room 1");
    }

    [Fact]
    public async Task CancelClinicLabOrder_WhenOrdered_CancelsOrderAndAllPendingItems()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var orderRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(db, sieve);

        var order = new ClinicLabOrder
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            OrderNumber = "LAB-TEST-001",
            PatientId = Guid.NewGuid(),
            PatientName = "Jane Doe",
            Status = LabOrderStatus.Ordered,
            OrderDate = DateTime.UtcNow,
            Items = new List<ClinicLabOrderItem>
            {
                new() { TestName = "CBC", Category = "Hematology", Status = LabOrderStatus.Ordered }
            }
        };
        await db.LabOrders.AddAsync(order);
        await db.SaveChangesAsync();

        var handler = new CancelClinicLabOrderCommandHandler(orderRepo, unitOfWork, _clinicContext);
        var result = await handler.Handle(
            new CancelClinicLabOrderCommand(order.Id, "Doctor revised diagnostic workup"),
            CancellationToken.None
        );

        result.Status.Should().Be(LabOrderStatus.Cancelled);
        var updatedOrder = await db.LabOrders.Include(o => o.Items).FirstOrDefaultAsync(o => o.Id == order.Id);
        updatedOrder!.Status.Should().Be(LabOrderStatus.Cancelled);
        updatedOrder.StageReason.Should().Be("Doctor revised diagnostic workup");
        updatedOrder.Items.Should().ContainSingle(i => i.Status == LabOrderStatus.Cancelled);
    }
}
