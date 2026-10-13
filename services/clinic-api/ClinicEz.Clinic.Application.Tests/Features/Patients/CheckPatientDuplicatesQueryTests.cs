using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Helpers;
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
            DateOfBirth: new DateOnly(1991, 6, 19)
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
    public async Task Handle_FuzzyNameWithMatchingDateOfBirth_LevenshteinMatch_ReturnsMatchWithScoreAndReason()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var existing = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-00006",
            FirstName = "Maria",
            LastName = "Santos",
            DateOfBirth = new DateOnly(1990, 8, 15),
            ContactNumber = "09181112233"
        };
        await repo.AddAsync(existing, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new CheckPatientDuplicatesQueryHandler(repo);

        // Act - search with typo "Marie" instead of "Maria"
        var result = await handler.Handle(new CheckPatientDuplicatesQuery(
            FirstName: "Marie",
            LastName: "Santos",
            DateOfBirth: new DateOnly(1990, 8, 15)
        ), CancellationToken.None);

        // Assert
        result.HasDuplicates.Should().BeTrue();
        result.Matches.Should().HaveCount(1);
        result.Matches[0].PatientId.Should().Be(existing.Id);
        result.Matches[0].SimilarityScore.Should().BeGreaterThanOrEqualTo(0.85);
        result.Matches[0].Confidence.Should().Be("High");
        result.Matches[0].MatchReason.Should().Contain("similar name");
    }

    [Fact]
    public async Task Handle_FuzzyNameWithMatchingDateOfBirth_PhoneticSoundexMatch_ReturnsPhoneticReason()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var existing = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-00007",
            FirstName = "Carlos",
            LastName = "Gonzalez",
            DateOfBirth = new DateOnly(1988, 4, 12),
            ContactNumber = "09192223344"
        };
        await repo.AddAsync(existing, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new CheckPatientDuplicatesQueryHandler(repo);

        // Act - search with phonetic variant "Gonzales" vs "Gonzalez"
        var result = await handler.Handle(new CheckPatientDuplicatesQuery(
            FirstName: "Carlos",
            LastName: "Gonzales",
            DateOfBirth: new DateOnly(1988, 4, 12)
        ), CancellationToken.None);

        // Assert
        result.HasDuplicates.Should().BeTrue();
        result.Matches.Should().HaveCount(1);
        result.Matches[0].PatientId.Should().Be(existing.Id);
        result.Matches[0].SimilarityScore.Should().BeGreaterThanOrEqualTo(0.85);
        result.Matches[0].Confidence.Should().Be("High");
    }

    [Fact]
    public async Task Handle_ContactNumberCountryCodeVariations_NormalizedMatch_ReturnsContactMatch()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var existing = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-00008",
            FirstName = "Lucia",
            LastName = "Joaquin",
            DateOfBirth = new DateOnly(1995, 12, 5),
            ContactNumber = "09171234567"
        };
        await repo.AddAsync(existing, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new CheckPatientDuplicatesQueryHandler(repo);

        // Act - search with country code +639171234567
        var result = await handler.Handle(new CheckPatientDuplicatesQuery(
            ContactNumber: "+639171234567"
        ), CancellationToken.None);

        // Assert
        result.HasDuplicates.Should().BeTrue();
        result.Matches.Should().HaveCount(1);
        result.Matches[0].PatientId.Should().Be(existing.Id);
        result.Matches[0].SimilarityScore.Should().Be(0.95);
        result.Matches[0].Confidence.Should().Be("High");
        result.Matches[0].MatchReason.Should().Contain("Contact Number match");
    }

    [Fact]
    public async Task Handle_SortedBySimilarityScoreDescending()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        // Candidate 1: Exact PIN match (Score = 1.00)
        var patient1 = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-00009",
            FirstName = "Target",
            LastName = "Patient",
            DateOfBirth = new DateOnly(1980, 1, 1),
            ContactNumber = "09170000001",
            PhilHealthNumber = "12-345678901-8"
        };

        // Candidate 2: Fuzzy Name match with matching DOB (Score ~ 0.88)
        var patient2 = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-00010",
            FirstName = "Jon",
            LastName = "Doe",
            DateOfBirth = new DateOnly(1990, 5, 20),
            ContactNumber = "09170000002"
        };

        await repo.AddAsync(patient1, CancellationToken.None);
        await repo.AddAsync(patient2, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new CheckPatientDuplicatesQueryHandler(repo);

        // Act: search with PIN matching patient 1, and Name/DOB matching patient 2 with typo
        var result = await handler.Handle(new CheckPatientDuplicatesQuery(
            PhilHealthNumber: "12-345678901-8",
            FirstName: "John",
            LastName: "Doe",
            DateOfBirth: new DateOnly(1990, 5, 20)
        ), CancellationToken.None);

        // Assert: Patient 1 (exact PIN) must be sorted before Patient 2 (fuzzy name)
        result.HasDuplicates.Should().BeTrue();
        result.Matches.Should().HaveCount(2);
        result.Matches[0].PatientId.Should().Be(patient1.Id);
        result.Matches[0].SimilarityScore.Should().Be(1.00);
        result.Matches[1].PatientId.Should().Be(patient2.Id);
        result.Matches[1].SimilarityScore.Should().BeLessThan(1.00);
    }

    [Fact]
    public void FuzzyMatcher_LevenshteinDistance_ComputesCorrectly()
    {
        FuzzyMatcher.LevenshteinDistance("", "").Should().Be(0);
        FuzzyMatcher.LevenshteinDistance("kitten", "sitting").Should().Be(3);
        FuzzyMatcher.LevenshteinDistance("Jon", "John").Should().Be(1);
        FuzzyMatcher.LevenshteinDistance("Dela Cruz", "De La Cruz").Should().Be(1);
    }

    [Fact]
    public void FuzzyMatcher_CalculateSimilarity_BoundsAndNormalized()
    {
        FuzzyMatcher.CalculateSimilarity("Maria", "Maria").Should().Be(1.0);
        FuzzyMatcher.CalculateSimilarity("", "").Should().Be(1.0);
        FuzzyMatcher.CalculateSimilarity("Maria", null).Should().Be(0.0);
        FuzzyMatcher.CalculateSimilarity("Maria", "Marie").Should().BeGreaterThan(0.75);
    }

    [Fact]
    public void FuzzyMatcher_ToSoundex_EncodesPhoneticsCorrectly()
    {
        FuzzyMatcher.ToSoundex("Smith").Should().Be("S530");
        FuzzyMatcher.ToSoundex("Smyth").Should().Be("S530");
        FuzzyMatcher.ToSoundex("Gonzalez").Should().Be("G524");
        FuzzyMatcher.ToSoundex("Gonzales").Should().Be("G524");
    }

    [Fact]
    public void FuzzyMatcher_NormalizePhone_HandlesPhilippineFormats()
    {
        FuzzyMatcher.NormalizePhone("+639171234567").Should().Be("9171234567");
        FuzzyMatcher.NormalizePhone("639171234567").Should().Be("9171234567");
        FuzzyMatcher.NormalizePhone("09171234567").Should().Be("9171234567");
        FuzzyMatcher.NormalizePhone("0917-123-4567").Should().Be("9171234567");
        FuzzyMatcher.NormalizePhone("9171234567").Should().Be("9171234567");
    }

    [Fact]
    public void FuzzyMatcher_NormalizePhilHealthPin_StripsFormatting()
    {
        FuzzyMatcher.NormalizePhilHealthPin("12-345678901-8").Should().Be("123456789018");
        FuzzyMatcher.NormalizePhilHealthPin(" 12 3456 78901 8 ").Should().Be("123456789018");
        FuzzyMatcher.NormalizePhilHealthPin("").Should().Be("");
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
