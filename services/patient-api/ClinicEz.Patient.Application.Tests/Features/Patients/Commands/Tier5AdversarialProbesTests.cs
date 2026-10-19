using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Common.Exceptions;
using ClinicEz.Patient.Application.Features.Patients.Commands.ClaimIntake;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Security.ClaimTokens;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Patient.Application.Tests.Features.Patients.Commands;

/// <summary>
/// Tier 5 Adversarial Probes for ClaimIntakeCommandHandler & PatientClaimConflictResolver:
/// - Age == 18 boundary (minor proxy vs adult medical privacy guardrail, leap years)
/// - High-concurrency claims (simulated parallel claims on same token)
/// - Alternate email linking without duplicate Patient creation
/// - PhilHealth statutory dependent ("DD") vs non-dependent with same family name
/// </summary>
public sealed class Tier5AdversarialProbesTests
{
    private sealed class MutableTimeProvider(DateTimeOffset initialUtcNow) : TimeProvider
    {
        private DateTimeOffset _utcNow = initialUtcNow;
        public override DateTimeOffset GetUtcNow() => _utcNow;
        public void SetUtcNow(DateTimeOffset utcNow) => _utcNow = utcNow;
    }

    private readonly IPatientRepository _patientRepo = Substitute.For<IPatientRepository>();
    private readonly IClinicRepository _clinicRepo = Substitute.For<IClinicRepository>();
    private readonly IClinicMembershipRepository _membershipRepo = Substitute.For<IClinicMembershipRepository>();
    private readonly IClaimTokenService _claimTokenService = Substitute.For<IClaimTokenService>();
    private readonly IUnitOfWork _uow = Substitute.For<IUnitOfWork>();

    private ClaimIntakeCommandHandler CreateHandler(IPatientClaimConflictResolver resolver) =>
        new(
            _patientRepo,
            _clinicRepo,
            _membershipRepo,
            _claimTokenService,
            resolver,
            _uow,
            NullLogger<ClaimIntakeCommandHandler>.Instance);

    private static ClaimTokenClaims CreateClaims(
        string firstName = "Juan",
        string lastName = "Dela Cruz",
        DateOnly? dob = null,
        string? email = "juan.delacruz@example.ph",
        string memberType = "MM") => new(
        joinRequestId: Guid.NewGuid(),
        tenantSlug: "tenant-metro",
        facilitySlug: "facility-central",
        email: email,
        firstName: firstName,
        lastName: lastName,
        dateOfBirth: dob ?? new DateOnly(1995, 6, 15),
        memberType: memberType,
        expiresAtUtc: DateTime.UtcNow.AddHours(48));

    #region Probe 1: Age == 18 Boundary & Leap Year Boundary

    [Fact]
    public void AgeBoundary_17Years364Days_EvaluatedAsMinor_AutoProxiesToDependent()
    {
        // On 2026-10-13, a patient born on 2008-10-14 is 17 years and 364 days old (turns 18 tomorrow)
        var fixedTime = new DateTimeOffset(2026, 10, 13, 12, 0, 0, TimeSpan.Zero);
        var timeProvider = new MutableTimeProvider(fixedTime);
        var resolver = new PatientClaimConflictResolver(timeProvider);

        var minorDob = new DateOnly(2008, 10, 14);
        var claims = CreateClaims(firstName: "Carlos", lastName: "Dela Cruz", dob: minorDob);

        var parentClaimant = new Domain.Entities.Patient
        {
            Id = Guid.NewGuid(),
            ClerkUserId = "user_parent_1",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            DateOfBirth = new DateOnly(1980, 5, 20)
        };

        // Parent claims minor's pass with isDependentClaim: false
        var result = resolver.Resolve(parentClaimant, claims, isDependentClaim: false);

        result.Outcome.Should().Be(ClaimConflictOutcome.ManagedDependentProxy);
        result.RelationshipType.Should().Be("Dependent");
        result.Reason.Should().Contain("Minor");
    }

    [Fact]
    public void AgeBoundary_Exact18thBirthday_EvaluatedAsAdult_BlocksUnrelatedAdultClaim()
    {
        // On 2026-10-13, a patient born on 2008-10-13 turns exactly 18 years old today
        var fixedTime = new DateTimeOffset(2026, 10, 13, 12, 0, 0, TimeSpan.Zero);
        var timeProvider = new MutableTimeProvider(fixedTime);
        var resolver = new PatientClaimConflictResolver(timeProvider);

        var adult18Dob = new DateOnly(2008, 10, 13);
        var claims = CreateClaims(firstName: "Carlos", lastName: "Dela Cruz", dob: adult18Dob, memberType: "MM");

        var adultClaimant = new Domain.Entities.Patient
        {
            Id = Guid.NewGuid(),
            ClerkUserId = "user_adult_1",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            DateOfBirth = new DateOnly(1980, 5, 20)
        };

        // When adult claimant attempts to merge unrelated adult pass into personal account: blocked per RA 10173
        var result = resolver.Resolve(adultClaimant, claims, isDependentClaim: false);

        result.Outcome.Should().Be(ClaimConflictOutcome.MedicalPrivacyBlocked);
        result.RelationshipType.Should().Be("Blocked");
        result.Reason.Should().Contain("medical privacy");
    }

    [Fact]
    public void AgeBoundary_Exact18thBirthday_SelfIntake_AllowsNewSelfAccount()
    {
        var fixedTime = new DateTimeOffset(2026, 10, 13, 12, 0, 0, TimeSpan.Zero);
        var timeProvider = new MutableTimeProvider(fixedTime);
        var resolver = new PatientClaimConflictResolver(timeProvider);

        var adult18Dob = new DateOnly(2008, 10, 13);
        var claims = CreateClaims(firstName: "Carlos", lastName: "Dela Cruz", dob: adult18Dob);

        // 18-year-old creates account for themselves (claimant is null)
        var result = resolver.Resolve(claimant: null, claims, isDependentClaim: false);

        result.Outcome.Should().Be(ClaimConflictOutcome.NewSelf);
        result.RelationshipType.Should().Be("Self");
    }

    [Fact]
    public void AgeBoundary_LeapYearDob_Feb29_2008_EvaluatesCorrectlyInNonLeapYear()
    {
        var timeProvider = new MutableTimeProvider(new DateTimeOffset(2026, 2, 28, 12, 0, 0, TimeSpan.Zero));
        var resolver = new PatientClaimConflictResolver(timeProvider);

        var leapDob = new DateOnly(2008, 2, 29);
        var claims = CreateClaims(firstName: "LeapKid", lastName: "Santos", dob: leapDob);
        var parentClaimant = new Domain.Entities.Patient
        {
            Id = Guid.NewGuid(),
            ClerkUserId = "user_parent_leap",
            FirstName = "Maria",
            LastName = "Santos",
            DateOfBirth = new DateOnly(1982, 1, 1)
        };

        // On 2026-02-28, today.AddYears(-18) is 2008-02-28.
        // 2008-02-29 > 2008-02-28 is true => still a minor!
        var resultBefore18 = resolver.Resolve(parentClaimant, claims, isDependentClaim: false);
        resultBefore18.Outcome.Should().Be(ClaimConflictOutcome.ManagedDependentProxy);

        // On 2026-03-01, today.AddYears(-18) is 2008-03-01.
        // 2008-02-29 > 2008-03-01 is false => reached majority (adult)!
        timeProvider.SetUtcNow(new DateTimeOffset(2026, 3, 1, 12, 0, 0, TimeSpan.Zero));
        var resultAfter18 = resolver.Resolve(parentClaimant, claims, isDependentClaim: false);
        resultAfter18.Outcome.Should().Be(ClaimConflictOutcome.MedicalPrivacyBlocked);
    }

    #endregion

    #region Probe 2: High-Concurrency Claims Simulation

    [Fact]
    public async Task Concurrency_ParallelClaimsOnSameToken_SameUser_SucceedsIdempotentlyWithoutDuplicates()
    {
        // Simulate two parallel incoming HTTP requests for the same token by the same authenticated user
        var claims = CreateClaims(firstName: "Juan", lastName: "Dela Cruz", dob: new DateOnly(1990, 5, 10));
        _claimTokenService.ValidateToken(Arg.Any<string>())
            .Returns(ClaimTokenValidationResult.Success(claims));

        var existingPatientId = Guid.NewGuid();
        var existingPatient = new Domain.Entities.Patient
        {
            Id = existingPatientId,
            ClerkUserId = "user_concurrent_123",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            DateOfBirth = new DateOnly(1990, 5, 10),
            Email = "juan.delacruz@example.ph",
            ClinicEzId = "CE-CONC-001"
        };

        _patientRepo.GetByClerkUserIdWithDetailsAsync("user_concurrent_123", Arg.Any<CancellationToken>())
            .Returns(existingPatient);

        var clinic = new Clinic { Id = Guid.NewGuid(), Name = "facility-central", TenantId = "tenant-metro" };
        _clinicRepo.GetAllAsync(Arg.Any<CancellationToken>()).Returns([clinic]);

        var membership = new ClinicMembership
        {
            Id = Guid.NewGuid(),
            PatientId = existingPatientId,
            ClinicId = clinic.Id,
            Status = ClinicMembershipStatus.Active
        };

        _membershipRepo.GetByPatientAndClinicWithDeletedAsync(existingPatientId, clinic.Id, Arg.Any<CancellationToken>())
            .Returns(membership);

        _uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(1);

        var handler = CreateHandler(new PatientClaimConflictResolver());

        var command1 = new ClaimIntakeCommand(
            ClerkUserId: "user_concurrent_123",
            ClaimToken: "valid.claim.token");
        var command2 = new ClaimIntakeCommand(
            ClerkUserId: "user_concurrent_123",
            ClaimToken: "valid.claim.token");

        // Execute both tasks in parallel
        var task1 = handler.Handle(command1, CancellationToken.None);
        var task2 = handler.Handle(command2, CancellationToken.None);

        var results = await Task.WhenAll(task1, task2);

        results[0].Should().NotBeNull();
        results[1].Should().NotBeNull();
        results[0].PatientId.Should().Be(existingPatientId);
        results[1].PatientId.Should().Be(existingPatientId);

        // Never invoked AddAsync for new patient (existing profile reused)
        await _patientRepo.DidNotReceive().AddAsync(Arg.Any<Domain.Entities.Patient>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Concurrency_ParallelClaimsOnSameToken_DifferentUsers_BlocksUnauthorizedClaimant()
    {
        // Token belongs to adult "Juan Dela Cruz"
        var claims = CreateClaims(firstName: "Juan", lastName: "Dela Cruz", dob: new DateOnly(1990, 5, 10));
        _claimTokenService.ValidateToken(Arg.Any<string>())
            .Returns(ClaimTokenValidationResult.Success(claims));

        // User A (Juan)
        var userAPatient = new Domain.Entities.Patient
        {
            Id = Guid.NewGuid(),
            ClerkUserId = "user_juan",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            DateOfBirth = new DateOnly(1990, 5, 10)
        };

        // User B (Unrelated Adult)
        var userBPatient = new Domain.Entities.Patient
        {
            Id = Guid.NewGuid(),
            ClerkUserId = "user_imposter",
            FirstName = "Ramon",
            LastName = "Magsaysay",
            DateOfBirth = new DateOnly(1980, 8, 31)
        };

        _patientRepo.GetByClerkUserIdWithDetailsAsync("user_juan", Arg.Any<CancellationToken>())
            .Returns(userAPatient);
        _patientRepo.GetByClerkUserIdWithDetailsAsync("user_imposter", Arg.Any<CancellationToken>())
            .Returns(userBPatient);

        var clinic = new Clinic { Id = Guid.NewGuid(), Name = "facility-central", TenantId = "tenant-metro" };
        _clinicRepo.GetAllAsync(Arg.Any<CancellationToken>()).Returns([clinic]);
        _membershipRepo.GetByPatientAndClinicWithDeletedAsync(userAPatient.Id, clinic.Id, Arg.Any<CancellationToken>())
            .Returns(new ClinicMembership { PatientId = userAPatient.Id, ClinicId = clinic.Id, Status = ClinicMembershipStatus.Active });

        _uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(1);

        var handler = CreateHandler(new PatientClaimConflictResolver());

        var validCommand = new ClaimIntakeCommand("user_juan", "token");
        var imposterCommand = new ClaimIntakeCommand("user_imposter", "token");

        // Valid user succeeds
        var validResult = await handler.Handle(validCommand, CancellationToken.None);
        validResult.PatientId.Should().Be(userAPatient.Id);

        // Imposter attempt is blocked by Medical Privacy Guardrail
        var imposterAct = () => handler.Handle(imposterCommand, CancellationToken.None);
        await imposterAct.Should().ThrowAsync<MedicalPrivacyGuardrailException>()
            .WithMessage("*medical privacy*");
    }

    #endregion

    #region Probe 3: Alternate Email Linking Without Duplicate Patient Creation

    [Fact]
    public async Task AlternateEmailLinking_MatchingNameAndDob_ReusesExistingPatientIdWithoutCreatingDuplicate()
    {
        var claims = CreateClaims(
            firstName: "Maria",
            lastName: "Santos",
            dob: new DateOnly(1992, 4, 10),
            email: "maria.work@hospital.ph"); // Work email on intake form

        _claimTokenService.ValidateToken(Arg.Any<string>())
            .Returns(ClaimTokenValidationResult.Success(claims));

        var existingPatientId = Guid.NewGuid();
        var existingPatient = new Domain.Entities.Patient
        {
            Id = existingPatientId,
            ClerkUserId = "user_clerk_maria",
            FirstName = "Maria",
            LastName = "Santos",
            DateOfBirth = new DateOnly(1992, 4, 10),
            Email = "maria.personal@gmail.com", // Personal email on profile
            ClinicEzId = "CE-MARIA-001"
        };

        _patientRepo.GetByClerkUserIdWithDetailsAsync("user_clerk_maria", Arg.Any<CancellationToken>())
            .Returns(existingPatient);

        var clinic = new Clinic { Id = Guid.NewGuid(), Name = "facility-central" };
        _clinicRepo.GetAllAsync(Arg.Any<CancellationToken>()).Returns([clinic]);

        _membershipRepo.GetByPatientAndClinicWithDeletedAsync(existingPatientId, clinic.Id, Arg.Any<CancellationToken>())
            .Returns((ClinicMembership?)null);

        _uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(1);

        var command = new ClaimIntakeCommand(
            ClerkUserId: "user_clerk_maria",
            ClaimToken: "valid.token",
            ConfirmAlternateEmailLink: true);

        var handler = CreateHandler(new PatientClaimConflictResolver());
        var result = await handler.Handle(command, CancellationToken.None);

        result.PatientId.Should().Be(existingPatientId);
        result.ClinicEzId.Should().Be("CE-MARIA-001");
        result.RelationshipType.Should().Be("Self");

        // Crucial assertions:
        // 1. Patient AddAsync is NEVER called (0 times)
        await _patientRepo.DidNotReceive().AddAsync(Arg.Any<Domain.Entities.Patient>(), Arg.Any<CancellationToken>());
        // 2. Personal email on primary profile is NOT overwritten by work email
        existingPatient.Email.Should().Be("maria.personal@gmail.com");
        // 3. Update is called to mark consent
        _patientRepo.Received(1).Update(existingPatient);
    }

    #endregion

    #region Probe 4: PhilHealth Statutory Dependent ("DD") vs Non-Dependent with Same Family Name

    [Fact]
    public async Task PhilHealth_StatutoryDependentDD_CreatesManagedDependentWithSponsorData()
    {
        // Child dependent with same family name "Gonzales", memberType DD
        var ddClaims = CreateClaims(
            firstName: "Chloe",
            lastName: "Gonzales",
            dob: new DateOnly(2020, 1, 1),
            memberType: "DD");

        _claimTokenService.ValidateToken(Arg.Any<string>())
            .Returns(ClaimTokenValidationResult.Success(ddClaims));

        var parentPatientId = Guid.NewGuid();
        var parentPatient = new Domain.Entities.Patient
        {
            Id = parentPatientId,
            ClerkUserId = "user_parent_gonzales",
            FirstName = "Roberto",
            LastName = "Gonzales",
            DateOfBirth = new DateOnly(1985, 3, 10),
            ClinicEzId = "CE-PARENT-GONZALES"
        };

        _patientRepo.GetByClerkUserIdWithDetailsAsync("user_parent_gonzales", Arg.Any<CancellationToken>())
            .Returns(parentPatient);

        var clinic = new Clinic { Id = Guid.NewGuid(), Name = "facility-central" };
        _clinicRepo.GetAllAsync(Arg.Any<CancellationToken>()).Returns([clinic]);
        _membershipRepo.GetByPatientAndClinicWithDeletedAsync(Arg.Any<Guid>(), clinic.Id, Arg.Any<CancellationToken>())
            .Returns((ClinicMembership?)null);

        _uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(1);

        var command = new ClaimIntakeCommand(
            ClerkUserId: "user_parent_gonzales",
            ClaimToken: "valid.token",
            IsDependent: true,
            RelationshipToDependent: "Child",
            PhilHealthPin: "12-444555666-7",
            PhilhealthCategory: "DD",
            PrincipalMemberPin: "12-111222333-4",
            PrincipalFullName: "Roberto Gonzales",
            PrincipalRelationship: "Father",
            PrincipalDateOfBirth: new DateOnly(1985, 3, 10));

        var handler = CreateHandler(new PatientClaimConflictResolver());
        var result = await handler.Handle(command, CancellationToken.None);

        result.RelationshipType.Should().Be("Dependent");
        result.FirstName.Should().Be("Chloe");
        result.LastName.Should().Be("Gonzales");

        // Assert Managed Dependent creation with sponsor linkage
        await _patientRepo.Received(1).AddAsync(
            Arg.Is<Domain.Entities.Patient>(p =>
                p.ClerkUserId == null &&
                p.ManagedByPatientId == parentPatientId &&
                p.FirstName == "Chloe" &&
                p.LastName == "Gonzales" &&
                p.GovernmentIds.Any(g =>
                    g.IdType == GovernmentIdType.PhilHealth &&
                    g.IdNumber == "12-444555666-7" &&
                    g.PhilhealthCategory == "DD" &&
                    g.SponsorPin == "12-111222333-4" &&
                    g.SponsorFirstName == "Roberto" &&
                    g.SponsorLastName == "Gonzales")),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task PhilHealth_NonDependentWithSameFamilyName_AdultMM_IsBlockedByMedicalPrivacyGuardrail()
    {
        // Adult relative with same family name "Gonzales", memberType MM (Principal member, NOT dependent)
        var adultRelativeClaims = CreateClaims(
            firstName: "Marco",
            lastName: "Gonzales",
            dob: new DateOnly(1980, 5, 15), // 46 years old (adult)
            memberType: "MM");

        _claimTokenService.ValidateToken(Arg.Any<string>())
            .Returns(ClaimTokenValidationResult.Success(adultRelativeClaims));

        var claimant = new Domain.Entities.Patient
        {
            Id = Guid.NewGuid(),
            ClerkUserId = "user_roberto_gonzales",
            FirstName = "Roberto",
            LastName = "Gonzales",
            DateOfBirth = new DateOnly(1985, 3, 10),
            ClinicEzId = "CE-ROBERTO"
        };

        _patientRepo.GetByClerkUserIdWithDetailsAsync("user_roberto_gonzales", Arg.Any<CancellationToken>())
            .Returns(claimant);

        var command = new ClaimIntakeCommand(
            ClerkUserId: "user_roberto_gonzales",
            ClaimToken: "valid.token",
            IsDependent: false); // Attempting to merge as self

        var handler = CreateHandler(new PatientClaimConflictResolver());

        // Must be blocked by Medical Privacy Guardrail
        var act = () => handler.Handle(command, CancellationToken.None);
        await act.Should().ThrowAsync<MedicalPrivacyGuardrailException>()
            .WithMessage("*medical privacy*");

        await _uow.DidNotReceive().SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    #endregion
}
