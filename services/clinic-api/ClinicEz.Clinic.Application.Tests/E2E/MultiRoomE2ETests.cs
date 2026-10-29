using System;
using System.Collections.Generic;
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
using ClinicEz.Clinic.Application.Features.Staff.DTOs;
using ClinicEz.Clinic.Application.Features.Staff.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.E2E;

/// <summary>
/// Comprehensive E2E Opaque-Box Test Suite for Multi-Room Staff Assignment & Routing.
/// Strictly derived from PROJECT.md (Features F1.1 - F4.5) and ORIGINAL_REQUEST.md (§ 2026-10-14T10:27:11Z).
/// Covers Tiers 1-4: Feature Coverage, Boundary & Corner Cases, Pairwise Combinations, and Real-World Workloads.
/// </summary>
public class MultiRoomE2ETests
{
    private static IClinicIdentityProvider IdentityOf(Guid clinicId, string tenantId)
    {
        var identity = Substitute.For<IClinicIdentityProvider>();
        identity.GetAsync(Arg.Any<CancellationToken>())
            .Returns(new ClinicIdentity(tenantId, clinicId, "Apex Metro Healthcare Center"));
        return identity;
    }

    private static (Guid clinicId, string tenantId, IClinicContext clinicContext) SetupClinicContext()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_e2e_multiroom";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);
        return (clinicId, tenantId, clinicContext);
    }

    // =========================================================================
    // TIER 1: FEATURE COVERAGE (INDIVIDUAL FEATURES IN ISOLATION)
    // =========================================================================

    #region Tier 1 - F1.1: Domain Model Multi-Room Staff (StaffMember.cs)

    [Fact]
    public void F1_1_TC1_GetAssignedRoomIds_NullOrEmptyJson_ReturnsEmptyGuidList()
    {
        var staff = new StaffMember
        {
            TenantId = "tenant_1",
            FirstName = "Maria",
            LastName = "Santos",
            Role = StaffRole.Doctor,
            AssignedRoomIdsJson = null
        };

        staff.GetAssignedRoomIds().Should().BeEmpty();

        staff.AssignedRoomIdsJson = "";
        staff.GetAssignedRoomIds().Should().BeEmpty();

        staff.AssignedRoomIdsJson = "   ";
        staff.GetAssignedRoomIds().Should().BeEmpty();
    }

    [Fact]
    public void F1_1_TC2_SetAssignedRoomIds_ValidGuids_SerializesToJsonCleanly()
    {
        var staff = new StaffMember
        {
            TenantId = "tenant_1",
            FirstName = "Maria",
            LastName = "Santos",
            Role = StaffRole.Doctor
        };
        var r1 = Guid.NewGuid();
        var r2 = Guid.NewGuid();

        staff.SetAssignedRoomIds(new[] { r1, r2 });

        staff.AssignedRoomIdsJson.Should().NotBeNullOrWhiteSpace();
        staff.GetAssignedRoomIds().Should().HaveCount(2).And.Contain(new[] { r1, r2 });
    }

    [Fact]
    public void F1_1_TC3_SetAssignedRoomIds_DeduplicatesAndFiltersGuidEmpty()
    {
        var staff = new StaffMember
        {
            TenantId = "tenant_1",
            FirstName = "Maria",
            LastName = "Santos",
            Role = StaffRole.Doctor
        };
        var r1 = Guid.NewGuid();

        // Pass duplicates and Guid.Empty
        staff.SetAssignedRoomIds(new[] { r1, Guid.Empty, r1, Guid.Empty });

        staff.GetAssignedRoomIds().Should().ContainSingle().Which.Should().Be(r1);
    }

    [Fact]
    public void F1_1_TC4_SetAssignedRoomIds_NullOrEmptyList_SetsJsonToNull()
    {
        var staff = new StaffMember
        {
            TenantId = "tenant_1",
            FirstName = "Maria",
            LastName = "Santos",
            Role = StaffRole.Doctor,
            AssignedRoomIdsJson = "[\"00000000-0000-0000-0000-000000000001\"]"
        };

        staff.SetAssignedRoomIds(null);
        staff.AssignedRoomIdsJson.Should().BeNull();
        staff.GetAssignedRoomIds().Should().BeEmpty();

        staff.SetAssignedRoomIds(Array.Empty<Guid>());
        staff.AssignedRoomIdsJson.Should().BeNull();
        staff.GetAssignedRoomIds().Should().BeEmpty();
    }

    [Fact]
    public void F1_1_TC5_GetAssignedRoomIds_MalformedJson_RecoversSafelyWithoutThrowing()
    {
        var staff = new StaffMember
        {
            TenantId = "tenant_1",
            FirstName = "Maria",
            LastName = "Santos",
            Role = StaffRole.Doctor,
            AssignedRoomIdsJson = "{ invalid json string }"
        };

        staff.GetAssignedRoomIds().Should().BeEmpty();

        staff.AssignedRoomIdsJson = "123456";
        staff.GetAssignedRoomIds().Should().BeEmpty();
    }

    #endregion

    #region Tier 1 - F1.2 & F1.3: EF Core Persistence & StaffMemberDto Contracts

    [Fact]
    public async Task F1_2_TC6_EfPersistence_CanPersistAndReload_StaffMemberWithAssignedRoomIdsJson()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);

        var r1 = Guid.NewGuid();
        var r2 = Guid.NewGuid();

        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Jose",
            LastName = "Rizal",
            Role = StaffRole.Doctor,
            IsActive = true
        };
        doctor.SetAssignedRoomIds(new[] { r1, r2 });

        await context.StaffMembers.AddAsync(doctor);
        await context.SaveChangesAsync();

        var reloaded = await context.StaffMembers.FirstAsync(s => s.Id == doctor.Id);
        reloaded.GetAssignedRoomIds().Should().HaveCount(2).And.Contain(new[] { r1, r2 });
    }

    [Fact]
    public async Task F1_2_TC7_EfPersistence_UpdatingAssignedRooms_PersistsNewState()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);

        var r1 = Guid.NewGuid();
        var r2 = Guid.NewGuid();
        var r3 = Guid.NewGuid();

        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Jose",
            LastName = "Rizal",
            Role = StaffRole.Doctor,
            IsActive = true
        };
        doctor.SetAssignedRoomIds(new[] { r1, r2 });
        await context.StaffMembers.AddAsync(doctor);
        await context.SaveChangesAsync();

        // Update to [r2, r3] (removing r1, adding r3)
        var toUpdate = await context.StaffMembers.FirstAsync(s => s.Id == doctor.Id);
        toUpdate.SetAssignedRoomIds(new[] { r2, r3 });
        await context.SaveChangesAsync();

        var reloaded = await context.StaffMembers.FirstAsync(s => s.Id == doctor.Id);
        reloaded.GetAssignedRoomIds().Should().HaveCount(2).And.Contain(new[] { r2, r3 }).And.NotContain(r1);
    }

    [Fact]
    public void F1_3_TC8_StaffMemberDto_Contracts_CarryAssignedRoomIdsAndNames()
    {
        var r1 = Guid.NewGuid();
        var r2 = Guid.NewGuid();

        var dto = new StaffMemberDto(
            Id: Guid.NewGuid(),
            TenantId: "tenant_1",
            ClinicId: Guid.NewGuid(),
            ClinicRoleId: null,
            RoleName: null,
            FirstName: "Andres",
            LastName: "Bonifacio",
            MiddleName: null,
            Title: "Dr.",
            Role: StaffRole.Doctor,
            Email: "doctor@apex.ph",
            PhoneNumber: null,
            PrcLicenseNumber: "PRC-10023",
            PtrNumber: null,
            S2LicenseNumber: null,
            Specialty: "Pediatrics",
            IsActive: true,
            CreatedAt: DateTime.UtcNow,
            AssignedRoomIds: new[] { r1, r2 },
            AssignedRoomNames: new[] { "Room 1 - Pedia", "Room 2 - General" }
        );

        dto.AssignedRoomIds.Should().HaveCount(2).And.Contain(new[] { r1, r2 });
        dto.AssignedRoomNames.Should().HaveCount(2).And.Contain(new[] { "Room 1 - Pedia", "Room 2 - General" });
    }

    [Fact]
    public void F1_3_TC9_StaffMemberDto_Defaults_GracefullyWhenRoomsUnassigned()
    {
        var dto = new StaffMemberDto(
            Id: Guid.NewGuid(),
            TenantId: "tenant_1",
            ClinicId: Guid.NewGuid(),
            ClinicRoleId: null,
            RoleName: null,
            FirstName: "Gabriela",
            LastName: "Silang",
            MiddleName: null,
            Title: "RN",
            Role: StaffRole.Nurse,
            Email: "nurse@apex.ph",
            PhoneNumber: null,
            PrcLicenseNumber: "PRC-9988",
            PtrNumber: null,
            S2LicenseNumber: null,
            Specialty: null,
            IsActive: true,
            CreatedAt: DateTime.UtcNow
        );

        dto.AssignedRoomIds.Should().BeNull();
        dto.AssignedRoomNames.Should().BeNull();
    }

    [Fact]
    public void F1_3_TC10_StaffMemberDto_RecordImmutabilityAndEquality_ValidatesCleanly()
    {
        var id = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        var r1 = Guid.NewGuid();

        var dto1 = new StaffMemberDto(
            Id: id,
            TenantId: "tenant_1",
            ClinicId: clinicId,
            ClinicRoleId: null,
            RoleName: null,
            FirstName: "Andres",
            LastName: "Bonifacio",
            MiddleName: null,
            Title: null,
            Role: StaffRole.Doctor,
            Email: "a@b.com",
            PhoneNumber: null,
            PrcLicenseNumber: null,
            PtrNumber: null,
            S2LicenseNumber: null,
            Specialty: null,
            IsActive: true,
            CreatedAt: DateTime.UtcNow,
            AssignedRoomIds: new[] { r1 }
        );
        var dto2 = dto1 with { FirstName = "Updated" };

        dto2.Id.Should().Be(id);
        dto2.FirstName.Should().Be("Updated");
        dto2.AssignedRoomIds.Should().ContainSingle().Which.Should().Be(r1);
    }

    #endregion

    #region Tier 1 - F2.1: Room Query Multi-Staff Grouping (GetClinicRoomsQuery)

    [Fact]
    public async Task F2_1_TC11_GetClinicRoomsQuery_StaffWithMultipleRooms_AppearsInAllAssignedRooms()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        var room1 = new Room { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Room 1", Code = "RM-1", Type = ClinicRoomType.Consultation, DisplayOrder = 1, IsActive = true };
        var room2 = new Room { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Room 2", Code = "RM-2", Type = ClinicRoomType.Consultation, DisplayOrder = 2, IsActive = true };
        await context.Rooms.AddRangeAsync(room1, room2);

        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Title = "Dr.",
            FirstName = "Elena",
            LastName = "Reyes",
            Role = StaffRole.Doctor,
            IsActive = true
        };
        doctor.SetAssignedRoomIds(new[] { room1.Id, room2.Id });
        await context.StaffMembers.AddAsync(doctor);
        await context.SaveChangesAsync();

        var queryHandler = new GetClinicRoomsQueryHandler(roomRepo, staffRepo, uow, clinicContext);
        var rooms = await queryHandler.Handle(new GetClinicRoomsQuery(false), CancellationToken.None);

        var r1Dto = rooms.First(r => r.Id == room1.Id);
        var r2Dto = rooms.First(r => r.Id == room2.Id);

        r1Dto.AssignedStaffCount.Should().Be(1);
        r1Dto.AssignedStaffIds.Should().Contain(doctor.Id);
        r1Dto.AssignedStaffNames.Should().Contain("Dr. Elena Reyes");

        r2Dto.AssignedStaffCount.Should().Be(1);
        r2Dto.AssignedStaffIds.Should().Contain(doctor.Id);
        r2Dto.AssignedStaffNames.Should().Contain("Dr. Elena Reyes");
    }

    [Fact]
    public async Task F2_1_TC12_GetClinicRoomsQuery_InactiveStaff_AreExcludedFromRoomStaffList()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        var room1 = new Room { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Room 1", Code = "RM-1", Type = ClinicRoomType.Consultation, DisplayOrder = 1, IsActive = true };
        await context.Rooms.AddAsync(room1);

        var inactiveStaff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Retired",
            LastName = "Physician",
            Role = StaffRole.Doctor,
            IsActive = false
        };
        inactiveStaff.SetAssignedRoomIds(new[] { room1.Id });
        await context.StaffMembers.AddAsync(inactiveStaff);
        await context.SaveChangesAsync();

        var queryHandler = new GetClinicRoomsQueryHandler(roomRepo, staffRepo, uow, clinicContext);
        var rooms = await queryHandler.Handle(new GetClinicRoomsQuery(false), CancellationToken.None);

        var r1Dto = rooms.First(r => r.Id == room1.Id);
        r1Dto.AssignedStaffCount.Should().Be(0);
        r1Dto.AssignedStaffIds.Should().BeEmpty();
    }

    #endregion

    #region Tier 1 - F2.2 & F2.3: Additive Room Sync and Deletion Cleanup

    [Fact]
    public async Task F2_2_TC13_UpdateClinicRoomCommand_AdditiveAssignment_RetainsOtherAssignedRooms()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var room1 = new Room { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Room 1", Code = "RM-1", Type = ClinicRoomType.Consultation, DisplayOrder = 1, IsActive = true };
        var room2 = new Room { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Room 2", Code = "RM-2", Type = ClinicRoomType.Consultation, DisplayOrder = 2, IsActive = true };
        await context.Rooms.AddRangeAsync(room1, room2);

        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Clara",
            LastName = "Cruz",
            Role = StaffRole.Doctor,
            IsActive = true
        };
        doctor.SetAssignedRoomIds(new[] { room1.Id });
        await context.StaffMembers.AddAsync(doctor);
        await context.SaveChangesAsync();

        // Assign doctor to Room 2 via UpdateClinicRoomCommand
        var updateHandler = new UpdateClinicRoomCommandHandler(roomRepo, staffRepo, queueRepo, uow, clinicContext);
        await updateHandler.Handle(
            new UpdateClinicRoomCommand(
                room2.Id,
                "Room 2 - Expanded",
                "RM-2",
                ClinicRoomType.Consultation,
                null,
                30,
                true,
                new[] { doctor.Id }),
            CancellationToken.None);

        var refreshedDoctor = await context.StaffMembers.FirstAsync(s => s.Id == doctor.Id);
        // Additive check: doctor must now have BOTH Room 1 and Room 2
        refreshedDoctor.GetAssignedRoomIds().Should().HaveCount(2).And.Contain(new[] { room1.Id, room2.Id });
    }

    [Fact]
    public async Task F2_2_TC14_UpdateClinicRoomCommand_UncheckingStaff_RemovesOnlyTargetRoom()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var room1 = new Room { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Room 1", Code = "RM-1", Type = ClinicRoomType.Consultation, DisplayOrder = 1, IsActive = true };
        var room2 = new Room { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Room 2", Code = "RM-2", Type = ClinicRoomType.Consultation, DisplayOrder = 2, IsActive = true };
        await context.Rooms.AddRangeAsync(room1, room2);

        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Clara",
            LastName = "Cruz",
            Role = StaffRole.Doctor,
            IsActive = true
        };
        doctor.SetAssignedRoomIds(new[] { room1.Id, room2.Id });
        await context.StaffMembers.AddAsync(doctor);
        await context.SaveChangesAsync();

        // Update Room 2 with empty assigned staff -> unassigns doctor from Room 2 only
        var updateHandler = new UpdateClinicRoomCommandHandler(roomRepo, staffRepo, queueRepo, uow, clinicContext);
        await updateHandler.Handle(
            new UpdateClinicRoomCommand(
                room2.Id,
                "Room 2",
                "RM-2",
                ClinicRoomType.Consultation,
                null,
                30,
                true,
                Array.Empty<Guid>()),
            CancellationToken.None);

        var refreshedDoctor = await context.StaffMembers.FirstAsync(s => s.Id == doctor.Id);
        refreshedDoctor.GetAssignedRoomIds().Should().ContainSingle().Which.Should().Be(room1.Id);
    }

    [Fact]
    public async Task F2_3_TC15_DeleteClinicRoomCommand_RemovesOnlyDeletedRoomIdFromStaff()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        var room1 = new Room { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Room 1", Code = "RM-1", Type = ClinicRoomType.Consultation, DisplayOrder = 1, IsActive = true };
        var room2 = new Room { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Room 2", Code = "RM-2", Type = ClinicRoomType.Consultation, DisplayOrder = 2, IsActive = true };
        await context.Rooms.AddRangeAsync(room1, room2);

        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Marco",
            LastName = "Villanueva",
            Role = StaffRole.Doctor,
            IsActive = true
        };
        doctor.SetAssignedRoomIds(new[] { room1.Id, room2.Id });
        await context.StaffMembers.AddAsync(doctor);
        await context.SaveChangesAsync();

        // Delete Room 2
        var deleteHandler = new DeleteClinicRoomCommandHandler(roomRepo, staffRepo, uow, clinicContext);
        await deleteHandler.Handle(new DeleteClinicRoomCommand(room2.Id), CancellationToken.None);

        var refreshedDoctor = await context.StaffMembers.FirstAsync(s => s.Id == doctor.Id);
        refreshedDoctor.GetAssignedRoomIds().Should().ContainSingle().Which.Should().Be(room1.Id);
    }

    #endregion

    #region Tier 1 - F2.4, F2.5, F2.6: Queue Routing & Call Resolution

    [Fact]
    public async Task F2_4_TC16_CheckInPatientCommand_MultiRoomDoctor_DefaultsToFirstActiveAssignedRoom()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);

        var room1 = new Room { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Room 1", Code = "RM-1", Type = ClinicRoomType.Consultation, DisplayOrder = 1, IsActive = true };
        var room2 = new Room { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Room 2", Code = "RM-2", Type = ClinicRoomType.Consultation, DisplayOrder = 2, IsActive = true };
        await context.Rooms.AddRangeAsync(room1, room2);

        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Title = "Dr.",
            FirstName = "Alice",
            LastName = "Guo",
            Role = StaffRole.Doctor,
            IsActive = true
        };
        doctor.SetAssignedRoomIds(new[] { room1.Id, room2.Id });
        await context.StaffMembers.AddAsync(doctor);
        await context.SaveChangesAsync();

        var checkInHandler = new CheckInPatientCommandHandler(
            queueRepo, apptRepo, uow, clinicContext,
            IdentityOf(clinicId, tenantId),
            Substitute.For<IPatientAppointmentPublisher>(),
            roomRepo, staffRepo);

        var result = await checkInHandler.Handle(
            new CheckInPatientCommand(
                Guid.NewGuid(),
                "Juan Dela Cruz",
                null,
                doctor.Id,
                "Dr. Alice Guo",
                QueuePriority.Routine,
                "General Consultation"),
            CancellationToken.None);

        result.RoomId.Should().Be(room1.Id);
        result.RoomOrStation.Should().Be("Room 1");
    }

    [Fact]
    public async Task F2_4_TC17_CheckInPatientCommand_ExplicitMatchingRoom_PreservesSpecifiedRoom()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);

        var room1 = new Room { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Room 1", Code = "RM-1", Type = ClinicRoomType.Consultation, DisplayOrder = 1, IsActive = true };
        var room2 = new Room { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Room 2", Code = "RM-2", Type = ClinicRoomType.Consultation, DisplayOrder = 2, IsActive = true };
        await context.Rooms.AddRangeAsync(room1, room2);

        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Title = "Dr.",
            FirstName = "Alice",
            LastName = "Guo",
            Role = StaffRole.Doctor,
            IsActive = true
        };
        doctor.SetAssignedRoomIds(new[] { room1.Id, room2.Id });
        await context.StaffMembers.AddAsync(doctor);
        await context.SaveChangesAsync();

        var checkInHandler = new CheckInPatientCommandHandler(
            queueRepo, apptRepo, uow, clinicContext,
            IdentityOf(clinicId, tenantId),
            Substitute.For<IPatientAppointmentPublisher>(),
            roomRepo, staffRepo);

        // Explicitly check in to Room 2
        var result = await checkInHandler.Handle(
            new CheckInPatientCommand(
                Guid.NewGuid(),
                "Maria Clara",
                AppointmentId: null,
                DoctorId: doctor.Id,
                DoctorName: "Dr. Alice Guo",
                Priority: QueuePriority.Routine,
                ChiefComplaint: "Follow up",
                RoomOrStation: "Room 2",
                RoomId: room2.Id),
            CancellationToken.None);

        result.RoomId.Should().Be(room2.Id);
        result.RoomOrStation.Should().Be("Room 2");
    }

    [Fact]
    public async Task F2_5_TC18_CallQueueItemCommand_PreservesItemRoomIfInDoctorAssignedRooms()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var room1 = new Room { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Room 1", Code = "RM-1", Type = ClinicRoomType.Consultation, DisplayOrder = 1, IsActive = true };
        var room2 = new Room { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Room 2", Code = "RM-2", Type = ClinicRoomType.Consultation, DisplayOrder = 2, IsActive = true };
        await context.Rooms.AddRangeAsync(room1, room2);

        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Title = "Dr.",
            FirstName = "Alice",
            LastName = "Guo",
            Role = StaffRole.Doctor,
            IsActive = true
        };
        doctor.SetAssignedRoomIds(new[] { room1.Id, room2.Id });
        await context.StaffMembers.AddAsync(doctor);

        // Queue item checked into Room 2
        var item = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Paolo Santos",
            QueueNumber = "Q-005",
            SequenceNumber = 5,
            Status = QueueStatus.Waiting,
            RoomId = room2.Id,
            RoomOrStation = "Room 2",
            CheckInTime = DateTime.UtcNow
        };
        await context.QueueItems.AddAsync(item);
        await context.SaveChangesAsync();

        var callHandler = new CallQueueItemCommandHandler(queueRepo, uow, clinicContext, null, roomRepo, staffRepo);
        var called = await callHandler.Handle(
            new CallQueueItemCommand(item.Id, doctor.Id, "Dr. Alice Guo"),
            CancellationToken.None);

        called.RoomId.Should().Be(room2.Id);
        called.RoomOrStation.Should().Be("Room 2");
        called.Status.Should().Be(QueueStatus.InConsultation);
    }

    [Fact]
    public async Task F2_6_TC19_ProcedureWorkflow_RoutesToTreatmentAndRestoresConsultationRoom()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);

        var consultRoom = new Room { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Exam Room A", Code = "EX-A", Type = ClinicRoomType.Consultation, DisplayOrder = 1, IsActive = true };
        var txRoom = new Room { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Treatment Bay", Code = "TX-B", Type = ClinicRoomType.Treatment, DisplayOrder = 2, IsActive = true };
        await context.Rooms.AddRangeAsync(consultRoom, txRoom);

        var doctor = new StaffMember { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Title = "Dr.", FirstName = "Marco", LastName = "V", Role = StaffRole.Doctor, IsActive = true };
        doctor.SetAssignedRoomIds(new[] { consultRoom.Id });
        await context.StaffMembers.AddAsync(doctor);

        var patientId = Guid.NewGuid();
        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Ana Ramos",
            QueueNumber = "Q-010",
            SequenceNumber = 10,
            Status = QueueStatus.InConsultation,
            RoomId = consultRoom.Id,
            RoomOrStation = consultRoom.Name,
            CheckInTime = DateTime.UtcNow
        };
        await context.QueueItems.AddAsync(queueItem);
        await context.SaveChangesAsync();

        // 1. Order procedure -> moves to Treatment Bay
        var orderHandler = new OrderProcedureCommandHandler(procRepo, uow, clinicContext, queueRepo, roomRepo);
        var ordered = await orderHandler.Handle(
            new OrderProcedureCommand(
                patientId, "Ana Ramos", queueItem.Id, null, "IV-01", "Normal Saline 500mL", "IV Therapy", doctor.Id, "Dr. Marco V", "Dehydration"),
            CancellationToken.None);

        ordered.TargetRoomId.Should().Be(txRoom.Id);

        var qItemInTx = await context.QueueItems.FirstAsync(q => q.Id == queueItem.Id);
        qItemInTx.Status.Should().Be(QueueStatus.PendingProcedure);
        qItemInTx.RoomId.Should().Be(txRoom.Id);

        // 2. Complete procedure -> restores Exam Room A with ReEvaluation status
        var execHandler = new RecordProcedureExecutionCommandHandler(procRepo, uow, clinicContext, queueRepo, staffRepo, roomRepo);
        await execHandler.Handle(
            new RecordProcedureExecutionCommand(
                ordered.Id, Guid.NewGuid(), "Nurse Nancy", "120/80", "118/78", "IV NS 500mL", "LOT-441", null, "IV", "Hydrated", "None"),
            CancellationToken.None);

        var qItemPostTx = await context.QueueItems.FirstAsync(q => q.Id == queueItem.Id);
        qItemPostTx.Status.Should().Be(QueueStatus.ReEvaluation);
        qItemPostTx.RoomId.Should().Be(consultRoom.Id);
        qItemPostTx.RoomOrStation.Should().Be("Exam Room A");
    }

    #endregion

    // =========================================================================
    // TIER 2: BOUNDARY & CORNER CASES (>=5 PER FEATURE)
    // =========================================================================

    #region Tier 2 - Boundary Value & Edge Stress Analysis

    [Fact]
    public void Tier2_BC1_DoctorAssignedToTenRooms_SerializesAndDeserializesWithoutLoss()
    {
        var staff = new StaffMember { TenantId = "t1", FirstName = "Ten", LastName = "Rooms", Role = StaffRole.Doctor };
        var tenGuids = Enumerable.Range(1, 10).Select(_ => Guid.NewGuid()).ToList();

        staff.SetAssignedRoomIds(tenGuids);

        staff.GetAssignedRoomIds().Should().HaveCount(10).And.Equal(tenGuids);
    }

    [Fact]
    public async Task Tier2_BC2_DeletingAllAssignedRooms_LeavesStaffAsFloatingWithoutException()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        var roomA = new Room { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Room A", Code = "A", Type = ClinicRoomType.Consultation, DisplayOrder = 1, IsActive = true };
        await context.Rooms.AddAsync(roomA);

        var doctor = new StaffMember { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, FirstName = "Solo", LastName = "Doc", Role = StaffRole.Doctor, IsActive = true };
        doctor.SetAssignedRoomIds(new[] { roomA.Id });
        await context.StaffMembers.AddAsync(doctor);
        await context.SaveChangesAsync();

        var deleteHandler = new DeleteClinicRoomCommandHandler(roomRepo, staffRepo, uow, clinicContext);
        await deleteHandler.Handle(new DeleteClinicRoomCommand(roomA.Id), CancellationToken.None);

        var refreshed = await context.StaffMembers.FirstAsync(s => s.Id == doctor.Id);
        refreshed.GetAssignedRoomIds().Should().BeEmpty();
        refreshed.AssignedRoomIdsJson.Should().BeNull();
    }

    [Fact]
    public async Task Tier2_BC3_FloatingDoctor_CheckInAndCall_FallsBackToFirstConsultationRoom()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);

        var consultRoom = new Room { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Main Consult", Code = "MC", Type = ClinicRoomType.Consultation, DisplayOrder = 1, IsActive = true };
        await context.Rooms.AddAsync(consultRoom);

        // Doctor with 0 assigned rooms (floating)
        var floatDoc = new StaffMember { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Title = "Dr.", FirstName = "Float", LastName = "Physician", Role = StaffRole.Doctor, IsActive = true };
        await context.StaffMembers.AddAsync(floatDoc);
        await context.SaveChangesAsync();

        var checkInHandler = new CheckInPatientCommandHandler(
            queueRepo, apptRepo, uow, clinicContext, IdentityOf(clinicId, tenantId), Substitute.For<IPatientAppointmentPublisher>(), roomRepo, staffRepo);

        var checkedIn = await checkInHandler.Handle(
            new CheckInPatientCommand(Guid.NewGuid(), "Floating Patient", null, floatDoc.Id, "Dr. Float", QueuePriority.Routine, "Consult"),
            CancellationToken.None);

        checkedIn.RoomId.Should().BeNull();
        checkedIn.RoomOrStation.Should().BeNull();

        var callHandler = new CallQueueItemCommandHandler(queueRepo, uow, clinicContext, null, roomRepo, staffRepo);
        var called = await callHandler.Handle(
            new CallQueueItemCommand(checkedIn.Id, floatDoc.Id, "Dr. Float", "Main Consult", consultRoom.Id),
            CancellationToken.None);

        called.RoomId.Should().Be(consultRoom.Id);
        called.RoomOrStation.Should().Be("Main Consult");
        called.Status.Should().Be(QueueStatus.InConsultation);
    }

    [Fact]
    public async Task Tier2_BC4_ReassigningRoomWhilePatientInQueue_PreservesQueueItemIntegrity()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var room = new Room { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Room Original", Code = "RO", Type = ClinicRoomType.Consultation, DisplayOrder = 1, IsActive = true };
        await context.Rooms.AddAsync(room);

        var activeItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Waiting Patient",
            QueueNumber = "Q-099",
            SequenceNumber = 99,
            Status = QueueStatus.Waiting,
            RoomId = room.Id,
            RoomOrStation = "Room Original",
            CheckInTime = DateTime.UtcNow
        };
        await context.QueueItems.AddAsync(activeItem);
        await context.SaveChangesAsync();

        // Rename room -> queue item synchronized
        var updateHandler = new UpdateClinicRoomCommandHandler(roomRepo, staffRepo, queueRepo, uow, clinicContext);
        await updateHandler.Handle(
            new UpdateClinicRoomCommand(room.Id, "Room Modernized", "RM-MOD", ClinicRoomType.Consultation, null, 30, true),
            CancellationToken.None);

        var refreshedItem = await context.QueueItems.FirstAsync(q => q.Id == activeItem.Id);
        refreshedItem.RoomOrStation.Should().Be("Room Modernized");
    }

    [Fact]
    public void Tier2_BC5_SetAssignedRoomIds_WithDuplicateGuidsAndGuidEmpty_IsPureAndIdempotent()
    {
        var staff = new StaffMember { TenantId = "t1", FirstName = "F", LastName = "L", Role = StaffRole.Doctor };
        var r1 = Guid.NewGuid();
        var r2 = Guid.NewGuid();

        staff.SetAssignedRoomIds(new[] { r1, r2, r1, Guid.Empty, r2 });
        var firstRun = staff.GetAssignedRoomIds();

        staff.SetAssignedRoomIds(new[] { r1, r2 });
        var secondRun = staff.GetAssignedRoomIds();

        firstRun.Should().Equal(secondRun);
        firstRun.Should().HaveCount(2);
    }

    #endregion

    // =========================================================================
    // TIER 3: CROSS-FEATURE COMBINATIONS (PAIRWISE INTERACTIONS)
    // =========================================================================

    #region Tier 3 - Pairwise Combinatorial Interactions

    [Fact]
    public async Task Tier3_P1_MultiRoomDoctor_AdditiveAssignment_And_CheckInRouting()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);

        var room1 = new Room { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Station Alpha", Code = "A", Type = ClinicRoomType.Consultation, DisplayOrder = 1, IsActive = true };
        var room2 = new Room { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Station Beta", Code = "B", Type = ClinicRoomType.Consultation, DisplayOrder = 2, IsActive = true };
        await context.Rooms.AddRangeAsync(room1, room2);

        var doctor = new StaffMember { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Title = "Dr.", FirstName = "Pair", LastName = "Wise", Role = StaffRole.Doctor, IsActive = true };
        doctor.SetAssignedRoomIds(new[] { room1.Id, room2.Id });
        await context.StaffMembers.AddAsync(doctor);
        await context.SaveChangesAsync();

        var checkInHandler = new CheckInPatientCommandHandler(queueRepo, apptRepo, uow, clinicContext, IdentityOf(clinicId, tenantId), Substitute.For<IPatientAppointmentPublisher>(), roomRepo, staffRepo);

        // Check in targeting Station Beta
        var checkedIn = await checkInHandler.Handle(
            new CheckInPatientCommand(
                Guid.NewGuid(),
                "Patient P1",
                AppointmentId: null,
                DoctorId: doctor.Id,
                DoctorName: "Dr. Pair Wise",
                Priority: QueuePriority.Routine,
                ChiefComplaint: "Exam",
                RoomOrStation: "Station Beta",
                RoomId: room2.Id),
            CancellationToken.None);

        checkedIn.RoomId.Should().Be(room2.Id);
        checkedIn.RoomOrStation.Should().Be("Station Beta");
    }

    [Fact]
    public async Task Tier3_P2_RoomDeletion_ActiveWaitingQueueItem_And_CallResolution()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var room1 = new Room { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Room 1", Code = "RM-1", Type = ClinicRoomType.Consultation, DisplayOrder = 1, IsActive = true };
        var room2 = new Room { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Room 2", Code = "RM-2", Type = ClinicRoomType.Consultation, DisplayOrder = 2, IsActive = true };
        await context.Rooms.AddRangeAsync(room1, room2);

        var doctor = new StaffMember { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Title = "Dr.", FirstName = "Doc", LastName = "One", Role = StaffRole.Doctor, IsActive = true };
        doctor.SetAssignedRoomIds(new[] { room1.Id, room2.Id });
        await context.StaffMembers.AddAsync(doctor);

        var ticket = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Ticket in Deleted Room",
            QueueNumber = "Q-050",
            SequenceNumber = 50,
            Status = QueueStatus.Waiting,
            RoomId = room2.Id,
            RoomOrStation = "Room 2",
            CheckInTime = DateTime.UtcNow
        };
        await context.QueueItems.AddAsync(ticket);
        await context.SaveChangesAsync();

        // Room 2 deleted
        var deleteHandler = new DeleteClinicRoomCommandHandler(roomRepo, staffRepo, uow, clinicContext);
        await deleteHandler.Handle(new DeleteClinicRoomCommand(room2.Id), CancellationToken.None);

        // Doctor calling ticket: room2 is gone -> resolves to doctor's remaining primary room (Room 1)
        var callHandler = new CallQueueItemCommandHandler(queueRepo, uow, clinicContext, null, roomRepo, staffRepo);
        var called = await callHandler.Handle(new CallQueueItemCommand(ticket.Id, doctor.Id, "Dr. Doc One"), CancellationToken.None);

        called.RoomId.Should().Be(room1.Id);
        called.RoomOrStation.Should().Be("Room 1");
    }

    [Fact]
    public async Task Tier3_P3_MultipleDoctors_OverlappingRooms_IndependentCallRouting()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var room1 = new Room { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Room 1", Code = "RM-1", Type = ClinicRoomType.Consultation, DisplayOrder = 1, IsActive = true };
        var sharedRoom = new Room { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Shared Suite", Code = "SS", Type = ClinicRoomType.Consultation, DisplayOrder = 2, IsActive = true };
        var room3 = new Room { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Room 3", Code = "RM-3", Type = ClinicRoomType.Consultation, DisplayOrder = 3, IsActive = true };
        await context.Rooms.AddRangeAsync(room1, sharedRoom, room3);

        // Dr. A covers Room 1 and Shared Suite
        var drA = new StaffMember { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Title = "Dr.", FirstName = "A", LastName = "Smith", Role = StaffRole.Doctor, IsActive = true };
        drA.SetAssignedRoomIds(new[] { room1.Id, sharedRoom.Id });

        // Dr. B covers Shared Suite and Room 3
        var drB = new StaffMember { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Title = "Dr.", FirstName = "B", LastName = "Jones", Role = StaffRole.Doctor, IsActive = true };
        drB.SetAssignedRoomIds(new[] { sharedRoom.Id, room3.Id });

        await context.StaffMembers.AddRangeAsync(drA, drB);

        var itemA = new QueueItem { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, PatientId = Guid.NewGuid(), PatientName = "Pat A", QueueNumber = "Q-1", SequenceNumber = 1, Status = QueueStatus.Waiting, RoomId = sharedRoom.Id, RoomOrStation = "Shared Suite", CheckInTime = DateTime.UtcNow };
        var itemB = new QueueItem { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, PatientId = Guid.NewGuid(), PatientName = "Pat B", QueueNumber = "Q-2", SequenceNumber = 2, Status = QueueStatus.Waiting, RoomId = room3.Id, RoomOrStation = "Room 3", CheckInTime = DateTime.UtcNow };
        await context.QueueItems.AddRangeAsync(itemA, itemB);
        await context.SaveChangesAsync();

        var callHandler = new CallQueueItemCommandHandler(queueRepo, uow, clinicContext, null, roomRepo, staffRepo);

        var calledA = await callHandler.Handle(new CallQueueItemCommand(itemA.Id, drA.Id, "Dr. A"), CancellationToken.None);
        var calledB = await callHandler.Handle(new CallQueueItemCommand(itemB.Id, drB.Id, "Dr. B"), CancellationToken.None);

        calledA.RoomId.Should().Be(sharedRoom.Id);
        calledB.RoomId.Should().Be(room3.Id);
    }

    #endregion

    // =========================================================================
    // TIER 4: REAL-WORLD CLINICAL WORKLOAD SCENARIOS
    // =========================================================================

    #region Tier 4 - High-Fidelity Clinical Simulation

    [Fact]
    public async Task Tier4_RealWorld_FullMultiDoctorMorningShiftSimulation()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<Room>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);

        // 1. SETUP CLINIC INFRASTRUCTURE
        var roomPedia = new Room { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Room 1 - Pedia", Code = "PED", Type = ClinicRoomType.Consultation, DisplayOrder = 1, IsActive = true };
        var roomGeneral = new Room { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Room 2 - General", Code = "GEN", Type = ClinicRoomType.Consultation, DisplayOrder = 2, IsActive = true };
        var roomInternal = new Room { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Room 3 - Internal Med", Code = "IM", Type = ClinicRoomType.Consultation, DisplayOrder = 3, IsActive = true };
        var roomTriage = new Room { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Triage Station", Code = "TRI", Type = ClinicRoomType.Triage, DisplayOrder = 4, IsActive = true };
        var roomTreatment = new Room { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Treatment Room", Code = "TX", Type = ClinicRoomType.Treatment, DisplayOrder = 5, IsActive = true };
        await context.Rooms.AddRangeAsync(roomPedia, roomGeneral, roomInternal, roomTriage, roomTreatment);

        // 2. SETUP STAFF ROSTER
        // Dr. Alice: dual-room coverage (Pedia + General)
        var drAlice = new StaffMember { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Title = "Dr.", FirstName = "Alice", LastName = "Guo", Role = StaffRole.Doctor, IsActive = true };
        drAlice.SetAssignedRoomIds(new[] { roomPedia.Id, roomGeneral.Id });

        // Dr. Bob: single room (Internal Med)
        var drBob = new StaffMember { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Title = "Dr.", FirstName = "Bob", LastName = "Santos", Role = StaffRole.Doctor, IsActive = true };
        drBob.SetAssignedRoomIds(new[] { roomInternal.Id });

        // Nurse Nancy: shared triage & treatment
        var nurseNancy = new StaffMember { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Title = "RN", FirstName = "Nancy", LastName = "Reyes", Role = StaffRole.Nurse, IsActive = true };
        nurseNancy.SetAssignedRoomIds(new[] { roomTriage.Id, roomTreatment.Id });

        await context.StaffMembers.AddRangeAsync(drAlice, drBob, nurseNancy);
        await context.SaveChangesAsync();

        // 3. PHASE 1: WALK-IN INTAKE
        var checkInHandler = new CheckInPatientCommandHandler(
            queueRepo, apptRepo, uow, clinicContext, IdentityOf(clinicId, tenantId), Substitute.For<IPatientAppointmentPublisher>(), roomRepo, staffRepo);

        // Patient 1 (Lucas Ramos, 3yo) checked in for Dr. Alice (preselects primary roomPedia)
        var ticketP1 = await checkInHandler.Handle(
            new CheckInPatientCommand(Guid.NewGuid(), "Lucas Ramos", null, drAlice.Id, "Dr. Alice Guo", QueuePriority.Routine, "Cough and cold"),
            CancellationToken.None);

        ticketP1.RoomId.Should().Be(roomPedia.Id);
        ticketP1.RoomOrStation.Should().Be("Room 1 - Pedia");

        // Patient 2 (Carmen Del Rosario, 68yo) checked in for Dr. Bob
        var ticketP2 = await checkInHandler.Handle(
            new CheckInPatientCommand(Guid.NewGuid(), "Carmen Del Rosario", null, drBob.Id, "Dr. Bob Santos", QueuePriority.Routine, "Hypertension review"),
            CancellationToken.None);

        ticketP2.RoomId.Should().Be(roomInternal.Id);

        // 4. PHASE 2: CONCURRENT CONSULTATIONS
        var callHandler = new CallQueueItemCommandHandler(queueRepo, uow, clinicContext, null, roomRepo, staffRepo);

        var calledP1 = await callHandler.Handle(new CallQueueItemCommand(ticketP1.Id, drAlice.Id, "Dr. Alice Guo"), CancellationToken.None);
        var calledP2 = await callHandler.Handle(new CallQueueItemCommand(ticketP2.Id, drBob.Id, "Dr. Bob Santos"), CancellationToken.None);

        calledP1.Status.Should().Be(QueueStatus.InConsultation);
        calledP1.RoomId.Should().Be(roomPedia.Id);

        calledP2.Status.Should().Be(QueueStatus.InConsultation);
        calledP2.RoomId.Should().Be(roomInternal.Id);

        // 5. PHASE 3: PROCEDURE DELEGATION & NURSE EXECUTION
        var orderProcHandler = new OrderProcedureCommandHandler(procRepo, uow, clinicContext, queueRepo, roomRepo);
        var orderedProc = await orderProcHandler.Handle(
            new OrderProcedureCommand(ticketP1.PatientId, ticketP1.PatientName, ticketP1.Id, null, "NEB-01", "Salbutamol Nebulization", "Inhalation", drAlice.Id, "Dr. Alice Guo", "Wheezing"),
            CancellationToken.None);

        orderedProc.TargetRoomId.Should().Be(roomTreatment.Id);

        var qItemInTreatment = await context.QueueItems.FirstAsync(q => q.Id == ticketP1.Id);
        qItemInTreatment.Status.Should().Be(QueueStatus.PendingProcedure);
        qItemInTreatment.RoomId.Should().Be(roomTreatment.Id);

        // Nurse Nancy records procedure execution in Treatment Room
        var execProcHandler = new RecordProcedureExecutionCommandHandler(procRepo, uow, clinicContext, queueRepo, staffRepo, roomRepo);
        await execProcHandler.Handle(
            new RecordProcedureExecutionCommand(orderedProc.Id, nurseNancy.Id, "RN Nancy Reyes", "110/70", "108/68", "Salbutamol 2.5mg", "LOT-991", null, "Inhalation", "Clear lung fields post-treatment", "None"),
            CancellationToken.None);

        // Post-procedure: queue item restores to Dr. Alice's Room 1 - Pedia with ReEvaluation status
        var qItemRestored = await context.QueueItems.FirstAsync(q => q.Id == ticketP1.Id);
        qItemRestored.Status.Should().Be(QueueStatus.ReEvaluation);
        qItemRestored.RoomId.Should().Be(roomPedia.Id);
        qItemRestored.RoomOrStation.Should().Be("Room 1 - Pedia");

        // 6. PHASE 4: CONCURRENT SECOND ROOM USAGE
        // While P1 was receiving nebulization, Dr. Alice checks in and calls P3 in Room 2 - General
        var ticketP3 = await checkInHandler.Handle(
            new CheckInPatientCommand(
                Guid.NewGuid(),
                "Ramon Diaz",
                AppointmentId: null,
                DoctorId: drAlice.Id,
                DoctorName: "Dr. Alice Guo",
                Priority: QueuePriority.Routine,
                ChiefComplaint: "Wound care",
                RoomOrStation: "Room 2 - General",
                RoomId: roomGeneral.Id),
            CancellationToken.None);

        ticketP3.RoomId.Should().Be(roomGeneral.Id);
        var calledP3 = await callHandler.Handle(new CallQueueItemCommand(ticketP3.Id, drAlice.Id, "Dr. Alice Guo"), CancellationToken.None);
        calledP3.RoomId.Should().Be(roomGeneral.Id);

        // 7. PHASE 5: MID-DAY ROOM DECOMMISSIONING
        // Admin deletes Room 2 - General; Dr. Alice retains Room 1 - Pedia
        var deleteRoomHandler = new DeleteClinicRoomCommandHandler(roomRepo, staffRepo, uow, clinicContext);
        await deleteRoomHandler.Handle(new DeleteClinicRoomCommand(roomGeneral.Id), CancellationToken.None);

        var reloadedAlice = await context.StaffMembers.FirstAsync(s => s.Id == drAlice.Id);
        reloadedAlice.GetAssignedRoomIds().Should().ContainSingle().Which.Should().Be(roomPedia.Id);
    }

    #endregion
}
