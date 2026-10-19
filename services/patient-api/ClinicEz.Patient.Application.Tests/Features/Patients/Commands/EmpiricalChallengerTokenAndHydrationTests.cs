using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;
using ClinicEz.Patient.Application.Common.Exceptions;
using ClinicEz.Patient.Application.Features.Patients.Commands.ClaimIntake;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Patient.Infrastructure.Persistence.Repositories;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Security.ClaimTokens;

namespace ClinicEz.Patient.Application.Tests.Features.Patients.Commands;

/// <summary>
/// Adversarial Empirical Challenge Suite for Claim Intake Token Validation, Demographic Hydration,
/// Allergy Deduplication, and Transactional Clinic Membership Activation.
/// Authored by o13_challenger_m2_2 (teamwork_preview_challenger) to stress-test:
/// 1. Cryptographic token validation: expired, altered signature, altered payload, malformed base64url strings.
/// 2. Demographic hydration: ConsentToShareInfo = true guarantee, PhilHealth PIN & sponsor persistence.
/// 3. Allergy hydration: Deduplication by AllergenName (case-insensitive), whitespace skipping, severity mapping.
/// 4. Transactional ClinicMembership activation: Status = Active, 3 consent booleans true, soft-delete recovery.
/// </summary>
public sealed class EmpiricalChallengerTokenAndHydrationTests
{
    private static readonly byte[] TestSigningKey = Encoding.UTF8.GetBytes("0123456789ABCDEF0123456789ABCDEF"); // 32 bytes

    private static ClaimTokenService CreateRealTokenService(byte[]? key = null) =>
        new(key ?? TestSigningKey);

    private static ApplicationDbContext CreateInMemoryDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new ApplicationDbContext(options);
    }

    private static ClaimTokenClaims BuildValidClaims(
        string firstName = "Juan",
        string lastName = "Rizal",
        DateOnly? dob = null,
        string? email = "juan.rizal@example.ph",
        string memberType = "MM",
        string facilitySlug = "clinic-main-01",
        string tenantSlug = "tenant-01",
        DateTime? expiresAt = null)
    {
        return new ClaimTokenClaims(
            joinRequestId: Guid.NewGuid(),
            tenantSlug: tenantSlug,
            facilitySlug: facilitySlug,
            email: email,
            firstName: firstName,
            lastName: lastName,
            dateOfBirth: dob ?? new DateOnly(1995, 6, 19),
            memberType: memberType,
            expiresAtUtc: expiresAt ?? DateTime.UtcNow.AddHours(48));
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // PROBE 1: ADVERSARIAL TOKEN VALIDATION
    // ══════════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task Probe1A_ExpiredToken_ThrowsValidationExceptionImmediately()
    {
        // Arrange
        var tokenService = CreateRealTokenService();
        var expiredClaims = BuildValidClaims(expiresAt: DateTime.UtcNow.AddMinutes(-10));
        var expiredToken = tokenService.IssueToken(expiredClaims);

        var patientRepo = Substitute.For<IPatientRepository>();
        var clinicRepo = Substitute.For<IClinicRepository>();
        var membershipRepo = Substitute.For<IClinicMembershipRepository>();
        var uow = Substitute.For<IUnitOfWork>();

        var handler = new ClaimIntakeCommandHandler(
            patientRepo,
            clinicRepo,
            membershipRepo,
            tokenService,
            new PatientClaimConflictResolver(),
            uow,
            NullLogger<ClaimIntakeCommandHandler>.Instance);

        var command = new ClaimIntakeCommand(
            ClerkUserId: "user_clerk_adversary",
            ClaimToken: expiredToken);

        // Act & Assert
        var act = () => handler.Handle(command, CancellationToken.None);
        var ex = await act.Should().ThrowAsync<ValidationException>();
        ex.WithMessage("*expired*");

        await patientRepo.DidNotReceive().AddAsync(Arg.Any<Domain.Entities.Patient>(), Arg.Any<CancellationToken>());
        await uow.DidNotReceive().SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Probe1B_AlteredSignature_ThrowsValidationExceptionTamperedToken()
    {
        // Arrange
        var tokenService = CreateRealTokenService();
        var claims = BuildValidClaims();
        var validToken = tokenService.IssueToken(claims);

        var parts = validToken.Split('.');
        parts.Length.Should().Be(2);

        // Flip characters in signature while preserving length
        var tamperedSignature = parts[1][..^4] + (parts[1][^4] == 'A' ? "B" : "A") + parts[1][^3..];
        var tamperedToken = $"{parts[0]}.{tamperedSignature}";

        var patientRepo = Substitute.For<IPatientRepository>();
        var clinicRepo = Substitute.For<IClinicRepository>();
        var membershipRepo = Substitute.For<IClinicMembershipRepository>();
        var uow = Substitute.For<IUnitOfWork>();

        var handler = new ClaimIntakeCommandHandler(
            patientRepo,
            clinicRepo,
            membershipRepo,
            tokenService,
            new PatientClaimConflictResolver(),
            uow,
            NullLogger<ClaimIntakeCommandHandler>.Instance);

        var command = new ClaimIntakeCommand(
            ClerkUserId: "user_clerk_adversary",
            ClaimToken: tamperedToken);

        // Act & Assert
        var act = () => handler.Handle(command, CancellationToken.None);
        var ex = await act.Should().ThrowAsync<ValidationException>();
        ex.WithMessage("*Tampered token. HMAC signature mismatch.*");

        await uow.DidNotReceive().SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Probe1C_AlteredPayload_ThrowsValidationExceptionTamperedToken()
    {
        // Arrange
        var tokenService = CreateRealTokenService();
        var claims = BuildValidClaims(firstName: "Juan");
        var validToken = tokenService.IssueToken(claims);

        var parts = validToken.Split('.');
        // Tamper with payload portion
        var tamperedPayload = parts[0] + "xyz";
        var tamperedToken = $"{tamperedPayload}.{parts[1]}";

        var patientRepo = Substitute.For<IPatientRepository>();
        var clinicRepo = Substitute.For<IClinicRepository>();
        var membershipRepo = Substitute.For<IClinicMembershipRepository>();
        var uow = Substitute.For<IUnitOfWork>();

        var handler = new ClaimIntakeCommandHandler(
            patientRepo,
            clinicRepo,
            membershipRepo,
            tokenService,
            new PatientClaimConflictResolver(),
            uow,
            NullLogger<ClaimIntakeCommandHandler>.Instance);

        var command = new ClaimIntakeCommand(
            ClerkUserId: "user_clerk_adversary",
            ClaimToken: tamperedToken);

        // Act & Assert
        var act = () => handler.Handle(command, CancellationToken.None);
        await act.Should().ThrowAsync<ValidationException>();

        await uow.DidNotReceive().SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    [Theory]
    [InlineData("not-a-token-without-dot")]
    [InlineData("part1.part2.part3")]
    [InlineData("..")]
    [InlineData(".")]
    [InlineData("validpayload.shortsig")]
    [InlineData("validpayload.this-signature-is-way-too-long-to-be-a-valid-sha256-hmac-base64url-string-exceeding-length")]
    [InlineData("???illegal#chars???..")]
    public async Task Probe1D_MalformedBase64UrlTokens_ThrowsValidationException(string malformedToken)
    {
        // Arrange
        var tokenService = CreateRealTokenService();

        var patientRepo = Substitute.For<IPatientRepository>();
        var clinicRepo = Substitute.For<IClinicRepository>();
        var membershipRepo = Substitute.For<IClinicMembershipRepository>();
        var uow = Substitute.For<IUnitOfWork>();

        var handler = new ClaimIntakeCommandHandler(
            patientRepo,
            clinicRepo,
            membershipRepo,
            tokenService,
            new PatientClaimConflictResolver(),
            uow,
            NullLogger<ClaimIntakeCommandHandler>.Instance);

        var command = new ClaimIntakeCommand(
            ClerkUserId: "user_clerk_adversary",
            ClaimToken: malformedToken);

        // Act & Assert
        var act = () => handler.Handle(command, CancellationToken.None);
        await act.Should().ThrowAsync<ValidationException>();

        await uow.DidNotReceive().SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Probe1E_TokenSignedWithDifferentKey_ThrowsValidationException()
    {
        // Arrange
        var foreignKey = Encoding.UTF8.GetBytes("FOREIGN_KEY_0123456789ABCDEF0123");
        var foreignService = CreateRealTokenService(foreignKey);
        var genuineService = CreateRealTokenService(TestSigningKey);

        var claims = BuildValidClaims();
        var foreignToken = foreignService.IssueToken(claims);

        var patientRepo = Substitute.For<IPatientRepository>();
        var clinicRepo = Substitute.For<IClinicRepository>();
        var membershipRepo = Substitute.For<IClinicMembershipRepository>();
        var uow = Substitute.For<IUnitOfWork>();

        var handler = new ClaimIntakeCommandHandler(
            patientRepo,
            clinicRepo,
            membershipRepo,
            genuineService,
            new PatientClaimConflictResolver(),
            uow,
            NullLogger<ClaimIntakeCommandHandler>.Instance);

        var command = new ClaimIntakeCommand(
            ClerkUserId: "user_clerk_adversary",
            ClaimToken: foreignToken);

        // Act & Assert
        var act = () => handler.Handle(command, CancellationToken.None);
        var ex = await act.Should().ThrowAsync<ValidationException>();
        ex.WithMessage("*Tampered token. HMAC signature mismatch.*");

        await uow.DidNotReceive().SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // PROBE 2: DEMOGRAPHIC & PHILHEALTH SPONSOR HYDRATION
    // ══════════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task Probe2A_ConsentToShareInfo_IsAlwaysTrueEvenIfRequestSuppliesFalse()
    {
        // Arrange
        var tokenService = CreateRealTokenService();
        var claims = BuildValidClaims();
        var token = tokenService.IssueToken(claims);

        using var db = CreateInMemoryDbContext();
        var patientRepo = new PatientRepository(db);
        var clinicRepo = new ClinicRepository(db);
        var membershipRepo = new ClinicMembershipRepository(db);
        var uow = new UnitOfWork(db);

        var clinic = new Clinic { Id = Guid.NewGuid(), Name = "clinic-main-01", TenantId = "tenant-01" };
        await db.Clinics.AddAsync(clinic);
        await db.SaveChangesAsync();

        var handler = new ClaimIntakeCommandHandler(
            patientRepo,
            clinicRepo,
            membershipRepo,
            tokenService,
            new PatientClaimConflictResolver(),
            uow,
            NullLogger<ClaimIntakeCommandHandler>.Instance);

        var command = new ClaimIntakeCommand(
            ClerkUserId: "user_clerk_new_001",
            ClaimToken: token,
            ConsentToShareInfo: false); // Intentionally false to test guardrail

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.Patient.Should().NotBeNull();
        result.Patient!.ConsentToShareInfo.Should().BeTrue("ConsentToShareInfo must be unconditionally true");

        var persisted = await db.Patients.FirstOrDefaultAsync(p => p.ClerkUserId == "user_clerk_new_001");
        persisted.Should().NotBeNull();
        persisted!.ConsentToShareInfo.Should().BeTrue();
    }

    [Fact]
    public async Task Probe2B_PhilHealthDependentWithSponsorInfo_IsCorrectlyPersistedInPatientGovernmentId()
    {
        // Arrange
        var tokenService = CreateRealTokenService();
        var childDob = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(-5));
        var claims = BuildValidClaims(
            firstName: "Maria",
            lastName: "Rizal",
            dob: childDob,
            memberType: "DD");
        var token = tokenService.IssueToken(claims);

        using var db = CreateInMemoryDbContext();
        var patientRepo = new PatientRepository(db);
        var clinicRepo = new ClinicRepository(db);
        var membershipRepo = new ClinicMembershipRepository(db);
        var uow = new UnitOfWork(db);

        var clinic = new Clinic { Id = Guid.NewGuid(), Name = "clinic-main-01", TenantId = "tenant-01" };
        await db.Clinics.AddAsync(clinic);

        // Parent profile already in system
        var parentPatient = new Domain.Entities.Patient
        {
            Id = Guid.NewGuid(),
            ClerkUserId = "user_clerk_parent_002",
            FirstName = "Juan",
            LastName = "Rizal",
            DateOfBirth = new DateOnly(1985, 1, 1),
            ConsentToShareInfo = true,
            ClinicEzId = "CE-PARENT-002"
        };
        await db.Patients.AddAsync(parentPatient);
        await db.SaveChangesAsync();

        var handler = new ClaimIntakeCommandHandler(
            patientRepo,
            clinicRepo,
            membershipRepo,
            tokenService,
            new PatientClaimConflictResolver(),
            uow,
            NullLogger<ClaimIntakeCommandHandler>.Instance);

        var command = new ClaimIntakeCommand(
            ClerkUserId: "user_clerk_parent_002",
            ClaimToken: token,
            IsDependent: true,
            RelationshipToDependent: "Child",
            PhilHealthPin: "12-987654321-0",
            PhilhealthCategory: "DD",
            PrincipalMemberPin: "12-111222333-4",
            PrincipalFullName: "Dr. Jose Protacio Rizal",
            PrincipalRelationship: "Father",
            PrincipalDateOfBirth: new DateOnly(1961, 6, 19));

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.RelationshipType.Should().Be("Dependent");

        var dependent = await db.Patients
            .Include(p => p.GovernmentIds)
            .FirstOrDefaultAsync(p => p.Id == result.PatientId);

        dependent.Should().NotBeNull();
        dependent!.ManagedByPatientId.Should().Be(parentPatient.Id);
        dependent.ConsentToShareInfo.Should().BeTrue();

        var phicId = dependent.GovernmentIds.FirstOrDefault(g => g.IdType == GovernmentIdType.PhilHealth);
        phicId.Should().NotBeNull();
        phicId!.IdNumber.Should().Be("12-987654321-0");
        phicId.PhilhealthCategory.Should().Be("DD");
        phicId.SponsorPin.Should().Be("12-111222333-4");
        phicId.SponsorFirstName.Should().Be("Dr. Jose Protacio");
        phicId.SponsorLastName.Should().Be("Rizal");
        phicId.SponsorRelationship.Should().Be("Father");
        phicId.SponsorDob.Should().Be(new DateOnly(1961, 6, 19));
    }

    [Fact]
    public async Task Probe2C_SingleWordSponsorFullName_SplitsSafelyWithoutCrashing()
    {
        // Arrange
        var tokenService = CreateRealTokenService();
        var claims = BuildValidClaims(memberType: "DD");
        var token = tokenService.IssueToken(claims);

        using var db = CreateInMemoryDbContext();
        var patientRepo = new PatientRepository(db);
        var clinicRepo = new ClinicRepository(db);
        var membershipRepo = new ClinicMembershipRepository(db);
        var uow = new UnitOfWork(db);

        var clinic = new Clinic { Id = Guid.NewGuid(), Name = "clinic-main-01", TenantId = "tenant-01" };
        await db.Clinics.AddAsync(clinic);
        await db.SaveChangesAsync();

        var handler = new ClaimIntakeCommandHandler(
            patientRepo,
            clinicRepo,
            membershipRepo,
            tokenService,
            new PatientClaimConflictResolver(),
            uow,
            NullLogger<ClaimIntakeCommandHandler>.Instance);

        var command = new ClaimIntakeCommand(
            ClerkUserId: "user_clerk_single_name",
            ClaimToken: token,
            IsDependent: true,
            PhilHealthPin: "12-333444555-6",
            PrincipalFullName: "Cher");

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        var patient = await db.Patients.Include(p => p.GovernmentIds).FirstOrDefaultAsync(p => p.Id == result.PatientId);
        patient.Should().NotBeNull();
        var phic = patient!.GovernmentIds.First(g => g.IdType == GovernmentIdType.PhilHealth);
        phic.SponsorFirstName.Should().Be("Cher");
        phic.SponsorLastName.Should().Be("Cher");
    }

    [Fact]
    public async Task Probe2D_ExistingPatientWithoutPhilHealth_AddsPhilHealthId_SuccessfullyPersists()
    {
        // Arrange
        var tokenService = CreateRealTokenService();
        var claims = BuildValidClaims();
        var token = tokenService.IssueToken(claims);

        using var db = CreateInMemoryDbContext();
        var patientRepo = new PatientRepository(db);
        var clinicRepo = new ClinicRepository(db);
        var membershipRepo = new ClinicMembershipRepository(db);
        var uow = new UnitOfWork(db);

        var clinic = new Clinic { Id = Guid.NewGuid(), Name = "clinic-main-01", TenantId = "tenant-01" };
        await db.Clinics.AddAsync(clinic);

        var existingPatient = new Domain.Entities.Patient
        {
            Id = Guid.NewGuid(),
            ClerkUserId = "user_clerk_existing_nophic",
            FirstName = "Juan",
            LastName = "Rizal",
            DateOfBirth = new DateOnly(1995, 6, 19),
            ClinicEzId = "CE-EXISTING-NOPHIC"
        };
        await db.Patients.AddAsync(existingPatient);
        await db.SaveChangesAsync();

        var handler = new ClaimIntakeCommandHandler(
            patientRepo,
            clinicRepo,
            membershipRepo,
            tokenService,
            new PatientClaimConflictResolver(),
            uow,
            NullLogger<ClaimIntakeCommandHandler>.Instance);

        var command = new ClaimIntakeCommand(
            ClerkUserId: "user_clerk_existing_nophic",
            ClaimToken: token,
            PhilHealthPin: "12-444555666-7");

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        var patient = await db.Patients.Include(p => p.GovernmentIds).FirstOrDefaultAsync(p => p.Id == existingPatient.Id);
        patient.Should().NotBeNull();
        patient!.GovernmentIds.Should().Contain(g => g.IdType == GovernmentIdType.PhilHealth && g.IdNumber == "12-444555666-7");
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // PROBE 3: ALLERGY HYDRATION & DEDUPLICATION BY ALLERGENNAME
    // ══════════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task Probe3A_DuplicateAllergensInRequest_DeduplicatesByAllergenNameCaseInsensitive()
    {
        // Arrange
        var tokenService = CreateRealTokenService();
        var claims = BuildValidClaims();
        var token = tokenService.IssueToken(claims);

        using var db = CreateInMemoryDbContext();
        var patientRepo = new PatientRepository(db);
        var clinicRepo = new ClinicRepository(db);
        var membershipRepo = new ClinicMembershipRepository(db);
        var uow = new UnitOfWork(db);

        var clinic = new Clinic { Id = Guid.NewGuid(), Name = "clinic-main-01", TenantId = "tenant-01" };
        await db.Clinics.AddAsync(clinic);
        await db.SaveChangesAsync();

        var handler = new ClaimIntakeCommandHandler(
            patientRepo,
            clinicRepo,
            membershipRepo,
            tokenService,
            new PatientClaimConflictResolver(),
            uow,
            NullLogger<ClaimIntakeCommandHandler>.Instance);

        var command = new ClaimIntakeCommand(
            ClerkUserId: "user_clerk_allergies_001",
            ClaimToken: token,
            Allergies:
            [
                new ClaimAllergyDto("Amoxicillin", Category: "Drug", Severity: "Severe", IsAnaphylactic: true),
                new ClaimAllergyDto("amoxicillin", Category: "Drug", Severity: "Mild"),      // duplicate lowercase
                new ClaimAllergyDto("AMOXICILLIN", Category: "Medication", Severity: "Moderate"), // duplicate uppercase
                new ClaimAllergyDto("  Amoxicillin  ", Category: "Drug"),                     // duplicate whitespace
                new ClaimAllergyDto("Ibuprofen", Category: "Drug", Severity: "Moderate"),   // distinct
                new ClaimAllergyDto("Peanuts", Category: "Food", Severity: "Severe", IsAnaphylactic: true), // distinct
                new ClaimAllergyDto("peanuts", Category: "Food"),                             // duplicate
                new ClaimAllergyDto("   ")                                                    // blank, should skip
            ]);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        var patient = await db.Patients.Include(p => p.Allergies).FirstOrDefaultAsync(p => p.Id == result.PatientId);
        patient.Should().NotBeNull();
        patient!.Allergies.Should().HaveCount(3, "Amoxicillin, Ibuprofen, and Peanuts must each appear exactly once");

        var allergenNames = patient.Allergies.Select(a => a.AllergenName).ToList();
        allergenNames.Should().BeEquivalentTo(["Amoxicillin", "Ibuprofen", "Peanuts"]);

        var amox = patient.Allergies.First(a => a.AllergenName == "Amoxicillin");
        amox.Severity.Should().Be(AllergySeverity.LifeThreatening);
        amox.AllergyType.Should().Be(AllergyType.Drug);

        var peanuts = patient.Allergies.First(a => a.AllergenName == "Peanuts");
        peanuts.Severity.Should().Be(AllergySeverity.LifeThreatening);
        peanuts.AllergyType.Should().Be(AllergyType.Food);
    }

    [Fact]
    public async Task Probe3B_ExistingPatientAllergies_DeduplicatesAgainstExistingRecords()
    {
        // Arrange
        var tokenService = CreateRealTokenService();
        var claims = BuildValidClaims();
        var token = tokenService.IssueToken(claims);

        using var db = CreateInMemoryDbContext();
        var patientRepo = new PatientRepository(db);
        var clinicRepo = new ClinicRepository(db);
        var membershipRepo = new ClinicMembershipRepository(db);
        var uow = new UnitOfWork(db);

        var clinic = new Clinic { Id = Guid.NewGuid(), Name = "clinic-main-01", TenantId = "tenant-01" };
        await db.Clinics.AddAsync(clinic);

        var existingPatient = new Domain.Entities.Patient
        {
            Id = Guid.NewGuid(),
            ClerkUserId = "user_clerk_existing_allergy",
            FirstName = "Juan",
            LastName = "Rizal",
            DateOfBirth = new DateOnly(1995, 6, 19),
            ClinicEzId = "CE-EXISTING-002",
            Allergies =
            [
                new PatientAllergy
                {
                    ClientId = Guid.NewGuid(),
                    AllergenName = "Ciprofloxacin",
                    AllergyType = AllergyType.Drug,
                    Severity = AllergySeverity.Moderate
                }
            ]
        };
        await db.Patients.AddAsync(existingPatient);
        await db.SaveChangesAsync();

        var handler = new ClaimIntakeCommandHandler(
            patientRepo,
            clinicRepo,
            membershipRepo,
            tokenService,
            new PatientClaimConflictResolver(),
            uow,
            NullLogger<ClaimIntakeCommandHandler>.Instance);

        var command = new ClaimIntakeCommand(
            ClerkUserId: "user_clerk_existing_allergy",
            ClaimToken: token,
            Allergies:
            [
                new ClaimAllergyDto("ciprofloxacin", Severity: "Severe"), // duplicate of existing
                new ClaimAllergyDto("Dust Mites", Category: "environmental", Severity: "Mild") // new
            ]);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        var updated = await db.Patients.Include(p => p.Allergies).FirstOrDefaultAsync(p => p.Id == existingPatient.Id);
        updated.Should().NotBeNull();
        updated!.Allergies.Should().HaveCount(2);
        updated.Allergies.Should().Contain(a => a.AllergenName == "Ciprofloxacin");
        updated.Allergies.Should().Contain(a => a.AllergenName == "Dust Mites");
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // PROBE 4: TRANSACTIONAL CLINIC MEMBERSHIP ACTIVATION
    // ══════════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task Probe4A_NewMembership_SetsActiveWithAllThreeConsentsTrue()
    {
        // Arrange
        var tokenService = CreateRealTokenService();
        var claims = BuildValidClaims();
        var token = tokenService.IssueToken(claims);

        using var db = CreateInMemoryDbContext();
        var patientRepo = new PatientRepository(db);
        var clinicRepo = new ClinicRepository(db);
        var membershipRepo = new ClinicMembershipRepository(db);
        var uow = new UnitOfWork(db);

        var clinic = new Clinic { Id = Guid.NewGuid(), Name = "clinic-main-01", TenantId = "tenant-01" };
        await db.Clinics.AddAsync(clinic);
        await db.SaveChangesAsync();

        var handler = new ClaimIntakeCommandHandler(
            patientRepo,
            clinicRepo,
            membershipRepo,
            tokenService,
            new PatientClaimConflictResolver(),
            uow,
            NullLogger<ClaimIntakeCommandHandler>.Instance);

        var command = new ClaimIntakeCommand(
            ClerkUserId: "user_clerk_membership_001",
            ClaimToken: token);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.ClinicMembershipStatus.Should().Be("Active");
        result.ClinicMembershipId.Should().NotBeNull();

        var membership = await db.ClinicMemberships.FirstOrDefaultAsync(m => m.Id == result.ClinicMembershipId);
        membership.Should().NotBeNull();
        membership!.Status.Should().Be(ClinicMembershipStatus.Active);
        membership.ConsentPrivacyPolicy.Should().BeTrue("ConsentPrivacyPolicy must be true");
        membership.ConsentTermsAndConditions.Should().BeTrue("ConsentTermsAndConditions must be true");
        membership.ConsentDataSharing.Should().BeTrue("ConsentDataSharing must be true");
        membership.ConsentedAt.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromSeconds(5));
        membership.IsDeleted.Should().BeFalse();
    }

    [Fact]
    public async Task Probe4B_SoftDeletedMembership_IsReactivatedAndAllThreeConsentsSetToTrue()
    {
        // Arrange
        var tokenService = CreateRealTokenService();
        var claims = BuildValidClaims();
        var token = tokenService.IssueToken(claims);

        using var db = CreateInMemoryDbContext();
        var patientRepo = new PatientRepository(db);
        var clinicRepo = new ClinicRepository(db);
        var membershipRepo = new ClinicMembershipRepository(db);
        var uow = new UnitOfWork(db);

        var clinic = new Clinic { Id = Guid.NewGuid(), Name = "clinic-main-01", TenantId = "tenant-01" };
        await db.Clinics.AddAsync(clinic);

        var existingPatient = new Domain.Entities.Patient
        {
            Id = Guid.NewGuid(),
            ClerkUserId = "user_clerk_reactivate_001",
            FirstName = "Juan",
            LastName = "Rizal",
            DateOfBirth = new DateOnly(1995, 6, 19),
            ClinicEzId = "CE-REACTIVATE-001"
        };
        await db.Patients.AddAsync(existingPatient);

        // Soft-deleted membership
        var deletedMembership = new ClinicMembership
        {
            Id = Guid.NewGuid(),
            PatientId = existingPatient.Id,
            ClinicId = clinic.Id,
            Status = ClinicMembershipStatus.Pending,
            ConsentPrivacyPolicy = false,
            ConsentTermsAndConditions = false,
            ConsentDataSharing = false,
            IsDeleted = true,
            DeletedAt = DateTime.UtcNow.AddMonths(-2),
            DeletedBy = "staff"
        };
        await db.ClinicMemberships.AddAsync(deletedMembership);
        await db.SaveChangesAsync();

        var handler = new ClaimIntakeCommandHandler(
            patientRepo,
            clinicRepo,
            membershipRepo,
            tokenService,
            new PatientClaimConflictResolver(),
            uow,
            NullLogger<ClaimIntakeCommandHandler>.Instance);

        var command = new ClaimIntakeCommand(
            ClerkUserId: "user_clerk_reactivate_001",
            ClaimToken: token);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.ClinicMembershipStatus.Should().Be("Active");

        var reactivated = await db.ClinicMemberships.IgnoreQueryFilters()
            .FirstOrDefaultAsync(m => m.Id == deletedMembership.Id);

        reactivated.Should().NotBeNull();
        reactivated!.IsDeleted.Should().BeFalse("Soft-delete flag must be cleared");
        reactivated.DeletedAt.Should().BeNull();
        reactivated.DeletedBy.Should().BeNull();
        reactivated.Status.Should().Be(ClinicMembershipStatus.Active);
        reactivated.ConsentPrivacyPolicy.Should().BeTrue();
        reactivated.ConsentTermsAndConditions.Should().BeTrue();
        reactivated.ConsentDataSharing.Should().BeTrue();
        reactivated.ConsentedAt.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromSeconds(5));
    }

    [Fact]
    public async Task Probe4C_AtomicPersistence_DemonstratesDuplicateCollectionFixupBug()
    {
        // Arrange
        var tokenService = CreateRealTokenService();
        var claims = BuildValidClaims(firstName: "Andres", lastName: "Bonifacio");
        var token = tokenService.IssueToken(claims);

        using var db = CreateInMemoryDbContext();
        var patientRepo = new PatientRepository(db);
        var clinicRepo = new ClinicRepository(db);
        var membershipRepo = new ClinicMembershipRepository(db);
        var uow = new UnitOfWork(db);

        var clinic = new Clinic { Id = Guid.NewGuid(), Name = "clinic-main-01", TenantId = "tenant-01" };
        await db.Clinics.AddAsync(clinic);
        await db.SaveChangesAsync();

        var handler = new ClaimIntakeCommandHandler(
            patientRepo,
            clinicRepo,
            membershipRepo,
            tokenService,
            new PatientClaimConflictResolver(),
            uow,
            NullLogger<ClaimIntakeCommandHandler>.Instance);

        var command = new ClaimIntakeCommand(
            ClerkUserId: "user_clerk_atomic_001",
            ClaimToken: token,
            PhilHealthPin: "12-777888999-0",
            Allergies: [new ClaimAllergyDto("Penicillin", Severity: "Severe")]);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert: 1. In the database table, exactly 1 ClinicMembership row was persisted
        var dbMemberships = await db.ClinicMemberships.Where(m => m.PatientId == result.PatientId).ToListAsync();
        dbMemberships.Should().ContainSingle();

        // 2. Verifies fix in ClaimIntakeCommandHandler.cs:
        // EF Core relationship fixup automatically links the tracked membership without duplicating references
        var inMemoryPatient = await db.Patients.Include(p => p.ClinicMemberships).FirstAsync(p => p.Id == result.PatientId);
        inMemoryPatient.ClinicMemberships.Should().ContainSingle(
            "Calling _clinicMembershipRepository.AddAsync tracks the membership and EF Core navigation fixup populates targetPatient.ClinicMemberships without in-memory duplication");
    }
}
