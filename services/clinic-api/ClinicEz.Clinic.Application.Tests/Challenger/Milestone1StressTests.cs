using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Rooms.Commands;
using ClinicEz.Clinic.Application.Features.Rooms.DTOs;
using ClinicEz.Clinic.Application.Features.Rooms.Queries;
using ClinicEz.Clinic.Application.Features.Staff.Commands;
using ClinicEz.Clinic.Application.Features.Staff.DTOs;
using ClinicEz.Clinic.Application.Features.Staff.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Challenger;

/// <summary>
/// Empirical Adversarial Challenger Test Suite for Milestone 1:
/// Multi-Room Staff Assignment & Additive Room Synchronization.
/// 
/// Stress-tests:
/// 1. Additive 5-room assignment: 1 doctor iteratively assigned to 5 rooms, retaining all 5 rooms.
/// 2. Selective unassignment: unassigning room 3 leaves rooms 1, 2, 4, 5 intact.
/// 3. Room deletion: deleting room 2 leaves rooms 1, 4, 5 intact.
/// 4. Corrupted/malformed JSON recovery in StaffMember (invalid JSON, primitive types, empty string, null, arrays with bad GUIDs).
/// 5. Deduplication and Guid.Empty scrubbing in SetAssignedRoomIds.
/// 6. Multi-doctor shared room concurrency & isolation.
/// 7. Inactive staff exclusion from room query counts.
/// 8. Multi-tenant isolation ensuring cross-clinic room assignments are strictly quarantined.
/// </summary>
public class Milestone1StressTests
{
    private static (Guid clinicId, string tenantId, IClinicContext clinicContext) SetupClinicContext(string? tenantIdPrefix = null)
    {
        var clinicId = Guid.NewGuid();
        var tenantId = tenantIdPrefix ?? $"tenant_stress_{Guid.NewGuid():N}";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);
        clinicContext.StaffId.Returns(Guid.NewGuid());
        return (clinicId, tenantId, clinicContext);
    }

    #region Challenge 1: Additive 5-Room Assignment Stress

    [Fact]
    public async Task Challenge1_AdditiveFiveRoomAssignment_IterativelyRetainsAllRooms()
    {
        // ARRANGE
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<ClinicRoom>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        // Create 5 distinct consultation rooms
        var roomEntities = new List<ClinicRoom>();
        for (int i = 1; i <= 5; i++)
        {
            var room = new ClinicRoom
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                Name = $"Consultation Suite {i}",
                Code = $"CS-{i}",
                Type = ClinicRoomType.Consultation,
                DisplayOrder = i,
                IsActive = true
            };
            roomEntities.Add(room);
            await context.ClinicRooms.AddAsync(room);
        }

        // Create 1 doctor with initially zero room assignments
        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Title = "Dr.",
            FirstName = "Gregory",
            LastName = "House",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-007788",
            IsActive = true
        };
        await context.StaffMembers.AddAsync(doctor);
        await context.SaveChangesAsync();

        var updateHandler = new UpdateClinicRoomCommandHandler(roomRepo, staffRepo, queueRepo, uow, clinicContext);
        var getRoomsHandler = new GetClinicRoomsQueryHandler(roomRepo, staffRepo, uow, clinicContext);

        // ACT: Iteratively assign the doctor to Suite 1 through Suite 5
        for (int i = 0; i < 5; i++)
        {
            var targetRoom = roomEntities[i];
            var updateResult = await updateHandler.Handle(
                new UpdateClinicRoomCommand(
                    targetRoom.Id,
                    targetRoom.Name,
                    targetRoom.Code,
                    targetRoom.Type,
                    targetRoom.Description,
                    targetRoom.DisplayOrder,
                    targetRoom.IsActive,
                    new[] { doctor.Id }),
                CancellationToken.None);

            updateResult.AssignedStaffIds.Should().Contain(doctor.Id);
            updateResult.AssignedStaffNames.Should().Contain("Dr. Gregory House");

            // Verify cumulative retention in database after each iteration
            var doctorInDb = await context.StaffMembers.FirstAsync(s => s.Id == doctor.Id);
            var expectedAssignedIds = roomEntities.Take(i + 1).Select(r => r.Id).ToList();
            doctorInDb.GetAssignedRoomIds().Should().HaveCount(i + 1)
                .And.BeEquivalentTo(expectedAssignedIds, options => options.WithoutStrictOrdering(),
                    $"after assigning room {i + 1}, previous rooms must be preserved additively");
        }

        // ASSERT: Query GetClinicRoomsQuery and verify doctor is present in all 5 rooms
        var allRooms = await getRoomsHandler.Handle(new GetClinicRoomsQuery(false), CancellationToken.None);
        allRooms.Should().HaveCount(5);

        foreach (var room in roomEntities)
        {
            var roomDto = allRooms.First(r => r.Id == room.Id);
            roomDto.AssignedStaffCount.Should().Be(1, $"Room {room.Name} must reflect exactly 1 assigned doctor");
            roomDto.AssignedStaffIds.Should().ContainSingle().Which.Should().Be(doctor.Id);
            roomDto.AssignedStaffNames.Should().ContainSingle().Which.Should().Be("Dr. Gregory House");
        }
    }

    #endregion

    #region Challenge 2: Selective Unassignment (Removing Room 3)

    [Fact]
    public async Task Challenge2_SelectiveUnassignment_RemovingRoom3LeavesRooms1_2_4_5Intact()
    {
        // ARRANGE
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<ClinicRoom>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var rooms = new List<ClinicRoom>();
        for (int i = 1; i <= 5; i++)
        {
            var room = new ClinicRoom
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                Name = $"Suite {i}",
                Code = $"S-{i}",
                Type = ClinicRoomType.Consultation,
                DisplayOrder = i,
                IsActive = true
            };
            rooms.Add(room);
            await context.ClinicRooms.AddAsync(room);
        }

        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Title = "Dr.",
            FirstName = "Allison",
            LastName = "Cameron",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-009911",
            IsActive = true
        };
        // Pre-assign to all 5 rooms
        doctor.SetAssignedRoomIds(rooms.Select(r => r.Id));
        await context.StaffMembers.AddAsync(doctor);
        await context.SaveChangesAsync();

        var updateHandler = new UpdateClinicRoomCommandHandler(roomRepo, staffRepo, queueRepo, uow, clinicContext);
        var getRoomsHandler = new GetClinicRoomsQueryHandler(roomRepo, staffRepo, uow, clinicContext);

        // ACT: Unassign doctor from Room 3 by sending empty AssignedStaffIds for Room 3
        var room3 = rooms[2]; // 0-indexed: index 2 is Suite 3
        var updateResult = await updateHandler.Handle(
            new UpdateClinicRoomCommand(
                room3.Id,
                room3.Name,
                room3.Code,
                room3.Type,
                room3.Description,
                room3.DisplayOrder,
                room3.IsActive,
                Array.Empty<Guid>()), // empty list = unassign all staff from room 3
            CancellationToken.None);

        updateResult.AssignedStaffCount.Should().Be(0);
        updateResult.AssignedStaffIds.Should().BeEmpty();

        // ASSERT: Doctor must retain Suite 1, 2, 4, 5 (Suite 3 strictly removed)
        var doctorInDb = await context.StaffMembers.FirstAsync(s => s.Id == doctor.Id);
        var expectedRemainingIds = new[] { rooms[0].Id, rooms[1].Id, rooms[3].Id, rooms[4].Id };

        doctorInDb.GetAssignedRoomIds().Should().HaveCount(4)
            .And.BeEquivalentTo(expectedRemainingIds)
            .And.NotContain(room3.Id);

        // Query rooms view: Room 3 has 0 staff, others have 1 staff
        var allRoomsDto = await getRoomsHandler.Handle(new GetClinicRoomsQuery(false), CancellationToken.None);
        var room3Dto = allRoomsDto.First(r => r.Id == room3.Id);
        room3Dto.AssignedStaffCount.Should().Be(0);

        foreach (var remainingRoom in new[] { rooms[0], rooms[1], rooms[3], rooms[4] })
        {
            var dto = allRoomsDto.First(r => r.Id == remainingRoom.Id);
            dto.AssignedStaffCount.Should().Be(1);
            dto.AssignedStaffIds.Should().Contain(doctor.Id);
        }
    }

    #endregion

    #region Challenge 3: Room Deletion Cleanup (Deleting Room 2)

    [Fact]
    public async Task Challenge3_RoomDeletionCleanup_DeletingRoom2LeavesRooms1_4_5Intact()
    {
        // ARRANGE
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<ClinicRoom>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        var rooms = new List<ClinicRoom>();
        for (int i = 1; i <= 5; i++)
        {
            var room = new ClinicRoom
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                Name = $"Chamber {i}",
                Code = $"CH-{i}",
                Type = ClinicRoomType.Consultation,
                DisplayOrder = i,
                IsActive = true
            };
            rooms.Add(room);
            await context.ClinicRooms.AddAsync(room);
        }

        // Doctor is currently assigned to Chamber 1, 2, 4, 5 (Chamber 3 was previously removed)
        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            Title = "Dr.",
            FirstName = "Robert",
            LastName = "Chase",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-005522",
            IsActive = true
        };
        var initialRooms = new[] { rooms[0].Id, rooms[1].Id, rooms[3].Id, rooms[4].Id };
        doctor.SetAssignedRoomIds(initialRooms);
        await context.StaffMembers.AddAsync(doctor);
        await context.SaveChangesAsync();

        var deleteHandler = new DeleteClinicRoomCommandHandler(roomRepo, staffRepo, uow, clinicContext);
        var getRoomsHandler = new GetClinicRoomsQueryHandler(roomRepo, staffRepo, uow, clinicContext);

        // ACT: Delete Chamber 2 (rooms[1])
        var chamber2 = rooms[1];
        var deleteResult = await deleteHandler.Handle(new DeleteClinicRoomCommand(chamber2.Id), CancellationToken.None);
        deleteResult.Should().BeTrue();

        // ASSERT: Doctor must now have exactly Chamber 1, 4, 5 intact
        var doctorInDb = await context.StaffMembers.FirstAsync(s => s.Id == doctor.Id);
        var expectedRemaining = new[] { rooms[0].Id, rooms[3].Id, rooms[4].Id };

        doctorInDb.GetAssignedRoomIds().Should().HaveCount(3)
            .And.BeEquivalentTo(expectedRemaining)
            .And.NotContain(chamber2.Id);

        // Chamber 2 should be marked deleted / inactive in DB
        var deletedChamber2 = await context.ClinicRooms.IgnoreQueryFilters().FirstAsync(r => r.Id == chamber2.Id);
        deletedChamber2.IsDeleted.Should().BeTrue();
        deletedChamber2.IsActive.Should().BeFalse();

        // GetClinicRoomsQuery (ActiveOnly: true) must return only Chamber 1, 3, 4, 5 and NOT deleted Chamber 2
        var activeRooms = await getRoomsHandler.Handle(new GetClinicRoomsQuery(ActiveOnly: true), CancellationToken.None);
        activeRooms.Select(r => r.Id).Should().NotContain(chamber2.Id);

        // Chambers 1, 4, 5 must still list Dr. Chase
        foreach (var remainingChamber in new[] { rooms[0], rooms[3], rooms[4] })
        {
            var dto = activeRooms.First(r => r.Id == remainingChamber.Id);
            dto.AssignedStaffIds.Should().Contain(doctor.Id);
        }
    }

    #endregion

    #region Challenge 4: Corrupted / Malformed AssignedRoomIdsJson Recovery

    [Theory]
    [InlineData("not a json string at all")]
    [InlineData("{ \"single\": \"object_not_array\" }")]
    [InlineData("1234567890")]
    [InlineData("true")]
    [InlineData("null")]
    [InlineData("")]
    [InlineData("    \t\r\n   ")]
    [InlineData("[\"not-a-valid-guid-format\"]")]
    [InlineData("[123, 456]")]
    [InlineData("[{ \"id\": \"abc\" }]")]
    [InlineData("{\"error\": true}")]
    [InlineData("[null, null]")]
    public void Challenge4_MalformedJsonRecovery_ReturnsEmptyListWithoutCrashing(string? corruptedJson)
    {
        var staff = new StaffMember
        {
            TenantId = "tenant_test",
            FirstName = "James",
            LastName = "Wilson",
            Role = StaffRole.Doctor,
            AssignedRoomIdsJson = corruptedJson
        };

        // Execution must not throw any JsonException or unhandled exception
        IReadOnlyList<Guid>? result = null;
        var act = () => { result = staff.GetAssignedRoomIds(); };

        act.Should().NotThrow("GetAssignedRoomIds must be resilient to any malformed or unexpected JSON payload");
        result.Should().NotBeNull();
        result.Should().BeEmpty();
    }

    [Fact]
    public void Challenge4_JsonWithMixedValidAndEmptyGuids_ExtractsValidGuidsOnly()
    {
        var valid1 = Guid.NewGuid();
        var valid2 = Guid.NewGuid();
        var empty = Guid.Empty;

        var json = $"[\"{valid1}\", \"{empty}\", \"{valid2}\"]";
        var staff = new StaffMember
        {
            TenantId = "tenant_test",
            FirstName = "Eric",
            LastName = "Foreman",
            Role = StaffRole.Doctor,
            AssignedRoomIdsJson = json
        };

        var result = staff.GetAssignedRoomIds();
        result.Should().HaveCount(2).And.Contain(new[] { valid1, valid2 }).And.NotContain(Guid.Empty);
    }

    #endregion

    #region Challenge 5: Deduplication & Empty GUID Scrubbing

    [Fact]
    public void Challenge5_DeduplicationAndEmptyScrubbing_SerializesCleanDistinctJson()
    {
        var staff = new StaffMember
        {
            TenantId = "tenant_test",
            FirstName = "Chris",
            LastName = "Taub",
            Role = StaffRole.Doctor
        };

        var id1 = Guid.NewGuid();
        var id2 = Guid.NewGuid();

        // Pass duplicates and Guid.Empty
        var inputList = new List<Guid>
        {
            id1,
            Guid.Empty,
            id2,
            id1,
            Guid.Empty,
            id2,
            id1
        };

        staff.SetAssignedRoomIds(inputList);

        // Deserialized verification
        staff.GetAssignedRoomIds().Should().HaveCount(2).And.Equal(new[] { id1, id2 });

        // JSON string verification
        staff.AssignedRoomIdsJson.Should().NotBeNull();
        staff.AssignedRoomIdsJson.Should().Contain(id1.ToString());
        staff.AssignedRoomIdsJson.Should().Contain(id2.ToString());
        staff.AssignedRoomIdsJson.Should().NotContain(Guid.Empty.ToString());
    }

    [Fact]
    public void Challenge5_AllEmptyGuidsOrEmptyCollection_SetsJsonToNull()
    {
        var staff = new StaffMember
        {
            TenantId = "tenant_test",
            FirstName = "Lawrence",
            LastName = "Kutner",
            Role = StaffRole.Doctor,
            AssignedRoomIdsJson = "[\"00000000-0000-0000-0000-000000000001\"]"
        };

        // When only Guid.Empty is provided
        staff.SetAssignedRoomIds(new[] { Guid.Empty, Guid.Empty });
        staff.AssignedRoomIdsJson.Should().BeNull();
        staff.GetAssignedRoomIds().Should().BeEmpty();

        // When null is passed
        staff.AssignedRoomIdsJson = "[\"00000000-0000-0000-0000-000000000001\"]";
        staff.SetAssignedRoomIds(null);
        staff.AssignedRoomIdsJson.Should().BeNull();
        staff.GetAssignedRoomIds().Should().BeEmpty();

        // When empty collection is passed
        staff.AssignedRoomIdsJson = "[\"00000000-0000-0000-0000-000000000001\"]";
        staff.SetAssignedRoomIds(Array.Empty<Guid>());
        staff.AssignedRoomIdsJson.Should().BeNull();
        staff.GetAssignedRoomIds().Should().BeEmpty();
    }

    #endregion

    #region Challenge 6: Multi-Doctor Shared Room & Selective Unassignment Concurrency

    [Fact]
    public async Task Challenge6_MultiDoctorSharedRooms_UnassigningOneDoctorDoesNotAffectOtherDoctors()
    {
        // ARRANGE: Room 1 is shared by Doctor A and Doctor B. Room 2 is Doctor B only.
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<ClinicRoom>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var room1 = new ClinicRoom { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Shared Suite 1", Code = "SS-1", Type = ClinicRoomType.Consultation, DisplayOrder = 1, IsActive = true };
        var room2 = new ClinicRoom { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Private Suite 2", Code = "PS-2", Type = ClinicRoomType.Consultation, DisplayOrder = 2, IsActive = true };
        await context.ClinicRooms.AddRangeAsync(room1, room2);

        var docA = new StaffMember { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Title = "Dr.", FirstName = "DocA", LastName = "Alpha", Role = StaffRole.Doctor, PrcLicenseNumber = "PRC-A", IsActive = true };
        var docB = new StaffMember { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Title = "Dr.", FirstName = "DocB", LastName = "Beta", Role = StaffRole.Doctor, PrcLicenseNumber = "PRC-B", IsActive = true };

        docA.SetAssignedRoomIds(new[] { room1.Id });
        docB.SetAssignedRoomIds(new[] { room1.Id, room2.Id });

        await context.StaffMembers.AddRangeAsync(docA, docB);
        await context.SaveChangesAsync();

        var updateHandler = new UpdateClinicRoomCommandHandler(roomRepo, staffRepo, queueRepo, uow, clinicContext);
        var getRoomsHandler = new GetClinicRoomsQueryHandler(roomRepo, staffRepo, uow, clinicContext);

        // Verify initial query state: Room 1 has both DocA and DocB
        var initialRooms = await getRoomsHandler.Handle(new GetClinicRoomsQuery(false), CancellationToken.None);
        var r1Initial = initialRooms.First(r => r.Id == room1.Id);
        r1Initial.AssignedStaffCount.Should().Be(2);
        r1Initial.AssignedStaffIds.Should().Contain(new[] { docA.Id, docB.Id });

        // ACT: Update Room 1 to only assign DocB (unassigning DocA)
        await updateHandler.Handle(
            new UpdateClinicRoomCommand(
                room1.Id,
                room1.Name,
                room1.Code,
                room1.Type,
                room1.Description,
                room1.DisplayOrder,
                room1.IsActive,
                new[] { docB.Id }), // Only DocB desired for Room 1
            CancellationToken.None);

        // ASSERT: DocA now has zero rooms; DocB retains BOTH Room 1 and Room 2
        var refreshedDocA = await context.StaffMembers.FirstAsync(s => s.Id == docA.Id);
        var refreshedDocB = await context.StaffMembers.FirstAsync(s => s.Id == docB.Id);

        refreshedDocA.GetAssignedRoomIds().Should().BeEmpty();
        refreshedDocB.GetAssignedRoomIds().Should().HaveCount(2).And.Contain(new[] { room1.Id, room2.Id });

        var afterRooms = await getRoomsHandler.Handle(new GetClinicRoomsQuery(false), CancellationToken.None);
        var r1After = afterRooms.First(r => r.Id == room1.Id);
        r1After.AssignedStaffCount.Should().Be(1);
        r1After.AssignedStaffIds.Should().ContainSingle().Which.Should().Be(docB.Id);
    }

    #endregion

    #region Challenge 7: Inactive Staff Exclusion from Room Counts

    [Fact]
    public async Task Challenge7_DeactivatedDoctor_DoesNotAppearInRoomStaffCount()
    {
        var (clinicId, tenantId, clinicContext) = SetupClinicContext();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var roomRepo = TestDbHelper.CreateRepository<ClinicRoom>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        var room1 = new ClinicRoom { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, Name = "Room 1", Code = "R1", Type = ClinicRoomType.Consultation, DisplayOrder = 1, IsActive = true };
        await context.ClinicRooms.AddAsync(room1);

        var activeDoc = new StaffMember { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, FirstName = "Active", LastName = "Doc", Role = StaffRole.Doctor, IsActive = true };
        var retiredDoc = new StaffMember { Id = Guid.NewGuid(), TenantId = tenantId, ClinicId = clinicId, FirstName = "Retired", LastName = "Doc", Role = StaffRole.Doctor, IsActive = false };

        activeDoc.SetAssignedRoomIds(new[] { room1.Id });
        retiredDoc.SetAssignedRoomIds(new[] { room1.Id });

        await context.StaffMembers.AddRangeAsync(activeDoc, retiredDoc);
        await context.SaveChangesAsync();

        var getRoomsHandler = new GetClinicRoomsQueryHandler(roomRepo, staffRepo, uow, clinicContext);
        var rooms = await getRoomsHandler.Handle(new GetClinicRoomsQuery(false), CancellationToken.None);

        var r1Dto = rooms.First(r => r.Id == room1.Id);
        r1Dto.AssignedStaffCount.Should().Be(1, "Inactive doctors must be excluded from room staff count");
        r1Dto.AssignedStaffIds.Should().ContainSingle().Which.Should().Be(activeDoc.Id);
    }

    #endregion

    #region Challenge 8: Multi-Tenant Boundary Isolation

    [Fact]
    public async Task Challenge8_MultiTenantIsolation_QuarantinesRoomAssignmentsBetweenClinics()
    {
        var (clinicAId, tenantAId, clinicAContext) = SetupClinicContext("tenant_A");
        var (clinicBId, tenantBId, clinicBContext) = SetupClinicContext("tenant_B");

        var dbName = $"MultiTenantStressDb_{Guid.NewGuid()}";
        var (contextA, uowA, sieveA) = TestDbHelper.CreateSharedTestContext(dbName, clinicAContext);
        var (contextB, uowB, sieveB) = TestDbHelper.CreateSharedTestContext(dbName, clinicBContext);

        var roomRepoA = TestDbHelper.CreateRepository<ClinicRoom>(contextA, sieveA);
        var staffRepoA = TestDbHelper.CreateRepository<StaffMember>(contextA, sieveA);
        var queueRepoA = TestDbHelper.CreateRepository<QueueItem>(contextA, sieveA);

        var roomRepoB = TestDbHelper.CreateRepository<ClinicRoom>(contextB, sieveB);
        var staffRepoB = TestDbHelper.CreateRepository<StaffMember>(contextB, sieveB);

        // Clinic A has Room A and Doctor A
        var roomA = new ClinicRoom { Id = Guid.NewGuid(), TenantId = tenantAId, ClinicId = clinicAId, Name = "Clinic A Room", Code = "A-1", Type = ClinicRoomType.Consultation, DisplayOrder = 1, IsActive = true };
        var docA = new StaffMember { Id = Guid.NewGuid(), TenantId = tenantAId, ClinicId = clinicAId, FirstName = "Alice", LastName = "A", Role = StaffRole.Doctor, IsActive = true };
        await contextA.ClinicRooms.AddAsync(roomA);
        await contextA.StaffMembers.AddAsync(docA);
        await contextA.SaveChangesAsync();

        // Clinic B has Room B and Doctor B
        var roomB = new ClinicRoom { Id = Guid.NewGuid(), TenantId = tenantBId, ClinicId = clinicBId, Name = "Clinic B Room", Code = "B-1", Type = ClinicRoomType.Consultation, DisplayOrder = 1, IsActive = true };
        var docB = new StaffMember { Id = Guid.NewGuid(), TenantId = tenantBId, ClinicId = clinicBId, FirstName = "Bob", LastName = "B", Role = StaffRole.Doctor, IsActive = true };
        await contextB.ClinicRooms.AddAsync(roomB);
        await contextB.StaffMembers.AddAsync(docB);
        await contextB.SaveChangesAsync();

        // Assign Room A to Doc A in Clinic A
        var updateHandlerA = new UpdateClinicRoomCommandHandler(roomRepoA, staffRepoA, queueRepoA, uowA, clinicAContext);
        await updateHandlerA.Handle(
            new UpdateClinicRoomCommand(roomA.Id, roomA.Name, roomA.Code, roomA.Type, roomA.Description, roomA.DisplayOrder, roomA.IsActive, new[] { docA.Id }),
            CancellationToken.None);

        // Verify Clinic B is completely untouched
        var getRoomsB = new GetClinicRoomsQueryHandler(roomRepoB, staffRepoB, uowB, clinicBContext);
        var roomsB = await getRoomsB.Handle(new GetClinicRoomsQuery(false), CancellationToken.None);

        roomsB.Should().ContainSingle().Which.Name.Should().Be("Clinic B Room");
        roomsB[0].AssignedStaffCount.Should().Be(0, "Clinic A assignment should have zero impact on Clinic B");

        var docBInDb = await contextB.StaffMembers.FirstAsync(s => s.Id == docB.Id);
        docBInDb.GetAssignedRoomIds().Should().BeEmpty();
    }

    #endregion
}
