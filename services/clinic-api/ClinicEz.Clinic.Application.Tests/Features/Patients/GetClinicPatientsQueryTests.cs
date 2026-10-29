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
            Gender = Gender.Female,
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
            Gender = Gender.Male,
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
            Gender = Gender.Male,
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
            Gender = Gender.Male,
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
            Gender = Gender.Female,
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
}
