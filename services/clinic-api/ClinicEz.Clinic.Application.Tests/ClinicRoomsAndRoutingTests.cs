using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.DTOs;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Procedures.Commands;
using ClinicEz.Clinic.Application.Features.Queue.Commands;
using ClinicEz.Clinic.Application.Features.Rooms.Commands;
using ClinicEz.Clinic.Application.Features.Rooms.Queries;
using ClinicEz.Clinic.Application.Features.Staff.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class ClinicRoomsAndRoutingTests
{
    private static IClinicIdentityProvider IdentityOf(Guid clinicId, string tenantId)
    {
        var identity = Substitute.For<IClinicIdentityProvider>();
        identity.GetAsync(Arg.Any<CancellationToken>())
            .Returns(new ClinicIdentity(tenantId, clinicId, "Apex Multi-Room Clinic"));
        return identity;
    }

    [Fact]
    public async Task GetClinicRooms_FirstRunSeedsFourDefaultRooms_AndDoesNotReseedAfterDeletion()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_rooms";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<ClinicRoom>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        var getHandler = new GetClinicRoomsQueryHandler(roomRepo, staffRepo, uow, clinicContext);
        var deleteHandler = new DeleteClinicRoomCommandHandler(roomRepo, staffRepo, uow, clinicContext);

        // First call seeds the 4 initial rooms
        var initialRooms = await getHandler.Handle(new GetClinicRoomsQuery(false), CancellationToken.None);
        initialRooms.Should().HaveCount(4);
        initialRooms.Select(r => r.Name).Should().Contain(new[]
        {
            "Room 1", "Room 2", "Triage Station", "Treatment Room"
        });

        // Delete all 4 rooms
        foreach (var room in initialRooms)
        {
            await deleteHandler.Handle(new DeleteClinicRoomCommand(room.Id), CancellationToken.None);
        }

        // Subsequent call must NOT re-seed because IgnoreQueryFilters sees historical rooms
        var afterDelete = await getHandler.Handle(new GetClinicRoomsQuery(false), CancellationToken.None);
        afterDelete.Should().BeEmpty();
    }

    [Fact]
    public async Task UpdateAndDeleteClinicRoom_SynchronizesActiveQueueItems_AndUnassignsStaff()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_rooms";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<ClinicRoom>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var createHandler = new CreateClinicRoomCommandHandler(roomRepo, uow, clinicContext);
        var updateHandler = new UpdateClinicRoomCommandHandler(roomRepo, staffRepo, queueRepo, uow, clinicContext);
        var deleteHandler = new DeleteClinicRoomCommandHandler(roomRepo, staffRepo, uow, clinicContext);

        var created = await createHandler.Handle(
            new CreateClinicRoomCommand("Room 3", "RM-3", ClinicRoomType.Consultation, "Pedia Room", 30),
            CancellationToken.None);

        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Elena",
            LastName = "Reyes",
            Role = StaffRole.Doctor,
            AssignedRoomId = created.Id,
            IsActive = true
        };
        var activeQueueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Carlo Mendoza",
            QueueNumber = "Q-001",
            SequenceNumber = 1,
            Status = QueueStatus.InConsultation,
            RoomId = created.Id,
            RoomOrStation = "Room 3",
            CheckInTime = DateTime.UtcNow
        };
        await context.StaffMembers.AddAsync(doctor);
        await context.QueueItems.AddAsync(activeQueueItem);
        await context.SaveChangesAsync();

        // Rename Room 3 -> Pedia Suite
        var updated = await updateHandler.Handle(
            new UpdateClinicRoomCommand(created.Id, "Pedia Suite", "PED-1", ClinicRoomType.Consultation, "Pedia Room", 30, true),
            CancellationToken.None);

        updated.Name.Should().Be("Pedia Suite");
        updated.AssignedStaffCount.Should().Be(1);

        var refreshedQueue = await context.QueueItems.FirstAsync(q => q.Id == activeQueueItem.Id);
        refreshedQueue.RoomOrStation.Should().Be("Pedia Suite");

        // Delete room -> unassigns staff
        await deleteHandler.Handle(new DeleteClinicRoomCommand(created.Id), CancellationToken.None);
        var refreshedDoctor = await context.StaffMembers.FirstAsync(s => s.Id == doctor.Id);
        refreshedDoctor.AssignedRoomId.Should().BeNull();
    }

    [Fact]
    public async Task CheckIn_And_Call_AutoResolvesDoctorAssignedRoom_And_ProcedureHandoffRestoresConsultationRoom()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_flow";
        var patientId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<ClinicRoom>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);

        var room2 = new ClinicRoom
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Name = "Room 2",
            Code = "RM-2",
            Type = ClinicRoomType.Consultation,
            DisplayOrder = 2,
            IsActive = true
        };
        var treatmentRoom = new ClinicRoom
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Name = "Minor Procedure Bay",
            Code = "TX-1",
            Type = ClinicRoomType.Treatment,
            DisplayOrder = 4,
            IsActive = true
        };
        await context.ClinicRooms.AddRangeAsync(room2, treatmentRoom);

        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Title = "Dr.",
            FirstName = "Marco",
            LastName = "Villanueva",
            Role = StaffRole.Doctor,
            AssignedRoomId = room2.Id,
            IsActive = true
        };
        await context.StaffMembers.AddAsync(doctor);
        await context.SaveChangesAsync();

        // 1. Check in patient assigned to Dr. Marco (without explicitly passing RoomId)
        var checkInHandler = new CheckInPatientCommandHandler(
            queueRepo,
            apptRepo,
            uow,
            clinicContext,
            IdentityOf(clinicId, tenantId),
            Substitute.For<IPatientAppointmentPublisher>(),
            staffRepo,
            roomRepo);

        var checkedIn = await checkInHandler.Handle(
            new CheckInPatientCommand(
                patientId,
                "Ana Bautista",
                null,
                doctor.Id,
                "Dr. Marco Villanueva",
                QueuePriority.Routine,
                "Asthma exacerbation"),
            CancellationToken.None);

        checkedIn.RoomId.Should().Be(room2.Id);
        checkedIn.RoomOrStation.Should().Be("Room 2");

        // 2. Doctor orders nebulization -> routes patient to clinic's configured Treatment room ("Minor Procedure Bay")
        var orderProcHandler = new OrderProcedureCommandHandler(procRepo, queueRepo, uow, clinicContext, roomRepo);
        var orderedProc = await orderProcHandler.Handle(
            new OrderProcedureCommand(
                patientId,
                "Ana Bautista",
                checkedIn.Id,
                null,
                "NEB-01",
                "Salbutamol Nebulization",
                "Procedure",
                doctor.Id,
                "Dr. Marco Villanueva",
                "Wheezing bilateral"),
            CancellationToken.None);

        orderedProc.TargetRoomId.Should().Be(treatmentRoom.Id);
        orderedProc.TargetRoomName.Should().Be("Minor Procedure Bay");

        var queueDuringProc = await context.QueueItems.FirstAsync(q => q.Id == checkedIn.Id);
        queueDuringProc.Status.Should().Be(QueueStatus.PendingProcedure);
        queueDuringProc.RoomId.Should().Be(treatmentRoom.Id);
        queueDuringProc.RoomOrStation.Should().Be("Minor Procedure Bay");

        // 3. Nurse completes nebulization -> restores patient to Dr. Marco's Room 2 with ReEvaluation status
        var completeProcHandler = new RecordProcedureExecutionCommandHandler(
            procRepo,
            queueRepo,
            uow,
            clinicContext,
            staffRepo,
            roomRepo);

        await completeProcHandler.Handle(
            new RecordProcedureExecutionCommand(
                orderedProc.Id,
                Guid.NewGuid(),
                "RN Joy Santos",
                "{\"systolicBp\":120,\"diastolicBp\":80}",
                "{\"systolicBp\":118,\"diastolicBp\":78}",
                "Salbutamol 2.5mg/2.5mL",
                "LOT-991",
                null,
                "Inhalation",
                "Clear breath sounds post-neb",
                "None"),
            CancellationToken.None);

        var queueAfterProc = await context.QueueItems.FirstAsync(q => q.Id == checkedIn.Id);
        queueAfterProc.Status.Should().Be(QueueStatus.ReEvaluation);
        queueAfterProc.RoomId.Should().Be(room2.Id);
        queueAfterProc.RoomOrStation.Should().Be("Room 2");
    }
}
