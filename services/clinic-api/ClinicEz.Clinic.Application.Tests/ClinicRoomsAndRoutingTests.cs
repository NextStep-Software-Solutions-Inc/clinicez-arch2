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

public class RoomsAndRoutingTests
{
    private static IClinicIdentityProvider IdentityOf(Guid clinicId, string tenantId)
    {
        var identity = Substitute.For<IClinicIdentityProvider>();
        identity.GetAsync(Arg.Any<CancellationToken>())
            .Returns(new ClinicIdentity(tenantId, clinicId, "Apex Multi-Room Clinic"));
        return identity;
    }

    [Fact]
    public async Task GetRooms_FirstRunSeedsFourDefaultRooms_AndDoesNotReseedAfterDeletion()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_rooms";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
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
    public async Task UpdateAndDeleteRoom_SynchronizesActiveQueueItems_AndUnassignsStaff()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_rooms";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
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
            IsActive = true
        };
        doctor.SetAssignedRoomIds(new[] { created.Id });
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
        refreshedDoctor.GetAssignedRoomIds().Should().BeEmpty();
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
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);

        var room2 = new Room
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
        var treatmentRoom = new Room
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
        await context.Rooms.AddRangeAsync(room2, treatmentRoom);

        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Title = "Dr.",
            FirstName = "Marco",
            LastName = "Villanueva",
            Role = StaffRole.Doctor,
            IsActive = true
        };
        doctor.SetAssignedRoomIds(new[] { room2.Id });
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
            roomRepo,
            staffRepo);

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
        var orderProcHandler = new OrderProcedureCommandHandler(procRepo, uow, clinicContext, queueRepo, roomRepo);
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
            uow,
            clinicContext,
            queueRepo,
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

    [Fact]
    public async Task ReorderClinicRoomsCommand_UpdatesDisplayOrderInSequence()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_reorder";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        var getHandler = new GetClinicRoomsQueryHandler(roomRepo, staffRepo, uow, clinicContext);
        var initialRooms = await getHandler.Handle(new GetClinicRoomsQuery(), CancellationToken.None);
        initialRooms.Should().HaveCount(4);

        var reversedIds = initialRooms.Select(r => r.Id).Reverse().ToList();
        var reorderHandler = new ReorderClinicRoomsCommandHandler(roomRepo, uow, clinicContext);
        var result = await reorderHandler.Handle(new ReorderClinicRoomsCommand(reversedIds), CancellationToken.None);
        result.Should().BeTrue();

        var reorderedRooms = await getHandler.Handle(new GetClinicRoomsQuery(), CancellationToken.None);
        reorderedRooms.Select(r => r.Id).Should().Equal(reversedIds);
        reorderedRooms.Select(r => r.DisplayOrder).Should().Equal(1, 2, 3, 4);
    }

    [Fact]
    public async Task MultiRoom_AdditiveStaffAssignment_AndQueryProjection_RetainsBothRooms()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_multiroom_additive";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var room1 = new Room
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Name = "Consultation Room 1",
            Type = ClinicRoomType.Consultation,
            DisplayOrder = 1,
            IsActive = true
        };
        var room2 = new Room
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Name = "Consultation Room 2",
            Type = ClinicRoomType.Consultation,
            DisplayOrder = 2,
            IsActive = true
        };
        await context.Rooms.AddRangeAsync(room1, room2);

        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Title = "Dr.",
            FirstName = "Maria",
            LastName = "Santos",
            Role = StaffRole.Doctor,
            IsActive = true
        };
        await context.StaffMembers.AddAsync(doctor);
        await context.SaveChangesAsync();

        var updateHandler = new UpdateClinicRoomCommandHandler(roomRepo, staffRepo, queueRepo, uow, clinicContext);
        var getRoomsHandler = new GetClinicRoomsQueryHandler(roomRepo, staffRepo, uow, clinicContext);

        // Assign Doctor to Room 1
        await updateHandler.Handle(
            new UpdateClinicRoomCommand(room1.Id, room1.Name, room1.Code, room1.Type, room1.Description, room1.DisplayOrder, room1.IsActive, new[] { doctor.Id }),
            CancellationToken.None);

        // Additively assign Doctor to Room 2
        await updateHandler.Handle(
            new UpdateClinicRoomCommand(room2.Id, room2.Name, room2.Code, room2.Type, room2.Description, room2.DisplayOrder, room2.IsActive, new[] { doctor.Id }),
            CancellationToken.None);

        // Verify doctor entity holds both room IDs
        var refreshedDoctor = await context.StaffMembers.FirstAsync(s => s.Id == doctor.Id);
        refreshedDoctor.GetAssignedRoomIds().Should().HaveCount(2).And.Contain(new[] { room1.Id, room2.Id });

        // Verify GetClinicRoomsQuery lists doctor under BOTH rooms
        var roomsResult = await getRoomsHandler.Handle(new GetClinicRoomsQuery(), CancellationToken.None);
        var projectedRoom1 = roomsResult.First(r => r.Id == room1.Id);
        var projectedRoom2 = roomsResult.First(r => r.Id == room2.Id);

        projectedRoom1.AssignedStaffIds.Should().Contain(doctor.Id);
        projectedRoom1.AssignedStaffNames.Should().Contain("Dr. Maria Santos");
        projectedRoom2.AssignedStaffIds.Should().Contain(doctor.Id);
        projectedRoom2.AssignedStaffNames.Should().Contain("Dr. Maria Santos");
    }

    [Fact]
    public async Task MultiRoom_DeletingRoom_PreservesOtherAssignedRoomsOnStaff()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_multiroom_delete";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        var room1 = new Room
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Name = "Room A",
            Type = ClinicRoomType.Consultation,
            DisplayOrder = 1,
            IsActive = true
        };
        var room2 = new Room
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Name = "Room B",
            Type = ClinicRoomType.Consultation,
            DisplayOrder = 2,
            IsActive = true
        };
        await context.Rooms.AddRangeAsync(room1, room2);

        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Roberto",
            LastName = "Cruz",
            Role = StaffRole.Doctor,
            IsActive = true
        };
        doctor.SetAssignedRoomIds(new[] { room1.Id, room2.Id });
        await context.StaffMembers.AddAsync(doctor);
        await context.SaveChangesAsync();

        var deleteHandler = new DeleteClinicRoomCommandHandler(roomRepo, staffRepo, uow, clinicContext);

        // Delete Room A
        await deleteHandler.Handle(new DeleteClinicRoomCommand(room1.Id), CancellationToken.None);

        // Doctor should still retain Room B
        var refreshedDoctor = await context.StaffMembers.FirstAsync(s => s.Id == doctor.Id);
        refreshedDoctor.GetAssignedRoomIds().Should().ContainSingle().Which.Should().Be(room2.Id);
    }

    [Fact]
    public async Task MultiRoom_CheckIn_PreservesRoomIfInDoctorRooms_OrDefaultsToFirstActive()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_multiroom_checkin";
        var patientId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);

        var room1 = new Room
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Name = "Consultation Room 1",
            Type = ClinicRoomType.Consultation,
            DisplayOrder = 1,
            IsActive = true
        };
        var room2 = new Room
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Name = "Consultation Room 2",
            Type = ClinicRoomType.Consultation,
            DisplayOrder = 2,
            IsActive = true
        };
        await context.Rooms.AddRangeAsync(room1, room2);

        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Title = "Dr.",
            FirstName = "Gabriel",
            LastName = "Torres",
            Role = StaffRole.Doctor,
            IsActive = true
        };
        doctor.SetAssignedRoomIds(new[] { room1.Id, room2.Id });
        await context.StaffMembers.AddAsync(doctor);
        await context.SaveChangesAsync();

        var checkInHandler = new CheckInPatientCommandHandler(
            queueRepo,
            apptRepo,
            uow,
            clinicContext,
            IdentityOf(clinicId, tenantId),
            Substitute.For<IPatientAppointmentPublisher>(),
            roomRepo,
            staffRepo);

        // Case 1: Check in with explicit Room 2 (one of the doctor's assigned rooms) -> Preserves Room 2
        var checkInWithRoom2 = await checkInHandler.Handle(
            new CheckInPatientCommand(
                patientId,
                "Patient Alpha",
                null,
                doctor.Id,
                "Dr. Gabriel Torres",
                QueuePriority.Routine,
                "Checkup",
                RoomId: room2.Id),
            CancellationToken.None);

        checkInWithRoom2.RoomId.Should().Be(room2.Id);
        checkInWithRoom2.RoomOrStation.Should().Be("Consultation Room 2");

        // Case 2: Check in with RoomId = null -> Defaults to doctor's first active assigned room (Room 1)
        var checkInWithoutRoom = await checkInHandler.Handle(
            new CheckInPatientCommand(
                Guid.NewGuid(),
                "Patient Beta",
                null,
                doctor.Id,
                "Dr. Gabriel Torres",
                QueuePriority.Routine,
                "Follow-up",
                RoomId: null),
            CancellationToken.None);

        checkInWithoutRoom.RoomId.Should().Be(room1.Id);
        checkInWithoutRoom.RoomOrStation.Should().Be("Consultation Room 1");
    }

    [Fact]
    public async Task MultiRoom_CallQueueItem_PreservesExistingRoomIfInDoctorRooms_OrDefaultsToDoctorRoom()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_multiroom_call";

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var room1 = new Room
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Name = "Room A",
            Type = ClinicRoomType.Consultation,
            DisplayOrder = 1,
            IsActive = true
        };
        var room2 = new Room
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Name = "Room B",
            Type = ClinicRoomType.Consultation,
            DisplayOrder = 2,
            IsActive = true
        };
        await context.Rooms.AddRangeAsync(room1, room2);

        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Title = "Dr.",
            FirstName = "Clara",
            LastName = "Ocampo",
            Role = StaffRole.Doctor,
            IsActive = true
        };
        doctor.SetAssignedRoomIds(new[] { room1.Id, room2.Id });
        await context.StaffMembers.AddAsync(doctor);

        // Ticket 1: Already assigned to Room B (which is in doctor's assigned rooms)
        var ticket1 = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient One",
            QueueNumber = "Q-101",
            SequenceNumber = 1,
            DoctorId = doctor.Id,
            RoomId = room2.Id,
            RoomOrStation = "Room B",
            Status = QueueStatus.Waiting,
            CheckInTime = DateTime.UtcNow
        };

        // Ticket 2: Has no room assigned
        var ticket2 = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient Two",
            QueueNumber = "Q-102",
            SequenceNumber = 2,
            DoctorId = doctor.Id,
            RoomId = null,
            RoomOrStation = null,
            Status = QueueStatus.Waiting,
            CheckInTime = DateTime.UtcNow
        };
        await context.QueueItems.AddRangeAsync(ticket1, ticket2);
        await context.SaveChangesAsync();

        var callHandler = new CallQueueItemCommandHandler(
            queueRepo,
            uow,
            clinicContext,
            null,
            roomRepo,
            staffRepo);

        // Calling Ticket 1 without specifying room should PRESERVE Room B
        var calledTicket1 = await callHandler.Handle(
            new CallQueueItemCommand(ticket1.Id),
            CancellationToken.None);

        calledTicket1.RoomId.Should().Be(room2.Id);
        calledTicket1.RoomOrStation.Should().Be("Room B");

        // Calling Ticket 2 without specifying room should DEFAULT to first active room (Room A)
        var calledTicket2 = await callHandler.Handle(
            new CallQueueItemCommand(ticket2.Id),
            CancellationToken.None);

        calledTicket2.RoomId.Should().Be(room1.Id);
        calledTicket2.RoomOrStation.Should().Be("Room A");
    }
}


