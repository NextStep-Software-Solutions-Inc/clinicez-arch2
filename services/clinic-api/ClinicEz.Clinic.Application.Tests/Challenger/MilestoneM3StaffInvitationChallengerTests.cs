using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Auth.Commands;
using ClinicEz.Clinic.Application.Features.Auth.Queries;
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
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using NSubstitute;
using Xunit;
using ValidationException = ClinicEz.Shared.Exceptions.ValidationException;

namespace ClinicEz.Clinic.Application.Tests.Challenger;

/// <summary>
/// Milestone 3 Adversarial Challenger Verification Suite:
/// Empirical stress-testing of Clinic Staff Invites & Facility Local Auth.
/// 
/// Core Challenge Vectors:
/// 1. State Machine Strictness on ResendStaffInvitationCommand (Active, Suspended, Revoked rejection).
/// 2. State Machine Strictness on AcceptClinicStaffInvitationCommand (Revoked, Suspended, Expired rejection).
/// 3. Password Complexity Enforcement & Cryptographic Hashing via IFacilityPasswordHasher.
/// 4. State Transitions on Acceptance & Facility JWT Token Issuance (IssueTokensAsync).
/// 5. Cryptographic Entropy & Expiration Oracle (256-bit CSPRNG hex string, 7-day expiration).
/// 6. Cross-Tenant Isolation & Double-Acceptance Prevention.
/// 7. ClinicAuthService End-to-End Acceptance & License Gating.
/// </summary>
public class MilestoneM3StaffInvitationChallengerTests
{
    private static readonly Guid TenantAClinicId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantBClinicId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private const string TenantAId = "tenant_alpha_challenger";
    private const string TenantBId = "tenant_beta_challenger";

    private static string CreateLicenseToken(Guid clinicId, string tenantId) =>
        new FacilityLicenseSigner().SignLicense(new FacilityLicensePayload
        {
            FacilityId = clinicId,
            TenantId = tenantId,
            TenantSlug = "challenger-clinic",
            FacilityName = "Challenger Medical Clinic",
            FacilityType = "Clinic",
            PlanTier = "Community",
            Limits = PlanTierDefaults.GetLimitsForTier("Community"),
            EnabledFeatures = PlanTierDefaults.GetFeaturesForTier("Community"),
            IssuedAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddYears(1)
        });

    // =========================================================================
    // VECTOR 1: RESEND INVITATION STATE MACHINE CHALLENGES
    // =========================================================================

    [Theory]
    [InlineData(StaffAccountStatus.Active, "already an active member")]
    [InlineData(StaffAccountStatus.Suspended, "Suspended accounts cannot be resent")]
    [InlineData(StaffAccountStatus.Revoked, "Revoked invitations cannot be resent")]
    public async Task ResendStaffInvitation_WhenStatusIsNotInvited_StrictlyThrowsInvalidOperationException(
        StaffAccountStatus nonInvitedStatus, string expectedErrorMessageSubstring)
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(TenantAClinicId);
        clinicContext.TenantId.Returns(TenantAId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        var staff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAId,
            ClinicId = TenantAClinicId,
            FirstName = "Marcus",
            LastName = "Aurelius",
            Email = "marcus@rome.test",
            Role = StaffRole.Doctor,
            Status = nonInvitedStatus,
            IsActive = nonInvitedStatus == StaffAccountStatus.Active,
            InvitationToken = "old-token-xyz"
        };
        await staffRepo.AddAsync(staff);
        await uow.SaveChangesAsync();

        var handler = new ResendStaffInvitationCommandHandler(staffRepo, settingsRepo, uow, clinicContext);

        // Act & Assert
        var act = () => handler.Handle(new ResendStaffInvitationCommand(staff.Id), CancellationToken.None);
        var ex = await act.Should().ThrowAsync<InvalidOperationException>();
        ex.WithMessage($"*{expectedErrorMessageSubstring}*");
    }

    [Fact]
    public async Task ResendStaffInvitation_WhenCrossTenantAccessAttempted_StrictlyThrowsNotFoundException()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(TenantAClinicId); // Context is Clinic A
        clinicContext.TenantId.Returns(TenantAId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        // Staff member belongs to Clinic B
        var staffInClinicB = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = TenantBId,
            ClinicId = TenantBClinicId,
            FirstName = "Infiltrator",
            LastName = "Target",
            Email = "target@clinicb.test",
            Role = StaffRole.Nurse,
            Status = StaffAccountStatus.Invited,
            IsActive = true,
            InvitationToken = "clinic-b-secret-token"
        };
        await staffRepo.AddAsync(staffInClinicB);
        await uow.SaveChangesAsync();

        var handler = new ResendStaffInvitationCommandHandler(staffRepo, settingsRepo, uow, clinicContext);

        // Act & Assert: Cross-tenant invocation must fail with NotFoundException
        var act = () => handler.Handle(new ResendStaffInvitationCommand(staffInClinicB.Id), CancellationToken.None);
        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task ResendStaffInvitation_WhenExpired_RegeneratesNewTokenAndResetsExpiryTo7Days()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(TenantAClinicId);
        clinicContext.TenantId.Returns(TenantAId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        var expiredToken = "expired-token-11111111111111111111111111111111";
        var staff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAId,
            ClinicId = TenantAClinicId,
            FirstName = "Expired",
            LastName = "Invitee",
            Email = "expired@clinic.test",
            Role = StaffRole.Doctor,
            Status = StaffAccountStatus.Invited,
            InvitationToken = expiredToken,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(-10), // 10 days expired
            IsActive = true
        };
        await staffRepo.AddAsync(staff);
        await settingsRepo.AddAsync(new ClinicSettings
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAId,
            ClinicId = TenantAClinicId,
            ClinicName = "Care Clinic",
            TenantSlug = "care-tenant",
            FacilitySlug = "care-fac"
        });
        await uow.SaveChangesAsync();

        var notifier = Substitute.For<IClinicStaffInvitationNotifier>();
        var handler = new ResendStaffInvitationCommandHandler(staffRepo, settingsRepo, uow, clinicContext, notifier);

        var beforeCall = DateTime.UtcNow;
        var result = await handler.Handle(new ResendStaffInvitationCommand(staff.Id, SendInviteEmail: true), CancellationToken.None);
        var afterCall = DateTime.UtcNow;

        result.Status.Should().Be(StaffAccountStatus.Invited);
        result.InvitationToken.Should().NotBeNullOrWhiteSpace();
        result.InvitationToken.Should().NotBe(expiredToken);
        result.InvitationToken!.Length.Should().Be(64);
        result.InvitationExpiresAt.Should().BeOnOrAfter(beforeCall.AddDays(7).AddSeconds(-2));
        result.InvitationExpiresAt.Should().BeOnOrBefore(afterCall.AddDays(7).AddSeconds(2));
        result.IsExpired.Should().BeFalse();

        notifier.Received(1).EnqueueInvitationEmail(
            TenantAId,
            TenantAClinicId,
            "Care Clinic",
            "care-tenant",
            "care-fac",
            Arg.Is<StaffMember>(s => s.Id == staff.Id),
            result.InvitationToken!);
    }

    [Fact]
    public async Task ResendStaffInvitation_WithSendInviteEmailFalse_DoesNotEnqueueEmail()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(TenantAClinicId);
        clinicContext.TenantId.Returns(TenantAId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        var staff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAId,
            ClinicId = TenantAClinicId,
            FirstName = "CopyLink",
            LastName = "Only",
            Email = "copylink@clinic.test",
            Role = StaffRole.Cashier,
            Status = StaffAccountStatus.Invited,
            InvitationToken = "old-token-222",
            InvitationExpiresAt = DateTime.UtcNow.AddDays(2),
            IsActive = true
        };
        await staffRepo.AddAsync(staff);
        await uow.SaveChangesAsync();

        var notifier = Substitute.For<IClinicStaffInvitationNotifier>();
        var handler = new ResendStaffInvitationCommandHandler(staffRepo, settingsRepo, uow, clinicContext, notifier);

        var result = await handler.Handle(new ResendStaffInvitationCommand(staff.Id, SendInviteEmail: false), CancellationToken.None);

        result.Status.Should().Be(StaffAccountStatus.Invited);
        result.InvitationToken.Should().NotBe("old-token-222");
        notifier.DidNotReceive().EnqueueInvitationEmail(
            Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<StaffMember>(), Arg.Any<string>());
    }

    // =========================================================================
    // VECTOR 2: ACCEPT INVITATION STATE MACHINE CHALLENGES
    // =========================================================================

    [Fact]
    public async Task AcceptInvitation_WhenRevoked_StrictlyThrowsInvalidOperationException()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(TenantAClinicId);
        clinicContext.TenantId.Returns(TenantAId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        var token = "revoked-invitation-token-123";
        var staff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAId,
            ClinicId = TenantAClinicId,
            FirstName = "Revoked",
            LastName = "Staff",
            Email = "revoked@clinic.test",
            Role = StaffRole.Doctor,
            Status = StaffAccountStatus.Revoked,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(3),
            IsActive = false
        };
        await staffRepo.AddAsync(staff);
        await uow.SaveChangesAsync();

        var handler = new AcceptClinicStaffInvitationCommandHandler(staffRepo, new FacilityPasswordHasher(), uow);

        var act = () => handler.Handle(new AcceptClinicStaffInvitationCommand(token, "ValidPass123!"), CancellationToken.None);
        var ex = await act.Should().ThrowAsync<InvalidOperationException>();
        ex.WithMessage("*revoked*");
    }

    [Fact]
    public async Task AcceptInvitation_WhenSuspended_StrictlyThrowsInvalidOperationException()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(TenantAClinicId);
        clinicContext.TenantId.Returns(TenantAId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        var token = "suspended-invitation-token-123";
        var staff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAId,
            ClinicId = TenantAClinicId,
            FirstName = "Suspended",
            LastName = "Staff",
            Email = "suspended@clinic.test",
            Role = StaffRole.Nurse,
            Status = StaffAccountStatus.Suspended,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(3),
            IsActive = false
        };
        await staffRepo.AddAsync(staff);
        await uow.SaveChangesAsync();

        var handler = new AcceptClinicStaffInvitationCommandHandler(staffRepo, new FacilityPasswordHasher(), uow);

        var act = () => handler.Handle(new AcceptClinicStaffInvitationCommand(token, "ValidPass123!"), CancellationToken.None);
        var ex = await act.Should().ThrowAsync<InvalidOperationException>();
        ex.WithMessage("*suspended*");
    }

    [Fact]
    public async Task AcceptInvitation_WhenExpiredByJustOneSecond_StrictlyThrowsInvalidOperationException()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(TenantAClinicId);
        clinicContext.TenantId.Returns(TenantAId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        var token = "expired-by-seconds-token-123";
        var staff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAId,
            ClinicId = TenantAClinicId,
            FirstName = "Late",
            LastName = "Comer",
            Email = "late@clinic.test",
            Role = StaffRole.Doctor,
            Status = StaffAccountStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddSeconds(-2), // 2 seconds in the past
            IsActive = true
        };
        await staffRepo.AddAsync(staff);
        await uow.SaveChangesAsync();

        var handler = new AcceptClinicStaffInvitationCommandHandler(staffRepo, new FacilityPasswordHasher(), uow);

        var act = () => handler.Handle(new AcceptClinicStaffInvitationCommand(token, "ValidPass123!"), CancellationToken.None);
        var ex = await act.Should().ThrowAsync<InvalidOperationException>();
        ex.WithMessage("*expired*");
    }

    [Fact]
    public async Task AcceptInvitation_WhenAlreadyAccepted_StrictlyThrowsInvalidOperationException()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(TenantAClinicId);
        clinicContext.TenantId.Returns(TenantAId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        var token = "already-accepted-token-123";
        var staff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAId,
            ClinicId = TenantAClinicId,
            FirstName = "Already",
            LastName = "Active",
            Email = "already@clinic.test",
            Role = StaffRole.Doctor,
            Status = StaffAccountStatus.Active,
            PasswordHash = "existing-hash",
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(4),
            IsActive = true
        };
        await staffRepo.AddAsync(staff);
        await uow.SaveChangesAsync();

        var handler = new AcceptClinicStaffInvitationCommandHandler(staffRepo, new FacilityPasswordHasher(), uow);

        var act = () => handler.Handle(new AcceptClinicStaffInvitationCommand(token, "ValidPass123!"), CancellationToken.None);
        var ex = await act.Should().ThrowAsync<InvalidOperationException>();
        ex.WithMessage("*already been accepted*");
    }

    [Fact]
    public async Task AcceptInvitation_WhenTokenDoesNotExist_ThrowsNotFoundException()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(TenantAClinicId);
        clinicContext.TenantId.Returns(TenantAId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        var handler = new AcceptClinicStaffInvitationCommandHandler(staffRepo, new FacilityPasswordHasher(), uow);

        var act = () => handler.Handle(new AcceptClinicStaffInvitationCommand("non-existent-token", "ValidPass123!"), CancellationToken.None);
        await act.Should().ThrowAsync<NotFoundException>();
    }

    // =========================================================================
    // VECTOR 3: PASSWORD COMPLEXITY ENFORCEMENT & HASHING
    // =========================================================================

    [Theory]
    [InlineData("short1", "at least 8 characters")]                          // Too short (< 8 chars)
    [InlineData("123456789", "at least one letter")]                        // No letters
    [InlineData("abcdefghijk", "at least one digit")]                       // No digits
    public async Task AcceptInvitation_WhenPasswordIsWeak_RejectsWithValidationException(string weakPassword, string expectedReasonSubstring)
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(TenantAClinicId);
        clinicContext.TenantId.Returns(TenantAId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        var token = "weak-pwd-token-123";
        var staff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAId,
            ClinicId = TenantAClinicId,
            FirstName = "Weak",
            LastName = "PasswordTest",
            Email = "weakpwd@clinic.test",
            Role = StaffRole.Doctor,
            Status = StaffAccountStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(3),
            IsActive = true
        };
        await staffRepo.AddAsync(staff);
        await uow.SaveChangesAsync();

        var handler = new AcceptClinicStaffInvitationCommandHandler(staffRepo, new FacilityPasswordHasher(), uow);

        // Act & Assert
        var act = () => handler.Handle(new AcceptClinicStaffInvitationCommand(token, weakPassword), CancellationToken.None);
        var ex = await act.Should().ThrowAsync<ValidationException>();
        ex.WithMessage($"*{expectedReasonSubstring}*");
    }

    [Fact]
    public async Task AcceptInvitation_WithValidComplexPassword_HashesWithFacilityPasswordHasher_AndDoesNotStorePlaintext()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(TenantAClinicId);
        clinicContext.TenantId.Returns(TenantAId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        var token = "complex-pwd-token-999";
        var staff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAId,
            ClinicId = TenantAClinicId,
            FirstName = "Complex",
            LastName = "Doctor",
            Email = "complex@clinic.test",
            Role = StaffRole.Doctor,
            Status = StaffAccountStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(3),
            IsActive = true
        };
        await staffRepo.AddAsync(staff);
        await uow.SaveChangesAsync();

        var rawPassword = "StrongP@ssw0rd!2026#Secure";
        var hasher = new FacilityPasswordHasher();
        var handler = new AcceptClinicStaffInvitationCommandHandler(staffRepo, hasher, uow);

        var result = await handler.Handle(new AcceptClinicStaffInvitationCommand(token, rawPassword), CancellationToken.None);

        result.Status.Should().Be(StaffAccountStatus.Active);
        result.HasCredentials.Should().BeTrue();
        result.MustChangePassword.Should().BeFalse();

        var updated = await staffRepo.GetByIdAsync(staff.Id);
        updated!.PasswordHash.Should().NotBeNullOrWhiteSpace();
        updated.PasswordHash.Should().NotBe(rawPassword, "plain text password must never be stored");
        hasher.Verify(updated.PasswordHash!, rawPassword).Should().BeTrue("stored hash must verify against original password");
        hasher.Verify(updated.PasswordHash!, "WrongPassword123!").Should().BeFalse("hash must reject incorrect password");
    }

    // =========================================================================
    // VECTOR 4: STATE TRANSITIONS & FACILITY JWT ISSUANCE (ISSUE TOKENS ASYNC)
    // =========================================================================

    [Fact]
    public async Task ClinicAuthService_AcceptInvitationAsync_PerformsFullStateTransition_AndIssuesJwtTokens()
    {
        var clinicId = TenantAClinicId;
        var tenantId = TenantAId;
        var license = CreateLicenseToken(clinicId, tenantId);

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (db, _, _) = TestDbHelper.CreateTestContext(clinicContext);

        await db.ClinicSettings.AddAsync(new ClinicSettings
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            ClinicName = "Apex Healthcare",
            LicenseToken = license,
            FacilitySlug = "apex-health",
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "admin"
        });

        var token = "jwt-issuance-challenge-token";
        var staff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Gregory",
            LastName = "House",
            Email = "greg.house@apex.test",
            Role = StaffRole.Doctor,
            Status = StaffAccountStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(5),
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "admin"
        };
        await db.StaffMembers.AddAsync(staff);
        await db.SaveChangesAsync();

        var tokens = new FacilityTokenService(
            Options.Create(new FacilityJwtOptions
            {
                Issuer = "clinicez-clinic",
                Audience = "clinicez-clinic",
                SigningKey = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64)),
                AccessTokenMinutes = 15,
                RefreshTokenDays = 7
            }),
            NullLogger<FacilityTokenService>.Instance);

        var tenantLookup = Substitute.For<ITenantLookupService>();
        var accessCache = Substitute.For<IStaffAccessCache>();
        var workspaces = new WorkspaceResolver(db, tenantLookup, new ConfigurationBuilder().Build(), NullLogger<WorkspaceResolver>.Instance);
        var authService = new ClinicAuthService(
            db,
            workspaces,
            new FacilityLicenseValidator(),
            tokens,
            new FacilityPasswordHasher(),
            accessCache,
            NullLogger<ClinicAuthService>.Instance);

        var beforeAccept = DateTime.UtcNow;
        var outcome = await authService.AcceptInvitationAsync(token, "HouseM.D.!2026", "challenger-browser");
        var afterAccept = DateTime.UtcNow;

        // Verify Outcome
        outcome.Ok.Should().BeTrue();
        outcome.Failure.Should().Be(AuthFailure.None);
        outcome.Tokens.Should().NotBeNull();

        // Verify Issued Tokens
        var issuedTokens = outcome.Tokens!;
        issuedTokens.AccessToken.Should().NotBeNullOrWhiteSpace();
        issuedTokens.RefreshToken.Should().NotBeNullOrWhiteSpace();
        issuedTokens.AccessTokenExpiresAtUtc.Should().BeAfter(beforeAccept);
        issuedTokens.RefreshTokenExpiresAtUtc.Should().BeAfter(beforeAccept.AddDays(6));

        // Verify User Payload
        issuedTokens.User.Id.Should().Be(staff.Id);
        issuedTokens.User.Name.Should().Be("Gregory House");
        issuedTokens.User.Role.Should().Be("Doctor");
        issuedTokens.User.ClinicId.Should().Be(clinicId);
        issuedTokens.User.TenantId.Should().Be(tenantId);
        issuedTokens.User.ClinicName.Should().Be("Apex Healthcare");
        issuedTokens.User.MustChangePassword.Should().BeFalse();

        // Verify Database Persistence & State Transition
        var persistedStaff = await db.StaffMembers.FindAsync(staff.Id);
        persistedStaff.Should().NotBeNull();
        persistedStaff!.Status.Should().Be(StaffAccountStatus.Active);
        persistedStaff.IsActive.Should().BeTrue();
        persistedStaff.MustChangePassword.Should().BeFalse();
        persistedStaff.InviteAcceptedAt.Should().BeOnOrAfter(beforeAccept);
        persistedStaff.InviteAcceptedAt.Should().BeOnOrBefore(afterAccept);
        persistedStaff.TokenVersion.Should().BeGreaterThan(0);
        persistedStaff.LastLoginAt.Should().BeOnOrAfter(beforeAccept);
        persistedStaff.FailedLoginCount.Should().Be(0);
        persistedStaff.LockoutEnd.Should().BeNull();

        // Verify Refresh Token Record in DB
        var storedRefreshToken = await db.RefreshTokens.FirstOrDefaultAsync(r => r.StaffMemberId == staff.Id);
        storedRefreshToken.Should().NotBeNull();
        storedRefreshToken!.DeviceLabel.Should().Be("challenger-browser");
        storedRefreshToken.RevokedAt.Should().BeNull();
        storedRefreshToken.ExpiresAt.Should().BeOnOrAfter(beforeAccept.AddDays(6));

        // Verify Access Cache Invalidation was dispatched
        accessCache.Received(1).Invalidate(staff.Id);

        // Verify Idempotency / Double-acceptance Prevention
        var secondAttempt = await authService.AcceptInvitationAsync(token, "HouseM.D.!2026", "challenger-browser");
        secondAttempt.Ok.Should().BeFalse();
        secondAttempt.Failure.Should().Be(AuthFailure.InvalidRequest);
        secondAttempt.Message.Should().Contain("already been accepted");
    }

    [Fact]
    public async Task AcceptInvitation_WhenAnotherStaffMemberAlreadyHasCredentialsWithSameEmail_RejectsWithValidationException()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(TenantAClinicId);
        clinicContext.TenantId.Returns(TenantAId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        var sharedEmail = "duplicate.test@clinic.test";

        // Existing active staff with credentials
        var existingStaff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAId,
            ClinicId = TenantAClinicId,
            FirstName = "Original",
            LastName = "User",
            Email = sharedEmail,
            Role = StaffRole.Doctor,
            Status = StaffAccountStatus.Active,
            PasswordHash = "hashed_credentials_123",
            IsActive = true
        };
        await staffRepo.AddAsync(existingStaff);

        // New invited staff with the same email
        var token = "duplicate-email-token-123";
        var invitedStaff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAId,
            ClinicId = TenantAClinicId,
            FirstName = "Impostor",
            LastName = "User",
            Email = sharedEmail.ToUpper(), // Case-insensitive collision check
            Role = StaffRole.Nurse,
            Status = StaffAccountStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(3),
            IsActive = true
        };
        await staffRepo.AddAsync(invitedStaff);
        await uow.SaveChangesAsync();

        var handler = new AcceptClinicStaffInvitationCommandHandler(staffRepo, new FacilityPasswordHasher(), uow);

        var act = () => handler.Handle(new AcceptClinicStaffInvitationCommand(token, "ValidPass123!"), CancellationToken.None);
        var ex = await act.Should().ThrowAsync<ValidationException>();
        ex.WithMessage("*already has sign-in credentials*");
    }

    [Fact]
    public async Task AcceptInvitation_WithWhitespaceSurroundedToken_TrimsAndAcceptsSuccessfully()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(TenantAClinicId);
        clinicContext.TenantId.Returns(TenantAId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        var rawToken = "clean-token-whitespace-test";
        var staff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAId,
            ClinicId = TenantAClinicId,
            FirstName = "Padded",
            LastName = "Token",
            Email = "padded@clinic.test",
            Role = StaffRole.Receptionist,
            Status = StaffAccountStatus.Invited,
            InvitationToken = rawToken,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(3),
            IsActive = true
        };
        await staffRepo.AddAsync(staff);
        await uow.SaveChangesAsync();

        var handler = new AcceptClinicStaffInvitationCommandHandler(staffRepo, new FacilityPasswordHasher(), uow);

        var result = await handler.Handle(new AcceptClinicStaffInvitationCommand($"   {rawToken}   \t", "ValidPass123!"), CancellationToken.None);

        result.Status.Should().Be(StaffAccountStatus.Active);
        result.IsActive.Should().BeTrue();
    }

    [Fact]
    public async Task ClinicAuthService_AcceptInvitation_WhenLicenseIsTampered_RejectsWithLicenseTampered()
    {
        var clinicId = TenantAClinicId;
        var tenantId = TenantAId;

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (db, _, _) = TestDbHelper.CreateTestContext(clinicContext);

        await db.ClinicSettings.AddAsync(new ClinicSettings
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            ClinicName = "Apex Healthcare",
            LicenseToken = "tampered.corrupted.license.token"
        });

        var token = "tampered-license-token";
        await db.StaffMembers.AddAsync(new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Test",
            LastName = "Doctor",
            Email = "doc@apex.test",
            Role = StaffRole.Doctor,
            Status = StaffAccountStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(5),
            IsActive = true
        });
        await db.SaveChangesAsync();

        var tokens = new FacilityTokenService(
            Options.Create(new FacilityJwtOptions
            {
                Issuer = "clinicez-clinic",
                Audience = "clinicez-clinic",
                SigningKey = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64))
            }),
            NullLogger<FacilityTokenService>.Instance);

        var authService = new ClinicAuthService(
            db,
            new WorkspaceResolver(db, Substitute.For<ITenantLookupService>(), new ConfigurationBuilder().Build(), NullLogger<WorkspaceResolver>.Instance),
            new FacilityLicenseValidator(),
            tokens,
            new FacilityPasswordHasher(),
            Substitute.For<IStaffAccessCache>(),
            NullLogger<ClinicAuthService>.Instance);

        var outcome = await authService.AcceptInvitationAsync(token, "ValidPass123!", "device");
        outcome.Ok.Should().BeFalse();
        outcome.Failure.Should().Be(AuthFailure.LicenseTampered);
    }

    [Fact]
    public async Task ClinicAuthService_AcceptInvitation_WhenStatusIsRevokedOrSuspended_RejectsWithInvalidRequest()
    {
        var clinicId = TenantAClinicId;
        var tenantId = TenantAId;
        var license = CreateLicenseToken(clinicId, tenantId);

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (db, _, _) = TestDbHelper.CreateTestContext(clinicContext);

        await db.ClinicSettings.AddAsync(new ClinicSettings
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            ClinicName = "Apex Healthcare",
            LicenseToken = license
        });

        var revokedToken = "auth-revoked-token";
        var suspendedToken = "auth-suspended-token";

        await db.StaffMembers.AddRangeAsync(
            new StaffMember
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                FirstName = "Revoked",
                LastName = "User",
                Email = "revoked@apex.test",
                Role = StaffRole.Doctor,
                Status = StaffAccountStatus.Revoked,
                InvitationToken = revokedToken,
                InvitationExpiresAt = DateTime.UtcNow.AddDays(5),
                IsActive = false
            },
            new StaffMember
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                FirstName = "Suspended",
                LastName = "User",
                Email = "suspended@apex.test",
                Role = StaffRole.Nurse,
                Status = StaffAccountStatus.Suspended,
                InvitationToken = suspendedToken,
                InvitationExpiresAt = DateTime.UtcNow.AddDays(5),
                IsActive = false
            }
        );
        await db.SaveChangesAsync();

        var tokens = new FacilityTokenService(
            Options.Create(new FacilityJwtOptions
            {
                Issuer = "clinicez-clinic",
                Audience = "clinicez-clinic",
                SigningKey = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64))
            }),
            NullLogger<FacilityTokenService>.Instance);

        var authService = new ClinicAuthService(
            db,
            new WorkspaceResolver(db, Substitute.For<ITenantLookupService>(), new ConfigurationBuilder().Build(), NullLogger<WorkspaceResolver>.Instance),
            new FacilityLicenseValidator(),
            tokens,
            new FacilityPasswordHasher(),
            Substitute.For<IStaffAccessCache>(),
            NullLogger<ClinicAuthService>.Instance);

        // 1. Revoked attempt
        var revokedResult = await authService.AcceptInvitationAsync(revokedToken, "ValidPass123!", "device");
        revokedResult.Ok.Should().BeFalse();
        revokedResult.Failure.Should().Be(AuthFailure.InvalidRequest);
        revokedResult.Message.Should().Contain("revoked");

        // 2. Suspended attempt
        var suspendedResult = await authService.AcceptInvitationAsync(suspendedToken, "ValidPass123!", "device");
        suspendedResult.Ok.Should().BeFalse();
        suspendedResult.Failure.Should().Be(AuthFailure.InvalidRequest);
        suspendedResult.Message.Should().Contain("suspended");
    }

    // =========================================================================
    // VECTOR 5: CRYPTOGRAPHIC ENTROPY & EXPIRATION LOGIC ORACLE
    // =========================================================================

    [Fact]
    public void CryptographicEntropyOracle_256BitCsprngTokens_ExhibitZeroCollisionsAndHighShannonEntropy()
    {
        // Oracle: Generate 1,000 invitation tokens matching production logic:
        // Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant()
        const int sampleSize = 1000;
        var generatedTokens = new HashSet<string>(sampleSize);
        var hexRegex = new Regex("^[0-9a-f]{64}$", RegexOptions.Compiled);

        var charCounts = new Dictionary<char, int>();
        for (char c = '0'; c <= '9'; c++) charCounts[c] = 0;
        for (char c = 'a'; c <= 'f'; c++) charCounts[c] = 0;

        for (int i = 0; i < sampleSize; i++)
        {
            var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();

            // 1. Exactly 64 hex characters (32 bytes = 256 bits)
            token.Length.Should().Be(64);
            hexRegex.IsMatch(token).Should().BeTrue($"token '{token}' must be valid 64-char lowercase hex string");

            // 2. Uniqueness test across 1,000 samples (zero collisions)
            generatedTokens.Add(token).Should().BeTrue($"Collision detected at iteration {i} for token '{token}'");

            // Accumulate character frequency for Shannon entropy
            foreach (var ch in token)
            {
                charCounts[ch]++;
            }
        }

        // 3. Shannon Entropy calculation over character distribution:
        // Ideal uniform distribution over 16 hex characters has H = log2(16) = 4.0 bits/char.
        // We demand empirical Shannon entropy >= 3.95 bits/char over 64,000 characters.
        double totalChars = sampleSize * 64;
        double shannonEntropy = 0;
        foreach (var kvp in charCounts)
        {
            double p = kvp.Value / totalChars;
            if (p > 0)
            {
                shannonEntropy -= p * Math.Log2(p);
            }
        }

        shannonEntropy.Should().BeGreaterThan(3.95, "CSPRNG hex tokens must exhibit near-ideal Shannon entropy (4.0 bits/char)");
    }

    [Fact]
    public async Task CreateStaffMember_WithoutPassword_GeneratesStrict256BitToken_And7DayExpiry()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(TenantAClinicId);
        clinicContext.TenantId.Returns(TenantAId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var roleRepo = TestDbHelper.CreateRepository<ClinicRole>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        var licenseToken = CreateLicenseToken(TenantAClinicId, TenantAId);
        await settingsRepo.AddAsync(new ClinicSettings
        {
            Id = Guid.NewGuid(),
            TenantId = TenantAId,
            ClinicId = TenantAClinicId,
            ClinicName = "Oracle Clinic",
            LicenseToken = licenseToken,
            TenantSlug = "oracle-tenant",
            FacilitySlug = "oracle-fac"
        });
        await uow.SaveChangesAsync();

        var handler = new CreateStaffMemberCommandHandler(
            staffRepo,
            roleRepo,
            settingsRepo,
            new FacilityLicenseValidator(),
            uow,
            clinicContext,
            new FacilityPasswordHasher(),
            null,
            null);

        var beforeTime = DateTime.UtcNow;
        var command = new CreateStaffMemberCommand(
            "Entropy",
            "Doctor",
            null,
            "MD",
            StaffRole.Doctor,
            null,
            "entropy@clinic.test",
            null,
            null,
            null,
            null,
            null,
            InitialPassword: null,
            SendInviteEmail: false);

        var result = await handler.Handle(command, CancellationToken.None);
        var afterTime = DateTime.UtcNow;

        result.Status.Should().Be(StaffAccountStatus.Invited);
        result.InvitationToken.Should().NotBeNullOrWhiteSpace();
        result.InvitationToken!.Length.Should().Be(64);
        new Regex("^[0-9a-f]{64}$").IsMatch(result.InvitationToken).Should().BeTrue();

        result.InvitationExpiresAt.Should().BeOnOrAfter(beforeTime.AddDays(7).AddSeconds(-2));
        result.InvitationExpiresAt.Should().BeOnOrBefore(afterTime.AddDays(7).AddSeconds(2));
        result.IsExpired.Should().BeFalse();
        result.HasCredentials.Should().BeFalse();
    }
}
