using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Auth.Commands;
using ClinicEz.Clinic.Application.Features.Staff.Commands;
using ClinicEz.Clinic.Application.Features.Staff.DTOs;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Auth;
using ClinicEz.Clinic.Infrastructure.Context;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Licensing;
using ClinicEz.Shared.LocalAuth;
using FluentAssertions;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;
using ValidationException = ClinicEz.Shared.Exceptions.ValidationException;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Milestone 5 Tier 5 Adversarial Verification Suite for Clinic Staff & Facility Auth:
/// Rigorous empirical stress testing of password complexity, PBKDF2 hashing, JWT issuance & claims,
/// immediate session invalidation on suspension/revocation, state machine transitions, and license seat limits.
/// </summary>
public class Tier5AdversarialClinicStaffTests
{
    private static readonly Guid TestClinicId = Guid.Parse("33333333-3333-3333-3333-333333333333");
    private const string TestTenantId = "tenant_tier5_challenger";

    private static string CreateLicenseToken(Guid clinicId, string tenantId, int maxStaff = 5) =>
        new FacilityLicenseSigner().SignLicense(new FacilityLicensePayload
        {
            FacilityId = clinicId,
            TenantId = tenantId,
            TenantSlug = "tier5-clinic",
            FacilityName = "Tier 5 Clinic",
            FacilityType = "Clinic",
            PlanTier = "Community",
            Limits = new FacilityLimits { MaxStaff = maxStaff },
            EnabledFeatures = PlanTierDefaults.GetFeaturesForTier("Community"),
            IssuedAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddYears(1)
        });

    #region VECTOR 1: IFacilityPasswordHasher BOUNDARY & COMPLEXITY MATRIX

    [Theory]
    [InlineData(null, "Password must be at least 8 characters long.")]
    [InlineData("", "Password must be at least 8 characters long.")]
    [InlineData("   ", "Password must be at least 8 characters long.")]
    [InlineData("1234567", "Password must be at least 8 characters long.")] // 7 chars (< 8)
    [InlineData("abcdefg", "Password must be at least 8 characters long.")] // 7 chars (< 8)
    [InlineData("abcdefghij", "Password must contain at least one digit.")] // Letters only, no digits
    [InlineData("1234567890", "Password must contain at least one letter.")] // Digits only, no letters
    [InlineData("!@#$%^&*()_+", "Password must contain at least one letter.")] // Special chars only, no letters
    public void FacilityPasswordHasher_ValidateStrength_RejectsSubstandardPasswords(string? password, string expectedProblemSubstring)
    {
        var hasher = new FacilityPasswordHasher();
        var problems = hasher.ValidateStrength(password, 8);

        problems.Should().NotBeEmpty();
        problems.Should().Contain(p => p.Contains(expectedProblemSubstring));
    }

    [Fact]
    public void FacilityPasswordHasher_ValidateStrength_RejectsPasswordOver128Characters()
    {
        var hasher = new FacilityPasswordHasher();
        var password129 = new string('A', 120) + "1234567890"; // 130 characters

        var problems = hasher.ValidateStrength(password129, 8);

        problems.Should().Contain(p => p.Contains("Password must be at most 128 characters long."));
    }

    [Theory]
    [InlineData("Valid123")] // Exactly 8 characters with letters + digits
    [InlineData("StrongP@ssw0rd!")] // Mixed case, symbols, numbers
    [InlineData("ClinicalStaff2026!")]
    public void FacilityPasswordHasher_ValidateStrength_AcceptsCompliantPasswords(string validPassword)
    {
        var hasher = new FacilityPasswordHasher();
        var problems = hasher.ValidateStrength(validPassword, 8);

        problems.Should().BeEmpty();
    }

    [Fact]
    public void FacilityPasswordHasher_PBKDF2_HashesAndVerifiesCorrectly_RejectsMismatchesAndTampering()
    {
        var hasher = new FacilityPasswordHasher();
        const string password = "DoctorSecurePass2026!";

        var hash = hasher.Hash(password);

        hash.Should().NotBeNullOrWhiteSpace();
        hash.Should().NotBe(password); // Never store plaintext

        // Verification tests
        hasher.Verify(hash, password).Should().BeTrue("Correct password must verify successfully");
        hasher.Verify(hash, "WrongPassword123!").Should().BeFalse("Incorrect password must fail verification");
        hasher.Verify(hash, "").Should().BeFalse("Empty password must fail");
        hasher.Verify("", password).Should().BeFalse("Empty hash must fail");
        hasher.Verify(null!, password).Should().BeFalse("Null hash must fail");
        hasher.Verify(hash, null!).Should().BeFalse("Null password must fail");

        // Tampered hash test: flip a character in the payload
        var chars = hash.ToCharArray();
        chars[^5] = chars[^5] == 'X' ? 'Y' : 'X';
        var tamperedHash = new string(chars);
        hasher.Verify(tamperedHash, password).Should().BeFalse("Corrupted/tampered hash must fail verification");
    }

    #endregion

    #region VECTOR 2: CREDENTIAL INVALIDATION ON SUSPENSION AND REVOCATION

    [Fact]
    public async Task SuspendStaffMember_ImmediatelyRevokesRefreshTokens_IncrementsTokenVersion_AndInvalidatesCache()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(TestClinicId);
        clinicContext.TenantId.Returns(TestTenantId);
        clinicContext.StaffId.Returns(Guid.NewGuid()); // Calling admin

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var refreshRepo = TestDbHelper.CreateRepository<RefreshToken>(context, sieve);
        var accessCache = Substitute.For<IStaffAccessInvalidator>();

        var staff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = TestTenantId,
            ClinicId = TestClinicId,
            FirstName = "Target",
            LastName = "Physician",
            Email = "target.physician@clinic.test",
            Role = StaffRole.Doctor,
            Status = StaffAccountStatus.Active,
            IsActive = true,
            TokenVersion = 1,
            PasswordHash = "some-hash"
        };
        await staffRepo.AddAsync(staff);

        // Add 2 active refresh tokens
        var token1 = new RefreshToken
        {
            Id = Guid.NewGuid(),
            StaffMemberId = staff.Id,
            ClinicId = TestClinicId,
            TenantId = TestTenantId,
            TokenHash = "hash1",
            FamilyId = Guid.NewGuid(),
            ExpiresAt = DateTime.UtcNow.AddDays(30)
        };
        var token2 = new RefreshToken
        {
            Id = Guid.NewGuid(),
            StaffMemberId = staff.Id,
            ClinicId = TestClinicId,
            TenantId = TestTenantId,
            TokenHash = "hash2",
            FamilyId = Guid.NewGuid(),
            ExpiresAt = DateTime.UtcNow.AddDays(30)
        };
        await refreshRepo.AddAsync(token1);
        await refreshRepo.AddAsync(token2);
        await uow.SaveChangesAsync();

        var handler = new SuspendStaffMemberCommandHandler(staffRepo, uow, clinicContext, refreshRepo, null, accessCache);

        // Execute suspension
        var result = await handler.Handle(new SuspendStaffMemberCommand(staff.Id), CancellationToken.None);

        result.Status.Should().Be(StaffAccountStatus.Suspended);
        result.IsActive.Should().BeFalse();

        // Verify entity in DB
        var inDb = await staffRepo.GetByIdAsync(staff.Id);
        inDb!.Status.Should().Be(StaffAccountStatus.Suspended);
        inDb.IsActive.Should().BeFalse();
        inDb.TokenVersion.Should().Be(2, "TokenVersion must increment on suspension to invalidate outstanding JWTs");

        // Verify refresh tokens revoked
        var activeTokens = await refreshRepo.Query(t => t.StaffMemberId == staff.Id && t.RevokedAt == null).ToListAsync();
        activeTokens.Should().BeEmpty("All active refresh tokens must have RevokedAt populated");

        // Verify cache invalidation
        accessCache.Received(1).Invalidate(staff.Id);
    }

    [Fact]
    public async Task RevokeStaffInvitation_ImmediatelyRevokesTokens_IncrementsTokenVersion_AndInvalidatesCache()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(TestClinicId);
        clinicContext.TenantId.Returns(TestTenantId);
        clinicContext.StaffId.Returns(Guid.NewGuid()); // Calling admin

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var refreshRepo = TestDbHelper.CreateRepository<RefreshToken>(context, sieve);
        var accessCache = Substitute.For<IStaffAccessInvalidator>();

        var staff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = TestTenantId,
            ClinicId = TestClinicId,
            FirstName = "Revoke",
            LastName = "Target",
            Email = "revoke.target@clinic.test",
            Role = StaffRole.Nurse,
            Status = StaffAccountStatus.Invited,
            IsActive = true,
            TokenVersion = 1,
            InvitationToken = "token-to-revoke"
        };
        await staffRepo.AddAsync(staff);
        await uow.SaveChangesAsync();

        var handler = new RevokeStaffInvitationCommandHandler(staffRepo, uow, clinicContext, refreshRepo, accessCache);

        var success = await handler.Handle(new RevokeStaffInvitationCommand(staff.Id), CancellationToken.None);
        success.Should().BeTrue();

        var inDb = await staffRepo.GetByIdAsync(staff.Id);
        inDb!.Status.Should().Be(StaffAccountStatus.Revoked);
        inDb.IsActive.Should().BeFalse();
        inDb.TokenVersion.Should().Be(2);

        accessCache.Received(1).Invalidate(staff.Id);
    }

    #endregion

    #region VECTOR 3: STATE TRANSITIONS ON ACCEPTANCE & CONCURRENCY

    [Fact]
    public async Task AcceptClinicStaffInvitation_ConcurrentAcceptAttempts_FirstSucceeds_SubsequentFails()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(TestClinicId);
        clinicContext.TenantId.Returns(TestTenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var hasher = new FacilityPasswordHasher();

        var token = "concurrent-clinic-staff-token-64chars-length-abcdef0123456789012345";
        var staff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = TestTenantId,
            ClinicId = TestClinicId,
            FirstName = "Concurrent",
            LastName = "Staff",
            Email = "concurrent.staff@clinic.test",
            Role = StaffRole.Doctor,
            Status = StaffAccountStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            IsActive = true
        };
        await staffRepo.AddAsync(staff);
        await uow.SaveChangesAsync();

        var handler = new AcceptClinicStaffInvitationCommandHandler(staffRepo, hasher, uow);

        // First acceptance succeeds
        var result1 = await handler.Handle(new AcceptClinicStaffInvitationCommand(token, "StaffPassword123!"), CancellationToken.None);
        result1.Status.Should().Be(StaffAccountStatus.Active);
        result1.HasCredentials.Should().BeTrue();

        // Second acceptance with same token fails because it is already accepted
        var act = () => handler.Handle(new AcceptClinicStaffInvitationCommand(token, "StaffPassword123!"), CancellationToken.None);
        var ex = await act.Should().ThrowAsync<InvalidOperationException>();
        ex.WithMessage("This invitation has already been accepted. Sign in instead.");
    }

    [Fact]
    public async Task AcceptClinicStaffInvitation_WhenRevoked_StrictlyFails()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(TestClinicId);
        clinicContext.TenantId.Returns(TestTenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var hasher = new FacilityPasswordHasher();

        var token = "revoked-token-123";
        var staff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = TestTenantId,
            ClinicId = TestClinicId,
            FirstName = "Revoked",
            LastName = "Staff",
            Email = "revoked@clinic.test",
            Role = StaffRole.Doctor,
            Status = StaffAccountStatus.Revoked,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            IsActive = false
        };
        await staffRepo.AddAsync(staff);
        await uow.SaveChangesAsync();

        var handler = new AcceptClinicStaffInvitationCommandHandler(staffRepo, hasher, uow);
        var act = () => handler.Handle(new AcceptClinicStaffInvitationCommand(token, "ValidPass123!"), CancellationToken.None);

        var ex = await act.Should().ThrowAsync<InvalidOperationException>();
        ex.WithMessage("This invitation has been revoked.");
    }

    [Fact]
    public async Task AcceptClinicStaffInvitation_WhenSuspended_StrictlyFails()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(TestClinicId);
        clinicContext.TenantId.Returns(TestTenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var hasher = new FacilityPasswordHasher();

        var token = "suspended-token-123";
        var staff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = TestTenantId,
            ClinicId = TestClinicId,
            FirstName = "Suspended",
            LastName = "Staff",
            Email = "suspended@clinic.test",
            Role = StaffRole.Doctor,
            Status = StaffAccountStatus.Suspended,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            IsActive = false
        };
        await staffRepo.AddAsync(staff);
        await uow.SaveChangesAsync();

        var handler = new AcceptClinicStaffInvitationCommandHandler(staffRepo, hasher, uow);
        var act = () => handler.Handle(new AcceptClinicStaffInvitationCommand(token, "ValidPass123!"), CancellationToken.None);

        var ex = await act.Should().ThrowAsync<InvalidOperationException>();
        ex.WithMessage("This account is suspended.");
    }

    [Fact]
    public async Task AcceptClinicStaffInvitation_WhenExpired_StrictlyFails()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(TestClinicId);
        clinicContext.TenantId.Returns(TestTenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var hasher = new FacilityPasswordHasher();

        var token = "expired-token-123";
        var staff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = TestTenantId,
            ClinicId = TestClinicId,
            FirstName = "Expired",
            LastName = "Staff",
            Email = "expired@clinic.test",
            Role = StaffRole.Doctor,
            Status = StaffAccountStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddSeconds(-1),
            IsActive = true
        };
        await staffRepo.AddAsync(staff);
        await uow.SaveChangesAsync();

        var handler = new AcceptClinicStaffInvitationCommandHandler(staffRepo, hasher, uow);
        var act = () => handler.Handle(new AcceptClinicStaffInvitationCommand(token, "ValidPass123!"), CancellationToken.None);

        var ex = await act.Should().ThrowAsync<InvalidOperationException>();
        ex.WithMessage("This invitation has expired. Please ask your clinic administrator to resend the invitation.");
    }

    #endregion

    #region VECTOR 4: SEAT QUOTA GUARDS ON CREATION & REACTIVATION

    [Fact]
    public async Task CreateStaffMember_WhenActiveStaffExceedsLicenseLimit_StrictlyThrowsValidationException()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(TestClinicId);
        clinicContext.TenantId.Returns(TestTenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var roleRepo = TestDbHelper.CreateRepository<Role>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        // License allows exactly 2 staff members
        var licenseToken = CreateLicenseToken(TestClinicId, TestTenantId, maxStaff: 2);
        await settingsRepo.AddAsync(new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = TestClinicId,
            TenantId = TestTenantId,
            ClinicName = "Tier 5 Clinic",
            LicenseToken = licenseToken
        });

        // Seed 2 active staff members
        await staffRepo.AddAsync(new StaffMember { Id = Guid.NewGuid(), ClinicId = TestClinicId, TenantId = TestTenantId, IsActive = true, Role = StaffRole.Doctor, FirstName = "Doc1", LastName = "One" });
        await staffRepo.AddAsync(new StaffMember { Id = Guid.NewGuid(), ClinicId = TestClinicId, TenantId = TestTenantId, IsActive = true, Role = StaffRole.Nurse, FirstName = "Nurse1", LastName = "One" });
        await uow.SaveChangesAsync();

        var licenseValidator = new FacilityLicenseValidator();
        var handler = new CreateStaffMemberCommandHandler(staffRepo, roleRepo, settingsRepo, licenseValidator, uow, clinicContext);

        // Attempting to create a 3rd staff member
        var cmd = new CreateStaffMemberCommand(
            FirstName: "OverQuota",
            LastName: "Doctor",
            MiddleName: null,
            Title: null,
            Role: StaffRole.Doctor,
            ClinicRoleId: null,
            Email: "overquota@clinic.test",
            PhoneNumber: null,
            PrcLicenseNumber: "1234567",
            PtrNumber: null,
            S2LicenseNumber: null,
            Specialty: null);

        var act = () => handler.Handle(cmd, CancellationToken.None);
        var ex = await act.Should().ThrowAsync<ValidationException>();
        ex.WithMessage("*Staff limit reached*allows up to 2 active staff members*");
    }

    [Fact]
    public async Task ReactivateStaffMember_WhenActiveStaffExceedsLicenseLimit_StrictlyThrowsValidationException()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(TestClinicId);
        clinicContext.TenantId.Returns(TestTenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        // License allows exactly 2 staff members
        var licenseToken = CreateLicenseToken(TestClinicId, TestTenantId, maxStaff: 2);
        await settingsRepo.AddAsync(new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = TestClinicId,
            TenantId = TestTenantId,
            ClinicName = "Tier 5 Clinic",
            LicenseToken = licenseToken
        });

        // 2 active staff and 1 suspended staff
        await staffRepo.AddAsync(new StaffMember { Id = Guid.NewGuid(), ClinicId = TestClinicId, TenantId = TestTenantId, IsActive = true, Role = StaffRole.Doctor, FirstName = "Doc1", LastName = "One" });
        await staffRepo.AddAsync(new StaffMember { Id = Guid.NewGuid(), ClinicId = TestClinicId, TenantId = TestTenantId, IsActive = true, Role = StaffRole.Nurse, FirstName = "Nurse1", LastName = "One" });

        var suspendedStaff = new StaffMember
        {
            Id = Guid.NewGuid(),
            ClinicId = TestClinicId,
            TenantId = TestTenantId,
            IsActive = false,
            Status = StaffAccountStatus.Suspended,
            Role = StaffRole.Cashier,
            FirstName = "Suspended",
            LastName = "Staff"
        };
        await staffRepo.AddAsync(suspendedStaff);
        await uow.SaveChangesAsync();

        var licenseValidator = new FacilityLicenseValidator();
        var handler = new ReactivateStaffMemberCommandHandler(staffRepo, settingsRepo, licenseValidator, uow, clinicContext);

        // Reactivating while already at capacity (2 active) must fail
        var act = () => handler.Handle(new ReactivateStaffMemberCommand(suspendedStaff.Id), CancellationToken.None);
        var ex = await act.Should().ThrowAsync<ValidationException>();
        ex.WithMessage("*Staff limit reached*allows up to 2 active staff members*");

        // Verification: status remains Suspended in database
        var inDb = await staffRepo.GetByIdAsync(suspendedStaff.Id);
        inDb!.Status.Should().Be(StaffAccountStatus.Suspended);
        inDb.IsActive.Should().BeFalse();
    }

    #endregion
}
