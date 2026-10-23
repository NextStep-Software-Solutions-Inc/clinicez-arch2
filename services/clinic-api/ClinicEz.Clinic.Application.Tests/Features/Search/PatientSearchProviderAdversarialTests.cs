using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Application.Features.Patients.Queries;
using ClinicEz.Clinic.Application.Features.Patients.Search;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Search;

public class PatientSearchProviderAdversarialTests
{
    private readonly Guid _clinicIdA = Guid.NewGuid();
    private readonly Guid _clinicIdB = Guid.NewGuid();
    private readonly Guid _clinicIdC = Guid.NewGuid();
    private readonly IClinicContext _clinicContext;

    public PatientSearchProviderAdversarialTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicIdA);
        _clinicContext.HasPermission(Arg.Any<string>()).Returns(true);
    }

    [Fact]
    public async Task Adversarial_CrossTenantLeakage_NeverLeaksClinicBToClinicA_AcrossAllSearchVectors()
    {
        // Arrange
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var provider = new PatientSearchProvider(patientRepo);

        // Seed Clinic B with sensitive patient data
        var patientB1 = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-b",
            ClinicId = _clinicIdB,
            PatientCode = "PAT-LEAK-001",
            FirstName = "TargetGiven",
            MiddleName = "TargetMiddle",
            LastName = "TargetSurname",
            Suffix = "III",
            ClinicEzId = "CE-LEAK-9999",
            ContactNumber = "09998887766",
            PhilHealthNumber = "99-123456789-0",
            DateOfBirth = new DateOnly(1980, 1, 1)
        };

        // Seed Clinic A with unrelated patient
        var patientA = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            PatientCode = "PAT-SAFE-001",
            FirstName = "SafeGiven",
            LastName = "SafeSurname",
            ClinicEzId = "CE-SAFE-1111",
            ContactNumber = "09171112233",
            DateOfBirth = new DateOnly(1990, 5, 10)
        };

        context.Patients.AddRange(patientB1, patientA);
        await context.SaveChangesAsync();

        // Vectors targeting Clinic B's data executed against Clinic A
        var targetVectors = new[]
        {
            "CE-LEAK-9999",         // Exact ClinicEzId
            "LEAK",                 // Partial ClinicEzId
            "celeak9999",           // Unhyphenated lowercase
            "CELEAK9999",           // Unhyphenated uppercase
            "PAT-LEAK-001",         // Patient Code
            "09998887766",          // Contact Number
            "99-123456789-0",       // PhilHealth Number
            "991234567890",         // Unhyphenated PhilHealth
            "TargetGiven",          // First Name
            "TargetSurname",        // Last Name
            "TargetMiddle",         // Middle Name
            "TargetGiven TargetSurname", // Full Name
            "TargetSurname, TargetGiven",// Inverted Name
            "III"                   // Suffix
        };

        foreach (var vector in targetVectors)
        {
            // Act: Search in Clinic A
            var resultsA = await provider.SearchAsync(vector, _clinicIdA, 20, CancellationToken.None);

            // Assert: NEVER leak Clinic B data to Clinic A
            resultsA.Should().NotContain(r => r.Id == patientB1.Id.ToString(),
                because: $"Searching for '{vector}' in Clinic A must never return Clinic B patient {patientB1.Id}");

            // Act: Search in unseeded Clinic C
            var resultsC = await provider.SearchAsync(vector, _clinicIdC, 20, CancellationToken.None);
            resultsC.Should().BeEmpty(because: $"Clinic C has no patients, vector '{vector}' must return empty");
        }
    }

    [Fact]
    public async Task Adversarial_CrossTenantCollision_SameClinicEzIdDifferentClinics_StrictlySeparated()
    {
        // Arrange
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var provider = new PatientSearchProvider(patientRepo);

        const string sharedClinicEzId = "CE-COLL-8888";

        var patientA = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            PatientCode = "PAT-A-COLL",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            ClinicEzId = sharedClinicEzId,
            ContactNumber = "09170000001",
            DateOfBirth = new DateOnly(1988, 3, 15)
        };

        var patientB = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-b",
            ClinicId = _clinicIdB,
            PatientCode = "PAT-B-COLL",
            FirstName = "Maria",
            LastName = "Santos",
            ClinicEzId = sharedClinicEzId,
            ContactNumber = "09180000002",
            DateOfBirth = new DateOnly(1992, 7, 20)
        };

        context.Patients.AddRange(patientA, patientB);
        await context.SaveChangesAsync();

        // 1. Exact match in Clinic A
        var resultsA = await provider.SearchAsync(sharedClinicEzId, _clinicIdA, 10, CancellationToken.None);
        resultsA.Should().HaveCount(1);
        resultsA[0].Id.Should().Be(patientA.Id.ToString());
        resultsA[0].Title.Should().Be("Dela Cruz, Juan");
        resultsA[0].Subtitle.Should().Contain(patientA.PatientCode).And.Contain(sharedClinicEzId);

        // 2. Exact match in Clinic B
        var resultsB = await provider.SearchAsync(sharedClinicEzId, _clinicIdB, 10, CancellationToken.None);
        resultsB.Should().HaveCount(1);
        resultsB[0].Id.Should().Be(patientB.Id.ToString());
        resultsB[0].Title.Should().Be("Santos, Maria");
        resultsB[0].Subtitle.Should().Contain(patientB.PatientCode).And.Contain(sharedClinicEzId);

        // 3. Unhyphenated match in Clinic A
        var resultsUnhyphenatedA = await provider.SearchAsync("cecoll8888", _clinicIdA, 10, CancellationToken.None);
        resultsUnhyphenatedA.Should().HaveCount(1);
        resultsUnhyphenatedA[0].Id.Should().Be(patientA.Id.ToString());

        // 4. Partial match in Clinic B
        var resultsPartialB = await provider.SearchAsync("COLL", _clinicIdB, 10, CancellationToken.None);
        resultsPartialB.Should().HaveCount(1);
        resultsPartialB[0].Id.Should().Be(patientB.Id.ToString());
    }

    [Fact]
    public async Task Adversarial_SoftDeletedPatient_NeverReturnedInSearch()
    {
        // Arrange
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var provider = new PatientSearchProvider(patientRepo);

        var deletedPatient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            PatientCode = "PAT-DEL-001",
            FirstName = "Ghost",
            LastName = "Patient",
            ClinicEzId = "CE-GHOST-0000",
            ContactNumber = "09179998877",
            DateOfBirth = new DateOnly(1975, 4, 1),
            IsDeleted = true // SOFT DELETED
        };

        context.Patients.Add(deletedPatient);
        await context.SaveChangesAsync();

        // Act & Assert
        var resultsById = await provider.SearchAsync("CE-GHOST-0000", _clinicIdA, 10, CancellationToken.None);
        resultsById.Should().BeEmpty();

        var resultsByName = await provider.SearchAsync("Ghost", _clinicIdA, 10, CancellationToken.None);
        resultsByName.Should().BeEmpty();
    }

    [Fact]
    public async Task Adversarial_SubtitleFormatting_HandlesAllNullEmptyWhitespaceAndValidScenarios()
    {
        // Arrange
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var provider = new PatientSearchProvider(patientRepo);

        // 1. Patient with valid ClinicEzId
        var patientWithId = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            PatientCode = "PAT-VALID-1",
            FirstName = "Valid",
            LastName = "Patient",
            ClinicEzId = "CE-WDP9-FMBJ",
            ContactNumber = "09171234567",
            DateOfBirth = new DateOnly(1995, 2, 14)
        };

        // 2. Patient with null ClinicEzId
        var patientNullId = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            PatientCode = "PAT-NULL-2",
            FirstName = "NullId",
            LastName = "Patient",
            ClinicEzId = null,
            ContactNumber = "09172345678",
            DateOfBirth = new DateOnly(1990, 8, 20)
        };

        // 3. Patient with empty string ClinicEzId
        var patientEmptyId = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            PatientCode = "PAT-EMPTY-3",
            FirstName = "EmptyId",
            LastName = "Patient",
            ClinicEzId = "",
            ContactNumber = "09173456789",
            DateOfBirth = new DateOnly(1985, 12, 1)
        };

        // 4. Patient with whitespace-only ClinicEzId
        var patientWhitespaceId = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            PatientCode = "PAT-SPACE-4",
            FirstName = "SpaceId",
            LastName = "Patient",
            ClinicEzId = "   ",
            ContactNumber = "09174567890",
            DateOfBirth = new DateOnly(2000, 6, 15)
        };

        context.Patients.AddRange(patientWithId, patientNullId, patientEmptyId, patientWhitespaceId);
        await context.SaveChangesAsync();

        // Assert 1: Valid ClinicEzId includes identifier in subtitle
        var res1 = await provider.SearchAsync("Valid", _clinicIdA, 10, CancellationToken.None);
        res1.Should().HaveCount(1);
        res1[0].Subtitle.Should().Be("PAT-VALID-1 • CE-WDP9-FMBJ • DOB: 1995-02-14 • 09171234567");

        // Assert 2: Null ClinicEzId gracefully falls back
        var res2 = await provider.SearchAsync("NullId", _clinicIdA, 10, CancellationToken.None);
        res2.Should().HaveCount(1);
        res2[0].Subtitle.Should().Be("PAT-NULL-2 • DOB: 1990-08-20 • 09172345678");
        res2[0].Subtitle.Should().NotContain("null");
        res2[0].Subtitle.Should().NotContain("•  •");

        // Assert 3: Empty string ClinicEzId gracefully falls back
        var res3 = await provider.SearchAsync("EmptyId", _clinicIdA, 10, CancellationToken.None);
        res3.Should().HaveCount(1);
        res3[0].Subtitle.Should().Be("PAT-EMPTY-3 • DOB: 1985-12-01 • 09173456789");
        res3[0].Subtitle.Should().NotContain("•  •");

        // Assert 4: Whitespace-only ClinicEzId gracefully falls back
        var res4 = await provider.SearchAsync("SpaceId", _clinicIdA, 10, CancellationToken.None);
        res4.Should().HaveCount(1);
        res4[0].Subtitle.Should().Be("PAT-SPACE-4 • DOB: 2000-06-15 • 09174567890");
        res4[0].Subtitle.Should().NotContain("•  •");
    }

    [Fact]
    public async Task Adversarial_ClinicPatientDto_ClinicEzIdPopulationAndNullPreservation()
    {
        // 1. Direct MapToDto verification
        var patientWithEzId = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            PatientCode = "PAT-DTO-1",
            FirstName = "Test",
            LastName = "Person",
            ClinicEzId = "CE-TEST-ABCD",
            ContactNumber = "09170001122",
            DateOfBirth = new DateOnly(1995, 1, 1)
        };
        var dtoWithEzId = RegisterClinicPatientCommandHandler.MapToDto(patientWithEzId);
        dtoWithEzId.ClinicEzId.Should().Be("CE-TEST-ABCD");

        var patientWithoutEzId = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            PatientCode = "PAT-DTO-2",
            FirstName = "Test",
            LastName = "Person2",
            ClinicEzId = null,
            ContactNumber = "09170001123",
            DateOfBirth = new DateOnly(1996, 2, 2)
        };
        var dtoWithoutEzId = RegisterClinicPatientCommandHandler.MapToDto(patientWithoutEzId);
        dtoWithoutEzId.ClinicEzId.Should().BeNull();

        // 2. Query handler integration verification
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var handler = new GetClinicPatientsQueryHandler(repo);

        context.Patients.AddRange(patientWithEzId, patientWithoutEzId);
        await context.SaveChangesAsync();

        var queryResults = await handler.Handle(new GetClinicPatientsQuery(), CancellationToken.None);
        var mapped1 = queryResults.First(p => p.Id == patientWithEzId.Id);
        var mapped2 = queryResults.First(p => p.Id == patientWithoutEzId.Id);

        mapped1.ClinicEzId.Should().Be("CE-TEST-ABCD");
        mapped2.ClinicEzId.Should().BeNull();
    }

    [Fact]
    public async Task Adversarial_ExtremeInputs_EmptyWhitespaceLimitsCancellationToken()
    {
        // Arrange
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var provider = new PatientSearchProvider(patientRepo);

        // Null query
        var nullResult = await provider.SearchAsync(null!, _clinicIdA, 10, CancellationToken.None);
        nullResult.Should().BeEmpty();

        // Empty query
        var emptyResult = await provider.SearchAsync("", _clinicIdA, 10, CancellationToken.None);
        emptyResult.Should().BeEmpty();

        // Whitespace query
        var spaceResult = await provider.SearchAsync("    \t\r\n  ", _clinicIdA, 10, CancellationToken.None);
        spaceResult.Should().BeEmpty();

        // Limit clamping: seed 60 patients
        var patients = Enumerable.Range(1, 60).Select(i => new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            PatientCode = $"PAT-CLAMP-{i:D3}",
            FirstName = "Clamp",
            LastName = $"Test{i:D3}",
            ClinicEzId = $"CE-CLAMP-{i:D3}",
            ContactNumber = "09170009999",
            DateOfBirth = new DateOnly(1990, 1, 1)
        }).ToList();
        context.Patients.AddRange(patients);
        await context.SaveChangesAsync();

        // Limit <= 0 defaults to 10
        var zeroLimit = await provider.SearchAsync("Clamp", _clinicIdA, 0, CancellationToken.None);
        zeroLimit.Should().HaveCount(10);

        var negativeLimit = await provider.SearchAsync("Clamp", _clinicIdA, -5, CancellationToken.None);
        negativeLimit.Should().HaveCount(10);

        // Limit > 50 clamps to 50
        var largeLimit = await provider.SearchAsync("Clamp", _clinicIdA, 500, CancellationToken.None);
        largeLimit.Should().HaveCount(50);

        // Cancellation token respected
        using var cts = new CancellationTokenSource();
        cts.Cancel();
        var act = () => provider.SearchAsync("Clamp", _clinicIdA, 10, cts.Token);
        await act.Should().ThrowAsync<OperationCanceledException>();
    }
}
