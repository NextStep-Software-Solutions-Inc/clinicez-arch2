using System;
using System.Collections.Generic;
using System.Linq;
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
using ClinicEz.Shared.Security.ClaimTokens;

namespace ClinicEz.Patient.Application.Tests.Features.Patients.Commands;

/// <summary>
/// Adversarial Empirical Challenge Suite for Multi-Identity Conflict Resolution Engine.
/// Authored by o13_challenger_m2_1 to stress-test:
/// 1. Parent / Dependent Proxy (Minors, MemberType == "DD", multiple dependents, filtered unique index, IsOwnedByAsync).
/// 2. Alternate Email Linking (Cross-email matching name/DOB, zero duplicate Patient rows, membership activation).
/// 3. Medical Privacy Guardrail (RA 10173 protections, age >= 18 boundaries, HTTP 422 / MEDICAL_PRIVACY_GUARDRAIL_BLOCKED).
/// </summary>
public sealed class EmpiricalChallengerConflictResolutionTests
{
    private static ApplicationDbContext CreateInMemoryDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new ApplicationDbContext(options);
    }

    private static ClaimTokenClaims BuildClaims(
        string firstName,
        string lastName,
        DateOnly dob,
        string? email = "test@example.ph",
        string memberType = "MM",
        string facilitySlug = "clinic-fac-01",
        string tenantSlug = "tenant-01")
    {
        return new ClaimTokenClaims(
            joinRequestId: Guid.NewGuid(),
            tenantSlug: tenantSlug,
            facilitySlug: facilitySlug,
            email: email,
            firstName: firstName,
            lastName: lastName,
            dateOfBirth: dob,
            memberType: memberType,
            expiresAtUtc: DateTime.UtcNow.AddHours(48));
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // PROBE 1: PARENT / DEPENDENT PROXY
    // ══════════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task Probe1A_MinorIntake_CreatesManagedDependentWithNullClerkUserIdAndParentFk()
    {
        // Arrange
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var minorDob = today.AddYears(-7); // 7-year old child
        var claims = BuildClaims("Maria Clara", "Rizal", minorDob, memberType: "MM");

        var tokenService = Substitute.For<IClaimTokenService>();
        tokenService.ValidateToken(Arg.Any<string>()).Returns(ClaimTokenValidationResult.Success(claims));

        var parentId = Guid.NewGuid();
        var parentPatient = new Domain.Entities.Patient
        {
            Id = parentId,
            ClerkUserId = "user_clerk_parent_001",
            FirstName = "Juan",
            LastName = "Rizal",
            DateOfBirth = today.AddYears(-35),
            Email = "parent.juan@example.ph",
            ClinicEzId = "CE-PARENT-001"
        };

        var patientRepo = Substitute.For<IPatientRepository>();
        patientRepo.GetByClerkUserIdWithDetailsAsync("user_clerk_parent_001", Arg.Any<CancellationToken>())
            .Returns(parentPatient);

        var clinicRepo = Substitute.For<IClinicRepository>();
        var clinic = new Clinic { Id = Guid.NewGuid(), Name = "clinic-fac-01", TenantId = "tenant-01" };
        clinicRepo.GetAllAsync(Arg.Any<CancellationToken>()).Returns([clinic]);

        var membershipRepo = Substitute.For<IClinicMembershipRepository>();
        membershipRepo.GetByPatientAndClinicWithDeletedAsync(Arg.Any<Guid>(), clinic.Id, Arg.Any<CancellationToken>())
            .Returns((ClinicMembership?)null);

        var uow = Substitute.For<IUnitOfWork>();
        uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(1);

        var handler = new ClaimIntakeCommandHandler(
            patientRepo,
            clinicRepo,
            membershipRepo,
            tokenService,
            new PatientClaimConflictResolver(),
            uow,
            NullLogger<ClaimIntakeCommandHandler>.Instance);

        var command = new ClaimIntakeCommand(
            ClerkUserId: "user_clerk_parent_001",
            ClaimToken: "valid.claim.token",
            IsDependent: false, // Even if claimant did not check dependent box, minor status forces proxy
            RelationshipToDependent: "Child");

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.RelationshipType.Should().Be("Dependent");
        result.ClinicMembershipStatus.Should().Be("Active");

        await patientRepo.Received(1).AddAsync(
            Arg.Is<Domain.Entities.Patient>(p =>
                p.ClerkUserId == null &&
                p.ManagedByPatientId == parentId &&
                p.FirstName == "Maria Clara" &&
                p.LastName == "Rizal" &&
                p.DateOfBirth == minorDob &&
                p.RelationshipToManager == "Child"),
            Arg.Any<CancellationToken>());

        await uow.Received(1).SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Probe1B_PhilHealthStatutoryDependentDD_Adult_CreatesManagedDependentProxy()
    {
        // Arrange: Adult child with statutory dependent PhilHealth card (MemberType == "DD")
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var adultDependentDob = today.AddYears(-22); // 22-year-old statutory dependent
        var claims = BuildClaims("Jose", "Santos", adultDependentDob, memberType: "DD");

        var tokenService = Substitute.For<IClaimTokenService>();
        tokenService.ValidateToken(Arg.Any<string>()).Returns(ClaimTokenValidationResult.Success(claims));

        var sponsorId = Guid.NewGuid();
        var sponsor = new Domain.Entities.Patient
        {
            Id = sponsorId,
            ClerkUserId = "user_clerk_sponsor_002",
            FirstName = "Roberto",
            LastName = "Santos",
            DateOfBirth = today.AddYears(-55),
            Email = "roberto.santos@example.ph",
            ClinicEzId = "CE-SPONSOR-002"
        };

        var patientRepo = Substitute.For<IPatientRepository>();
        patientRepo.GetByClerkUserIdWithDetailsAsync("user_clerk_sponsor_002", Arg.Any<CancellationToken>())
            .Returns(sponsor);

        var clinicRepo = Substitute.For<IClinicRepository>();
        var clinic = new Clinic { Id = Guid.NewGuid(), Name = "clinic-fac-01", TenantId = "tenant-01" };
        clinicRepo.GetAllAsync(Arg.Any<CancellationToken>()).Returns([clinic]);

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
            ClerkUserId: "user_clerk_sponsor_002",
            ClaimToken: "valid.claim.token",
            IsDependent: false,
            RelationshipToDependent: "Dependent",
            PhilHealthPin: "12-888777666-5",
            PrincipalMemberPin: "12-111222333-4",
            PrincipalFullName: "Roberto Santos",
            PrincipalRelationship: "P");

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.RelationshipType.Should().Be("Dependent");
        await patientRepo.Received(1).AddAsync(
            Arg.Is<Domain.Entities.Patient>(p =>
                p.ClerkUserId == null &&
                p.ManagedByPatientId == sponsorId &&
                p.FirstName == "Jose" &&
                p.GovernmentIds.Any(g =>
                    g.IdNumber == "12-888777666-5" &&
                    g.PhilhealthCategory == "DD" &&
                    g.SponsorPin == "12-111222333-4")),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Probe1C_MultipleDependentsUnderSameParent_PersistWithNullClerkUserIdWithoutCollision()
    {
        // Arrange: Direct EF Core database stress test with 5 siblings under 1 parent
        await using var db = CreateInMemoryDbContext();
        var repo = new PatientRepository(db);

        var parent = new Domain.Entities.Patient
        {
            Id = Guid.NewGuid(),
            ClerkUserId = "user_clerk_big_family",
            FirstName = "Nanay",
            LastName = "Batumbakal",
            ClinicEzId = "CE-PARENT-999",
            CreatedBy = "user_clerk_big_family"
        };
        await db.Patients.AddAsync(parent);
        await db.SaveChangesAsync();

        var dependents = new List<Domain.Entities.Patient>();
        for (var i = 1; i <= 5; i++)
        {
            var dep = new Domain.Entities.Patient
            {
                Id = Guid.NewGuid(),
                ClerkUserId = null, // Must remain null for all dependents
                ManagedByPatientId = parent.Id,
                RelationshipToManager = "Child",
                FirstName = $"Anak_{i}",
                LastName = "Batumbakal",
                ClinicEzId = $"CE-DEP-00{i}",
                CreatedBy = "user_clerk_big_family"
            };
            dependents.Add(dep);
            await db.Patients.AddAsync(dep);
        }

        // Act: Commit multiple dependents with ClerkUserId = null to database
        Func<Task> saveAction = async () => await db.SaveChangesAsync();

        // Assert: EF Core handles multiple null ClerkUserIds smoothly
        await saveAction.Should().NotThrowAsync();

        var loadedParent = await repo.GetByClerkUserIdWithDetailsAsync("user_clerk_big_family");
        loadedParent.Should().NotBeNull();
        loadedParent!.ManagedDependents.Should().HaveCount(5);
        loadedParent.ManagedDependents.All(d => d.ClerkUserId == null).Should().BeTrue();
        loadedParent.ManagedDependents.All(d => d.ManagedByPatientId == parent.Id).Should().BeTrue();
    }

    [Fact]
    public async Task Probe1D_ProxyChartAccess_ParentAuthorized_IntrudersAndOrphansBlocked()
    {
        // Arrange
        await using var db = CreateInMemoryDbContext();
        var repo = new PatientRepository(db);

        var parentA = new Domain.Entities.Patient
        {
            Id = Guid.NewGuid(),
            ClerkUserId = "user_parent_A",
            FirstName = "ParentA",
            LastName = "Cruz",
            ClinicEzId = "CE-PA"
        };
        var parentB = new Domain.Entities.Patient
        {
            Id = Guid.NewGuid(),
            ClerkUserId = "user_parent_B",
            FirstName = "ParentB",
            LastName = "Santos",
            ClinicEzId = "CE-PB"
        };

        var childA1 = new Domain.Entities.Patient
        {
            Id = Guid.NewGuid(),
            ClerkUserId = null,
            ManagedByPatientId = parentA.Id,
            FirstName = "ChildA1",
            LastName = "Cruz",
            ClinicEzId = "CE-CA1"
        };
        var childA2 = new Domain.Entities.Patient
        {
            Id = Guid.NewGuid(),
            ClerkUserId = null,
            ManagedByPatientId = parentA.Id,
            FirstName = "ChildA2",
            LastName = "Cruz",
            ClinicEzId = "CE-CA2"
        };
        var orphan = new Domain.Entities.Patient
        {
            Id = Guid.NewGuid(),
            ClerkUserId = null,
            ManagedByPatientId = null,
            FirstName = "Orphan",
            LastName = "Unknown",
            ClinicEzId = "CE-ORPHAN"
        };

        await db.Patients.AddRangeAsync(parentA, parentB, childA1, childA2, orphan);
        await db.SaveChangesAsync();

        // Act & Assert
        // 1. Parent A has full authorized access over Child A1 and Child A2
        (await repo.IsOwnedByAsync(childA1.Id, "user_parent_A")).Should().BeTrue("Parent A manages Child A1");
        (await repo.IsOwnedByAsync(childA2.Id, "user_parent_A")).Should().BeTrue("Parent A manages Child A2");
        (await repo.IsOwnedByAsync(parentA.Id, "user_parent_A")).Should().BeTrue("Parent A owns own chart");

        // 2. Parent B CANNOT access Parent A's children
        (await repo.IsOwnedByAsync(childA1.Id, "user_parent_B")).Should().BeFalse("Parent B cannot access Child A1");
        (await repo.IsOwnedByAsync(childA2.Id, "user_parent_B")).Should().BeFalse("Parent B cannot access Child A2");

        // 3. Random stranger CANNOT access any child
        (await repo.IsOwnedByAsync(childA1.Id, "user_stranger_XYZ")).Should().BeFalse("Stranger rejected");

        // 4. Orphan with no manager and no ClerkUserId is inaccessible to any user
        (await repo.IsOwnedByAsync(orphan.Id, "user_parent_A")).Should().BeFalse("Orphan record inaccessible");
        (await repo.IsOwnedByAsync(orphan.Id, "user_parent_B")).Should().BeFalse("Orphan record inaccessible");
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // PROBE 2: ALTERNATE EMAIL LINKING
    // ══════════════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task Probe2A_AlternateEmailLinking_ReusesExistingPatientWithoutCreatingDuplicate()
    {
        // Arrange: Existing patient registered personal email, intake used corporate email
        var dob = new DateOnly(1992, 8, 25);
        var claims = BuildClaims(
            firstName: "Gabriela",
            lastName: "Silang",
            dob: dob,
            email: "gabriela.silang@enterprise.corp.ph");

        var tokenService = Substitute.For<IClaimTokenService>();
        tokenService.ValidateToken(Arg.Any<string>()).Returns(ClaimTokenValidationResult.Success(claims));

        var existingPatientId = Guid.NewGuid();
        var existingPatient = new Domain.Entities.Patient
        {
            Id = existingPatientId,
            ClerkUserId = "user_clerk_gabriela",
            FirstName = "Gabriela",
            LastName = "Silang",
            DateOfBirth = dob,
            Email = "gabriela.silang@personal-gmail.com",
            Mobile = "09181112222",
            ClinicEzId = "CE-EXISTING-GAB"
        };

        var patientRepo = Substitute.For<IPatientRepository>();
        patientRepo.GetByClerkUserIdWithDetailsAsync("user_clerk_gabriela", Arg.Any<CancellationToken>())
            .Returns(existingPatient);

        var clinicRepo = Substitute.For<IClinicRepository>();
        var clinic = new Clinic { Id = Guid.NewGuid(), Name = "clinic-fac-01", TenantId = "tenant-01" };
        clinicRepo.GetAllAsync(Arg.Any<CancellationToken>()).Returns([clinic]);

        var membershipRepo = Substitute.For<IClinicMembershipRepository>();
        membershipRepo.GetByPatientAndClinicWithDeletedAsync(existingPatientId, clinic.Id, Arg.Any<CancellationToken>())
            .Returns((ClinicMembership?)null);

        var uow = Substitute.For<IUnitOfWork>();
        uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(1);

        var handler = new ClaimIntakeCommandHandler(
            patientRepo,
            clinicRepo,
            membershipRepo,
            tokenService,
            new PatientClaimConflictResolver(),
            uow,
            NullLogger<ClaimIntakeCommandHandler>.Instance);

        var command = new ClaimIntakeCommand(
            ClerkUserId: "user_clerk_gabriela",
            ClaimToken: "valid.claim.token",
            ConfirmAlternateEmailLink: true,
            CivilStatus: "Married");

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.PatientId.Should().Be(existingPatientId, "Must link to the existing patient entity ID");
        result.ClinicEzId.Should().Be("CE-EXISTING-GAB");
        result.RelationshipType.Should().Be("Self");
        result.ClinicMembershipStatus.Should().Be("Active");

        // Strictly verify that NO new patient row was created
        await patientRepo.DidNotReceive().AddAsync(Arg.Any<Domain.Entities.Patient>(), Arg.Any<CancellationToken>());

        // Verify that existing patient was updated and membership was created
        patientRepo.Received(1).Update(Arg.Is<Domain.Entities.Patient>(p =>
            p.Id == existingPatientId &&
            p.ConsentToShareInfo == true &&
            p.CivilStatus == CivilStatus.Married));

        await membershipRepo.Received(1).AddAsync(
            Arg.Is<ClinicMembership>(m =>
                m.PatientId == existingPatientId &&
                m.ClinicId == clinic.Id &&
                m.Status == ClinicMembershipStatus.Active),
            Arg.Any<CancellationToken>());

        await uow.Received(1).SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public void Probe2B_AlternateEmail_WhitespaceAndCaseTolerantMatching()
    {
        // Arrange
        var resolver = new PatientClaimConflictResolver();
        var dob = new DateOnly(1989, 12, 10);
        var claims = BuildClaims("  Antonio  ", "  Luna  ", dob, email: "general.luna@army.mil.ph");

        var existingPatient = new Domain.Entities.Patient
        {
            Id = Guid.NewGuid(),
            ClerkUserId = "user_luna",
            FirstName = "antonio",
            LastName = "luna",
            DateOfBirth = dob,
            Email = "antonio.luna@gmail.com"
        };

        // Act
        var result = resolver.Resolve(existingPatient, claims, isDependentClaim: false);

        // Assert
        result.Outcome.Should().Be(ClaimConflictOutcome.ExistingSelf);
        result.RelationshipType.Should().Be("Self");
        result.Reason.Should().Contain("Alternate email linking");
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // PROBE 3: MEDICAL PRIVACY GUARDRAIL (RA 10173)
    // ══════════════════════════════════════════════════════════════════════════════

    [Theory]
    [InlineData("DifferentFirstName", "Aguinaldo", 1985, 3, 22, "First name differs")]
    [InlineData("Emilio", "DifferentLastName", 1985, 3, 22, "Last name differs")]
    [InlineData("Emilio", "Aguinaldo", 1985, 3, 23, "Birthdate differs by 1 day")]
    [InlineData("Emilio", "Aguinaldo", 1980, 3, 22, "Birthdate differs by 5 years")]
    [InlineData("Stranger", "Mendoza", 1990, 1, 1, "Completely different identity")]
    public async Task Probe3A_UnrelatedAdultClaim_StrictlyThrowsMedicalPrivacyGuardrailException(
        string intakeFirst, string intakeLast, int intakeYear, int intakeMonth, int intakeDay, string testScenario)
    {
        // Arrange
        var intakeDob = new DateOnly(intakeYear, intakeMonth, intakeDay);
        var claims = BuildClaims(intakeFirst, intakeLast, intakeDob, memberType: "MM");

        var tokenService = Substitute.For<IClaimTokenService>();
        tokenService.ValidateToken(Arg.Any<string>()).Returns(ClaimTokenValidationResult.Success(claims));

        var authenticatedUserPatient = new Domain.Entities.Patient
        {
            Id = Guid.NewGuid(),
            ClerkUserId = "user_clerk_emilio",
            FirstName = "Emilio",
            LastName = "Aguinaldo",
            DateOfBirth = new DateOnly(1985, 3, 22),
            Email = "emilio.aguinaldo@gov.ph"
        };

        var patientRepo = Substitute.For<IPatientRepository>();
        patientRepo.GetByClerkUserIdWithDetailsAsync("user_clerk_emilio", Arg.Any<CancellationToken>())
            .Returns(authenticatedUserPatient);

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
            ClerkUserId: "user_clerk_emilio",
            ClaimToken: "valid.claim.token",
            IsDependent: false);

        // Act & Assert
        var act = () => handler.Handle(command, CancellationToken.None);

        var ex = await act.Should().ThrowAsync<MedicalPrivacyGuardrailException>(
            because: $"RA 10173 blocks merging when {testScenario}");

        ex.Which.ErrorCode.Should().Be("MEDICAL_PRIVACY_GUARDRAIL_BLOCKED");
        ex.Which.Message.Should().Contain("medical privacy");

        // Zero mutations to database
        await patientRepo.DidNotReceive().AddAsync(Arg.Any<Domain.Entities.Patient>(), Arg.Any<CancellationToken>());
        patientRepo.DidNotReceive().Update(Arg.Any<Domain.Entities.Patient>());
        await membershipRepo.DidNotReceive().AddAsync(Arg.Any<ClinicMembership>(), Arg.Any<CancellationToken>());
        await uow.DidNotReceive().SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public void Probe3B_Exact18thBirthdayBoundary_TreatedAsAdultAndBlockedWhenMismatch()
    {
        // Arrange: Today minus 18 years exactly
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var exact18thDob = today.AddYears(-18);

        var resolver = new PatientClaimConflictResolver();
        var claims = BuildClaims("Adult", "Stranger", exact18thDob, memberType: "MM");

        var authenticatedUser = new Domain.Entities.Patient
        {
            Id = Guid.NewGuid(),
            ClerkUserId = "user_auth_18",
            FirstName = "Juan",
            LastName = "DelaCruz",
            DateOfBirth = today.AddYears(-30)
        };

        // Act
        var result = resolver.Resolve(authenticatedUser, claims, isDependentClaim: false);

        // Assert: Exactly 18 is an adult, so attempting to claim an unrelated adult must be BLOCKED
        result.Outcome.Should().Be(ClaimConflictOutcome.MedicalPrivacyBlocked);
        result.RelationshipType.Should().Be("Blocked");
    }

    [Fact]
    public void Probe3C_MinorBoundary_OneDayBefore18thBirthday_TreatedAsMinorProxy()
    {
        // Arrange: Born 18 years minus 1 day ago (17 years and 364 days old)
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var minorDob = today.AddYears(-18).AddDays(1);

        var resolver = new PatientClaimConflictResolver();
        var claims = BuildClaims("Teen", "DelaCruz", minorDob, memberType: "MM");

        var authenticatedUser = new Domain.Entities.Patient
        {
            Id = Guid.NewGuid(),
            ClerkUserId = "user_auth_parent",
            FirstName = "Juan",
            LastName = "DelaCruz",
            DateOfBirth = today.AddYears(-40)
        };

        // Act
        var result = resolver.Resolve(authenticatedUser, claims, isDependentClaim: false);

        // Assert: Under 18 is minor, resolved as ManagedDependentProxy
        result.Outcome.Should().Be(ClaimConflictOutcome.ManagedDependentProxy);
        result.RelationshipType.Should().Be("Dependent");
    }
}
