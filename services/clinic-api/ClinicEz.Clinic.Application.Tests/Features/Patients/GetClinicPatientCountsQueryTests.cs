using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Patients.Queries;
using ClinicEz.Clinic.Application.Tests;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
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
        var repo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var handler = new GetClinicPatientCountsQueryHandler(repo);

        // 1. Regular Adult
        var p1 = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-001",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            DateOfBirth = new DateOnly(1995, 5, 10),
            Gender = "Male",
            ContactNumber = "09170000001",
            CustomFields = new Dictionary<string, object?> { ["classification"] = "General" }
        };

        // 2. Student
        var p2 = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-002",
            FirstName = "Maria",
            LastName = "Santos",
            DateOfBirth = new DateOnly(2005, 8, 15),
            Gender = "Female",
            ContactNumber = "09170000002",
            CustomFields = new Dictionary<string, object?> { ["classification"] = "Student", ["student_id"] = "STU-2026-001" }
        };

        // 3. Employee
        var p3 = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-003",
            FirstName = "Pedro",
            LastName = "Penduko",
            DateOfBirth = new DateOnly(1988, 3, 20),
            Gender = "Male",
            ContactNumber = "09170000003",
            CustomFields = new Dictionary<string, object?> { ["classification"] = "Employee", ["employee_id"] = "EMP-9001" }
        };

        // 4. Senior Citizen (age >= 60) with Allergies
        var p4 = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-004",
            FirstName = "Lola",
            LastName = "Nena",
            DateOfBirth = new DateOnly(1950, 1, 1),
            Gender = "Female",
            ContactNumber = "09170000004",
            SeniorCitizenId = "SC-12345",
            Allergies = "Penicillin, Aspirin",
            CustomFields = new Dictionary<string, object?> { ["classification"] = "General" }
        };

        // 5. PWD with Alert
        var p5 = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-005",
            FirstName = "Cardo",
            LastName = "Dalisay",
            DateOfBirth = new DateOnly(1982, 11, 2),
            Gender = "Male",
            ContactNumber = "09170000005",
            PwdId = "PWD-9999",
            Alerts = "Fall risk",
            CustomFields = new Dictionary<string, object?> { ["classification"] = "General" }
        };

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
        var repo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var handler = new GetClinicPatientCountsQueryHandler(repo);

        var p1 = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-010",
            FirstName = "Andres",
            LastName = "Bonifacio",
            DateOfBirth = new DateOnly(1980, 11, 30),
            Gender = "Male",
            ContactNumber = "09170000010",
            Allergies = "Dust",
            CustomFields = new Dictionary<string, object?> { ["classification"] = "Employee" }
        };

        var p2 = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "PAT-011",
            FirstName = "Apolinario",
            LastName = "Mabini",
            DateOfBirth = new DateOnly(1975, 7, 23),
            Gender = "Male",
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
    }
}
