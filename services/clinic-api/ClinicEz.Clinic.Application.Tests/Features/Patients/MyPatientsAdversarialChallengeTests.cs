using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Application.Features.Patients.Queries;
using ClinicEz.Clinic.Application.Tests;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Patients;

public sealed class MyPatientsAdversarialChallengeTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _testClinicId = Guid.NewGuid();
    private const string _testTenantId = "tenant-challenger-m1";

    public MyPatientsAdversarialChallengeTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_testClinicId);
        _clinicContext.TenantId.Returns(_testTenantId);
    }

    [Fact]
    public async Task DoctorWithZeroPatients_ReturnsZeroCountsAndEmptyListWithoutExceptions()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);

        var queryHandler = new GetClinicPatientsQueryHandler(patientRepo, queueRepo, encounterRepo);
        var countsHandler = new GetClinicPatientCountsQueryHandler(patientRepo, queueRepo, encounterRepo);

        var otherDoctorId = Guid.NewGuid();
        var zeroPatientDoctorId = Guid.NewGuid();

        // Seed 3 patients for another doctor
        var p1 = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-OTHER-01",
            FirstName = "Other",
            LastName = "PatientOne",
            DateOfBirth = new DateOnly(1985, 1, 1),
            ContactNumber = "09170000001",
            CustomFields = new Dictionary<string, object?> { ["assigned_doctor_id"] = otherDoctorId.ToString() }
        };
        var p2 = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-OTHER-02",
            FirstName = "Other",
            LastName = "PatientTwo",
            DateOfBirth = new DateOnly(1986, 2, 2),
            ContactNumber = "09170000002",
            CustomFields = new Dictionary<string, object?> { ["doctor_id"] = otherDoctorId.ToString() }
        };
        var p3 = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-OTHER-03",
            FirstName = "Other",
            LastName = "PatientThree",
            DateOfBirth = new DateOnly(1987, 3, 3),
            ContactNumber = "09170000003"
        };
        context.Patients.AddRange(p1, p2, p3);
        await context.SaveChangesAsync();

        // Act & Assert 1: Query list for zeroPatientDoctorId
        var patientsResult = await queryHandler.Handle(new GetClinicPatientsQuery(
            FilterMode: "MY_PATIENTS",
            DoctorId: zeroPatientDoctorId), CancellationToken.None);

        patientsResult.Should().NotBeNull();
        patientsResult.Should().BeEmpty();

        // Act & Assert 2: Query counts for zeroPatientDoctorId
        var countsResult = await countsHandler.Handle(new GetClinicPatientCountsQuery(
            DoctorId: zeroPatientDoctorId), CancellationToken.None);

        countsResult.Should().NotBeNull();
        countsResult.All.Should().Be(3);
        countsResult.MyPatients.Should().Be(0);

        // Act & Assert 3: Completely empty database scenario
        var (emptyContext, _, emptySieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var emptyPatientRepo = TestDbHelper.CreateRepository<Patient>(emptyContext, emptySieve);
        var emptyQueueRepo = TestDbHelper.CreateRepository<QueueItem>(emptyContext, emptySieve);
        var emptyEncounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(emptyContext, emptySieve);

        var emptyQueryHandler = new GetClinicPatientsQueryHandler(emptyPatientRepo, emptyQueueRepo, emptyEncounterRepo);
        var emptyCountsHandler = new GetClinicPatientCountsQueryHandler(emptyPatientRepo, emptyQueueRepo, emptyEncounterRepo);

        var emptyList = await emptyQueryHandler.Handle(new GetClinicPatientsQuery(
            FilterMode: "MY_PATIENTS",
            DoctorId: zeroPatientDoctorId), CancellationToken.None);

        var emptyCounts = await emptyCountsHandler.Handle(new GetClinicPatientCountsQuery(
            DoctorId: zeroPatientDoctorId), CancellationToken.None);

        emptyList.Should().BeEmpty();
        emptyCounts.All.Should().Be(0);
        emptyCounts.MyPatients.Should().Be(0);
    }

    [Fact]
    public async Task NurseWithMultipleRooms_IsolatesPatientsAcrossAssignedAndUnassignedRooms()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);

        var queryHandler = new GetClinicPatientsQueryHandler(patientRepo, queueRepo, encounterRepo);
        var countsHandler = new GetClinicPatientCountsQueryHandler(patientRepo, queueRepo, encounterRepo);

        var nurseId = Guid.NewGuid();
        var roomA = Guid.NewGuid();
        var roomB = Guid.NewGuid();
        var roomC = Guid.NewGuid();

        // Patient 1: Active in Room A -> MATCH
        var p1 = new Patient { Id = Guid.NewGuid(), TenantId = _testTenantId, ClinicId = _testClinicId, PatientCode = "PAT-N-01", FirstName = "RoomA", LastName = "Waiting", DateOfBirth = new DateOnly(1990, 1, 1), ContactNumber = "09180000001" };
        var q1 = new QueueItem { Id = Guid.NewGuid(), TenantId = _testTenantId, ClinicId = _testClinicId, QueueNumber = "V-001", SequenceNumber = 1, QueueDate = DateOnly.FromDateTime(DateTime.UtcNow), PatientId = p1.Id, PatientName = "RoomA Waiting", RoomId = roomA, Status = QueueStatus.Waiting };

        // Patient 2: Active in Room B -> MATCH
        var p2 = new Patient { Id = Guid.NewGuid(), TenantId = _testTenantId, ClinicId = _testClinicId, PatientCode = "PAT-N-02", FirstName = "RoomB", LastName = "Triaged", DateOfBirth = new DateOnly(1991, 2, 2), ContactNumber = "09180000002" };
        var q2 = new QueueItem { Id = Guid.NewGuid(), TenantId = _testTenantId, ClinicId = _testClinicId, QueueNumber = "V-002", SequenceNumber = 2, QueueDate = DateOnly.FromDateTime(DateTime.UtcNow), PatientId = p2.Id, PatientName = "RoomB Triaged", RoomId = roomB, Status = QueueStatus.Triaged };

        // Patient 3: Active in unassigned Room C -> NO MATCH
        var p3 = new Patient { Id = Guid.NewGuid(), TenantId = _testTenantId, ClinicId = _testClinicId, PatientCode = "PAT-N-03", FirstName = "RoomC", LastName = "Unassigned", DateOfBirth = new DateOnly(1992, 3, 3), ContactNumber = "09180000003" };
        var q3 = new QueueItem { Id = Guid.NewGuid(), TenantId = _testTenantId, ClinicId = _testClinicId, QueueNumber = "V-003", SequenceNumber = 3, QueueDate = DateOnly.FromDateTime(DateTime.UtcNow), PatientId = p3.Id, PatientName = "RoomC Unassigned", RoomId = roomC, Status = QueueStatus.Waiting };

        // Patient 4: Completed in Room A -> NO MATCH
        var p4 = new Patient { Id = Guid.NewGuid(), TenantId = _testTenantId, ClinicId = _testClinicId, PatientCode = "PAT-N-04", FirstName = "RoomA", LastName = "Completed", DateOfBirth = new DateOnly(1993, 4, 4), ContactNumber = "09180000004" };
        var q4 = new QueueItem { Id = Guid.NewGuid(), TenantId = _testTenantId, ClinicId = _testClinicId, QueueNumber = "V-004", SequenceNumber = 4, QueueDate = DateOnly.FromDateTime(DateTime.UtcNow), PatientId = p4.Id, PatientName = "RoomA Completed", RoomId = roomA, Status = QueueStatus.Completed };

        // Patient 5: Cancelled in Room B -> NO MATCH
        var p5 = new Patient { Id = Guid.NewGuid(), TenantId = _testTenantId, ClinicId = _testClinicId, PatientCode = "PAT-N-05", FirstName = "RoomB", LastName = "Cancelled", DateOfBirth = new DateOnly(1994, 5, 5), ContactNumber = "09180000005" };
        var q5 = new QueueItem { Id = Guid.NewGuid(), TenantId = _testTenantId, ClinicId = _testClinicId, QueueNumber = "V-005", SequenceNumber = 5, QueueDate = DateOnly.FromDateTime(DateTime.UtcNow), PatientId = p5.Id, PatientName = "RoomB Cancelled", RoomId = roomB, Status = QueueStatus.Cancelled };

        // Patient 6: NoShow in Room A -> NO MATCH
        var p6 = new Patient { Id = Guid.NewGuid(), TenantId = _testTenantId, ClinicId = _testClinicId, PatientCode = "PAT-N-06", FirstName = "RoomA", LastName = "NoShow", DateOfBirth = new DateOnly(1995, 6, 6), ContactNumber = "09180000006" };
        var q6 = new QueueItem { Id = Guid.NewGuid(), TenantId = _testTenantId, ClinicId = _testClinicId, QueueNumber = "V-006", SequenceNumber = 6, QueueDate = DateOnly.FromDateTime(DateTime.UtcNow), PatientId = p6.Id, PatientName = "RoomA NoShow", RoomId = roomA, Status = QueueStatus.NoShow };

        // Patient 7: Queue in Room C, but Vitals recorded by Nurse -> MATCH
        var p7 = new Patient { Id = Guid.NewGuid(), TenantId = _testTenantId, ClinicId = _testClinicId, PatientCode = "PAT-N-07", FirstName = "Vitals", LastName = "NurseMatch", DateOfBirth = new DateOnly(1996, 7, 7), ContactNumber = "09180000007" };
        p7.Vitals.Add(new PatientVitals { TenantId = _testTenantId, ClinicId = _testClinicId, PatientId = p7.Id, NurseId = nurseId, RecordedByNurseName = "Nurse Joy" });
        var q7 = new QueueItem { Id = Guid.NewGuid(), TenantId = _testTenantId, ClinicId = _testClinicId, QueueNumber = "V-007", SequenceNumber = 7, QueueDate = DateOnly.FromDateTime(DateTime.UtcNow), PatientId = p7.Id, PatientName = "Vitals NurseMatch", RoomId = roomC, Status = QueueStatus.Waiting };

        // Patient 8: CustomFields nurse_id -> MATCH
        var p8 = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-N-08",
            FirstName = "Custom",
            LastName = "NurseId",
            DateOfBirth = new DateOnly(1997, 8, 8),
            ContactNumber = "09180000008",
            CustomFields = new Dictionary<string, object?> { ["nurse_id"] = nurseId.ToString() }
        };

        // Patient 9: CustomFields assigned_nurse_id -> MATCH
        var p9 = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-N-09",
            FirstName = "Custom",
            LastName = "AssignedNurseId",
            DateOfBirth = new DateOnly(1998, 9, 9),
            ContactNumber = "09180000009",
            CustomFields = new Dictionary<string, object?> { ["assigned_nurse_id"] = nurseId.ToString() }
        };

        context.Patients.AddRange(p1, p2, p3, p4, p5, p6, p7, p8, p9);
        context.QueueItems.AddRange(q1, q2, q3, q4, q5, q6, q7);
        await context.SaveChangesAsync();

        // Act: Multi-room query with RoomA & RoomB
        var multiRoomList = await queryHandler.Handle(new GetClinicPatientsQuery(
            FilterMode: "MY_PATIENTS",
            StaffId: nurseId,
            RoomIds: new[] { roomA, roomB }), CancellationToken.None);

        var multiRoomCounts = await countsHandler.Handle(new GetClinicPatientCountsQuery(
            StaffId: nurseId,
            RoomIds: new[] { roomA, roomB }), CancellationToken.None);

        // Assert: Exactly 5 matched: p1, p2, p7, p8, p9
        multiRoomList.Should().HaveCount(5);
        multiRoomList.Select(x => x.Id).Should().BeEquivalentTo(new[] { p1.Id, p2.Id, p7.Id, p8.Id, p9.Id });
        multiRoomCounts.MyPatients.Should().Be(5);
        multiRoomCounts.All.Should().Be(9);
    }

    [Fact]
    public async Task NurseWithSingleRoom_IsolatesOnlyThatRoom()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);

        var queryHandler = new GetClinicPatientsQueryHandler(patientRepo, queueRepo, encounterRepo);
        var countsHandler = new GetClinicPatientCountsQueryHandler(patientRepo, queueRepo, encounterRepo);

        var nurseId = Guid.NewGuid();
        var roomA = Guid.NewGuid();
        var roomB = Guid.NewGuid();

        var pA = new Patient { Id = Guid.NewGuid(), TenantId = _testTenantId, ClinicId = _testClinicId, PatientCode = "PAT-S-A", FirstName = "Patient", LastName = "RoomA", DateOfBirth = new DateOnly(1990, 1, 1), ContactNumber = "09190000001" };
        var qA = new QueueItem { Id = Guid.NewGuid(), TenantId = _testTenantId, ClinicId = _testClinicId, QueueNumber = "V-010", SequenceNumber = 10, QueueDate = DateOnly.FromDateTime(DateTime.UtcNow), PatientId = pA.Id, PatientName = "Patient RoomA", RoomId = roomA, Status = QueueStatus.Waiting };

        var pB = new Patient { Id = Guid.NewGuid(), TenantId = _testTenantId, ClinicId = _testClinicId, PatientCode = "PAT-S-B", FirstName = "Patient", LastName = "RoomB", DateOfBirth = new DateOnly(1991, 2, 2), ContactNumber = "09190000002" };
        var qB = new QueueItem { Id = Guid.NewGuid(), TenantId = _testTenantId, ClinicId = _testClinicId, QueueNumber = "V-011", SequenceNumber = 11, QueueDate = DateOnly.FromDateTime(DateTime.UtcNow), PatientId = pB.Id, PatientName = "Patient RoomB", RoomId = roomB, Status = QueueStatus.Waiting };

        context.Patients.AddRange(pA, pB);
        context.QueueItems.AddRange(qA, qB);
        await context.SaveChangesAsync();

        // Query only roomA
        var singleRoomList = await queryHandler.Handle(new GetClinicPatientsQuery(
            FilterMode: "MY_PATIENTS",
            StaffId: nurseId,
            RoomIds: new[] { roomA }), CancellationToken.None);

        var singleRoomCounts = await countsHandler.Handle(new GetClinicPatientCountsQuery(
            StaffId: nurseId,
            RoomIds: new[] { roomA }), CancellationToken.None);

        singleRoomList.Should().HaveCount(1);
        singleRoomList[0].Id.Should().Be(pA.Id);
        singleRoomCounts.MyPatients.Should().Be(1);
    }

    [Fact]
    public async Task NurseWithNoRoomsOrEmptyList_ExcludesRoomQueuedPatients()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);

        var queryHandler = new GetClinicPatientsQueryHandler(patientRepo, queueRepo, encounterRepo);
        var countsHandler = new GetClinicPatientCountsQueryHandler(patientRepo, queueRepo, encounterRepo);

        var nurseId = Guid.NewGuid();
        var roomA = Guid.NewGuid();

        var pQueueOnly = new Patient { Id = Guid.NewGuid(), TenantId = _testTenantId, ClinicId = _testClinicId, PatientCode = "PAT-NOROOM-01", FirstName = "Queue", LastName = "Only", DateOfBirth = new DateOnly(1990, 1, 1), ContactNumber = "09200000001" };
        var qA = new QueueItem { Id = Guid.NewGuid(), TenantId = _testTenantId, ClinicId = _testClinicId, QueueNumber = "V-020", SequenceNumber = 20, QueueDate = DateOnly.FromDateTime(DateTime.UtcNow), PatientId = pQueueOnly.Id, PatientName = "Queue Only", RoomId = roomA, Status = QueueStatus.Waiting };

        var pVitals = new Patient { Id = Guid.NewGuid(), TenantId = _testTenantId, ClinicId = _testClinicId, PatientCode = "PAT-NOROOM-02", FirstName = "Nurse", LastName = "VitalsOnly", DateOfBirth = new DateOnly(1991, 2, 2), ContactNumber = "09200000002" };
        pVitals.Vitals.Add(new PatientVitals { TenantId = _testTenantId, ClinicId = _testClinicId, PatientId = pVitals.Id, NurseId = nurseId });

        context.Patients.AddRange(pQueueOnly, pVitals);
        context.QueueItems.Add(qA);
        await context.SaveChangesAsync();

        // Case A: RoomIds is null
        var nullRoomList = await queryHandler.Handle(new GetClinicPatientsQuery(
            FilterMode: "MY_PATIENTS",
            StaffId: nurseId,
            RoomIds: null), CancellationToken.None);

        var nullRoomCounts = await countsHandler.Handle(new GetClinicPatientCountsQuery(
            StaffId: nurseId,
            RoomIds: null), CancellationToken.None);

        nullRoomList.Should().HaveCount(1);
        nullRoomList[0].Id.Should().Be(pVitals.Id);
        nullRoomCounts.MyPatients.Should().Be(1);

        // Case B: RoomIds is empty list
        var emptyRoomList = await queryHandler.Handle(new GetClinicPatientsQuery(
            FilterMode: "MY_PATIENTS",
            StaffId: nurseId,
            RoomIds: Array.Empty<Guid>()), CancellationToken.None);

        var emptyRoomCounts = await countsHandler.Handle(new GetClinicPatientCountsQuery(
            StaffId: nurseId,
            RoomIds: Array.Empty<Guid>()), CancellationToken.None);

        emptyRoomList.Should().HaveCount(1);
        emptyRoomList[0].Id.Should().Be(pVitals.Id);
        emptyRoomCounts.MyPatients.Should().Be(1);
    }

    [Fact]
    public async Task MissingStaffIdOrNullParameters_SafeFallback()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);

        var queryHandler = new GetClinicPatientsQueryHandler(patientRepo, queueRepo, encounterRepo);
        var countsHandler = new GetClinicPatientCountsQueryHandler(patientRepo, queueRepo, encounterRepo);

        var p1 = new Patient { Id = Guid.NewGuid(), TenantId = _testTenantId, ClinicId = _testClinicId, PatientCode = "PAT-NULL-01", FirstName = "Null", LastName = "Staff", DateOfBirth = new DateOnly(1990, 1, 1), ContactNumber = "09210000001" };
        context.Patients.Add(p1);
        await context.SaveChangesAsync();

        // Query with FilterMode: "MY_PATIENTS" but no staffId or doctorId
        var listResult = await queryHandler.Handle(new GetClinicPatientsQuery(
            FilterMode: "MY_PATIENTS",
            StaffId: null,
            DoctorId: null), CancellationToken.None);

        var countsResult = await countsHandler.Handle(new GetClinicPatientCountsQuery(
            StaffId: null,
            DoctorId: null), CancellationToken.None);

        listResult.Should().BeEmpty();
        countsResult.All.Should().Be(1);
        countsResult.MyPatients.Should().Be(0);

        // Query without FilterMode (returns all)
        var allListResult = await queryHandler.Handle(new GetClinicPatientsQuery(
            FilterMode: null,
            StaffId: null,
            DoctorId: null), CancellationToken.None);

        allListResult.Should().HaveCount(1);
    }

    [Fact]
    public async Task DeletedVitalsAndNullNurseId_NeverMatched()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var queryHandler = new GetClinicPatientsQueryHandler(patientRepo);
        var countsHandler = new GetClinicPatientCountsQueryHandler(patientRepo);

        var nurseId = Guid.NewGuid();

        // 1. Patient with deleted vitals recorded by nurse
        var pDeletedVitals = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-DEL-01",
            FirstName = "Deleted",
            LastName = "Vitals",
            DateOfBirth = new DateOnly(1990, 1, 1),
            ContactNumber = "09220000001"
        };
        pDeletedVitals.Vitals.Add(new PatientVitals
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = pDeletedVitals.Id,
            NurseId = nurseId,
            IsDeleted = true // SOFT DELETED
        });

        // 2. Patient with vitals where NurseId is null
        var pNullNurse = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-DEL-02",
            FirstName = "Null",
            LastName = "NurseVitals",
            DateOfBirth = new DateOnly(1991, 2, 2),
            ContactNumber = "09220000002"
        };
        pNullNurse.Vitals.Add(new PatientVitals
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = pNullNurse.Id,
            NurseId = null,
            IsDeleted = false
        });

        context.Patients.AddRange(pDeletedVitals, pNullNurse);
        await context.SaveChangesAsync();

        var listResult = await queryHandler.Handle(new GetClinicPatientsQuery(
            FilterMode: "MY_PATIENTS",
            StaffId: nurseId), CancellationToken.None);

        var countsResult = await countsHandler.Handle(new GetClinicPatientCountsQuery(
            StaffId: nurseId), CancellationToken.None);

        listResult.Should().BeEmpty();
        countsResult.MyPatients.Should().Be(0);
    }

    [Fact]
    public async Task CustomFields_EdgeCases_CaseInsensitivity_AndNullValues()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var queryHandler = new GetClinicPatientsQueryHandler(patientRepo);
        var countsHandler = new GetClinicPatientCountsQueryHandler(patientRepo);

        var doctorId = Guid.NewGuid();

        // 1. Patient with null value in dictionary
        var pNullValue = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-CF-01",
            FirstName = "NullValue",
            LastName = "Custom",
            DateOfBirth = new DateOnly(1990, 1, 1),
            ContactNumber = "09230000001",
            CustomFields = new Dictionary<string, object?> { ["assigned_doctor_id"] = null }
        };

        // 2. Patient with uppercase GUID string -> MATCH
        var pUpperGuid = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-CF-02",
            FirstName = "UpperGuid",
            LastName = "Custom",
            DateOfBirth = new DateOnly(1991, 2, 2),
            ContactNumber = "09230000002",
            CustomFields = new Dictionary<string, object?> { ["doctor_id"] = doctorId.ToString().ToUpperInvariant() }
        };

        // 3. Patient with lowercase GUID string -> MATCH
        var pLowerGuid = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-CF-03",
            FirstName = "LowerGuid",
            LastName = "Custom",
            DateOfBirth = new DateOnly(1992, 3, 3),
            ContactNumber = "09230000003",
            CustomFields = new Dictionary<string, object?> { ["doctor_id"] = doctorId.ToString().ToLowerInvariant() }
        };

        // 4. Patient with non-string values (int, bool, nested list) -> NO CRASH, NO FALSE MATCH
        var pNonString = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-CF-04",
            FirstName = "NonString",
            LastName = "Custom",
            DateOfBirth = new DateOnly(1993, 4, 4),
            ContactNumber = "09230000004",
            CustomFields = new Dictionary<string, object?>
            {
                ["assigned_doctor_id"] = 12345,
                ["is_vip"] = true,
                ["tags"] = new List<string> { "VIP", "Executive" }
            }
        };

        // 5. Patient with custom key containing doctor GUID -> MATCH
        var pGenericKey = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-CF-05",
            FirstName = "GenericKey",
            LastName = "Custom",
            DateOfBirth = new DateOnly(1994, 5, 5),
            ContactNumber = "09230000005",
            CustomFields = new Dictionary<string, object?> { ["primary_consultant_guid"] = doctorId.ToString() }
        };

        context.Patients.AddRange(pNullValue, pUpperGuid, pLowerGuid, pNonString, pGenericKey);
        await context.SaveChangesAsync();

        var listResult = await queryHandler.Handle(new GetClinicPatientsQuery(
            FilterMode: "MY_PATIENTS",
            DoctorId: doctorId), CancellationToken.None);

        var countsResult = await countsHandler.Handle(new GetClinicPatientCountsQuery(
            DoctorId: doctorId), CancellationToken.None);

        // Expected matches: pUpperGuid, pLowerGuid, pGenericKey (3 patients)
        listResult.Should().HaveCount(3);
        listResult.Select(x => x.Id).Should().BeEquivalentTo(new[] { pUpperGuid.Id, pLowerGuid.Id, pGenericKey.Id });
        countsResult.MyPatients.Should().Be(3);
    }

    [Fact]
    public async Task ConsultationEncounter_PastPatient_MatchesDoctor()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);

        var queryHandler = new GetClinicPatientsQueryHandler(patientRepo, queueRepo, encounterRepo);
        var countsHandler = new GetClinicPatientCountsQueryHandler(patientRepo, queueRepo, encounterRepo);

        var doctorId = Guid.NewGuid();
        var otherDoctorId = Guid.NewGuid();

        var pEncounterDoctor = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-ENC-01",
            FirstName = "PastEncounter",
            LastName = "SeenByDoctor",
            DateOfBirth = new DateOnly(1990, 1, 1),
            ContactNumber = "09240000001"
        };
        var enc1 = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = pEncounterDoctor.Id,
            PatientName = "PastEncounter SeenByDoctor",
            DoctorId = doctorId,
            DoctorName = "Dr. Maria Santos",
            Subjective = "Cough",
            Objective = "Clear lungs",
            Assessment = "URTI",
            Plan = "Hydration"
        };

        var pEncounterOther = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-ENC-02",
            FirstName = "PastEncounter",
            LastName = "SeenByOther",
            DateOfBirth = new DateOnly(1991, 2, 2),
            ContactNumber = "09240000002"
        };
        var enc2 = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = pEncounterOther.Id,
            PatientName = "PastEncounter SeenByOther",
            DoctorId = otherDoctorId,
            DoctorName = "Dr. Other",
            Subjective = "Fever",
            Objective = "Temp 38C",
            Assessment = "Fever",
            Plan = "Paracetamol"
        };

        context.Patients.AddRange(pEncounterDoctor, pEncounterOther);
        context.Consultations.AddRange(enc1, enc2);
        await context.SaveChangesAsync();

        var listResult = await queryHandler.Handle(new GetClinicPatientsQuery(
            FilterMode: "MY_PATIENTS",
            DoctorId: doctorId), CancellationToken.None);

        var countsResult = await countsHandler.Handle(new GetClinicPatientCountsQuery(
            DoctorId: doctorId), CancellationToken.None);

        listResult.Should().HaveCount(1);
        listResult[0].Id.Should().Be(pEncounterDoctor.Id);
        countsResult.MyPatients.Should().Be(1);
    }

    [Fact]
    public async Task CombinedSearchAndPaginationStress_WithMyPatients()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var queryHandler = new GetClinicPatientsQueryHandler(patientRepo);

        var doctorId = Guid.NewGuid();

        // Seed 15 patients assigned to this doctor with sequential names
        var patients = new List<Patient>();
        for (int i = 1; i <= 15; i++)
        {
            patients.Add(new Patient
            {
                Id = Guid.NewGuid(),
                TenantId = _testTenantId,
                ClinicId = _testClinicId,
                PatientCode = $"PAT-PAG-{i:D3}",
                FirstName = $"Patient{i:D2}",
                LastName = i <= 5 ? "Alpha" : (i <= 10 ? "Beta" : "Gamma"),
                DateOfBirth = new DateOnly(1990, 1, 1).AddDays(i),
                ContactNumber = $"09250000{i:D3}",
                CustomFields = new Dictionary<string, object?> { ["assigned_doctor_id"] = doctorId.ToString() }
            });
        }
        context.Patients.AddRange(patients);
        await context.SaveChangesAsync();

        // Paging: Page 1, Size 5 -> 5 items
        var page1 = await queryHandler.Handle(new GetClinicPatientsQuery(
            FilterMode: "MY_PATIENTS",
            DoctorId: doctorId,
            PageNumber: 1,
            PageSize: 5), CancellationToken.None);

        page1.Should().HaveCount(5);

        // Paging: Page 2, Size 5 -> next 5 items
        var page2 = await queryHandler.Handle(new GetClinicPatientsQuery(
            FilterMode: "MY_PATIENTS",
            DoctorId: doctorId,
            PageNumber: 2,
            PageSize: 5), CancellationToken.None);

        page2.Should().HaveCount(5);
        page1.Select(x => x.Id).Should().NotIntersectWith(page2.Select(x => x.Id));

        // Paging beyond bounds: Page 5, Size 5 -> empty
        var page5 = await queryHandler.Handle(new GetClinicPatientsQuery(
            FilterMode: "MY_PATIENTS",
            DoctorId: doctorId,
            PageNumber: 5,
            PageSize: 5), CancellationToken.None);

        page5.Should().BeEmpty();

        // Search within MY_PATIENTS: Search "Alpha" -> 5 items
        var alphaSearch = await queryHandler.Handle(new GetClinicPatientsQuery(
            SearchTerm: "Alpha",
            FilterMode: "MY_PATIENTS",
            DoctorId: doctorId,
            PageNumber: 1,
            PageSize: 50), CancellationToken.None);

        alphaSearch.Should().HaveCount(5);
        alphaSearch.All(x => x.LastName == "Alpha").Should().BeTrue();
    }

    [Fact]
    public async Task ConcurrentQueryStress_MaintainsStabilityAndThreadSafety()
    {
        var sharedDbName = $"ClinicEz_Concurrent_TestDb_{Guid.NewGuid()}";
        var (seedContext, _, seedSieve) = TestDbHelper.CreateSharedTestContext(sharedDbName, _clinicContext);

        var doctorA = Guid.NewGuid();
        var doctorB = Guid.NewGuid();

        var pA = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-CONC-A",
            FirstName = "DoctorA",
            LastName = "Patient",
            DateOfBirth = new DateOnly(1990, 1, 1),
            ContactNumber = "09260000001",
            CustomFields = new Dictionary<string, object?> { ["assigned_doctor_id"] = doctorA.ToString() }
        };
        var pB = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-CONC-B",
            FirstName = "DoctorB",
            LastName = "Patient",
            DateOfBirth = new DateOnly(1991, 2, 2),
            ContactNumber = "09260000002",
            CustomFields = new Dictionary<string, object?> { ["assigned_doctor_id"] = doctorB.ToString() }
        };
        seedContext.Patients.AddRange(pA, pB);
        await seedContext.SaveChangesAsync();

        // Run 40 concurrent operations with scoped contexts simulating web requests
        var tasks = new List<Task>();
        for (int i = 0; i < 20; i++)
        {
            tasks.Add(Task.Run(async () =>
            {
                var (taskCtx, _, taskSieve) = TestDbHelper.CreateSharedTestContext(sharedDbName, _clinicContext);
                var repo = TestDbHelper.CreateRepository<Patient>(taskCtx, taskSieve);
                var handler = new GetClinicPatientsQueryHandler(repo);

                var res = await handler.Handle(new GetClinicPatientsQuery(
                    FilterMode: "MY_PATIENTS",
                    DoctorId: doctorA), CancellationToken.None);
                res.Should().HaveCount(1);
                res[0].Id.Should().Be(pA.Id);
            }));

            tasks.Add(Task.Run(async () =>
            {
                var (taskCtx, _, taskSieve) = TestDbHelper.CreateSharedTestContext(sharedDbName, _clinicContext);
                var repo = TestDbHelper.CreateRepository<Patient>(taskCtx, taskSieve);
                var handler = new GetClinicPatientCountsQueryHandler(repo);

                var cnt = await handler.Handle(new GetClinicPatientCountsQuery(
                    DoctorId: doctorB), CancellationToken.None);
                cnt.All.Should().Be(2);
                cnt.MyPatients.Should().Be(1);
            }));
        }

        await Task.WhenAll(tasks);
    }

    [Fact]
    public async Task Handle_Issue170_ProjectsAlertsAllergiesAndActiveQueueRoomId()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var handler = new GetClinicPatientsQueryHandler(patientRepo, queueRepo);

        var doctorId = Guid.NewGuid();
        var roomId = Guid.NewGuid();
        var tz = ClinicEz.Clinic.Application.Common.Helpers.ClinicTimeZoneResolver.ResolveTimeZone("Asia/Manila");
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz));

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-PROJ-01",
            FirstName = "Juan",
            LastName = "Projection",
            DateOfBirth = new DateOnly(1990, 5, 20),
            ContactNumber = "09170000999",
            HasActiveSafetyAlert = false
        };

        patient.Alerts.Add(new PatientAlert
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            Category = PatientAlertCategory.FallRisk,
            Code = "FALL",
            Title = "High Fall Risk",
            Status = PatientAlertStatus.Active
        });

        patient.Allergies = new List<PatientAllergy>
        {
            new PatientAllergy
            {
                TenantId = _testTenantId,
                ClinicId = _testClinicId,
                Allergen = "Amoxicillin",
                Status = AllergyStatus.Active
            }
        };

        var qItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = patient.Id,
            PatientName = $"{patient.LastName}, {patient.FirstName}",
            QueueNumber = "Q-100",
            QueueDate = today,
            DoctorId = doctorId,
            RoomId = roomId,
            Status = QueueStatus.Waiting
        };

        context.Patients.Add(patient);
        context.QueueItems.Add(qItem);
        await context.SaveChangesAsync();

        var result = await handler.Handle(new GetClinicPatientsQuery(
            FilterMode: "MY_PATIENTS",
            DoctorId: doctorId), CancellationToken.None);

        result.Should().HaveCount(1);
        var dto = result[0];
        dto.Alerts.Should().Be("High Fall Risk");
        dto.Allergies.Should().Be("Amoxicillin");
        dto.ActiveQueueTickets.Should().NotBeNull();
        dto.ActiveQueueTickets!.Should().HaveCount(1);
        dto.ActiveQueueTickets![0].RoomId.Should().Be(roomId);
        dto.CustomFields.Should().NotBeNull();
        dto.CustomFields!["activeQueueRoomId"]?.ToString().Should().Be(roomId.ToString());
    }
}
