using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Helpers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Patients.Queries;
using ClinicEz.Clinic.Application.Features.Patients.Search;
using ClinicEz.Clinic.Application.Tests;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Patients;

public sealed class GetClinicPatientCountsQueryTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _testClinicId = Guid.NewGuid();
    private const string _testTenantId = "tenant-counts-test";

    public GetClinicPatientCountsQueryTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_testClinicId);
        _clinicContext.TenantId.Returns(_testTenantId);
    }

    [Fact]
    public async Task Handle_ReturnsAccurateCounts_ForAllCategories()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var handler = new GetClinicPatientCountsQueryHandler(repo);

        // 1. Regular Adult
        var p1 = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-001",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            DateOfBirth = new DateOnly(1995, 5, 10),
            Sex = BiologicalSex.Male,
            ContactNumber = "09170000001",
            CustomFields = new Dictionary<string, object?> { ["classification"] = "General" }
        };

        // 2. Student
        var p2 = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-002",
            FirstName = "Maria",
            LastName = "Santos",
            DateOfBirth = new DateOnly(2005, 8, 15),
            Sex = BiologicalSex.Female,
            ContactNumber = "09170000002",
            CustomFields = new Dictionary<string, object?> { ["classification"] = "Student", ["student_id"] = "STU-2026-001" }
        };

        // 3. Employee
        var p3 = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-003",
            FirstName = "Pedro",
            LastName = "Penduko",
            DateOfBirth = new DateOnly(1988, 3, 20),
            Sex = BiologicalSex.Male,
            ContactNumber = "09170000003",
            CustomFields = new Dictionary<string, object?> { ["classification"] = "Employee", ["employee_id"] = "EMP-9001" }
        };

        // 4. Senior Citizen (age >= 60) with Allergies
        var p4 = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-004",
            FirstName = "Lola",
            LastName = "Nena",
            DateOfBirth = new DateOnly(1950, 1, 1),
            Sex = BiologicalSex.Female,
            ContactNumber = "09170000004",
            SeniorCitizenId = "SC-12345",
            CustomFields = new Dictionary<string, object?> { ["classification"] = "General" }
        };
        (p4.Allergies ??= new List<PatientAllergy>()).Add(new PatientAllergy { TenantId = _testTenantId, ClinicId = _testClinicId, Allergen = "Penicillin", Status = AllergyStatus.Active });

        // 5. PWD with Alert
        var p5 = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-005",
            FirstName = "Cardo",
            LastName = "Dalisay",
            DateOfBirth = new DateOnly(1982, 11, 2),
            Sex = BiologicalSex.Male,
            ContactNumber = "09170000005",
            PwdId = "PWD-9999",
            CustomFields = new Dictionary<string, object?> { ["classification"] = "General" }
        };
        p5.Alerts.Add(new PatientAlert { TenantId = _testTenantId, ClinicId = _testClinicId, Category = PatientAlertCategory.FallRisk, Code = "FALL", Title = "Fall risk", Status = PatientAlertStatus.Active });

        context.Patients.AddRange(p1, p2, p3, p4, p5);
        await context.SaveChangesAsync();

        var result = await handler.Handle(new GetClinicPatientCountsQuery(), CancellationToken.None);

        result.All.Should().Be(5);
        result.Students.Should().Be(1);
        result.Employees.Should().Be(1);
        result.Alerts.Should().Be(2); // p4 (Allergies) + p5 (Alerts)
        result.SeniorPwd.Should().Be(2); // p4 (Senior + age) + p5 (PWD)
    }

    [Fact]
    public async Task Handle_WithSearchTerm_FiltersCountsAccurately()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var handler = new GetClinicPatientCountsQueryHandler(repo);

        var p1 = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-010",
            FirstName = "Andres",
            LastName = "Bonifacio",
            DateOfBirth = new DateOnly(1980, 11, 30),
            Sex = BiologicalSex.Male,
            ContactNumber = "09170000010",
            CustomFields = new Dictionary<string, object?> { ["classification"] = "Employee" }
        };
        (p1.Allergies ??= new List<PatientAllergy>()).Add(new PatientAllergy { TenantId = _testTenantId, ClinicId = _testClinicId, Allergen = "Dust", Status = AllergyStatus.Active });

        var p2 = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-011",
            FirstName = "Apolinario",
            LastName = "Mabini",
            DateOfBirth = new DateOnly(1975, 7, 23),
            Sex = BiologicalSex.Male,
            ContactNumber = "09170000011",
            PwdId = "PWD-001",
            CustomFields = new Dictionary<string, object?> { ["classification"] = "General" }
        };

        context.Patients.AddRange(p1, p2);
        await context.SaveChangesAsync();

        var searchResult = await handler.Handle(new GetClinicPatientCountsQuery("Bonifacio"), CancellationToken.None);

        searchResult.All.Should().Be(1);
        searchResult.Employees.Should().Be(1);
        searchResult.Alerts.Should().Be(1);
        searchResult.SeniorPwd.Should().Be(0);
        searchResult.Students.Should().Be(0);
        searchResult.MyPatients.Should().Be(0);
    }

    [Fact]
    public async Task Handle_WithStaffId_ComputesMyPatientsAccurately_ForDoctor()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var handler = new GetClinicPatientCountsQueryHandler(repo);

        var doctorId = Guid.NewGuid();

        var p1 = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-CNT-01",
            FirstName = "Doctor",
            LastName = "Patient1",
            DateOfBirth = new DateOnly(1990, 1, 1),
            ContactNumber = "09170000101",
            CustomFields = new Dictionary<string, object?> { ["assigned_doctor_id"] = doctorId.ToString() }
        };
        var p2 = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-CNT-02",
            FirstName = "Doctor",
            LastName = "Patient2",
            DateOfBirth = new DateOnly(1991, 2, 2),
            ContactNumber = "09170000102",
            CustomFields = new Dictionary<string, object?> { ["doctor_id"] = doctorId.ToString() }
        };
        var p3 = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-CNT-03",
            FirstName = "Other",
            LastName = "Patient3",
            DateOfBirth = new DateOnly(1992, 3, 3),
            ContactNumber = "09170000103",
            CustomFields = new Dictionary<string, object?> { ["assigned_doctor_id"] = Guid.NewGuid().ToString() }
        };

        context.Patients.AddRange(p1, p2, p3);
        await context.SaveChangesAsync();

        var result = await handler.Handle(new GetClinicPatientCountsQuery(DoctorId: doctorId), CancellationToken.None);

        result.All.Should().Be(3);
        result.MyPatients.Should().Be(2);
    }

    [Fact]
    public async Task Handle_WithStaffId_ComputesMyPatientsAccurately_ForNurse()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var handler = new GetClinicPatientCountsQueryHandler(repo);

        var nurseId = Guid.NewGuid();

        var p1 = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-CNT-N1",
            FirstName = "Nurse",
            LastName = "VitalsPatient",
            DateOfBirth = new DateOnly(1990, 1, 1),
            ContactNumber = "09170000201"
        };
        p1.Vitals.Add(new PatientVitals
        {
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = p1.Id,
            NurseId = nurseId
        });

        var p2 = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-CNT-N2",
            FirstName = "Nurse",
            LastName = "CustomPatient",
            DateOfBirth = new DateOnly(1991, 2, 2),
            ContactNumber = "09170000202",
            CustomFields = new Dictionary<string, object?> { ["nurse_id"] = nurseId.ToString() }
        };

        var p3 = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-CNT-N3",
            FirstName = "Other",
            LastName = "Patient",
            DateOfBirth = new DateOnly(1992, 3, 3),
            ContactNumber = "09170000203"
        };

        context.Patients.AddRange(p1, p2, p3);
        await context.SaveChangesAsync();

        var result = await handler.Handle(new GetClinicPatientCountsQuery(StaffId: nurseId), CancellationToken.None);

        result.All.Should().Be(3);
        result.MyPatients.Should().Be(2);
    }

    [Fact]
    public async Task Handle_WithoutStaffId_ReturnsZeroMyPatients()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var handler = new GetClinicPatientCountsQueryHandler(repo);

        var p1 = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-CNT-NOSTAFF",
            FirstName = "Test",
            LastName = "Patient",
            DateOfBirth = new DateOnly(1990, 1, 1),
            ContactNumber = "09170000301",
            CustomFields = new Dictionary<string, object?> { ["assigned_doctor_id"] = Guid.NewGuid().ToString() }
        };

        context.Patients.Add(p1);
        await context.SaveChangesAsync();

        var result = await handler.Handle(new GetClinicPatientCountsQuery(), CancellationToken.None);

        result.All.Should().Be(1);
        result.MyPatients.Should().Be(0);
    }

    [Fact]
    public async Task Handle_ExcludesBlankIds_AndMatchesGetClinicPatientsQueryAcrossAllFilterModes()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var encounterRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);

        var countsHandler = new GetClinicPatientCountsQueryHandler(patientRepo, queueRepo, encounterRepo);
        var listHandler = new GetClinicPatientsQueryHandler(patientRepo, queueRepo, encounterRepo);

        var doctorId = Guid.NewGuid();

        var studentWithIdOnly = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAR-STU-01",
            FirstName = "Sofia",
            LastName = "Salazar",
            DateOfBirth = new DateOnly(2006, 5, 1),
            ContactNumber = "09178880001",
            CustomFields = new Dictionary<string, object?> { ["student_id"] = "STU-2026-77" }
        };

        var employeeWithIdOnly = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAR-EMP-01",
            FirstName = "Tomas",
            LastName = "Tan",
            DateOfBirth = new DateOnly(1985, 8, 12),
            ContactNumber = "09178880002",
            HasActiveSafetyAlert = true,
            CustomFields = new Dictionary<string, object?> { ["employee_id"] = "EMP-9921" }
        };

        var generalWithBlankIds = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAR-GEN-01",
            FirstName = "Ursula",
            LastName = "Uy",
            DateOfBirth = new DateOnly(1952, 2, 20),
            ContactNumber = "09178880003",
            SeniorCitizenId = "SC-5501",
            CustomFields = new Dictionary<string, object?>
            {
                ["student_id"] = "   ",
                ["employee_id"] = ""
            }
        };

        var encounterPatient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAR-ENC-01",
            FirstName = "Victor",
            LastName = "Villanueva",
            DateOfBirth = new DateOnly(1993, 9, 9),
            ContactNumber = "09178880004",
            CustomFields = new Dictionary<string, object?>
            {
                ["student_id"] = null,
                ["employee_id"] = null
            }
        };

        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = encounterPatient.Id,
            PatientName = "Villanueva, Victor",
            DoctorId = doctorId,
            DoctorName = "Dr. Reyes"
        };

        context.Patients.AddRange(studentWithIdOnly, employeeWithIdOnly, generalWithBlankIds, encounterPatient);
        context.Consultations.Add(encounter);
        await context.SaveChangesAsync();

        var counts = await countsHandler.Handle(new GetClinicPatientCountsQuery(DoctorId: doctorId), CancellationToken.None);

        var allList = await listHandler.Handle(new GetClinicPatientsQuery(FilterMode: "ALL", DoctorId: doctorId), CancellationToken.None);
        var studentsList = await listHandler.Handle(new GetClinicPatientsQuery(FilterMode: "STUDENTS", DoctorId: doctorId), CancellationToken.None);
        var employeesList = await listHandler.Handle(new GetClinicPatientsQuery(FilterMode: "EMPLOYEES", DoctorId: doctorId), CancellationToken.None);
        var alertsList = await listHandler.Handle(new GetClinicPatientsQuery(FilterMode: "ALERTS", DoctorId: doctorId), CancellationToken.None);
        var seniorPwdList = await listHandler.Handle(new GetClinicPatientsQuery(FilterMode: "SENIOR_PWD", DoctorId: doctorId), CancellationToken.None);
        var myPatientsList = await listHandler.Handle(new GetClinicPatientsQuery(FilterMode: "MY_PATIENTS", DoctorId: doctorId), CancellationToken.None);

        counts.All.Should().Be(4).And.Be(allList.Count);
        counts.Students.Should().Be(1).And.Be(studentsList.Count);
        counts.Employees.Should().Be(1).And.Be(employeesList.Count);
        counts.Alerts.Should().Be(1).And.Be(alertsList.Count);
        counts.SeniorPwd.Should().Be(1).And.Be(seniorPwdList.Count);
        counts.MyPatients.Should().Be(1).And.Be(myPatientsList.Count);
    }

    [Fact]
    public void NpgsqlSqlTranslation_BuildPostgresCountsQuery_TranslatesSinglePassAggregationCleanly()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[] { new KeyValuePair<string, string?>("DbSchema", "public") })
            .Build();
        var options = new DbContextOptionsBuilder<ClinicEz.Clinic.Infrastructure.Persistence.ApplicationDbContext>()
            .UseNpgsql("Host=localhost;Database=test;Username=postgres;Password=postgres")
            .Options;

        using var npgsqlContext = new ClinicEz.Clinic.Infrastructure.Persistence.ApplicationDbContext(options, config, _clinicContext);

        var seniorCutoff = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(-60));
        var staffId = Guid.NewGuid();
        var relatedIds = new List<Guid> { Guid.NewGuid() };

        var baseQuery = npgsqlContext.Patients.AsNoTracking().WhereMatchesSearchTerm("Dela Cruz");
        var countsQuery = GetClinicPatientCountsQueryHandler.BuildPostgresCountsQuery(
            baseQuery,
            seniorCutoff,
            staffId,
            relatedIds);

        var sql = countsQuery.ToQueryString();

        sql.Should().NotBeNullOrWhiteSpace();
        sql.Should().Contain("FILTER (WHERE");
        sql.Should().Contain("@>");
        sql.Should().Contain("? 'student_id'");
        sql.Should().Contain("? 'employee_id'");

        var noStaffSql = GetClinicPatientCountsQueryHandler.BuildPostgresCountsQuery(
            npgsqlContext.Patients.AsNoTracking(),
            seniorCutoff,
            null,
            Array.Empty<Guid>()).ToQueryString();

        noStaffSql.Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public async Task Handle_Issue170_NullOrEmptyCustomFields_DoNotInflateStudentsOrEmployees()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var countsHandler = new GetClinicPatientCountsQueryHandler(repo);
        var listHandler = new GetClinicPatientsQueryHandler(repo);

        var pNullFields = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-NULL-01",
            FirstName = "Null",
            LastName = "Customs",
            DateOfBirth = new DateOnly(1990, 1, 1),
            ContactNumber = "09170000301",
            CustomFields = new Dictionary<string, object?>
            {
                { "classification", "General" },
                { "student_id", null },
                { "employee_id", null }
            }
        };

        var pEmptyFields = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-EMPTY-02",
            FirstName = "Empty",
            LastName = "Strings",
            DateOfBirth = new DateOnly(1991, 2, 2),
            ContactNumber = "09170000302",
            CustomFields = new Dictionary<string, object?>
            {
                { "classification", "General" },
                { "student_id", "   " },
                { "employee_id", "" }
            }
        };

        var pRealStudent = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-STU-03",
            FirstName = "Real",
            LastName = "Student",
            DateOfBirth = new DateOnly(2004, 3, 3),
            ContactNumber = "09170000303",
            CustomFields = new Dictionary<string, object?>
            {
                { "classification", "Student" },
                { "student_id", "STU-2026-99" }
            }
        };

        context.Patients.AddRange(pNullFields, pEmptyFields, pRealStudent);
        await context.SaveChangesAsync();

        var counts = await countsHandler.Handle(new GetClinicPatientCountsQuery(), CancellationToken.None);
        var studentList = await listHandler.Handle(new GetClinicPatientsQuery(FilterMode: "STUDENTS"), CancellationToken.None);
        var employeeList = await listHandler.Handle(new GetClinicPatientsQuery(FilterMode: "EMPLOYEES"), CancellationToken.None);

        counts.All.Should().Be(3);
        counts.Students.Should().Be(1);
        counts.Employees.Should().Be(0);
        studentList.Should().HaveCount(1);
        studentList[0].Id.Should().Be(pRealStudent.Id);
        employeeList.Should().BeEmpty();
    }

    [Fact]
    public async Task Handle_Issue170_NurseRoomIds_MatchesAssignedRoomsForCountsAndList()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var countsHandler = new GetClinicPatientCountsQueryHandler(patientRepo, queueRepo);
        var listHandler = new GetClinicPatientsQueryHandler(patientRepo, queueRepo);

        var nurseId = Guid.NewGuid();
        var nurseRoomId = Guid.NewGuid();
        var otherRoomId = Guid.NewGuid();

        var patInNurseRoom = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-ROOM-01",
            FirstName = "Room",
            LastName = "PatientOne",
            DateOfBirth = new DateOnly(1995, 1, 1),
            ContactNumber = "09170000401"
        };
        var patInOtherRoom = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-ROOM-02",
            FirstName = "Room",
            LastName = "PatientTwo",
            DateOfBirth = new DateOnly(1996, 2, 2),
            ContactNumber = "09170000402"
        };

        var tz = ClinicTimeZoneResolver.ResolveTimeZone("Asia/Manila");
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz));

        var qItemNurse = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = patInNurseRoom.Id,
            PatientName = $"{patInNurseRoom.LastName}, {patInNurseRoom.FirstName}",
            QueueNumber = "Q-NURSE",
            QueueDate = today,
            RoomId = nurseRoomId,
            Status = QueueStatus.Waiting
        };

        var qItemOther = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = patInOtherRoom.Id,
            PatientName = $"{patInOtherRoom.LastName}, {patInOtherRoom.FirstName}",
            QueueNumber = "Q-OTHER",
            QueueDate = today,
            RoomId = otherRoomId,
            Status = QueueStatus.Waiting
        };

        context.Patients.AddRange(patInNurseRoom, patInOtherRoom);
        context.QueueItems.AddRange(qItemNurse, qItemOther);
        await context.SaveChangesAsync();

        var counts = await countsHandler.Handle(new GetClinicPatientCountsQuery(
            StaffId: nurseId,
            RoomIds: new[] { nurseRoomId }), CancellationToken.None);

        var myPatientsList = await listHandler.Handle(new GetClinicPatientsQuery(
            FilterMode: "MY_PATIENTS",
            StaffId: nurseId,
            RoomIds: new[] { nurseRoomId }), CancellationToken.None);

        counts.MyPatients.Should().Be(1);
        myPatientsList.Should().HaveCount(1);
        myPatientsList[0].Id.Should().Be(patInNurseRoom.Id);
    }

    [Fact]
    public async Task Handle_Issue170_HistoricalOrTerminalQueueTickets_DoNotInflateCounts()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var countsHandler = new GetClinicPatientCountsQueryHandler(patientRepo, queueRepo);
        var listHandler = new GetClinicPatientsQueryHandler(patientRepo, queueRepo);

        var doctorId = Guid.NewGuid();
        var patPastTicket = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-PAST-01",
            FirstName = "Past",
            LastName = "Ticket",
            DateOfBirth = new DateOnly(1995, 1, 1),
            ContactNumber = "09170000501"
        };
        var patDivertedTicket = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-DIV-02",
            FirstName = "Diverted",
            LastName = "Ticket",
            DateOfBirth = new DateOnly(1996, 2, 2),
            ContactNumber = "09170000502"
        };

        var tz = ClinicTimeZoneResolver.ResolveTimeZone("Asia/Manila");
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz));
        var yesterday = today.AddDays(-1);

        var qYesterday = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = patPastTicket.Id,
            PatientName = $"{patPastTicket.LastName}, {patPastTicket.FirstName}",
            QueueNumber = "Q-YESTERDAY",
            QueueDate = yesterday,
            DoctorId = doctorId,
            Status = QueueStatus.Waiting
        };

        var qDivertedToday = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = patDivertedTicket.Id,
            PatientName = $"{patDivertedTicket.LastName}, {patDivertedTicket.FirstName}",
            QueueNumber = "Q-DIVERTED",
            QueueDate = today,
            DoctorId = doctorId,
            Status = QueueStatus.Diverted
        };

        context.Patients.AddRange(patPastTicket, patDivertedTicket);
        context.QueueItems.AddRange(qYesterday, qDivertedToday);
        await context.SaveChangesAsync();

        var counts = await countsHandler.Handle(new GetClinicPatientCountsQuery(DoctorId: doctorId), CancellationToken.None);
        var list = await listHandler.Handle(new GetClinicPatientsQuery(FilterMode: "MY_PATIENTS", DoctorId: doctorId), CancellationToken.None);

        counts.MyPatients.Should().Be(0);
        list.Should().BeEmpty();
    }
}

