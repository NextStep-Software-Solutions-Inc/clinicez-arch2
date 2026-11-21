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
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
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

    [Fact]
    public async Task FilterMode_Students_ReturnsStudentsAndExcludesBlankIds_OnDirectLoadAndTabSwitching()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var handler = new GetClinicPatientsQueryHandler(repo, queueRepo, encounterRepo);

        var doctorId = Guid.NewGuid();

        var studentByClassification = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "STU-001",
            FirstName = "Angela",
            LastName = "Aquino",
            DateOfBirth = new DateOnly(2006, 4, 12),
            ContactNumber = "09171110001",
            CustomFields = new Dictionary<string, object?> { ["classification"] = "Student" }
        };

        var studentByCategory = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "STU-002",
            FirstName = "Bryan",
            LastName = "Bautista",
            DateOfBirth = new DateOnly(2005, 9, 20),
            ContactNumber = "09171110002",
            CustomFields = new Dictionary<string, object?> { ["category"] = "student" }
        };

        var studentByIdOnly = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "STU-003",
            FirstName = "Camille",
            LastName = "Cruz",
            DateOfBirth = new DateOnly(2007, 1, 15),
            ContactNumber = "09171110003",
            CustomFields = new Dictionary<string, object?> { ["student_id"] = "2026-00419" }
        };

        var generalWithBlankStudentId = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "GEN-001",
            FirstName = "Dennis",
            LastName = "Dizon",
            DateOfBirth = new DateOnly(1990, 6, 10),
            ContactNumber = "09171110004",
            CustomFields = new Dictionary<string, object?> { ["classification"] = "General", ["student_id"] = "   " }
        };

        var employeeWithNullStudentId = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "EMP-001",
            FirstName = "Elena",
            LastName = "Espino",
            DateOfBirth = new DateOnly(1986, 3, 5),
            ContactNumber = "09171110005",
            HasActiveSafetyAlert = true,
            CustomFields = new Dictionary<string, object?>
            {
                ["classification"] = "Employee",
                ["employee_id"] = "EMP-1001",
                ["student_id"] = null,
                ["assigned_doctor_id"] = doctorId.ToString()
            }
        };

        var seniorPatient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "SEN-001",
            FirstName = "Francisco",
            LastName = "Flores",
            DateOfBirth = new DateOnly(1955, 11, 2),
            ContactNumber = "09171110006",
            SeniorCitizenId = "OSCA-8891",
            CustomFields = new Dictionary<string, object?> { ["student_id"] = "" }
        };

        context.Patients.AddRange(
            studentByClassification,
            studentByCategory,
            studentByIdOnly,
            generalWithBlankStudentId,
            employeeWithNullStudentId,
            seniorPatient);
        await context.SaveChangesAsync();

        // 1. Direct initial load / page refresh on STUDENTS tab (previously crashed with HTTP 500)
        var initialStudents = await handler.Handle(new GetClinicPatientsQuery(FilterMode: "STUDENTS"), CancellationToken.None);
        initialStudents.Select(p => p.Id).Should().BeEquivalentTo(new[]
        {
            studentByClassification.Id,
            studentByCategory.Id,
            studentByIdOnly.Id
        });

        // 2. Sequential tab switching across all directory filter modes
        var allTab = await handler.Handle(new GetClinicPatientsQuery(FilterMode: "ALL"), CancellationToken.None);
        allTab.Should().HaveCount(6);

        var studentsTab = await handler.Handle(new GetClinicPatientsQuery(FilterMode: "STUDENTS", DoctorId: doctorId), CancellationToken.None);
        studentsTab.Should().HaveCount(3);

        var employeesTab = await handler.Handle(new GetClinicPatientsQuery(FilterMode: "EMPLOYEES", DoctorId: doctorId), CancellationToken.None);
        employeesTab.Select(p => p.Id).Should().Equal(employeeWithNullStudentId.Id);

        var alertsTab = await handler.Handle(new GetClinicPatientsQuery(FilterMode: "ALERTS", DoctorId: doctorId), CancellationToken.None);
        alertsTab.Select(p => p.Id).Should().Equal(employeeWithNullStudentId.Id);

        var seniorPwdTab = await handler.Handle(new GetClinicPatientsQuery(FilterMode: "SENIOR_PWD", DoctorId: doctorId), CancellationToken.None);
        seniorPwdTab.Select(p => p.Id).Should().Equal(seniorPatient.Id);

        var myPatientsTab = await handler.Handle(new GetClinicPatientsQuery(FilterMode: "MY_PATIENTS", DoctorId: doctorId), CancellationToken.None);
        myPatientsTab.Select(p => p.Id).Should().Equal(employeeWithNullStudentId.Id);

        var defaultNullFilter = await handler.Handle(new GetClinicPatientsQuery(FilterMode: null), CancellationToken.None);
        defaultNullFilter.Should().HaveCount(6);
    }

    [Fact]
    public async Task FilterMode_Employees_ReturnsEmployeesAndExcludesBlankEmployeeIds()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var handler = new GetClinicPatientsQueryHandler(repo);

        var empByClassification = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "EMP-101",
            FirstName = "Grace",
            LastName = "Garcia",
            DateOfBirth = new DateOnly(1991, 2, 14),
            ContactNumber = "09172220001",
            CustomFields = new Dictionary<string, object?> { ["classification"] = "Employee" }
        };

        var empByCategory = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "EMP-102",
            FirstName = "Hector",
            LastName = "Hernandez",
            DateOfBirth = new DateOnly(1989, 7, 19),
            ContactNumber = "09172220002",
            CustomFields = new Dictionary<string, object?> { ["category"] = "employee" }
        };

        var empByIdOnly = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "EMP-103",
            FirstName = "Irene",
            LastName = "Ilagan",
            DateOfBirth = new DateOnly(1993, 12, 1),
            ContactNumber = "09172220003",
            CustomFields = new Dictionary<string, object?> { ["employee_id"] = "FAC-4402" }
        };

        var blankEmployeeId = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "GEN-104",
            FirstName = "Jerome",
            LastName = "Javier",
            DateOfBirth = new DateOnly(1995, 5, 25),
            ContactNumber = "09172220004",
            CustomFields = new Dictionary<string, object?> { ["employee_id"] = "" }
        };

        var whitespaceEmployeeId = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "STU-105",
            FirstName = "Katrina",
            LastName = "Katigbak",
            DateOfBirth = new DateOnly(2004, 8, 8),
            ContactNumber = "09172220005",
            CustomFields = new Dictionary<string, object?> { ["classification"] = "Student", ["employee_id"] = "   " }
        };

        context.Patients.AddRange(empByClassification, empByCategory, empByIdOnly, blankEmployeeId, whitespaceEmployeeId);
        await context.SaveChangesAsync();

        var employees = await handler.Handle(new GetClinicPatientsQuery(FilterMode: "EMPLOYEES"), CancellationToken.None);

        employees.Select(p => p.Id).Should().BeEquivalentTo(new[]
        {
            empByClassification.Id,
            empByCategory.Id,
            empByIdOnly.Id
        });
    }

    [Fact]
    public async Task FilterMode_MyPatients_IncludesHistoricalConsultationEncounters()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var handler = new GetClinicPatientsQueryHandler(repo, queueRepo, encounterRepo);

        var doctorId = Guid.NewGuid();

        var pEncounter = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-ENC-001",
            FirstName = "Lorenzo",
            LastName = "Lopez",
            DateOfBirth = new DateOnly(1984, 10, 10),
            ContactNumber = "09173330001"
        };

        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = pEncounter.Id,
            PatientName = "Lopez, Lorenzo",
            DoctorId = doctorId,
            DoctorName = "Dr. Santos"
        };

        var pUnrelated = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-ENC-002",
            FirstName = "Marco",
            LastName = "Mendoza",
            DateOfBirth = new DateOnly(1990, 4, 4),
            ContactNumber = "09173330002"
        };

        context.Patients.AddRange(pEncounter, pUnrelated);
        context.Consultations.Add(encounter);
        await context.SaveChangesAsync();

        var result = await handler.Handle(new GetClinicPatientsQuery(
            FilterMode: "MY_PATIENTS",
            DoctorId: doctorId), CancellationToken.None);

        result.Select(p => p.Id).Should().Equal(pEncounter.Id);
    }

    [Theory]
    [InlineData("ALL")]
    [InlineData("STUDENTS")]
    [InlineData("EMPLOYEES")]
    [InlineData("MY_PATIENTS")]
    [InlineData("ALERTS")]
    [InlineData("SENIOR_PWD")]
    public void NpgsqlSqlTranslation_AllFilterModesAndCursorPagination_TranslateCleanlyWithJsonbValueConverter(string filterMode)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[] { new KeyValuePair<string, string?>("DbSchema", "public") })
            .Build();
        var options = new DbContextOptionsBuilder<ClinicEz.Clinic.Infrastructure.Persistence.ApplicationDbContext>()
            .UseNpgsql("Host=localhost;Database=test;Username=postgres;Password=postgres")
            .Options;

        using var npgsqlContext = new ClinicEz.Clinic.Infrastructure.Persistence.ApplicationDbContext(options, config, _clinicContext);

        var staffId = Guid.NewGuid();
        var relatedIds = new List<Guid> { Guid.NewGuid() };
        var request = new GetClinicPatientsQuery(
            SearchTerm: "Santos",
            FilterMode: filterMode,
            StaffId: staffId,
            CursorLastName: "Adams",
            CursorFirstName: "Alice",
            CursorId: Guid.NewGuid(),
            PageSize: 25);

        var baseQuery = GetClinicPatientsQueryHandler.ApplyRelationalBaseFilters(npgsqlContext.Patients.AsNoTracking(), request);
        var filteredQuery = GetClinicPatientsQueryHandler.ApplyPostgresFilterMode(baseQuery, request.FilterMode, staffId, relatedIds);
        var pagedQuery = GetClinicPatientsQueryHandler.ApplyOrderingAndPagination(filteredQuery, request);

        var sql = pagedQuery.ToQueryString();

        sql.Should().NotBeNullOrWhiteSpace();
        sql.Should().Contain("FROM public.\"Patients\"");

        if (filterMode == "STUDENTS")
        {
            sql.Should().Contain("@>");
            sql.Should().Contain("? 'student_id'");
        }
        else if (filterMode == "EMPLOYEES")
        {
            sql.Should().Contain("@>");
            sql.Should().Contain("? 'employee_id'");
        }
        else if (filterMode == "MY_PATIENTS")
        {
            sql.Should().Contain("@>");
        }
    }
}

