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
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Patients;

public class GetClinicPatientsQueryTests
{
    private readonly Guid _testClinicId = Guid.NewGuid();
    private readonly string _testTenantId = "tenant-cursor-test";
    private readonly IClinicContext _clinicContext;

    public GetClinicPatientsQueryTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_testClinicId);
        _clinicContext.TenantId.Returns(_testTenantId);
    }

    [Fact]
    public async Task KeysetCursorPagination_NavigatesCleanlyAcrossPages()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var handler = new GetClinicPatientsQueryHandler(repo);

        // Seed 5 patients ordered alphabetically by LastName, FirstName
        var p1 = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-001",
            FirstName = "Alice",
            LastName = "Adams",
            DateOfBirth = new DateOnly(1990, 1, 1),
            Sex = BiologicalSex.Female,
            ContactNumber = "09110000001"
        };
        var p2 = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-002",
            FirstName = "Bob",
            LastName = "Brown",
            DateOfBirth = new DateOnly(1991, 2, 2),
            Sex = BiologicalSex.Male,
            ContactNumber = "09110000002"
        };
        var p3 = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-003",
            FirstName = "Charlie",
            LastName = "Clark",
            DateOfBirth = new DateOnly(1992, 3, 3),
            Sex = BiologicalSex.Male,
            ContactNumber = "09110000003"
        };
        var p4 = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-004",
            FirstName = "David",
            LastName = "Davis",
            DateOfBirth = new DateOnly(1993, 4, 4),
            Sex = BiologicalSex.Male,
            ContactNumber = "09110000004"
        };
        var p5 = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-005",
            FirstName = "Eva",
            LastName = "Evans",
            DateOfBirth = new DateOnly(1994, 5, 5),
            Sex = BiologicalSex.Female,
            ContactNumber = "09110000005"
        };

        context.Patients.AddRange(p1, p2, p3, p4, p5);
        await context.SaveChangesAsync();

        // Page 1: 2 items
        var page1 = await handler.Handle(new GetClinicPatientsQuery(PageSize: 2), CancellationToken.None);
        page1.Should().HaveCount(2);
        page1[0].LastName.Should().Be("Adams");
        page1[1].LastName.Should().Be("Brown");

        // Page 2 using cursor from last item of page 1
        var lastOfPage1 = page1[^1];
        var page2 = await handler.Handle(new GetClinicPatientsQuery(
            CursorLastName: lastOfPage1.LastName,
            CursorFirstName: lastOfPage1.FirstName,
            CursorId: lastOfPage1.Id,
            PageSize: 2), CancellationToken.None);

        page2.Should().HaveCount(2);
        page2[0].LastName.Should().Be("Clark");
        page2[1].LastName.Should().Be("Davis");

        // Page 3 using cursor from last item of page 2
        var lastOfPage2 = page2[^1];
        var page3 = await handler.Handle(new GetClinicPatientsQuery(
            CursorLastName: lastOfPage2.LastName,
            CursorFirstName: lastOfPage2.FirstName,
            CursorId: lastOfPage2.Id,
            PageSize: 2), CancellationToken.None);

        page3.Should().HaveCount(1);
        page3[0].LastName.Should().Be("Evans");
    }

    [Fact]
    public async Task FilterMode_MyPatients_ForDoctor_ReturnsAssignedAndSeenPatients()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var handler = new GetClinicPatientsQueryHandler(repo, queueRepo);

        var doctorId = Guid.NewGuid();
        var otherDoctorId = Guid.NewGuid();

        // 1. Patient with assigned_doctor_id
        var p1 = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-DOC-001",
            FirstName = "Juan",
            LastName = "Assigned",
            DateOfBirth = new DateOnly(1990, 1, 1),
            ContactNumber = "09110000001",
            CustomFields = new Dictionary<string, object?> { ["assigned_doctor_id"] = doctorId.ToString() }
        };

        // 2. Patient with doctor_id
        var p2 = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-DOC-002",
            FirstName = "Maria",
            LastName = "Seen",
            DateOfBirth = new DateOnly(1992, 2, 2),
            ContactNumber = "09110000002",
            CustomFields = new Dictionary<string, object?> { ["doctor_id"] = doctorId.ToString() }
        };

        // 3. Patient with active queue ticket for this doctor
        var p3 = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-DOC-003",
            FirstName = "Pedro",
            LastName = "Queued",
            DateOfBirth = new DateOnly(1994, 3, 3),
            ContactNumber = "09110000003"
        };
        var q3 = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            QueueNumber = "Q-001",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            PatientId = p3.Id,
            PatientName = "Pedro Queued",
            DoctorId = doctorId,
            Status = QueueStatus.Waiting
        };

        // 4. Other doctor's patient
        var pOther = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-DOC-OTHER",
            FirstName = "Carlos",
            LastName = "Other",
            DateOfBirth = new DateOnly(1995, 4, 4),
            ContactNumber = "09110000004",
            CustomFields = new Dictionary<string, object?> { ["assigned_doctor_id"] = otherDoctorId.ToString() }
        };

        context.Patients.AddRange(p1, p2, p3, pOther);
        context.QueueItems.Add(q3);
        await context.SaveChangesAsync();

        var result = await handler.Handle(new GetClinicPatientsQuery(
            FilterMode: "MY_PATIENTS",
            DoctorId: doctorId), CancellationToken.None);

        result.Should().HaveCount(3);
        result.Select(x => x.Id).Should().Contain(new[] { p1.Id, p2.Id, p3.Id });
        result.Select(x => x.Id).Should().NotContain(pOther.Id);
    }

    [Fact]
    public async Task FilterMode_MyPatients_ForNurse_ReturnsVitalsRecordedAndRoomPatients()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var handler = new GetClinicPatientsQueryHandler(repo, queueRepo);

        var nurseId = Guid.NewGuid();
        var nurseRoomId = Guid.NewGuid();

        // 1. Patient with vitals recorded by nurse
        var p1 = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-NURSE-001",
            FirstName = "Ana",
            LastName = "VitalsPatient",
            DateOfBirth = new DateOnly(1990, 5, 5),
            ContactNumber = "09110000010"
        };
        p1.Vitals.Add(new PatientVitals
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = p1.Id,
            NurseId = nurseId,
            RecordedByNurseName = "Nurse Joy"
        });

        // 2. Patient with nurse_id in CustomFields
        var p2 = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-NURSE-002",
            FirstName = "Bella",
            LastName = "NurseCustom",
            DateOfBirth = new DateOnly(1991, 6, 6),
            ContactNumber = "09110000011",
            CustomFields = new Dictionary<string, object?> { ["nurse_id"] = nurseId.ToString() }
        };

        // 3. Patient with active queue ticket in nurse's assigned room
        var p3 = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-NURSE-003",
            FirstName = "Carla",
            LastName = "RoomQueued",
            DateOfBirth = new DateOnly(1992, 7, 7),
            ContactNumber = "09110000012"
        };
        var q3 = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            QueueNumber = "V-001",
            SequenceNumber = 1,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            PatientId = p3.Id,
            PatientName = "Carla RoomQueued",
            RoomId = nurseRoomId,
            Status = QueueStatus.Waiting
        };

        // 4. Other patient with no connection to nurse
        var pOther = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-NURSE-OTHER",
            FirstName = "Diana",
            LastName = "Unrelated",
            DateOfBirth = new DateOnly(1993, 8, 8),
            ContactNumber = "09110000013"
        };

        context.Patients.AddRange(p1, p2, p3, pOther);
        context.QueueItems.Add(q3);
        await context.SaveChangesAsync();

        var result = await handler.Handle(new GetClinicPatientsQuery(
            FilterMode: "MY_PATIENTS",
            StaffId: nurseId,
            RoomIds: new[] { nurseRoomId }), CancellationToken.None);

        result.Should().HaveCount(3);
        result.Select(x => x.Id).Should().Contain(new[] { p1.Id, p2.Id, p3.Id });
        result.Select(x => x.Id).Should().NotContain(pOther.Id);
    }

    [Fact]
    public async Task FilterMode_MyPatients_WithoutStaffId_ReturnsEmpty()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var handler = new GetClinicPatientsQueryHandler(repo);

        var p1 = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-NO-STAFF",
            FirstName = "Test",
            LastName = "Patient",
            DateOfBirth = new DateOnly(1990, 1, 1),
            ContactNumber = "09110000099"
        };
        context.Patients.Add(p1);
        await context.SaveChangesAsync();

        var result = await handler.Handle(new GetClinicPatientsQuery(
            FilterMode: "MY_PATIENTS",
            StaffId: null,
            DoctorId: null), CancellationToken.None);

        result.Should().BeEmpty();
    }

    [Fact]
    public async Task ActiveQueueTicket_ScopesToTargetDate_AndExpiresYesterdayTickets()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var handler = new GetClinicPatientsQueryHandler(repo, queueRepo);

        var today = new DateOnly(2026, 11, 2);
        var yesterday = new DateOnly(2026, 11, 1);

        // Patient 1: Had an open ticket yesterday that was never completed
        var p1 = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-YESTERDAY",
            FirstName = "Bea",
            LastName = "Abellana",
            DateOfBirth = new DateOnly(1985, 11, 14),
            Sex = BiologicalSex.Female,
            ContactNumber = "09194319725"
        };
        var q1 = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            QueueNumber = "Q-001",
            SequenceNumber = 1,
            QueueDate = yesterday,
            PatientId = p1.Id,
            PatientName = "Abellana, Bea M.",
            Status = QueueStatus.Waiting
        };

        // Patient 2: Has an active ticket today
        var p2 = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-TODAY",
            FirstName = "Banahaw",
            LastName = "Agcaoili",
            DateOfBirth = new DateOnly(1970, 8, 20),
            Sex = BiologicalSex.Male,
            ContactNumber = "09499312749"
        };
        var q2 = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            QueueNumber = "Q-005",
            SequenceNumber = 5,
            QueueDate = today,
            PatientId = p2.Id,
            PatientName = "Agcaoili, Banahaw V.",
            Status = QueueStatus.Waiting
        };

        context.Patients.AddRange(p1, p2);
        context.QueueItems.AddRange(q1, q2);
        await context.SaveChangesAsync();

        // Act: Query for today (2026-11-02)
        var result = await handler.Handle(new GetClinicPatientsQuery(QueueDate: today), CancellationToken.None);

        // Assert
        var patient1Result = result.FirstOrDefault(x => x.Id == p1.Id);
        var patient2Result = result.FirstOrDefault(x => x.Id == p2.Id);

        patient1Result.Should().NotBeNull();
        patient1Result!.ActiveQueueTicket.Should().BeNull("yesterday's unserved ticket must not bleed into today's queue");

        patient2Result.Should().NotBeNull();
        patient2Result!.ActiveQueueTicket.Should().Be("Q-005", "today's ticket is active");
    }
}

