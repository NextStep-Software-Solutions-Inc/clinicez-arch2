using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.DTOs;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Procedures.Commands;
using ClinicEz.Clinic.Application.Features.Queue.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Challenger;

/// <summary>
/// Empirical Adversarial Challenger Test Suite for Milestone 1:
/// Queue Routing Resolution Across Check-in, Call-to-Room, and Procedure Execution.
/// 
/// Stress-tests:
/// 1. Multi-room doctor walk-in check-in default room routing (DisplayOrder ordering).
/// 2. Room preservation when ticket called into already assigned doctor room.
/// 3. Room reassignment when ticket called from unassigned or external station.
/// 4. Inactive room fallback across check-in and call commands.
/// 5. Floating doctor resilience (0 assigned rooms, null JSON, malformed JSON, zero NRE).
/// 6. Closed-loop procedure execution and doctor room restoration.
/// 7. Cross-clinic / multi-tenant room isolation.
/// </summary>
public class Milestone1QueueRoutingStressTests
{
    private static IClinicIdentityProvider IdentityOf(Guid clinicId, string tenantId)
    {
        var identity = Substitute.For<IClinicIdentityProvider>();
        identity.GetAsync(Arg.Any<CancellationToken>())
            .Returns(new ClinicIdentity(tenantId, clinicId, "Apex Multi-Room Routing Center"));
        return identity;
    }

    private static (Guid clinicId, string tenantId, IClinicContext clinicContext) SetupClinicContext()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = $"tenant_routing_{Guid.NewGuid():N}";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);
        clinicContext.StaffId.Returns(Guid.NewGuid());
        return (clinicId, tenantId, clinicContext);
    }

    #region 1. Multi-Room Doctor Walk-in Check-in

    [Fact]
    public async Task CheckIn_MultiRoomDoctor_DefaultsToFirstActiveAssignedRoom_ByDisplayOrder()
    {
        // ARRANGE
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);

        var roomA = new Room
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Name = "Room A",
            Code = "RM-A",
            Type = ClinicRoomType.Consultation,
            DisplayOrder = 1,
            IsActive = true
        };
        var roomB = new Room
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Name = "Room B",
            Code = "RM-B",
            Type = ClinicRoomType.Consultation,
            DisplayOrder = 2,
            IsActive = true
        };
        await context.Rooms.AddRangeAsync(roomA, roomB);

        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Title = "Dr.",
            FirstName = "Roberto",
            LastName = "Lim",
            Role = StaffRole.Doctor,
            IsActive = true
        };
        doctor.SetAssignedRoomIds(new[] { roomA.Id, roomB.Id });
        await context.StaffMembers.AddAsync(doctor);
        await context.SaveChangesAsync();

        var checkInHandler = new CheckInPatientCommandHandler(
            queueRepo, apptRepo, uow, clinicContext,
            IdentityOf(clinicId, tenantId),
            Substitute.For<IPatientAppointmentPublisher>(),
            roomRepo, staffRepo);

        // ACT: Walk-in check-in without room
        var patientId = Guid.NewGuid();
        var checkedIn = await checkInHandler.Handle(
            new CheckInPatientCommand(
                patientId,
                "Juan dela Cruz",
                DoctorId: doctor.Id,
                Priority: QueuePriority.Routine,
                ChiefComplaint: "Routine consult"),
            CancellationToken.None);

        // ASSERT: Defaults to Room A (DisplayOrder 1)
        checkedIn.RoomId.Should().Be(roomA.Id);
        checkedIn.RoomOrStation.Should().Be("Room A");

        var persisted = await context.QueueItems.FirstAsync(q => q.Id == checkedIn.Id);
        persisted.RoomId.Should().Be(roomA.Id);
        persisted.RoomOrStation.Should().Be("Room A");
    }

    [Fact]
    public async Task CheckIn_MultiRoomDoctor_RespectsDisplayOrder_EvenWhenJsonArrayOrderIsReversed()
    {
        // ARRANGE: Doctor JSON has [Room B, Room A], but Room A has lower DisplayOrder
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);

        var roomA = new Room
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Name = "Room Alpha",
            Code = "RM-A",
            Type = ClinicRoomType.Consultation,
            DisplayOrder = 10,
            IsActive = true
        };
        var roomB = new Room
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Name = "Room Beta",
            Code = "RM-B",
            Type = ClinicRoomType.Consultation,
            DisplayOrder = 20,
            IsActive = true
        };
        await context.Rooms.AddRangeAsync(roomA, roomB);

        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Alice",
            LastName = "Tan",
            Role = StaffRole.Doctor,
            IsActive = true
        };
        // Explicitly set reversed order in JSON [Room Beta, Room Alpha]
        doctor.SetAssignedRoomIds(new[] { roomB.Id, roomA.Id });
        await context.StaffMembers.AddAsync(doctor);
        await context.SaveChangesAsync();

        var checkInHandler = new CheckInPatientCommandHandler(
            queueRepo, apptRepo, uow, clinicContext,
            IdentityOf(clinicId, tenantId),
            Substitute.For<IPatientAppointmentPublisher>(),
            roomRepo, staffRepo);

        // ACT
        var checkedIn = await checkInHandler.Handle(
            new CheckInPatientCommand(
                Guid.NewGuid(),
                "Pedro Penduko",
                DoctorId: doctor.Id,
                Priority: QueuePriority.Routine),
            CancellationToken.None);

        // ASSERT: Ordered by DisplayOrder, so Room Alpha is selected
        checkedIn.RoomId.Should().Be(roomA.Id);
        checkedIn.RoomOrStation.Should().Be("Room Alpha");
    }

    [Fact]
    public async Task CheckIn_MultiRoomDoctor_ExplicitRoomInCommand_OverridesDoctorDefault()
    {
        // ARRANGE
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);

        var roomA = new Room { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, Name = "Room A", DisplayOrder = 1, IsActive = true };
        var roomB = new Room { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, Name = "Room B", DisplayOrder = 2, IsActive = true };
        await context.Rooms.AddRangeAsync(roomA, roomB);

        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            FirstName = "Maria",
            LastName = "Reyes",
            Role = StaffRole.Doctor,
            IsActive = true
        };
        doctor.SetAssignedRoomIds(new[] { roomA.Id, roomB.Id });
        await context.StaffMembers.AddAsync(doctor);
        await context.SaveChangesAsync();

        var checkInHandler = new CheckInPatientCommandHandler(
            queueRepo, apptRepo, uow, clinicContext,
            IdentityOf(clinicId, tenantId),
            Substitute.For<IPatientAppointmentPublisher>(),
            roomRepo, staffRepo);

        // ACT: Explicitly check in to Room B
        var checkedIn = await checkInHandler.Handle(
            new CheckInPatientCommand(
                Guid.NewGuid(),
                "Gloria Ramos",
                DoctorId: doctor.Id,
                RoomId: roomB.Id),
            CancellationToken.None);

        // ASSERT: Explicit Room B wins over default Room A
        checkedIn.RoomId.Should().Be(roomB.Id);
        checkedIn.RoomOrStation.Should().Be("Room B");
    }

    [Fact]
    public async Task CheckIn_MultiRoomDoctor_ExplicitRoomNameInCommand_ResolvesRoomByNameCaseInsensitive()
    {
        // ARRANGE
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);

        var roomA = new Room { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, Name = "Room A", DisplayOrder = 1, IsActive = true };
        var roomB = new Room { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, Name = "Room B", DisplayOrder = 2, IsActive = true };
        await context.Rooms.AddRangeAsync(roomA, roomB);

        var doctor = new StaffMember { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, FirstName = "Maria", LastName = "Reyes", Role = StaffRole.Doctor, IsActive = true };
        doctor.SetAssignedRoomIds(new[] { roomA.Id, roomB.Id });
        await context.StaffMembers.AddAsync(doctor);
        await context.SaveChangesAsync();

        var checkInHandler = new CheckInPatientCommandHandler(
            queueRepo, apptRepo, uow, clinicContext,
            IdentityOf(clinicId, tenantId),
            Substitute.For<IPatientAppointmentPublisher>(),
            roomRepo, staffRepo);

        // ACT: Explicit RoomOrStation = "room b"
        var checkedIn = await checkInHandler.Handle(
            new CheckInPatientCommand(
                Guid.NewGuid(),
                "Gloria Ramos",
                DoctorId: doctor.Id,
                RoomOrStation: "room b"),
            CancellationToken.None);

        // ASSERT: Resolves to Room B
        checkedIn.RoomId.Should().Be(roomB.Id);
        checkedIn.RoomOrStation.Should().Be("Room B");
    }

    #endregion

    #region 2. Call to Room Preservation

    [Fact]
    public async Task Call_PreservesRoom_WhenTicketAlreadyInDoctorAssignedRoomB()
    {
        // ARRANGE: Doctor is assigned [Room A, Room B]. Ticket was checked in to Room B.
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var roomA = new Room { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, Name = "Room A", DisplayOrder = 1, IsActive = true };
        var roomB = new Room { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, Name = "Room B", DisplayOrder = 2, IsActive = true };
        await context.Rooms.AddRangeAsync(roomA, roomB);

        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            Title = "Dr.",
            FirstName = "Elena",
            LastName = "Cruz",
            Role = StaffRole.Doctor,
            IsActive = true
        };
        doctor.SetAssignedRoomIds(new[] { roomA.Id, roomB.Id });
        await context.StaffMembers.AddAsync(doctor);

        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Benigno Aquino",
            QueueNumber = "Q-005",
            SequenceNumber = 5,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            DoctorId = doctor.Id,
            DoctorName = "Dr. Elena Cruz",
            RoomId = roomB.Id,
            RoomOrStation = "Room B",
            Status = QueueStatus.Waiting,
            CheckInTime = DateTime.UtcNow
        };
        await context.QueueItems.AddAsync(queueItem);
        await context.SaveChangesAsync();

        var callHandler = new CallQueueItemCommandHandler(queueRepo, uow, clinicContext, null, roomRepo, staffRepo);

        // ACT: Doctor calls ticket without specifying RoomId or RoomOrStation
        var called = await callHandler.Handle(new CallQueueItemCommand(queueItem.Id), CancellationToken.None);

        // ASSERT: Preserves Room B (does NOT override to default Room A)
        called.RoomId.Should().Be(roomB.Id);
        called.RoomOrStation.Should().Be("Room B");
        called.Status.Should().Be(QueueStatus.InConsultation);

        var refreshed = await context.QueueItems.FirstAsync(q => q.Id == queueItem.Id);
        refreshed.RoomId.Should().Be(roomB.Id);
        refreshed.RoomOrStation.Should().Be("Room B");
    }

    [Fact]
    public async Task Call_PreservesRoom_AndHydratesRoomOrStationName_WhenTicketHasRoomIdWithoutName()
    {
        // ARRANGE: Ticket has RoomId = Room B.Id, but RoomOrStation is empty
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var roomA = new Room { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, Name = "Room A", DisplayOrder = 1, IsActive = true };
        var roomB = new Room { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, Name = "Room B", DisplayOrder = 2, IsActive = true };
        await context.Rooms.AddRangeAsync(roomA, roomB);

        var doctor = new StaffMember { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, FirstName = "Elena", LastName = "Cruz", Role = StaffRole.Doctor, IsActive = true };
        doctor.SetAssignedRoomIds(new[] { roomA.Id, roomB.Id });
        await context.StaffMembers.AddAsync(doctor);

        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Benigno Aquino",
            QueueNumber = "Q-006",
            SequenceNumber = 6,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            DoctorId = doctor.Id,
            RoomId = roomB.Id,
            RoomOrStation = null, // Missing name
            Status = QueueStatus.Waiting,
            CheckInTime = DateTime.UtcNow
        };
        await context.QueueItems.AddAsync(queueItem);
        await context.SaveChangesAsync();

        var callHandler = new CallQueueItemCommandHandler(queueRepo, uow, clinicContext, null, roomRepo, staffRepo);

        // ACT
        var called = await callHandler.Handle(new CallQueueItemCommand(queueItem.Id), CancellationToken.None);

        // ASSERT: Preserves Room B and hydrates RoomOrStation name
        called.RoomId.Should().Be(roomB.Id);
        called.RoomOrStation.Should().Be("Room B");
    }

    #endregion

    #region 3. Call to Room Reassignment

    [Fact]
    public async Task Call_ReassignsRoom_WhenTicketInUnassignedRoomC_ToDoctorDefaultRoomA()
    {
        // ARRANGE: Doctor assigned to [Room A, Room B]. Ticket is at Room C (Triage).
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var roomA = new Room { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, Name = "Room A", DisplayOrder = 1, IsActive = true };
        var roomB = new Room { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, Name = "Room B", DisplayOrder = 2, IsActive = true };
        var roomC = new Room { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, Name = "Triage Station", DisplayOrder = 3, IsActive = true };
        await context.Rooms.AddRangeAsync(roomA, roomB, roomC);

        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            Title = "Dr.",
            FirstName = "Rodrigo",
            LastName = "Duterte",
            Role = StaffRole.Doctor,
            IsActive = true
        };
        doctor.SetAssignedRoomIds(new[] { roomA.Id, roomB.Id });
        await context.StaffMembers.AddAsync(doctor);

        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Ferdinand Marcos",
            QueueNumber = "Q-007",
            SequenceNumber = 7,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            DoctorId = doctor.Id,
            RoomId = roomC.Id, // In triage / unassigned room C
            RoomOrStation = "Triage Station",
            Status = QueueStatus.Triaged,
            CheckInTime = DateTime.UtcNow
        };
        await context.QueueItems.AddAsync(queueItem);
        await context.SaveChangesAsync();

        var callHandler = new CallQueueItemCommandHandler(queueRepo, uow, clinicContext, null, roomRepo, staffRepo);

        // ACT: Doctor calls ticket
        var called = await callHandler.Handle(new CallQueueItemCommand(queueItem.Id), CancellationToken.None);

        // ASSERT: Reassigned from Room C to Doctor's first assigned active room (Room A)
        called.RoomId.Should().Be(roomA.Id);
        called.RoomOrStation.Should().Be("Room A");

        var refreshed = await context.QueueItems.FirstAsync(q => q.Id == queueItem.Id);
        refreshed.RoomId.Should().Be(roomA.Id);
        refreshed.RoomOrStation.Should().Be("Room A");
    }

    [Fact]
    public async Task Call_ReassignsRoom_WhenTicketHasNoRoom_ToDoctorDefaultRoomA()
    {
        // ARRANGE: Ticket has RoomId = null
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var roomA = new Room { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, Name = "Room A", DisplayOrder = 1, IsActive = true };
        var roomB = new Room { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, Name = "Room B", DisplayOrder = 2, IsActive = true };
        await context.Rooms.AddRangeAsync(roomA, roomB);

        var doctor = new StaffMember { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, FirstName = "Rodrigo", LastName = "Duterte", Role = StaffRole.Doctor, IsActive = true };
        doctor.SetAssignedRoomIds(new[] { roomA.Id, roomB.Id });
        await context.StaffMembers.AddAsync(doctor);

        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Corazon Aquino",
            QueueNumber = "Q-008",
            SequenceNumber = 8,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            DoctorId = doctor.Id,
            RoomId = null,
            RoomOrStation = null,
            Status = QueueStatus.Waiting,
            CheckInTime = DateTime.UtcNow
        };
        await context.QueueItems.AddAsync(queueItem);
        await context.SaveChangesAsync();

        var callHandler = new CallQueueItemCommandHandler(queueRepo, uow, clinicContext, null, roomRepo, staffRepo);

        // ACT
        var called = await callHandler.Handle(new CallQueueItemCommand(queueItem.Id), CancellationToken.None);

        // ASSERT: Assigned to Room A
        called.RoomId.Should().Be(roomA.Id);
        called.RoomOrStation.Should().Be("Room A");
    }

    [Fact]
    public async Task Call_ExplicitRoomInCallCommand_OverridesAssignedAndPreservedRooms()
    {
        // ARRANGE: Ticket is in Room A, Doctor is assigned [Room A, Room B].
        // Call command explicitly specifies Room B.
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var roomA = new Room { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, Name = "Room A", DisplayOrder = 1, IsActive = true };
        var roomB = new Room { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, Name = "Room B", DisplayOrder = 2, IsActive = true };
        await context.Rooms.AddRangeAsync(roomA, roomB);

        var doctor = new StaffMember { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, FirstName = "Rodrigo", LastName = "Duterte", Role = StaffRole.Doctor, IsActive = true };
        doctor.SetAssignedRoomIds(new[] { roomA.Id, roomB.Id });
        await context.StaffMembers.AddAsync(doctor);

        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Jose Rizal",
            QueueNumber = "Q-009",
            SequenceNumber = 9,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            DoctorId = doctor.Id,
            RoomId = roomA.Id,
            RoomOrStation = "Room A",
            Status = QueueStatus.Waiting,
            CheckInTime = DateTime.UtcNow
        };
        await context.QueueItems.AddAsync(queueItem);
        await context.SaveChangesAsync();

        var callHandler = new CallQueueItemCommandHandler(queueRepo, uow, clinicContext, null, roomRepo, staffRepo);

        // ACT: Explicit Room B in command
        var called = await callHandler.Handle(new CallQueueItemCommand(queueItem.Id, RoomId: roomB.Id), CancellationToken.None);

        // ASSERT: Explicit room wins
        called.RoomId.Should().Be(roomB.Id);
        called.RoomOrStation.Should().Be("Room B");
    }

    #endregion

    #region 4. Inactive Room Fallback

    [Fact]
    public async Task InactiveRoom_CheckIn_FallsBackToRoomB_WhenRoomAIsInactive()
    {
        // ARRANGE: Doctor assigned to [Room A, Room B], but Room A has IsActive = false
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);

        var roomA = new Room { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, Name = "Room A", DisplayOrder = 1, IsActive = false }; // INACTIVE
        var roomB = new Room { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, Name = "Room B", DisplayOrder = 2, IsActive = true };
        await context.Rooms.AddRangeAsync(roomA, roomB);

        var doctor = new StaffMember { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, FirstName = "Clara", LastName = "Bautista", Role = StaffRole.Doctor, IsActive = true };
        doctor.SetAssignedRoomIds(new[] { roomA.Id, roomB.Id });
        await context.StaffMembers.AddAsync(doctor);
        await context.SaveChangesAsync();

        var checkInHandler = new CheckInPatientCommandHandler(
            queueRepo, apptRepo, uow, clinicContext,
            IdentityOf(clinicId, tenantId),
            Substitute.For<IPatientAppointmentPublisher>(),
            roomRepo, staffRepo);

        // ACT: Check in without room
        var checkedIn = await checkInHandler.Handle(
            new CheckInPatientCommand(
                Guid.NewGuid(),
                "Manuel Quezon",
                DoctorId: doctor.Id,
                Priority: QueuePriority.Routine),
            CancellationToken.None);

        // ASSERT: Falls back to Room B
        checkedIn.RoomId.Should().Be(roomB.Id);
        checkedIn.RoomOrStation.Should().Be("Room B");
    }

    [Fact]
    public async Task InactiveRoom_Call_FromUnassignedOrNullRoom_FallsBackToRoomB_WhenRoomAIsInactive()
    {
        // ARRANGE: Doctor assigned to [Room A, Room B], Room A is inactive
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var roomA = new Room { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, Name = "Room A", DisplayOrder = 1, IsActive = false }; // INACTIVE
        var roomB = new Room { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, Name = "Room B", DisplayOrder = 2, IsActive = true };
        await context.Rooms.AddRangeAsync(roomA, roomB);

        var doctor = new StaffMember { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, FirstName = "Clara", LastName = "Bautista", Role = StaffRole.Doctor, IsActive = true };
        doctor.SetAssignedRoomIds(new[] { roomA.Id, roomB.Id });
        await context.StaffMembers.AddAsync(doctor);

        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Sergio Osmena",
            QueueNumber = "Q-010",
            SequenceNumber = 10,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            DoctorId = doctor.Id,
            RoomId = null,
            RoomOrStation = null,
            Status = QueueStatus.Waiting,
            CheckInTime = DateTime.UtcNow
        };
        await context.QueueItems.AddAsync(queueItem);
        await context.SaveChangesAsync();

        var callHandler = new CallQueueItemCommandHandler(queueRepo, uow, clinicContext, null, roomRepo, staffRepo);

        // ACT: Doctor calls ticket
        var called = await callHandler.Handle(new CallQueueItemCommand(queueItem.Id), CancellationToken.None);

        // ASSERT: Inactive Room A skipped, falls back to Room B
        called.RoomId.Should().Be(roomB.Id);
        called.RoomOrStation.Should().Be("Room B");
    }

    [Fact]
    public async Task InactiveRoom_Call_WhenTicketWasInRoomA_AndRoomAIsDeactivated_ChecksIfFallsBackToRoomB()
    {
        // ARRANGE: Doctor assigned to [Room A, Room B].
        // Ticket was checked in to Room A.
        // Subsequently, Room A is deactivated (IsActive = false).
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var roomA = new Room { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, Name = "Room A", DisplayOrder = 1, IsActive = false }; // Deactivated
        var roomB = new Room { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, Name = "Room B", DisplayOrder = 2, IsActive = true };
        await context.Rooms.AddRangeAsync(roomA, roomB);

        var doctor = new StaffMember { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, FirstName = "Clara", LastName = "Bautista", Role = StaffRole.Doctor, IsActive = true };
        doctor.SetAssignedRoomIds(new[] { roomA.Id, roomB.Id });
        await context.StaffMembers.AddAsync(doctor);

        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Test Patient",
            QueueNumber = "Q-099",
            SequenceNumber = 99,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            DoctorId = doctor.Id,
            RoomId = roomA.Id,
            RoomOrStation = "Room A",
            Status = QueueStatus.Waiting,
            CheckInTime = DateTime.UtcNow
        };
        await context.QueueItems.AddAsync(queueItem);
        await context.SaveChangesAsync();

        var callHandler = new CallQueueItemCommandHandler(queueRepo, uow, clinicContext, null, roomRepo, staffRepo);

        // ACT
        var called = await callHandler.Handle(new CallQueueItemCommand(queueItem.Id), CancellationToken.None);

        // ASSERT: Empirical check — does it fall back to Room B or keep inactive Room A?
        called.RoomId.Should().Be(roomB.Id);
    }

    [Fact]
    public async Task InactiveRoom_CheckInAndCall_AllAssignedRoomsInactive_SafelyLeavesRoomNull()
    {
        // ARRANGE: Doctor assigned to [Room A, Room B], but BOTH are inactive
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);

        var roomA = new Room { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, Name = "Room A", DisplayOrder = 1, IsActive = false };
        var roomB = new Room { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, Name = "Room B", DisplayOrder = 2, IsActive = false };
        await context.Rooms.AddRangeAsync(roomA, roomB);

        var doctor = new StaffMember { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, FirstName = "Clara", LastName = "Bautista", Role = StaffRole.Doctor, IsActive = true };
        doctor.SetAssignedRoomIds(new[] { roomA.Id, roomB.Id });
        await context.StaffMembers.AddAsync(doctor);
        await context.SaveChangesAsync();

        var checkInHandler = new CheckInPatientCommandHandler(
            queueRepo, apptRepo, uow, clinicContext,
            IdentityOf(clinicId, tenantId),
            Substitute.For<IPatientAppointmentPublisher>(),
            roomRepo, staffRepo);

        // ACT 1: Check in
        var checkedIn = await checkInHandler.Handle(
            new CheckInPatientCommand(Guid.NewGuid(), "Ramon Magsaysay", DoctorId: doctor.Id),
            CancellationToken.None);

        // ASSERT 1: RoomId remains null
        checkedIn.RoomId.Should().BeNull();
        checkedIn.RoomOrStation.Should().BeNull();

        // ACT 2: Call ticket
        var callHandler = new CallQueueItemCommandHandler(queueRepo, uow, clinicContext, null, roomRepo, staffRepo);
        var called = await callHandler.Handle(new CallQueueItemCommand(checkedIn.Id), CancellationToken.None);

        // ASSERT 2: Zero NRE, RoomId remains null
        called.RoomId.Should().BeNull();
        called.RoomOrStation.Should().BeNull();
        called.Status.Should().Be(QueueStatus.InConsultation);
    }

    #endregion

    #region 5. Floating Doctor with 0 Assigned Rooms

    [Fact]
    public async Task FloatingDoctor_ZeroAssignedRooms_CheckInLeavesRoomNull()
    {
        // ARRANGE: Doctor with null AssignedRoomIdsJson
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);

        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            FirstName = "Floating",
            LastName = "Physician",
            Role = StaffRole.Doctor,
            IsActive = true,
            AssignedRoomIdsJson = null // 0 rooms
        };
        await context.StaffMembers.AddAsync(doctor);
        await context.SaveChangesAsync();

        var checkInHandler = new CheckInPatientCommandHandler(
            queueRepo, apptRepo, uow, clinicContext,
            IdentityOf(clinicId, tenantId),
            Substitute.For<IPatientAppointmentPublisher>(),
            roomRepo, staffRepo);

        // ACT
        var checkedIn = await checkInHandler.Handle(
            new CheckInPatientCommand(Guid.NewGuid(), "Diosdado Macapagal", DoctorId: doctor.Id),
            CancellationToken.None);

        // ASSERT
        checkedIn.RoomId.Should().BeNull();
        checkedIn.RoomOrStation.Should().BeNull();
    }

    [Fact]
    public async Task FloatingDoctor_ZeroAssignedRooms_CallDoesNotThrowNre_LeavesRoomNull()
    {
        // ARRANGE: Doctor with empty list "[]"
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            FirstName = "Floating",
            LastName = "Physician",
            Role = StaffRole.Doctor,
            IsActive = true,
            AssignedRoomIdsJson = "[]" // Empty array
        };
        await context.StaffMembers.AddAsync(doctor);

        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Carlos Garcia",
            QueueNumber = "Q-011",
            SequenceNumber = 11,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            DoctorId = doctor.Id,
            RoomId = null,
            RoomOrStation = null,
            Status = QueueStatus.Waiting,
            CheckInTime = DateTime.UtcNow
        };
        await context.QueueItems.AddAsync(queueItem);
        await context.SaveChangesAsync();

        var callHandler = new CallQueueItemCommandHandler(queueRepo, uow, clinicContext, null, roomRepo, staffRepo);

        // ACT & ASSERT: Must not throw NullReferenceException
        var called = await callHandler.Handle(new CallQueueItemCommand(queueItem.Id), CancellationToken.None);

        called.Should().NotBeNull();
        called.RoomId.Should().BeNull();
        called.RoomOrStation.Should().BeNull();
        called.Status.Should().Be(QueueStatus.InConsultation);
    }

    [Fact]
    public async Task FloatingDoctor_MalformedJson_SafelyDegradesToZeroRooms()
    {
        // ARRANGE: Doctor with malformed JSON string
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);

        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            FirstName = "Corrupt",
            LastName = "JsonDoctor",
            Role = StaffRole.Doctor,
            IsActive = true,
            AssignedRoomIdsJson = "{ broken json content: invalid }"
        };
        await context.StaffMembers.AddAsync(doctor);
        await context.SaveChangesAsync();

        var checkInHandler = new CheckInPatientCommandHandler(
            queueRepo, apptRepo, uow, clinicContext,
            IdentityOf(clinicId, tenantId),
            Substitute.For<IPatientAppointmentPublisher>(),
            roomRepo, staffRepo);

        // ACT
        var checkedIn = await checkInHandler.Handle(
            new CheckInPatientCommand(Guid.NewGuid(), "Elpidio Quirino", DoctorId: doctor.Id),
            CancellationToken.None);

        // ASSERT: Graceful recovery without throwing, room is null
        checkedIn.RoomId.Should().BeNull();

        var callHandler = new CallQueueItemCommandHandler(queueRepo, uow, clinicContext, null, roomRepo, staffRepo);
        var called = await callHandler.Handle(new CallQueueItemCommand(checkedIn.Id), CancellationToken.None);
        called.RoomId.Should().BeNull();
        called.Status.Should().Be(QueueStatus.InConsultation);
    }

    #endregion

    #region 6. Closed-Loop Procedure Execution

    [Fact]
    public async Task ClosedLoopProcedure_ResolvesDoctorActiveAssignedRoom_OnCompletion()
    {
        // ARRANGE: Doctor assigned to [Room A, Room B]. Patient is sent to Treatment Room for procedure.
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);

        var roomA = new Room { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, Name = "Room A", DisplayOrder = 1, IsActive = true };
        var roomB = new Room { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, Name = "Room B", DisplayOrder = 2, IsActive = true };
        var treatmentRoom = new Room { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, Name = "Treatment Bay", DisplayOrder = 5, IsActive = true };
        await context.Rooms.AddRangeAsync(roomA, roomB, treatmentRoom);

        var doctor = new StaffMember { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, FirstName = "Gabriel", LastName = "Reyes", Role = StaffRole.Doctor, IsActive = true };
        doctor.SetAssignedRoomIds(new[] { roomA.Id, roomB.Id });
        await context.StaffMembers.AddAsync(doctor);

        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Emilio Aguinaldo",
            QueueNumber = "Q-012",
            SequenceNumber = 12,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            DoctorId = doctor.Id,
            RoomId = treatmentRoom.Id,
            RoomOrStation = treatmentRoom.Name,
            Status = QueueStatus.PendingProcedure,
            CheckInTime = DateTime.UtcNow
        };
        await context.QueueItems.AddAsync(queueItem);

        var proc = new Procedure
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = queueItem.PatientId,
            PatientName = queueItem.PatientName,
            ProcedureName = "Wound Dressing",
            Category = "Minor Surgical",
            QueueItemId = queueItem.Id,
            OrderedByDoctorId = doctor.Id,
            OrderedByDoctorName = "Dr. Gabriel Reyes",
            ProcedureCode = "WOUND-01",
            Status = ProcedureStatus.Ordered,
            TargetRoomId = treatmentRoom.Id,
            TargetRoomName = treatmentRoom.Name
        };
        await context.Set<Procedure>().AddAsync(proc);
        await context.SaveChangesAsync();

        var recordHandler = new RecordProcedureExecutionCommandHandler(procRepo, uow, clinicContext, queueRepo, staffRepo, roomRepo);

        // ACT: Nurse completes procedure
        var result = await recordHandler.Handle(
            new RecordProcedureExecutionCommand(
                proc.Id,
                PerformedByStaffId: Guid.NewGuid(),
                PerformedByStaffName: "RN Ana",
                ClinicalNotes: "Dressing changed successfully"),
            CancellationToken.None);

        // ASSERT: Procedure completed
        result.Status.Should().Be(ProcedureStatus.Completed);

        // Ticket returned to ReEvaluation and routed back to Doctor's active assigned room (Room A)
        var refreshedQueue = await context.QueueItems.FirstAsync(q => q.Id == queueItem.Id);
        refreshedQueue.Status.Should().Be(QueueStatus.ReEvaluation);
        refreshedQueue.RoomId.Should().Be(roomA.Id);
        refreshedQueue.RoomOrStation.Should().Be("Room A");
    }

    [Fact]
    public async Task ClosedLoopProcedure_FallsBackToRoomB_WhenFirstDoctorRoomIsInactive()
    {
        // ARRANGE: Doctor assigned to [Room A, Room B], but Room A is inactive
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);

        var roomA = new Room { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, Name = "Room A", DisplayOrder = 1, IsActive = false }; // INACTIVE
        var roomB = new Room { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, Name = "Room B", DisplayOrder = 2, IsActive = true };
        var treatmentRoom = new Room { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, Name = "Treatment Bay", DisplayOrder = 5, IsActive = true };
        await context.Rooms.AddRangeAsync(roomA, roomB, treatmentRoom);

        var doctor = new StaffMember { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, FirstName = "Gabriel", LastName = "Reyes", Role = StaffRole.Doctor, IsActive = true };
        doctor.SetAssignedRoomIds(new[] { roomA.Id, roomB.Id });
        await context.StaffMembers.AddAsync(doctor);

        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Apolinario Mabini",
            QueueNumber = "Q-013",
            SequenceNumber = 13,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            DoctorId = doctor.Id,
            RoomId = treatmentRoom.Id,
            RoomOrStation = treatmentRoom.Name,
            Status = QueueStatus.PendingProcedure,
            CheckInTime = DateTime.UtcNow
        };
        await context.QueueItems.AddAsync(queueItem);

        var proc = new Procedure
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = queueItem.PatientId,
            PatientName = queueItem.PatientName,
            ProcedureName = "Nebulization",
            Category = "Nebulization",
            QueueItemId = queueItem.Id,
            OrderedByDoctorId = doctor.Id,
            Status = ProcedureStatus.Ordered,
            TargetRoomId = treatmentRoom.Id,
            TargetRoomName = treatmentRoom.Name
        };
        await context.Set<Procedure>().AddAsync(proc);
        await context.SaveChangesAsync();

        var recordHandler = new RecordProcedureExecutionCommandHandler(procRepo, uow, clinicContext, queueRepo, staffRepo, roomRepo);

        // ACT
        await recordHandler.Handle(new RecordProcedureExecutionCommand(proc.Id), CancellationToken.None);

        // ASSERT: Falls back to Room B because Room A is inactive
        var refreshedQueue = await context.QueueItems.FirstAsync(q => q.Id == queueItem.Id);
        refreshedQueue.Status.Should().Be(QueueStatus.ReEvaluation);
        refreshedQueue.RoomId.Should().Be(roomB.Id);
        refreshedQueue.RoomOrStation.Should().Be("Room B");
    }

    [Fact]
    public async Task ClosedLoopProcedure_ClearsRoomToNull_WhenDoctorIsFloatingWithZeroRooms()
    {
        // ARRANGE: Doctor has 0 assigned rooms
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);

        var treatmentRoom = new Room { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, Name = "Treatment Bay", DisplayOrder = 5, IsActive = true };
        await context.Rooms.AddAsync(treatmentRoom);

        var doctor = new StaffMember { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, FirstName = "Floating", LastName = "Doctor", Role = StaffRole.Doctor, IsActive = true, AssignedRoomIdsJson = null };
        await context.StaffMembers.AddAsync(doctor);

        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Melchora Aquino",
            QueueNumber = "Q-014",
            SequenceNumber = 14,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            DoctorId = doctor.Id,
            RoomId = treatmentRoom.Id,
            RoomOrStation = treatmentRoom.Name,
            Status = QueueStatus.PendingProcedure,
            CheckInTime = DateTime.UtcNow
        };
        await context.QueueItems.AddAsync(queueItem);

        var proc = new Procedure
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = queueItem.PatientId,
            PatientName = queueItem.PatientName,
            ProcedureName = "Nebulization",
            Category = "Nebulization",
            QueueItemId = queueItem.Id,
            OrderedByDoctorId = doctor.Id,
            Status = ProcedureStatus.Ordered,
            TargetRoomId = treatmentRoom.Id,
            TargetRoomName = treatmentRoom.Name
        };
        await context.Set<Procedure>().AddAsync(proc);
        await context.SaveChangesAsync();

        var recordHandler = new RecordProcedureExecutionCommandHandler(procRepo, uow, clinicContext, queueRepo, staffRepo, roomRepo);

        // ACT
        await recordHandler.Handle(new RecordProcedureExecutionCommand(proc.Id), CancellationToken.None);

        // ASSERT: Room is cleared to null (no longer stuck at Treatment Room)
        var refreshedQueue = await context.QueueItems.FirstAsync(q => q.Id == queueItem.Id);
        refreshedQueue.Status.Should().Be(QueueStatus.ReEvaluation);
        refreshedQueue.RoomId.Should().BeNull();
        refreshedQueue.RoomOrStation.Should().BeNull();
    }

    [Fact]
    public async Task ClosedLoopProcedure_ClearsRoomToNull_WhenAllDoctorRoomsAreInactive()
    {
        // ARRANGE: Doctor has 2 rooms, but both are inactive
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);

        var roomA = new Room { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, Name = "Room A", DisplayOrder = 1, IsActive = false };
        var roomB = new Room { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, Name = "Room B", DisplayOrder = 2, IsActive = false };
        var treatmentRoom = new Room { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, Name = "Treatment Bay", DisplayOrder = 5, IsActive = true };
        await context.Rooms.AddRangeAsync(roomA, roomB, treatmentRoom);

        var doctor = new StaffMember { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, FirstName = "Gabriel", LastName = "Reyes", Role = StaffRole.Doctor, IsActive = true };
        doctor.SetAssignedRoomIds(new[] { roomA.Id, roomB.Id });
        await context.StaffMembers.AddAsync(doctor);

        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Gabriela Silang",
            QueueNumber = "Q-015",
            SequenceNumber = 15,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            DoctorId = doctor.Id,
            RoomId = treatmentRoom.Id,
            RoomOrStation = treatmentRoom.Name,
            Status = QueueStatus.PendingProcedure,
            CheckInTime = DateTime.UtcNow
        };
        await context.QueueItems.AddAsync(queueItem);

        var proc = new Procedure
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = queueItem.PatientId,
            PatientName = queueItem.PatientName,
            ProcedureName = "Nebulization",
            Category = "Nebulization",
            QueueItemId = queueItem.Id,
            OrderedByDoctorId = doctor.Id,
            Status = ProcedureStatus.Ordered,
            TargetRoomId = treatmentRoom.Id,
            TargetRoomName = treatmentRoom.Name
        };
        await context.Set<Procedure>().AddAsync(proc);
        await context.SaveChangesAsync();

        var recordHandler = new RecordProcedureExecutionCommandHandler(procRepo, uow, clinicContext, queueRepo, staffRepo, roomRepo);

        // ACT
        await recordHandler.Handle(new RecordProcedureExecutionCommand(proc.Id), CancellationToken.None);

        // ASSERT: All doctor rooms inactive -> room is set to null
        var refreshedQueue = await context.QueueItems.FirstAsync(q => q.Id == queueItem.Id);
        refreshedQueue.Status.Should().Be(QueueStatus.ReEvaluation);
        refreshedQueue.RoomId.Should().BeNull();
        refreshedQueue.RoomOrStation.Should().BeNull();
    }

    [Fact]
    public async Task ClosedLoopProcedure_ResolvesViaOrderedByDoctorId_WhenQueueItemDoctorIdIsNull()
    {
        // ARRANGE: QueueItem has DoctorId = null, but Procedure has OrderedByDoctorId
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);

        var roomA = new Room { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, Name = "Room A", DisplayOrder = 1, IsActive = true };
        var treatmentRoom = new Room { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, Name = "Treatment Bay", DisplayOrder = 5, IsActive = true };
        await context.Rooms.AddRangeAsync(roomA, treatmentRoom);

        var doctor = new StaffMember { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, FirstName = "Antonio", LastName = "Luna", Role = StaffRole.Doctor, IsActive = true };
        doctor.SetAssignedRoomIds(new[] { roomA.Id });
        await context.StaffMembers.AddAsync(doctor);

        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Diego Silang",
            QueueNumber = "Q-016",
            SequenceNumber = 16,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            DoctorId = null, // NULL DoctorId on queue item
            RoomId = treatmentRoom.Id,
            RoomOrStation = treatmentRoom.Name,
            Status = QueueStatus.PendingProcedure,
            CheckInTime = DateTime.UtcNow
        };
        await context.QueueItems.AddAsync(queueItem);

        var proc = new Procedure
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = queueItem.PatientId,
            PatientName = queueItem.PatientName,
            ProcedureName = "Nebulization",
            Category = "Nebulization",
            QueueItemId = queueItem.Id,
            OrderedByDoctorId = doctor.Id, // Set on procedure
            Status = ProcedureStatus.Ordered,
            TargetRoomId = treatmentRoom.Id,
            TargetRoomName = treatmentRoom.Name
        };
        await context.Set<Procedure>().AddAsync(proc);
        await context.SaveChangesAsync();

        var recordHandler = new RecordProcedureExecutionCommandHandler(procRepo, uow, clinicContext, queueRepo, staffRepo, roomRepo);

        // ACT
        await recordHandler.Handle(new RecordProcedureExecutionCommand(proc.Id), CancellationToken.None);

        // ASSERT: Resolves via OrderedByDoctorId to Room A
        var refreshedQueue = await context.QueueItems.FirstAsync(q => q.Id == queueItem.Id);
        refreshedQueue.Status.Should().Be(QueueStatus.ReEvaluation);
        refreshedQueue.RoomId.Should().Be(roomA.Id);
        refreshedQueue.RoomOrStation.Should().Be("Room A");
    }

    [Fact]
    public async Task ClosedLoopProcedure_LeavesQueueItemUntouched_WhenStatusIsNotPendingProcedure()
    {
        // ARRANGE: Queue item is in Waiting status, NOT PendingProcedure
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);

        var roomA = new Room { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, Name = "Room A", DisplayOrder = 1, IsActive = true };
        var treatmentRoom = new Room { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, Name = "Treatment Bay", DisplayOrder = 5, IsActive = true };
        await context.Rooms.AddRangeAsync(roomA, treatmentRoom);

        var doctor = new StaffMember { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, FirstName = "Antonio", LastName = "Luna", Role = StaffRole.Doctor, IsActive = true };
        doctor.SetAssignedRoomIds(new[] { roomA.Id });
        await context.StaffMembers.AddAsync(doctor);

        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Diego Silang",
            QueueNumber = "Q-017",
            SequenceNumber = 17,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            DoctorId = doctor.Id,
            RoomId = null,
            RoomOrStation = null,
            Status = QueueStatus.Waiting, // WAITING, not PendingProcedure
            CheckInTime = DateTime.UtcNow
        };
        await context.QueueItems.AddAsync(queueItem);

        var proc = new Procedure
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = queueItem.PatientId,
            PatientName = queueItem.PatientName,
            ProcedureName = "Nebulization",
            Category = "Nebulization",
            QueueItemId = queueItem.Id,
            OrderedByDoctorId = doctor.Id,
            Status = ProcedureStatus.Ordered,
            TargetRoomId = treatmentRoom.Id,
            TargetRoomName = treatmentRoom.Name
        };
        await context.Set<Procedure>().AddAsync(proc);
        await context.SaveChangesAsync();

        var recordHandler = new RecordProcedureExecutionCommandHandler(procRepo, uow, clinicContext, queueRepo, staffRepo, roomRepo);

        // ACT
        var result = await recordHandler.Handle(new RecordProcedureExecutionCommand(proc.Id), CancellationToken.None);

        // ASSERT: Procedure completes, but queue item status remains Waiting and Room remains null
        result.Status.Should().Be(ProcedureStatus.Completed);
        var refreshedQueue = await context.QueueItems.FirstAsync(q => q.Id == queueItem.Id);
        refreshedQueue.Status.Should().Be(QueueStatus.Waiting);
        refreshedQueue.RoomId.Should().BeNull();
    }

    #endregion

    #region 7. Cross-Tenant & Clinic Isolation

    [Fact]
    public async Task MultiTenant_CrossRoomIsolation_NeverAssignsRoomFromDifferentClinic()
    {
        // ARRANGE: Doctor in Clinic 1 is assigned a room from Clinic 2
        var clinic1Id = Guid.NewGuid();
        var clinic2Id = Guid.NewGuid();
        var tenantId = "tenant_isolation";

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinic1Id); // Caller is Clinic 1
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);

        // Room 1 belongs to Clinic 1, Room 2 belongs to Clinic 2
        var room1 = new Room { Id = Guid.NewGuid(), ClinicId = clinic1Id, TenantId = tenantId, Name = "Clinic 1 Room", DisplayOrder = 1, IsActive = true };
        var room2 = new Room { Id = Guid.NewGuid(), ClinicId = clinic2Id, TenantId = tenantId, Name = "Clinic 2 Room", DisplayOrder = 1, IsActive = true };
        await context.Rooms.AddRangeAsync(room1, room2);

        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            ClinicId = clinic1Id,
            TenantId = tenantId,
            FirstName = "Cross",
            LastName = "ClinicDoctor",
            Role = StaffRole.Doctor,
            IsActive = true
        };
        // Corrupted assignment: contains room2 (which belongs to clinic2)
        doctor.SetAssignedRoomIds(new[] { room2.Id, room1.Id });
        await context.StaffMembers.AddAsync(doctor);
        await context.SaveChangesAsync();

        var checkInHandler = new CheckInPatientCommandHandler(
            queueRepo, apptRepo, uow, clinicContext,
            IdentityOf(clinic1Id, tenantId),
            Substitute.For<IPatientAppointmentPublisher>(),
            roomRepo, staffRepo);

        // ACT: Check in
        var checkedIn = await checkInHandler.Handle(
            new CheckInPatientCommand(Guid.NewGuid(), "Marcelo del Pilar", DoctorId: doctor.Id),
            CancellationToken.None);

        // ASSERT: Room 2 is quarantined because it belongs to Clinic 2. Check-in resolves to Room 1!
        checkedIn.RoomId.Should().Be(room1.Id);
        checkedIn.RoomOrStation.Should().Be("Clinic 1 Room");
    }

    [Fact]
    public async Task Call_ResolvesDoctorFromClinicContextStaffId_WhenCommandAndItemDoctorIdAreNull()
    {
        // ARRANGE: Neither queue item nor call command has DoctorId, but ClinicContext has StaffId
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var roomA = new Room { Id = Guid.NewGuid(), ClinicId = clinicId, TenantId = tenantId, Name = "Room A", DisplayOrder = 1, IsActive = true };
        await context.Rooms.AddAsync(roomA);

        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            FirstName = "Context",
            LastName = "Physician",
            Role = StaffRole.Doctor,
            IsActive = true
        };
        doctor.SetAssignedRoomIds(new[] { roomA.Id });
        await context.StaffMembers.AddAsync(doctor);

        clinicContext.StaffId.Returns(doctor.Id); // Logged in practitioner is the doctor

        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Unassigned Patient",
            QueueNumber = "Q-018",
            SequenceNumber = 18,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            DoctorId = null, // DoctorId is NULL
            RoomId = null,
            RoomOrStation = null,
            Status = QueueStatus.Waiting,
            CheckInTime = DateTime.UtcNow
        };
        await context.QueueItems.AddAsync(queueItem);
        await context.SaveChangesAsync();

        var callHandler = new CallQueueItemCommandHandler(queueRepo, uow, clinicContext, null, roomRepo, staffRepo);

        // ACT: Call without DoctorId
        var called = await callHandler.Handle(new CallQueueItemCommand(queueItem.Id, DoctorId: null), CancellationToken.None);

        // ASSERT: Resolves calling doctor from ClinicContext.StaffId and assigns Room A
        called.RoomId.Should().Be(roomA.Id);
        called.RoomOrStation.Should().Be("Room A");
    }

    #endregion
}
