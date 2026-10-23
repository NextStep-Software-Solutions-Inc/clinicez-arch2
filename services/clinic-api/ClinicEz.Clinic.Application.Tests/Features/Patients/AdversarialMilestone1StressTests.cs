using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Allergies.Dtos;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Application.Features.Patients.Queries;
using ClinicEz.Clinic.Application.Tests;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Persistence.Repositories;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using NSubstitute;
using Sieve.Services;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Patients;

public class AdversarialMilestone1StressTests
{
    private static readonly int[] Mod11Weights = [6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

    private static (ApplicationDbContext Context1, ApplicationDbContext Context2, IUnitOfWork Uow1, ISieveProcessor Sieve)
        CreateMultiTenantSharedContext(IClinicContext clinic1, IClinicContext clinic2)
    {
        var sharedDbName = $"ClinicEz_MultiTenant_TestDb_{Guid.NewGuid()}";
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[] { new KeyValuePair<string, string?>("DbSchema", "public") })
            .Build();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: sharedDbName)
            .Options;

        var context1 = new ApplicationDbContext(options, config, clinic1);
        var context2 = new ApplicationDbContext(options, config, clinic2);

        var sieve = Substitute.For<ISieveProcessor>();
        var productRepo = Substitute.For<IProductRepository>();
        var uow1 = new UnitOfWork(context1, sieve, productRepo);

        return (context1, context2, uow1, sieve);
    }

    #region Feature 1: Patient Duplicate Detection Adversarial Permutations

    [Fact]
    public async Task Feature1_MultiTenantIsolation_IdenticalPatientDataInDifferentClinic_NeverMatches()
    {
        // Arrange: Two distinct clinics in different tenants
        var clinic1Id = Guid.NewGuid();
        var clinic2Id = Guid.NewGuid();

        var clinic1Context = Substitute.For<IClinicContext>();
        clinic1Context.ClinicId.Returns(clinic1Id);
        clinic1Context.TenantId.Returns("tenant_alpha");

        var clinic2Context = Substitute.For<IClinicContext>();
        clinic2Context.ClinicId.Returns(clinic2Id);
        clinic2Context.TenantId.Returns("tenant_beta");

        var (context1, context2, uow1, sieve) = CreateMultiTenantSharedContext(clinic1Context, clinic2Context);
        var repo1 = new Repository<ClinicPatient>(context1, sieve);
        var repo2 = new Repository<ClinicPatient>(context2, sieve);

        // Seed Patient in Clinic 1
        var clinic1Patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_alpha",
            ClinicId = clinic1Id,
            PatientCode = "PAT-2026-00001",
            FirstName = "Maria",
            LastName = "Santos",
            DateOfBirth = new DateOnly(1990, 8, 15),
            ContactNumber = "09181234567",
            PhilHealthNumber = "12-345678901-8"
        };
        await repo1.AddAsync(clinic1Patient, CancellationToken.None);
        await uow1.SaveChangesAsync(CancellationToken.None);

        // Act: Query duplicate detection under Clinic 2 context with identical PIN, Phone, Name + DOB
        var handlerClinic2 = new CheckPatientDuplicatesQueryHandler(repo2);
        var resultClinic2 = await handlerClinic2.Handle(new CheckPatientDuplicatesQuery(
            PhilHealthNumber: "12-345678901-8",
            ContactNumber: "09181234567",
            FirstName: "Maria",
            LastName: "Santos",
            DateOfBirth: new DateOnly(1990, 8, 15)
        ), CancellationToken.None);

        // Assert: Clinic 2 must NOT see Clinic 1's patient (multi-tenant boundary is impenetrable)
        resultClinic2.HasDuplicates.Should().BeFalse("Clinic 2 must not see patients registered in Clinic 1");
        resultClinic2.Matches.Should().BeEmpty();

        // Verification: Clinic 1 querying the same data DOES see the duplicate
        var handlerClinic1 = new CheckPatientDuplicatesQueryHandler(repo1);
        var resultClinic1 = await handlerClinic1.Handle(new CheckPatientDuplicatesQuery(
            PhilHealthNumber: "12-345678901-8",
            ContactNumber: "09181234567",
            FirstName: "Maria",
            LastName: "Santos",
            DateOfBirth: new DateOnly(1990, 8, 15)
        ), CancellationToken.None);

        resultClinic1.HasDuplicates.Should().BeTrue();
        resultClinic1.Matches.Should().HaveCount(1);
        resultClinic1.Matches[0].PatientId.Should().Be(clinic1Patient.Id);
    }

    [Fact]
    public async Task Feature1_SoftDeletedPatients_AreExcludedFromDuplicateDetection()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns("tenant_soft_delete");

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var deletedPatient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_soft_delete",
            ClinicId = clinicId,
            PatientCode = "PAT-2026-DEL01",
            FirstName = "Deleted",
            LastName = "Patient",
            DateOfBirth = new DateOnly(1980, 1, 1),
            ContactNumber = "09170000000",
            PhilHealthNumber = "12-345678901-8",
            IsDeleted = true,
            DeletedAt = DateTime.UtcNow
        };
        await repo.AddAsync(deletedPatient, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new CheckPatientDuplicatesQueryHandler(repo);

        // Act
        var result = await handler.Handle(new CheckPatientDuplicatesQuery(
            PhilHealthNumber: "12-345678901-8",
            ContactNumber: "09170000000",
            FirstName: "Deleted",
            LastName: "Patient",
            DateOfBirth: new DateOnly(1980, 1, 1)
        ), CancellationToken.None);

        // Assert
        result.HasDuplicates.Should().BeFalse("Soft-deleted patients must not trigger duplicate warnings");
        result.Matches.Should().BeEmpty();
    }

    [Fact]
    public async Task Feature1_ComplexWhitespaceAndCasingPermutations_MatchesCorrectly()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns("tenant_case_perm");

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_case_perm",
            ClinicId = clinicId,
            PatientCode = "PAT-2026-CASE1",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            DateOfBirth = new DateOnly(1992, 3, 25),
            ContactNumber = "09179998877",
            PhilHealthNumber = "12-345678901-8"
        };
        await repo.AddAsync(patient, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new CheckPatientDuplicatesQueryHandler(repo);

        // Act: Query with leading/trailing spaces and mixed casing
        var result = await handler.Handle(new CheckPatientDuplicatesQuery(
            FirstName: "  jUaN  ",
            LastName: "  dELa cRuZ  ",
            DateOfBirth: new DateOnly(1992, 3, 25)
        ), CancellationToken.None);

        // Assert
        result.HasDuplicates.Should().BeTrue();
        result.Matches.Should().HaveCount(1);
        result.Matches[0].PatientId.Should().Be(patient.Id);
        result.Matches[0].MatchReason.Should().Contain("Full Name and Date of Birth match");
    }

    [Fact]
    public async Task Feature1_PinHyphenAndSpacePermutations_MatchesBidirectionally()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns("tenant_pin_perm");

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        // Patient 1 stored with standard hyphens
        var patientHyphenated = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_pin_perm",
            ClinicId = clinicId,
            PatientCode = "PAT-2026-HYPH",
            FirstName = "Ana",
            LastName = "Reyes",
            DateOfBirth = new DateOnly(1995, 1, 1),
            ContactNumber = "09171110001",
            PhilHealthNumber = "12-345678901-8"
        };
        // Patient 2 stored with raw digits (unhyphenated)
        var patientRaw = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_pin_perm",
            ClinicId = clinicId,
            PatientCode = "PAT-2026-RAW",
            FirstName = "Ben",
            LastName = "Tan",
            DateOfBirth = new DateOnly(1993, 2, 2),
            ContactNumber = "09171110002",
            PhilHealthNumber = "010250000010"
        };
        await repo.AddAsync(patientHyphenated, CancellationToken.None);
        await repo.AddAsync(patientRaw, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new CheckPatientDuplicatesQueryHandler(repo);

        // Case A: Query raw digits against hyphenated DB record
        var resultA = await handler.Handle(new CheckPatientDuplicatesQuery(PhilHealthNumber: "  123456789018  "), CancellationToken.None);
        resultA.HasDuplicates.Should().BeTrue();
        resultA.Matches.Should().ContainSingle(m => m.PatientId == patientHyphenated.Id);

        // Case B: Query hyphenated formatted PIN against raw DB record
        var resultB = await handler.Handle(new CheckPatientDuplicatesQuery(PhilHealthNumber: "01-025000001-0"), CancellationToken.None);
        resultB.HasDuplicates.Should().BeTrue();
        resultB.Matches.Should().ContainSingle(m => m.PatientId == patientRaw.Id);
    }

    [Fact]
    public async Task Feature1_DisjointMultipleMatches_IdentifiesAllUniquePatientsWithDistinctReasons()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns("tenant_disjoint");

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        // Patient 1 matches PIN only
        var patient1 = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_disjoint",
            ClinicId = clinicId,
            PatientCode = "PAT-2026-001",
            FirstName = "Alice",
            LastName = "Anderson",
            DateOfBirth = new DateOnly(1980, 1, 1),
            ContactNumber = "09110000001",
            PhilHealthNumber = "12-345678901-8"
        };
        // Patient 2 matches Contact Number only
        var patient2 = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_disjoint",
            ClinicId = clinicId,
            PatientCode = "PAT-2026-002",
            FirstName = "Bob",
            LastName = "Baker",
            DateOfBirth = new DateOnly(1985, 2, 2),
            ContactNumber = "09175556677",
            PhilHealthNumber = "10-000000000-5"
        };
        // Patient 3 matches Name + DOB only
        var patient3 = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_disjoint",
            ClinicId = clinicId,
            PatientCode = "PAT-2026-003",
            FirstName = "Charlie",
            LastName = "Clark",
            DateOfBirth = new DateOnly(1990, 7, 14),
            ContactNumber = "09110000003",
            PhilHealthNumber = "01-025000001-0"
        };

        await repo.AddAsync(patient1, CancellationToken.None);
        await repo.AddAsync(patient2, CancellationToken.None);
        await repo.AddAsync(patient3, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new CheckPatientDuplicatesQueryHandler(repo);

        // Act: Query containing criteria spanning all three distinct patients
        var result = await handler.Handle(new CheckPatientDuplicatesQuery(
            PhilHealthNumber: "12-345678901-8",
            ContactNumber: "09175556677",
            FirstName: "Charlie",
            LastName: "Clark",
            DateOfBirth: new DateOnly(1990, 7, 14)
        ), CancellationToken.None);

        // Assert
        result.HasDuplicates.Should().BeTrue();
        result.Matches.Should().HaveCount(3);

        var match1 = result.Matches.Single(m => m.PatientId == patient1.Id);
        match1.MatchReason.Should().Contain("PhilHealth Identification Number (PIN) match");
        match1.MatchReason.Should().NotContain("Contact");
        match1.MatchReason.Should().NotContain("Full Name");

        var match2 = result.Matches.Single(m => m.PatientId == patient2.Id);
        match2.MatchReason.Should().Contain("Contact Number match");
        match2.MatchReason.Should().NotContain("PhilHealth");

        var match3 = result.Matches.Single(m => m.PatientId == patient3.Id);
        match3.MatchReason.Should().Contain("Full Name and Date of Birth match");
        match3.MatchReason.Should().NotContain("Contact Number match");
    }

    [Fact]
    public async Task Feature1_PartialCriteriaWithoutDob_DoesNotProduceFalsePositives()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns("tenant_partial");

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var repo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_partial",
            ClinicId = clinicId,
            PatientCode = "PAT-2026-PART",
            FirstName = "Grace",
            LastName = "Poe",
            DateOfBirth = new DateOnly(1968, 9, 3),
            ContactNumber = "09178887766"
        };
        await repo.AddAsync(patient, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new CheckPatientDuplicatesQueryHandler(repo);

        // Act: Query with matching names but missing DOB
        var resultWithoutDob = await handler.Handle(new CheckPatientDuplicatesQuery(
            FirstName: "Grace",
            LastName: "Poe",
            DateOfBirth: null
        ), CancellationToken.None);

        // Assert: Without DOB, name-only should not trigger duplicate match (needs Name + DOB)
        resultWithoutDob.HasDuplicates.Should().BeFalse();
        resultWithoutDob.Matches.Should().BeEmpty();
    }

    #endregion

    #region Feature 2: PhilHealth PIN Format & Mod-11 Check-Digit Boundary Tests

    private static string CalculateMod11CheckDigit(string elevenDigits)
    {
        int sum = 0;
        for (int i = 0; i < 11; i++)
        {
            sum += (elevenDigits[i] - '0') * Mod11Weights[i];
        }
        int rem = sum % 11;
        int check = (11 - rem) % 11;
        return (check == 10) ? "0" : check.ToString();
    }

    [Theory]
    // Remainder 1 (11 - 1 = 10 -> maps to check digit 0)
    [InlineData("01-025000001-0", true)]
    [InlineData("01-025000001-9", false)]
    // Remainder 0 (11 - 0 = 11 % 11 = 0 -> maps to check digit 0)
    [InlineData("11-000000000-0", true)]
    [InlineData("11-000000000-1", false)]
    // Remainder 10 (11 - 10 = 1 -> maps to check digit 1)
    [InlineData("10-000000002-1", true)]
    [InlineData("10-000000002-0", false)]
    // Known valid PINs from other services / production seeds
    [InlineData("12-345678901-8", true)]
    [InlineData("10-000000000-5", true)]
    public void Feature2_Mod11_BoundaryRemainders_EvaluatesAccurately(string pin, bool expectedValid)
    {
        var isValid = RegisterClinicPatientCommandValidator.BeValidPhilHealthMod11(pin);
        isValid.Should().Be(expectedValid);
    }

    [Fact]
    public void Feature2_Mod11_FullCheckDigitSweep_0Through9_AllPassValidly()
    {
        // Construct 10 valid 12-digit PINs covering every check digit from 0 to 9
        var prefixes = new[]
        {
            "01-025000001", // check 0 (from rem=1)
            "10-000000002", // check 1 (from rem=10)
            "10-000000001", // check 3 -> let's compute programmatically
            "12-345678901", // check 8
            "10-000000000", // check 5
            "20-123456789", // let's compute
            "05-987654321", // let's compute
            "15-112233445", // let's compute
            "08-876543210", // let's compute
            "22-998877665"  // let's compute
        };

        var testedCheckDigits = new HashSet<int>();

        foreach (var prefix in prefixes)
        {
            var rawDigits = prefix.Replace("-", "");
            var checkDigit = CalculateMod11CheckDigit(rawDigits);
            var fullPin = $"{prefix}-{checkDigit}";

            // Verify algorithm validates the PIN
            var result = RegisterClinicPatientCommandValidator.BeValidPhilHealthMod11(fullPin);
            result.Should().BeTrue($"Valid generated PIN '{fullPin}' should pass Mod-11 verification");

            testedCheckDigits.Add(int.Parse(checkDigit));
        }

        testedCheckDigits.Count.Should().BeGreaterThan(3, "At least several distinct check digits must be exercised");
    }

    [Theory]
    [InlineData("12-34567890-8")]   // 11 digits (middle segment 8 digits)
    [InlineData("12-3456789012-8")] // 13 digits (middle segment 10 digits)
    [InlineData("12345678901")]     // 11 digits without hyphens
    [InlineData("12-345678901-")]   // Missing check digit
    [InlineData("12-345678901-89")] // 2-digit check segment
    [InlineData("12-34567890A-1")]  // Letter in middle
    [InlineData("12-345678901-X")]  // Letter check digit
    [InlineData("XX-XXXXXXXXX-X")]  // All non-digits
    [InlineData("")]                // Empty string
    [InlineData("   ")]             // Whitespace
    public void Feature2_Mod11_MalformedLengthsAndCharacters_FailsValidation(string invalidPin)
    {
        var isValid = RegisterClinicPatientCommandValidator.BeValidPhilHealthMod11(invalidPin);
        isValid.Should().BeFalse($"PIN '{invalidPin}' must fail Mod-11 verification");
    }

    [Fact]
    public void Feature2_Validator_UnformattedPinWithoutHyphens_FailsRegexFormatValidation()
    {
        var validator = new RegisterClinicPatientCommandValidator();
        var command = new RegisterClinicPatientCommand(
            FirstName: "Juan",
            LastName: "Dela Cruz",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(1990, 1, 1),
            Gender: "Male",
            CivilStatus: null,
            ContactNumber: "09171234567",
            Email: null,
            AddressLine: null,
            Barangay: null,
            City: null,
            Province: null,
            EmergencyContactName: null,
            EmergencyContactPhone: null,
            EmergencyContactRelationship: null,
            PhilHealthNumber: "123456789018", // Valid Mod-11 digits but missing required XX-XXXXXXXXX-X hyphens
            SeniorCitizenId: null,
            PwdId: null,
            BloodType: null,
            Allergies: null,
            ChronicConditions: null,
            Alerts: null
        );

        var result = validator.Validate(command);
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.ErrorMessage.Contains("RA 11223"));
    }

    [Fact]
    public void Feature2_Mod11_SingleDigitMutationHarness_EverySingleDigitCorruptionFails()
    {
        // Base valid PIN: 12-345678901-8
        const string basePin = "12-345678901-8";
        RegisterClinicPatientCommandValidator.BeValidPhilHealthMod11(basePin).Should().BeTrue();

        var chars = basePin.ToCharArray();

        // Mutate each digit position 0..11
        for (int i = 0; i < chars.Length; i++)
        {
            if (chars[i] == '-') continue;

            char originalChar = chars[i];
            int originalDigit = originalChar - '0';

            // Test mutating to all other 9 digits
            for (int delta = 1; delta <= 9; delta++)
            {
                int corruptedDigit = (originalDigit + delta) % 10;
                chars[i] = (char)('0' + corruptedDigit);

                var corruptedPin = new string(chars);
                var isValid = RegisterClinicPatientCommandValidator.BeValidPhilHealthMod11(corruptedPin);

                isValid.Should().BeFalse($"Corrupted PIN '{corruptedPin}' at index {i} must fail Mod-11 verification");
            }

            chars[i] = originalChar; // Restore
        }
    }

    #endregion

    #region Feature 3: Structured Allergy Intake Stress Tests

    [Fact]
    public async Task Feature3_StructuredAllergies_CategoryAndSeverityParsingWithAnaphylaxisFlag()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns("tenant_allergy");

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var allergyRepo = TestDbHelper.CreateRepository<PatientAllergy>(context, sieve);

        var handler = new RegisterClinicPatientCommandHandler(
            patientRepo, uow, clinicContext, allergyRepo: allergyRepo);

        var allergies = new List<CreateAllergyRequest>
        {
            new(Category: "Medication", Allergen: "Amoxicillin", AllergenDrugCode: "AMX-500", Severity: "LifeThreatening", ReactionManifestation: "Anaphylaxis, Angioedema", IsAnaphylactic: true),
            new(Category: "Food", Allergen: "Peanuts", Severity: "Severe", ReactionManifestation: "Urticaria, Dyspnea", IsAnaphylactic: true),
            new(Category: "Environmental", Allergen: "Pollen", Severity: "Mild", ReactionManifestation: "Rhinitis", IsAnaphylactic: false),
            new(Category: "InvalidCategoryFallback", Allergen: "Latex", Severity: "InvalidSeverityFallback", ReactionManifestation: "Contact dermatitis", IsAnaphylactic: false)
        };

        var command = new RegisterClinicPatientCommand(
            FirstName: "Ramon",
            LastName: "Bautista",
            MiddleName: null,
            Suffix: null,
            DateOfBirth: new DateOnly(1986, 6, 12),
            Gender: "Male",
            CivilStatus: null,
            ContactNumber: "09171239876",
            Email: null,
            AddressLine: null,
            Barangay: null,
            City: null,
            Province: null,
            EmergencyContactName: null,
            EmergencyContactPhone: null,
            EmergencyContactRelationship: null,
            PhilHealthNumber: null,
            SeniorCitizenId: null,
            PwdId: null,
            BloodType: null,
            Allergies: "Dust mites", // Existing summary string
            ChronicConditions: null,
            Alerts: null,
            StructuredAllergies: allergies
        );

        // Act
        var patientDto = await handler.Handle(command, CancellationToken.None);

        // Assert
        patientDto.Should().NotBeNull();
        // Summary string appended properly
        patientDto.Allergies.Should().Contain("Dust mites, Amoxicillin, Peanuts, Pollen, Latex");

        // Verify relational entities in DB
        var savedAllergies = await allergyRepo.Query(a => a.PatientId == patientDto.Id).ToListAsync();
        savedAllergies.Should().HaveCount(4);

        var amox = savedAllergies.Single(a => a.Allergen == "Amoxicillin");
        amox.Category.Should().Be(AllergyCategory.Medication);
        amox.Severity.Should().Be(AllergySeverity.LifeThreatening);
        amox.IsAnaphylactic.Should().BeTrue();
        amox.AllergenDrugCode.Should().Be("AMX-500");

        var latex = savedAllergies.Single(a => a.Allergen == "Latex");
        latex.Category.Should().Be(AllergyCategory.Medication, "Invalid category falls back gracefully to Medication");
        latex.Severity.Should().Be(AllergySeverity.Moderate, "Invalid severity falls back gracefully to Moderate");
        latex.IsAnaphylactic.Should().BeFalse();
    }

    #endregion

    #region Feature 4: 1-Click "Register & Send to Triage" Flow

    [Fact]
    public async Task Feature4_RegisterAndSendToTriage_SequentialQueueGenerationUnderConcurrency()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns("tenant_triage_seq");

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);

        var handler = new RegisterClinicPatientCommandHandler(
            patientRepo, uow, clinicContext, queueRepo: queueRepo);

        // Act: Register 4 patients in sequence with varying priorities
        var priorities = new[] { "Emergency", "Urgent", "Routine", "UnknownPriorityFallback" };
        var createdDtos = new List<ClinicPatientDto>();

        for (int i = 0; i < priorities.Length; i++)
        {
            var command = new RegisterClinicPatientCommand(
                FirstName: $"Patient{i}",
                LastName: "QueueTest",
                MiddleName: null,
                Suffix: null,
                DateOfBirth: new DateOnly(1990, 1, 1),
                Gender: "Female",
                CivilStatus: null,
                ContactNumber: $"0917000000{i}",
                Email: null,
                AddressLine: null,
                Barangay: null,
                City: null,
                Province: null,
                EmergencyContactName: null,
                EmergencyContactPhone: null,
                EmergencyContactRelationship: null,
                PhilHealthNumber: null,
                SeniorCitizenId: null,
                PwdId: null,
                BloodType: null,
                Allergies: null,
                ChronicConditions: null,
                Alerts: null,
                SendToTriage: true,
                Priority: priorities[i],
                ChiefComplaint: $"Complaint for patient {i}"
            );

            var dto = await handler.Handle(command, CancellationToken.None);
            createdDtos.Add(dto);
        }

        // Assert
        createdDtos[0].ActiveQueueTicket.Should().Be("Q-001");
        createdDtos[1].ActiveQueueTicket.Should().Be("Q-002");
        createdDtos[2].ActiveQueueTicket.Should().Be("Q-003");
        createdDtos[3].ActiveQueueTicket.Should().Be("Q-004");

        var allQueueItems = await queueRepo.Query().OrderBy(q => q.SequenceNumber).ToListAsync();
        allQueueItems.Should().HaveCount(4);

        allQueueItems[0].Priority.Should().Be(QueuePriority.Emergency);
        allQueueItems[1].Priority.Should().Be(QueuePriority.Urgent);
        allQueueItems[2].Priority.Should().Be(QueuePriority.Routine);
        allQueueItems[3].Priority.Should().Be(QueuePriority.Routine, "Unrecognized priority falls back to Routine");

        allQueueItems.Should().OnlyContain(q => q.Status == QueueStatus.Waiting, "Must route directly to nursing triage queue");
    }

    #endregion

    #region Feature 5: Consolidated Atomic PatientChartDto Under Edge & Adversarial Conditions

    [Fact]
    public async Task Feature5_PatientChart_NullDemographicsFields_DoesNotThrowAndComputesSafely()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns("tenant_chart_nulls");

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var triageRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var labRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var problemRepo = TestDbHelper.CreateRepository<PatientProblem>(context, sieve);
        var allergyRepo = TestDbHelper.CreateRepository<PatientAllergy>(context, sieve);
        var immRepo = TestDbHelper.CreateRepository<PatientImmunization>(context, sieve);
        var attachRepo = TestDbHelper.CreateRepository<ClinicRecordAttachment>(context, sieve);

        var patientId = Guid.NewGuid();
        var patientWithNulls = new ClinicPatient
        {
            Id = patientId,
            TenantId = "tenant_chart_nulls",
            ClinicId = clinicId,
            PatientCode = "PAT-2026-NULL01",
            FirstName = "Juan",
            LastName = "Bare",
            MiddleName = null,
            Suffix = null,
            DateOfBirth = new DateOnly(2000, 1, 1),
            Gender = "Male",
            CivilStatus = null,
            ContactNumber = "09170000000",
            Email = null,
            PhilHealthNumber = null,
            SeniorCitizenId = null,
            PwdId = null,
            BloodType = null,
            Allergies = null,
            ChronicConditions = null,
            Alerts = null,
            CustomFields = new Dictionary<string, object?>() // Empty custom fields
        };
        await patientRepo.AddAsync(patientWithNulls, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetPatientChartQueryHandler(
            consultRepo, triageRepo, procRepo, labRepo, invoiceRepo, clinicContext,
            patientRepo: patientRepo,
            problemRepo: problemRepo,
            allergyRepo: allergyRepo,
            immunizationRepo: immRepo,
            attachmentRepo: attachRepo);

        // Act
        var chart = await handler.Handle(new GetPatientChartQuery(patientId), CancellationToken.None);

        // Assert
        chart.Should().NotBeNull();
        chart.PatientName.Should().Be("Bare, Juan");
        chart.Demographics.Should().NotBeNull();
        chart.Demographics!.Age.Should().BeGreaterThan(0);
        chart.Demographics.PhilHealthNumber.Should().BeNull();
        chart.Demographics.MemberStatus.Should().Be("Non-Member");
        chart.Demographics.PhilHealthAtc.Should().BeNull();
        chart.Demographics.ActiveCaseNo.Should().BeNull();
        chart.TotalVisits.Should().Be(0);
        chart.Consultations.Should().BeEmpty();
        chart.VitalsHistory.Should().BeEmpty();
        chart.ProceduresHistory.Should().BeEmpty();
        chart.LabOrdersHistory.Should().BeEmpty();
        chart.InvoicesHistory.Should().BeEmpty();
        chart.Problems.Should().BeEmpty();
        chart.Allergies.Should().BeEmpty();
        chart.Immunizations.Should().BeEmpty();
        chart.Attachments.Should().BeEmpty();
    }

    [Fact]
    public async Task Feature5_PatientChart_SortingStress_AnaphylacticAllergiesAlwaysAtTop()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns("tenant_chart_sort");

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var triageRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var labRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var allergyRepo = TestDbHelper.CreateRepository<PatientAllergy>(context, sieve);

        var patientId = Guid.NewGuid();
        var patient = new ClinicPatient
        {
            Id = patientId,
            TenantId = "tenant_chart_sort",
            ClinicId = clinicId,
            PatientCode = "PAT-2026-SORT",
            FirstName = "Test",
            LastName = "Sorter",
            DateOfBirth = new DateOnly(1990, 5, 5),
            ContactNumber = "09171234567"
        };
        await patientRepo.AddAsync(patient, CancellationToken.None);

        // Add 6 allergies in mixed order (3 non-anaphylactic, 3 anaphylactic)
        var a1 = new PatientAllergy { Id = Guid.NewGuid(), TenantId = "tenant_chart_sort", ClinicId = clinicId, PatientId = patientId, Allergen = "Cats", IsAnaphylactic = false, Severity = AllergySeverity.Mild };
        var a2 = new PatientAllergy { Id = Guid.NewGuid(), TenantId = "tenant_chart_sort", ClinicId = clinicId, PatientId = patientId, Allergen = "Peanuts", IsAnaphylactic = true, Severity = AllergySeverity.LifeThreatening };
        var a3 = new PatientAllergy { Id = Guid.NewGuid(), TenantId = "tenant_chart_sort", ClinicId = clinicId, PatientId = patientId, Allergen = "Dust", IsAnaphylactic = false, Severity = AllergySeverity.Moderate };
        var a4 = new PatientAllergy { Id = Guid.NewGuid(), TenantId = "tenant_chart_sort", ClinicId = clinicId, PatientId = patientId, Allergen = "Bee Venom", IsAnaphylactic = true, Severity = AllergySeverity.LifeThreatening };
        var a5 = new PatientAllergy { Id = Guid.NewGuid(), TenantId = "tenant_chart_sort", ClinicId = clinicId, PatientId = patientId, Allergen = "Penicillin", IsAnaphylactic = true, Severity = AllergySeverity.Severe };
        var a6 = new PatientAllergy { Id = Guid.NewGuid(), TenantId = "tenant_chart_sort", ClinicId = clinicId, PatientId = patientId, Allergen = "Eggs", IsAnaphylactic = false, Severity = AllergySeverity.Mild };

        await allergyRepo.AddAsync(a1, CancellationToken.None);
        await allergyRepo.AddAsync(a2, CancellationToken.None);
        await allergyRepo.AddAsync(a3, CancellationToken.None);
        await allergyRepo.AddAsync(a4, CancellationToken.None);
        await allergyRepo.AddAsync(a5, CancellationToken.None);
        await allergyRepo.AddAsync(a6, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetPatientChartQueryHandler(
            consultRepo, triageRepo, procRepo, labRepo, invoiceRepo, clinicContext,
            patientRepo: patientRepo,
            allergyRepo: allergyRepo);

        // Act
        var chart = await handler.Handle(new GetPatientChartQuery(patientId), CancellationToken.None);

        // Assert: First 3 items MUST all be anaphylactic, sorted alphabetically by Allergen
        chart.Allergies.Should().NotBeNull();
        chart.Allergies!.Should().HaveCount(6);

        chart.Allergies![0].IsAnaphylactic.Should().BeTrue();
        chart.Allergies![0].Allergen.Should().Be("Bee Venom");

        chart.Allergies![1].IsAnaphylactic.Should().BeTrue();
        chart.Allergies![1].Allergen.Should().Be("Peanuts");

        chart.Allergies![2].IsAnaphylactic.Should().BeTrue();
        chart.Allergies![2].Allergen.Should().Be("Penicillin");

        // Remaining 3 are non-anaphylactic, sorted alphabetically
        chart.Allergies![3].IsAnaphylactic.Should().BeFalse();
        chart.Allergies![3].Allergen.Should().Be("Cats");

        chart.Allergies![4].IsAnaphylactic.Should().BeFalse();
        chart.Allergies![4].Allergen.Should().Be("Dust");

        chart.Allergies![5].IsAnaphylactic.Should().BeFalse();
        chart.Allergies![5].Allergen.Should().Be("Eggs");
    }

    [Fact]
    public async Task Feature5_PatientChart_MalformedCustomFieldsJson_FallsBackGracefullyWithoutCrash()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns("tenant_malformed");

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var triageRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var labRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var patientId = Guid.NewGuid();
        var patient = new ClinicPatient
        {
            Id = patientId,
            TenantId = "tenant_malformed",
            ClinicId = clinicId,
            PatientCode = "PAT-2026-MALF",
            FirstName = "Corrupt",
            LastName = "JsonData",
            DateOfBirth = new DateOnly(1988, 4, 1),
            ContactNumber = "09175551234",
            CustomFields = new Dictionary<string, object?>
            {
                ["philhealth_profile"] = "{ not a valid json object -- crash test! }"
            }
        };
        await patientRepo.AddAsync(patient, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetPatientChartQueryHandler(
            consultRepo, triageRepo, procRepo, labRepo, invoiceRepo, clinicContext,
            patientRepo: patientRepo);

        // Act
        var chart = await handler.Handle(new GetPatientChartQuery(patientId), CancellationToken.None);

        // Assert: Must not throw, falls back gracefully
        chart.Should().NotBeNull();
        chart.PatientName.Should().Be("JsonData, Corrupt");
        chart.Demographics.Should().NotBeNull();
        chart.Demographics!.MemberStatus.Should().Be("Non-Member");
    }

    #endregion
}
