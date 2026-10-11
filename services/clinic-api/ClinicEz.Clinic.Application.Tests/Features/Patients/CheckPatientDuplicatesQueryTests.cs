using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Patients.Queries;
using ClinicEz.Clinic.Application.Tests;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Patients;

public class CheckPatientDuplicatesQueryTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_dup_test";

    public CheckPatientDuplicatesQueryTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
    }

    [Fact]
    public async Task Handle_MatchingPhilHealthNumber_ReturnsHasDuplicatesTrueWithPinReason()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var existing = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-00001",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            DateOfBirth = new DateOnly(1985, 5, 20),
            ContactNumber = "09171234567",
            PhilHealthNumber = "12-345678901-8"
        };
        await repo.AddAsync(existing, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new CheckPatientDuplicatesQueryHandler(repo);

        // Act
        var result = await handler.Handle(new CheckPatientDuplicatesQuery(PhilHealthNumber: "12-345678901-8"), CancellationToken.None);

        // Assert
        result.HasDuplicates.Should().BeTrue();
        result.Matches.Should().HaveCount(1);
        result.Matches[0].PatientId.Should().Be(existing.Id);
        result.Matches[0].MatchReason.Should().Contain("PhilHealth Identification Number (PIN) match");
    }

    [Fact]
    public async Task Handle_MatchingPhilHealthNumberWithoutHyphens_ReturnsMatch()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var existing = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-00002",
            FirstName = "Maria",
            LastName = "Santos",
            DateOfBirth = new DateOnly(1990, 8, 15),
            ContactNumber = "09181234567",
            PhilHealthNumber = "12-345678901-8"
        };
        await repo.AddAsync(existing, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new CheckPatientDuplicatesQueryHandler(repo);

        // Act - search with raw digits without hyphens
        var result = await handler.Handle(new CheckPatientDuplicatesQuery(PhilHealthNumber: "123456789018"), CancellationToken.None);

        // Assert
        result.HasDuplicates.Should().BeTrue();
        result.Matches.Should().HaveCount(1);
        result.Matches[0].PatientId.Should().Be(existing.Id);
        result.Matches[0].MatchReason.Should().Contain("PhilHealth Identification Number (PIN) match");
    }

    [Fact]
    public async Task Handle_MatchingContactNumber_ReturnsHasDuplicatesTrueWithContactReason()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var existing = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-00003",
            FirstName = "Pedro",
            LastName = "Penduko",
            DateOfBirth = new DateOnly(1978, 11, 3),
            ContactNumber = "09199887766"
        };
        await repo.AddAsync(existing, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new CheckPatientDuplicatesQueryHandler(repo);

        // Act
        var result = await handler.Handle(new CheckPatientDuplicatesQuery(ContactNumber: "09199887766"), CancellationToken.None);

        // Assert
        result.HasDuplicates.Should().BeTrue();
        result.Matches.Should().HaveCount(1);
        result.Matches[0].PatientId.Should().Be(existing.Id);
        result.Matches[0].MatchReason.Should().Contain("Contact Number match");
    }

    [Fact]
    public async Task Handle_MatchingFullNameAndDateOfBirth_CaseInsensitive_ReturnsMatch()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var existing = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-00004",
            FirstName = "Andres",
            LastName = "Bonifacio",
            DateOfBirth = new DateOnly(1982, 11, 30),
            ContactNumber = "09201112233"
        };
        await repo.AddAsync(existing, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new CheckPatientDuplicatesQueryHandler(repo);

        // Act
        var result = await handler.Handle(new CheckPatientDuplicatesQuery(
            FirstName: "andres",
            LastName: "BONIFACIO",
            DateOfBirth: new DateOnly(1982, 11, 30)
        ), CancellationToken.None);

        // Assert
        result.HasDuplicates.Should().BeTrue();
        result.Matches.Should().HaveCount(1);
        result.Matches[0].PatientId.Should().Be(existing.Id);
        result.Matches[0].MatchReason.Should().Contain("Full Name and Date of Birth match");
    }

    [Fact]
    public async Task Handle_MultipleCriteriaMatchingSamePatient_CombinesReasons()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var existing = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-00005",
            FirstName = "Jose",
            LastName = "Rizal",
            DateOfBirth = new DateOnly(1991, 6, 19),
            ContactNumber = "09170001111",
            PhilHealthNumber = "12-345678901-8"
        };
        await repo.AddAsync(existing, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new CheckPatientDuplicatesQueryHandler(repo);

        // Act
        var result = await handler.Handle(new CheckPatientDuplicatesQuery(
            PhilHealthNumber: "12-345678901-8",
            ContactNumber: "09170001111",
            FirstName: "Jose",
            LastName: "Rizal",
            DateOfBirth = new DateOnly(1991, 6, 19)
        ), CancellationToken.None);

        // Assert
        result.HasDuplicates.Should().BeTrue();
        result.Matches.Should().HaveCount(1);
        result.Matches[0].MatchReason.Should().Contain("PhilHealth Identification Number (PIN) match");
        result.Matches[0].MatchReason.Should().Contain("Contact Number match");
        result.Matches[0].MatchReason.Should().Contain("Full Name and Date of Birth match");
    }

    [Fact]
    public async Task Handle_NoMatchesFound_ReturnsHasDuplicatesFalseAndEmptyList()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var handler = new CheckPatientDuplicatesQueryHandler(repo);

        // Act
        var result = await handler.Handle(new CheckPatientDuplicatesQuery(
            PhilHealthNumber: "12-345678901-8",
            ContactNumber: "09999999999"
        ), CancellationToken.None);

        // Assert
        result.HasDuplicates.Should().BeFalse();
        result.Matches.Should().BeEmpty();
    }

    [Fact]
    public async Task Handle_EmptyQueryParameters_ReturnsHasDuplicatesFalseWithoutQuerying()
    {
        // Arrange
        var repo = Substitute.For<IRepository<ClinicPatient>>();
        var handler = new CheckPatientDuplicatesQueryHandler(repo);

        // Act
        var result = await handler.Handle(new CheckPatientDuplicatesQuery(), CancellationToken.None);

        // Assert
        result.HasDuplicates.Should().BeFalse();
        result.Matches.Should().BeEmpty();
        repo.DidNotReceive().Query();
    }
}
