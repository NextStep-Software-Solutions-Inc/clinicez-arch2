using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;
using ClinicEz.Patient.Application.Common.Exceptions;
using ClinicEz.Patient.Application.Features.Patients.Commands.ClaimIntake;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Security.ClaimTokens;

namespace ClinicEz.Patient.Application.Tests.Features.Patients.Commands;

public sealed class ClaimIntakeCommandHandlerTests
{
    private readonly IPatientRepository _patientRepo = Substitute.For<IPatientRepository>();
    private readonly IClinicRepository _clinicRepo = Substitute.For<IClinicRepository>();
    private readonly IClinicMembershipRepository _membershipRepo = Substitute.For<IClinicMembershipRepository>();
    private readonly IClaimTokenService _claimTokenService = Substitute.For<IClaimTokenService>();
    private readonly IPatientClaimConflictResolver _conflictResolver = new PatientClaimConflictResolver();
    private readonly IUnitOfWork _uow = Substitute.For<IUnitOfWork>();

    private ClaimIntakeCommandHandler CreateHandler(IPatientClaimConflictResolver? resolver = null) =>
        new(
            _patientRepo,
            _clinicRepo,
            _membershipRepo,
            _claimTokenService,
            resolver ?? _conflictResolver,
            _uow,
            NullLogger<ClaimIntakeCommandHandler>.Instance);

    private static ClaimTokenClaims CreateValidClaims(
        string firstName = "Juan",
        string lastName = "Rizal",
        DateOnly? dob = null,
        string? email = "juan.rizal@example.ph",
        string memberType = "MM")
    {
        return new ClaimTokenClaims(
            joinRequestId: Guid.NewGuid(),
            tenantSlug: "tenant-a",
            facilitySlug: "facility-main",
            email: email,
            firstName: firstName,
            lastName: lastName,
            dateOfBirth: dob ?? new DateOnly(1995, 6, 19),
            memberType: memberType,
            expiresAtUtc: DateTime.UtcNow.AddHours(48));
    }

    [Fact]
    public async Task Handle_WhenTokenExpired_ThrowsValidationException()
    {
        // Arrange
        _claimTokenService.ValidateToken(Arg.Any<string>())
            .Returns(ClaimTokenValidationResult.Expired("Claim token has expired."));

        var command = new ClaimIntakeCommand(
            ClerkUserId: "user_clerk_123",
            ClaimToken: "expired.token");

        // Act & Assert
        var act = () => CreateHandler().Handle(command, CancellationToken.None);
        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage("*expired*");
    }

    [Fact]
    public async Task Handle_WhenTokenBadSignature_ThrowsValidationException()
    {
        // Arrange
        _claimTokenService.ValidateToken(Arg.Any<string>())
            .Returns(ClaimTokenValidationResult.BadSignature());

        var command = new ClaimIntakeCommand(
            ClerkUserId: "user_clerk_123",
            ClaimToken: "tampered.token");

        // Act & Assert
        var act = () => CreateHandler().Handle(command, CancellationToken.None);
        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage("*Tampered*");
    }

    [Fact]
    public async Task Handle_WhenMedicalPrivacyGuardrailBlocked_ThrowsMedicalPrivacyGuardrailException()
    {
        // Arrange
        var claims = CreateValidClaims(firstName: "Andres", lastName: "Bonifacio", dob: new DateOnly(1988, 11, 30));
        _claimTokenService.ValidateToken(Arg.Any<string>())
            .Returns(ClaimTokenValidationResult.Success(claims));

        var existingPatient = new Domain.Entities.Patient
        {
            Id = Guid.NewGuid(),
            ClerkUserId = "user_clerk_123",
            FirstName = "Emilio",
            LastName = "Aguinaldo",
            DateOfBirth = new DateOnly(1985, 3, 22),
            ConsentToShareInfo = true
        };

        _patientRepo.GetByClerkUserIdWithDetailsAsync("user_clerk_123", Arg.Any<CancellationToken>())
            .Returns(existingPatient);

        var command = new ClaimIntakeCommand(
            ClerkUserId: "user_clerk_123",
            ClaimToken: "valid.token",
            IsDependent: false);

        // Act & Assert
        var act = () => CreateHandler().Handle(command, CancellationToken.None);
        var ex = await act.Should().ThrowAsync<MedicalPrivacyGuardrailException>();
        ex.Which.ErrorCode.Should().Be("MEDICAL_PRIVACY_GUARDRAIL_BLOCKED");
        ex.Which.Message.Should().Contain("medical privacy");

        await _uow.DidNotReceive().SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_WhenNewPatientSelfClaim_HydratesDemographicsPhilHealthAllergiesAndMembership()
    {
        // Arrange
        var claims = CreateValidClaims();
        _claimTokenService.ValidateToken(Arg.Any<string>())
            .Returns(ClaimTokenValidationResult.Success(claims));

        _patientRepo.GetByClerkUserIdWithDetailsAsync("user_new_123", Arg.Any<CancellationToken>())
            .Returns((Domain.Entities.Patient?)null);

        var clinic = new Clinic { Id = Guid.NewGuid(), Name = "facility-main", TenantId = "tenant-a" };
        _clinicRepo.GetAllAsync(Arg.Any<CancellationToken>()).Returns([clinic]);

        _membershipRepo.GetByPatientAndClinicWithDeletedAsync(Arg.Any<Guid>(), clinic.Id, Arg.Any<CancellationToken>())
            .Returns((ClinicMembership?)null);

        _uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(1);

        var command = new ClaimIntakeCommand(
            ClerkUserId: "user_new_123",
            ClaimToken: "valid.token",
            Sex: "Male",
            ContactNumber: "09171234567",
            PhilHealthPin: "12-345678901-2",
            Allergies:
            [
                new ClaimAllergyDto("Amoxicillin", Category: "Medication", Severity: "Severe", IsAnaphylactic: true, Reaction: "Hives"),
                new ClaimAllergyDto("Peanuts", Category: "Food", Severity: "Moderate")
            ]);

        // Act
        var result = await CreateHandler().Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.RelationshipType.Should().Be("Self");
        result.ClinicMembershipStatus.Should().Be("Active");
        result.FirstName.Should().Be("Juan");
        result.LastName.Should().Be("Rizal");

        await _patientRepo.Received(1).AddAsync(
            Arg.Is<Domain.Entities.Patient>(p =>
                p.ClerkUserId == "user_new_123" &&
                p.FirstName == "Juan" &&
                p.ConsentToShareInfo == true &&
                p.GovernmentIds.Any(g => g.IdNumber == "12-345678901-2" && g.IdType == GovernmentIdType.PhilHealth) &&
                p.Allergies.Count == 2),
            Arg.Any<CancellationToken>());

        await _membershipRepo.Received(1).AddAsync(
            Arg.Is<ClinicMembership>(m =>
                m.ClinicId == clinic.Id &&
                m.Status == ClinicMembershipStatus.Active &&
                m.ConsentDataSharing == true),
            Arg.Any<CancellationToken>());

        await _uow.Received(1).SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_WhenExistingPatientSelfClaim_AlternateEmail_LinksWithoutDuplicatingPatient()
    {
        // Arrange
        var claims = CreateValidClaims(
            firstName: "Juan",
            lastName: "Rizal",
            dob: new DateOnly(1995, 6, 19),
            email: "juan.corp@company.ph");

        _claimTokenService.ValidateToken(Arg.Any<string>())
            .Returns(ClaimTokenValidationResult.Success(claims));

        var existingPatientId = Guid.NewGuid();
        var existingPatient = new Domain.Entities.Patient
        {
            Id = existingPatientId,
            ClerkUserId = "user_clerk_juan",
            FirstName = "Juan",
            LastName = "Rizal",
            DateOfBirth = new DateOnly(1995, 6, 19),
            Email = "juan.personal@gmail.com",
            ClinicEzId = "CE-EXISTING-001"
        };

        _patientRepo.GetByClerkUserIdWithDetailsAsync("user_clerk_juan", Arg.Any<CancellationToken>())
            .Returns(existingPatient);

        var clinic = new Clinic { Id = Guid.NewGuid(), Name = "facility-main" };
        _clinicRepo.GetAllAsync(Arg.Any<CancellationToken>()).Returns([clinic]);

        _membershipRepo.GetByPatientAndClinicWithDeletedAsync(existingPatientId, clinic.Id, Arg.Any<CancellationToken>())
            .Returns((ClinicMembership?)null);

        _uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(1);

        var command = new ClaimIntakeCommand(
            ClerkUserId: "user_clerk_juan",
            ClaimToken: "valid.token",
            ConfirmAlternateEmailLink: true);

        // Act
        var result = await CreateHandler().Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.PatientId.Should().Be(existingPatientId, "must reuse existing patient ID without creating a duplicate record");
        result.RelationshipType.Should().Be("Self");
        result.ClinicMembershipStatus.Should().Be("Active");

        await _patientRepo.DidNotReceive().AddAsync(Arg.Any<Domain.Entities.Patient>(), Arg.Any<CancellationToken>());
        _patientRepo.Received(1).Update(Arg.Is<Domain.Entities.Patient>(p => p.Id == existingPatientId && p.ConsentToShareInfo == true));
        await _uow.Received(1).SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_WhenMinorOrDependent_CreatesManagedDependentWithNullClerkUserIdAndParentFk()
    {
        // Arrange
        var minorDob = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(-3));
        var minorClaims = CreateValidClaims(
            firstName: "Baby",
            lastName: "Rizal",
            dob: minorDob,
            memberType: "DD");

        _claimTokenService.ValidateToken(Arg.Any<string>())
            .Returns(ClaimTokenValidationResult.Success(minorClaims));

        var parentPatientId = Guid.NewGuid();
        var parentPatient = new Domain.Entities.Patient
        {
            Id = parentPatientId,
            ClerkUserId = "user_parent_123",
            FirstName = "Juan",
            LastName = "Rizal",
            DateOfBirth = new DateOnly(1990, 1, 1),
            ClinicEzId = "CE-PARENT-001"
        };

        _patientRepo.GetByClerkUserIdWithDetailsAsync("user_parent_123", Arg.Any<CancellationToken>())
            .Returns(parentPatient);

        var clinic = new Clinic { Id = Guid.NewGuid(), Name = "facility-main" };
        _clinicRepo.GetAllAsync(Arg.Any<CancellationToken>()).Returns([clinic]);

        _membershipRepo.GetByPatientAndClinicWithDeletedAsync(Arg.Any<Guid>(), clinic.Id, Arg.Any<CancellationToken>())
            .Returns((ClinicMembership?)null);

        _uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(1);

        var command = new ClaimIntakeCommand(
            ClerkUserId: "user_parent_123",
            ClaimToken: "valid.token",
            IsDependent: true,
            RelationshipToDependent: "Child",
            PhilHealthPin: "12-999888777-1",
            PrincipalMemberPin: "12-111222333-4",
            PrincipalFullName: "Juan Rizal",
            PrincipalRelationship: "P",
            PrincipalDateOfBirth: new DateOnly(1990, 1, 1));

        // Act
        var result = await CreateHandler().Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.RelationshipType.Should().Be("Dependent");
        result.FirstName.Should().Be("Baby");
        result.LastName.Should().Be("Rizal");

        await _patientRepo.Received(1).AddAsync(
            Arg.Is<Domain.Entities.Patient>(p =>
                p.ClerkUserId == null &&
                p.ManagedByPatientId == parentPatientId &&
                p.RelationshipToManager == "Child" &&
                p.FirstName == "Baby" &&
                p.GovernmentIds.Any(g =>
                    g.IdNumber == "12-999888777-1" &&
                    g.PhilhealthCategory == "DD" &&
                    g.SponsorPin == "12-111222333-4" &&
                    g.SponsorRelationship == "P")),
            Arg.Any<CancellationToken>());

        await _uow.Received(1).SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_WhenAllergiesSupplied_DeduplicatesByAllergenName()
    {
        // Arrange
        var claims = CreateValidClaims();
        _claimTokenService.ValidateToken(Arg.Any<string>())
            .Returns(ClaimTokenValidationResult.Success(claims));

        var existingPatient = new Domain.Entities.Patient
        {
            Id = Guid.NewGuid(),
            ClerkUserId = "user_clerk_123",
            FirstName = "Juan",
            LastName = "Rizal",
            DateOfBirth = new DateOnly(1995, 6, 19),
            Allergies =
            [
                new PatientAllergy
                {
                    AllergenName = "Amoxicillin",
                    AllergyType = AllergyType.Drug,
                    Severity = AllergySeverity.Moderate
                }
            ]
        };

        _patientRepo.GetByClerkUserIdWithDetailsAsync("user_clerk_123", Arg.Any<CancellationToken>())
            .Returns(existingPatient);

        var clinic = new Clinic { Id = Guid.NewGuid(), Name = "facility-main" };
        _clinicRepo.GetAllAsync(Arg.Any<CancellationToken>()).Returns([clinic]);

        _membershipRepo.GetByPatientAndClinicWithDeletedAsync(existingPatient.Id, clinic.Id, Arg.Any<CancellationToken>())
            .Returns(new ClinicMembership { PatientId = existingPatient.Id, ClinicId = clinic.Id, Status = ClinicMembershipStatus.Active });

        _uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(1);

        var command = new ClaimIntakeCommand(
            ClerkUserId: "user_clerk_123",
            ClaimToken: "valid.token",
            Allergies:
            [
                new ClaimAllergyDto("amoxicillin", Severity: "Severe"), // Duplicate with different case
                new ClaimAllergyDto("Ibuprofen", Severity: "Mild")      // New
            ]);

        // Act
        await CreateHandler().Handle(command, CancellationToken.None);

        // Assert
        existingPatient.Allergies.Should().HaveCount(2, "amoxicillin must not be duplicated");
        existingPatient.Allergies.Select(a => a.AllergenName.ToLowerInvariant())
            .Should().BeEquivalentTo(["amoxicillin", "ibuprofen"]);
    }

    [Fact]
    public async Task Handle_WhenClinicDoesNotExist_AutoProvisionsClinic()
    {
        // Arrange
        var claims = CreateValidClaims();
        _claimTokenService.ValidateToken(Arg.Any<string>())
            .Returns(ClaimTokenValidationResult.Success(claims));

        _patientRepo.GetByClerkUserIdWithDetailsAsync("user_new_123", Arg.Any<CancellationToken>())
            .Returns((Domain.Entities.Patient?)null);

        _clinicRepo.GetAllAsync(Arg.Any<CancellationToken>()).Returns([]);

        _membershipRepo.GetByPatientAndClinicWithDeletedAsync(Arg.Any<Guid>(), Arg.Any<Guid>(), Arg.Any<CancellationToken>())
            .Returns((ClinicMembership?)null);

        _uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(1);

        var command = new ClaimIntakeCommand(
            ClerkUserId: "user_new_123",
            ClaimToken: "valid.token");

        // Act
        await CreateHandler().Handle(command, CancellationToken.None);

        // Assert
        await _clinicRepo.Received(1).AddAsync(
            Arg.Is<Clinic>(c =>
                c.Name == "facility-main" &&
                c.TenantId == "tenant-a"),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_WhenMembershipExists_ReactivatesExistingMembership()
    {
        // Arrange
        var claims = CreateValidClaims();
        _claimTokenService.ValidateToken(Arg.Any<string>())
            .Returns(ClaimTokenValidationResult.Success(claims));

        var patientId = Guid.NewGuid();
        var existingPatient = new Domain.Entities.Patient
        {
            Id = patientId,
            ClerkUserId = "user_clerk_123",
            FirstName = "Juan",
            LastName = "Rizal",
            DateOfBirth = new DateOnly(1995, 6, 19)
        };

        _patientRepo.GetByClerkUserIdWithDetailsAsync("user_clerk_123", Arg.Any<CancellationToken>())
            .Returns(existingPatient);

        var clinic = new Clinic { Id = Guid.NewGuid(), Name = "facility-main" };
        _clinicRepo.GetAllAsync(Arg.Any<CancellationToken>()).Returns([clinic]);

        var existingMembership = new ClinicMembership
        {
            Id = Guid.NewGuid(),
            PatientId = patientId,
            ClinicId = clinic.Id,
            Status = ClinicMembershipStatus.Pending,
            IsDeleted = true
        };

        _membershipRepo.GetByPatientAndClinicWithDeletedAsync(patientId, clinic.Id, Arg.Any<CancellationToken>())
            .Returns(existingMembership);

        _uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(1);

        var command = new ClaimIntakeCommand(
            ClerkUserId: "user_clerk_123",
            ClaimToken: "valid.token");

        // Act
        var result = await CreateHandler().Handle(command, CancellationToken.None);

        // Assert
        result.ClinicMembershipStatus.Should().Be("Active");
        existingMembership.IsDeleted.Should().BeFalse();
        existingMembership.Status.Should().Be(ClinicMembershipStatus.Active);
        existingMembership.ConsentDataSharing.Should().BeTrue();
        existingMembership.ConsentPrivacyPolicy.Should().BeTrue();
        existingMembership.ConsentTermsAndConditions.Should().BeTrue();

        _membershipRepo.Received(1).Update(existingMembership);
        await _membershipRepo.DidNotReceive().AddAsync(Arg.Any<ClinicMembership>(), Arg.Any<CancellationToken>());
    }
}
