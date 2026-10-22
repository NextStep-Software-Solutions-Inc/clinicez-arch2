using System;
using System.Collections.Generic;
using System.Security.Cryptography;
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

namespace ClinicEz.Clinic.Application.Tests.Staff;

public class StaffInvitationTests
{
    private static string CreateLicenseToken(Guid clinicId, string tenantId) =>
        new FacilityLicenseSigner().SignLicense(new FacilityLicensePayload
        {
            FacilityId = clinicId,
            TenantId = tenantId,
            TenantSlug = "test-clinic",
            FacilityName = "Test Clinic",
            FacilityType = "Clinic",
            PlanTier = "Community",
            Limits = PlanTierDefaults.GetLimitsForTier("Community"),
            EnabledFeatures = PlanTierDefaults.GetFeaturesForTier("Community"),
            IssuedAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddYears(1)
        });

    [Fact]
    public async Task CreateStaff_WithoutPassword_GeneratesCsprngToken_AndEnqueuesInviteEmail()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var roleRepo = TestDbHelper.CreateRepository<ClinicRole>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        var licenseToken = CreateLicenseToken(clinicId, tenantId);
        await settingsRepo.AddAsync(new ClinicSettings
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            ClinicName = "Test Clinic",
            LicenseToken = licenseToken,
            TenantSlug = "test-tenant",
            FacilitySlug = "test-facility"
        });
        await uow.SaveChangesAsync();

        var notifier = Substitute.For<IClinicStaffInvitationNotifier>();
        notifier.BuildInviteUrl(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<string>())
            .Returns(call => $"https://test-facility.clinic.clinicez.ph/invitations/{call.ArgAt<string>(0)}");

        var handler = new CreateStaffMemberCommandHandler(
            staffRepo,
            roleRepo,
            settingsRepo,
            new FacilityLicenseValidator(),
            uow,
            clinicContext,
            new FacilityPasswordHasher(),
            null,
            notifier);

        var command = new CreateStaffMemberCommand(
            "Jane",
            "Doe",
            null,
            "RN",
            StaffRole.Nurse,
            null,
            "jane.doe@example.com",
            "09171234567",
            null,
            null,
            null,
            null,
            InitialPassword: null,
            SendInviteEmail: true);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Status.Should().Be(StaffAccountStatus.Invited);
        result.InvitationToken.Should().NotBeNullOrWhiteSpace();
        result.InvitationToken!.Length.Should().Be(64); // 32 bytes hex encoded
        result.InvitationExpiresAt.Should().BeAfter(DateTime.UtcNow.AddDays(6));
        result.IsExpired.Should().BeFalse();
        result.HasCredentials.Should().BeFalse();
        result.InviteUrl.Should().Contain(result.InvitationToken);

        notifier.Received(1).EnqueueInvitationEmail(
            tenantId,
            clinicId,
            "Test Clinic",
            "test-tenant",
            "test-facility",
            Arg.Is<StaffMember>(s => s.Email == "jane.doe@example.com"),
            result.InvitationToken);
    }

    [Fact]
    public async Task CreateStaff_WithoutPassword_SendEmailFalse_DoesNotEnqueueEmail()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var roleRepo = TestDbHelper.CreateRepository<ClinicRole>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        var licenseToken = CreateLicenseToken(clinicId, tenantId);
        await settingsRepo.AddAsync(new ClinicSettings
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            ClinicName = "Test Clinic",
            LicenseToken = licenseToken
        });
        await uow.SaveChangesAsync();

        var notifier = Substitute.For<IClinicStaffInvitationNotifier>();
        notifier.BuildInviteUrl(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<string>())
            .Returns(call => $"https://clinic.local/invitations/{call.ArgAt<string>(0)}");

        var handler = new CreateStaffMemberCommandHandler(
            staffRepo,
            roleRepo,
            settingsRepo,
            new FacilityLicenseValidator(),
            uow,
            clinicContext,
            new FacilityPasswordHasher(),
            null,
            notifier);

        var command = new CreateStaffMemberCommand(
            "Mark",
            "Santos",
            null,
            null,
            StaffRole.Receptionist,
            null,
            "mark.santos@example.com",
            null,
            null,
            null,
            null,
            null,
            InitialPassword: null,
            SendInviteEmail: false);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Status.Should().Be(StaffAccountStatus.Invited);
        result.InviteUrl.Should().NotBeNullOrEmpty();
        notifier.DidNotReceive().EnqueueInvitationEmail(
            Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<StaffMember>(), Arg.Any<string>());
    }

    [Fact]
    public async Task ResendInvitation_WhenStatusIsInvited_RegeneratesToken_AndResetsExpiry()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        var oldToken = "old-token-12345678901234567890123456789012";
        var staff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Alice",
            LastName = "Guinto",
            Email = "alice@example.com",
            Role = StaffRole.Nurse,
            Status = StaffAccountStatus.Invited,
            InvitationToken = oldToken,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(-1), // Expired!
            IsActive = true
        };
        await staffRepo.AddAsync(staff);
        await settingsRepo.AddAsync(new ClinicSettings
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            ClinicName = "Care Clinic"
        });
        await uow.SaveChangesAsync();

        var notifier = Substitute.For<IClinicStaffInvitationNotifier>();
        var handler = new ResendStaffInvitationCommandHandler(
            staffRepo,
            settingsRepo,
            uow,
            clinicContext,
            notifier);

        var command = new ResendStaffInvitationCommand(staff.Id, SendInviteEmail: true);
        var result = await handler.Handle(command, CancellationToken.None);

        result.Status.Should().Be(StaffAccountStatus.Invited);
        result.InvitationToken.Should().NotBe(oldToken);
        result.InvitationExpiresAt.Should().BeAfter(DateTime.UtcNow.AddDays(6));
        result.IsExpired.Should().BeFalse();

        notifier.Received(1).EnqueueInvitationEmail(
            tenantId,
            clinicId,
            "Care Clinic",
            Arg.Any<string>(),
            Arg.Any<string>(),
            Arg.Is<StaffMember>(s => s.Id == staff.Id),
            result.InvitationToken!);
    }

    [Theory]
    [InlineData(StaffAccountStatus.Active)]
    [InlineData(StaffAccountStatus.Suspended)]
    [InlineData(StaffAccountStatus.Revoked)]
    public async Task ResendInvitation_WhenStatusIsNotInvited_ThrowsInvalidOperationException(StaffAccountStatus status)
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        var staff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Carlos",
            LastName = "Mendoza",
            Email = "carlos@example.com",
            Role = StaffRole.Receptionist,
            Status = status,
            IsActive = status == StaffAccountStatus.Active
        };
        await staffRepo.AddAsync(staff);
        await uow.SaveChangesAsync();

        var handler = new ResendStaffInvitationCommandHandler(
            staffRepo,
            settingsRepo,
            uow,
            clinicContext);

        var act = () => handler.Handle(new ResendStaffInvitationCommand(staff.Id), CancellationToken.None);
        await act.Should().ThrowAsync<InvalidOperationException>();
    }

    [Fact]
    public async Task RevokeInvitation_SetsRevokedStatus_AndDeactivates()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        var staff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Dan",
            LastName = "Reyes",
            Email = "dan@example.com",
            Role = StaffRole.Nurse,
            Status = StaffAccountStatus.Invited,
            InvitationToken = "valid-token-123",
            IsActive = true
        };
        await staffRepo.AddAsync(staff);
        await uow.SaveChangesAsync();

        var handler = new RevokeStaffInvitationCommandHandler(staffRepo, uow, clinicContext);
        var success = await handler.Handle(new RevokeStaffInvitationCommand(staff.Id), CancellationToken.None);

        success.Should().BeTrue();
        var updated = await staffRepo.GetByIdAsync(staff.Id);
        updated!.Status.Should().Be(StaffAccountStatus.Revoked);
        updated.IsActive.Should().BeFalse();
        updated.TokenVersion.Should().Be(1);
    }

    [Fact]
    public async Task SuspendStaff_SetsSuspendedStatus_AndIncrementsTokenVersion()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        var staff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Eva",
            LastName = "Santos",
            Email = "eva@example.com",
            Role = StaffRole.Nurse,
            Status = StaffAccountStatus.Active,
            IsActive = true,
            TokenVersion = 2
        };
        await staffRepo.AddAsync(staff);
        await uow.SaveChangesAsync();

        var handler = new SuspendStaffMemberCommandHandler(staffRepo, uow, clinicContext);
        var result = await handler.Handle(new SuspendStaffMemberCommand(staff.Id), CancellationToken.None);

        result.Status.Should().Be(StaffAccountStatus.Suspended);
        result.IsActive.Should().BeFalse();

        var updated = await staffRepo.GetByIdAsync(staff.Id);
        updated!.Status.Should().Be(StaffAccountStatus.Suspended);
        updated.IsActive.Should().BeFalse();
        updated.TokenVersion.Should().Be(3);
    }

    [Fact]
    public async Task ReactivateStaff_SetsActiveStatus_AndIsActiveTrue()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        var licenseToken = CreateLicenseToken(clinicId, tenantId);
        await settingsRepo.AddAsync(new ClinicSettings
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            ClinicName = "Test Clinic",
            LicenseToken = licenseToken
        });

        var staff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Frank",
            LastName = "Luna",
            Email = "frank@example.com",
            Role = StaffRole.Nurse,
            Status = StaffAccountStatus.Suspended,
            IsActive = false
        };
        await staffRepo.AddAsync(staff);
        await uow.SaveChangesAsync();

        var handler = new ReactivateStaffMemberCommandHandler(
            staffRepo,
            settingsRepo,
            new FacilityLicenseValidator(),
            uow,
            clinicContext);

        var result = await handler.Handle(new ReactivateStaffMemberCommand(staff.Id), CancellationToken.None);

        result.Status.Should().Be(StaffAccountStatus.Active);
        result.IsActive.Should().BeTrue();

        var updated = await staffRepo.GetByIdAsync(staff.Id);
        updated!.Status.Should().Be(StaffAccountStatus.Active);
        updated.IsActive.Should().BeTrue();
    }

    [Fact]
    public async Task GetInvitationDetails_ReturnsCorrectDetails_AndFlags()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        var token = "inv-token-abc-123";
        await settingsRepo.AddAsync(new ClinicSettings
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            ClinicName = "St. Jude Clinic",
            FacilitySlug = "st-jude"
        });

        var staff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Grace",
            LastName = "Hopper",
            Email = "grace@clinic.test",
            Role = StaffRole.Doctor,
            Status = StaffAccountStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(5),
            IsActive = true
        };
        await staffRepo.AddAsync(staff);
        await uow.SaveChangesAsync();

        var handler = new GetClinicInvitationDetailsQueryHandler(staffRepo, settingsRepo);
        var details = await handler.Handle(new GetClinicInvitationDetailsQuery(token), CancellationToken.None);

        details.Should().NotBeNull();
        details.ClinicName.Should().Be("St. Jude Clinic");
        details.InviteeFullName.Should().Be("Grace Hopper");
        details.InviteeEmail.Should().Be("grace@clinic.test");
        details.Role.Should().Be("Doctor");
        details.IsExpired.Should().BeFalse();
        details.IsAlreadyAccepted.Should().BeFalse();
        details.IsRevoked.Should().BeFalse();
        details.IsSuspended.Should().BeFalse();
    }

    [Fact]
    public async Task GetInvitationDetails_WhenTokenIsUnknown_ThrowsNotFoundException()
    {
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);

        var handler = new GetClinicInvitationDetailsQueryHandler(staffRepo, settingsRepo);
        var act = () => handler.Handle(new GetClinicInvitationDetailsQuery("nonexistent-token"), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task AcceptInvitation_SetsPassword_AndStatusActive()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        var token = "invite-to-accept-xyz";
        var staff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Helen",
            LastName = "Keller",
            Email = "helen@clinic.test",
            Role = StaffRole.Doctor,
            Status = StaffAccountStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddDays(3),
            IsActive = true
        };
        await staffRepo.AddAsync(staff);
        await uow.SaveChangesAsync();

        var hasher = new FacilityPasswordHasher();
        var handler = new AcceptClinicStaffInvitationCommandHandler(staffRepo, hasher, uow);

        var result = await handler.Handle(new AcceptClinicStaffInvitationCommand(token, "SecurePass123!"), CancellationToken.None);

        result.Status.Should().Be(StaffAccountStatus.Active);
        result.IsActive.Should().BeTrue();
        result.HasCredentials.Should().BeTrue();
        result.MustChangePassword.Should().BeFalse();
        result.InviteAcceptedAt.Should().NotBeNull();

        var updated = await staffRepo.GetByIdAsync(staff.Id);
        hasher.Verify(updated!.PasswordHash!, "SecurePass123!").Should().BeTrue();
        updated.Status.Should().Be(StaffAccountStatus.Active);
        updated.MustChangePassword.Should().BeFalse();
    }

    [Fact]
    public async Task AcceptInvitation_WhenExpired_ThrowsInvalidOperationException()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        var token = "expired-token-123";
        var staff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Ian",
            LastName = "Fleming",
            Email = "ian@clinic.test",
            Role = StaffRole.Nurse,
            Status = StaffAccountStatus.Invited,
            InvitationToken = token,
            InvitationExpiresAt = DateTime.UtcNow.AddMinutes(-10),
            IsActive = true
        };
        await staffRepo.AddAsync(staff);
        await uow.SaveChangesAsync();

        var handler = new AcceptClinicStaffInvitationCommandHandler(staffRepo, new FacilityPasswordHasher(), uow);
        var act = () => handler.Handle(new AcceptClinicStaffInvitationCommand(token, "SecurePass123!"), CancellationToken.None);

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*expired*");
    }

    [Fact]
    public async Task ClinicAuthService_GetInvitationDetails_And_AcceptInvitation_IssuesTokens()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
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
            ClinicName = "Metro Health Clinic",
            LicenseToken = license,
            FacilitySlug = "metro-health",
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "test"
        });

        var token = "token-auth-svc-999";
        var staff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Julia",
            LastName = "Roberts",
            Email = "julia@metro.test",
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
                SigningKey = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64))
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

        // 1. Get Details
        var details = await authService.GetInvitationDetailsAsync(token);
        details.Should().NotBeNull();
        details!.ClinicName.Should().Be("Metro Health Clinic");
        details.InviteeFullName.Should().Be("Julia Roberts");
        details.InviteeEmail.Should().Be("julia@metro.test");
        details.IsExpired.Should().BeFalse();
        details.IsAlreadyAccepted.Should().BeFalse();

        // 2. Accept Invitation
        var outcome = await authService.AcceptInvitationAsync(token, "ValidPass1234!", "browser-device");
        outcome.Ok.Should().BeTrue();
        outcome.Tokens.Should().NotBeNull();
        outcome.Tokens!.AccessToken.Should().NotBeNullOrWhiteSpace();
        outcome.Tokens.RefreshToken.Should().NotBeNullOrWhiteSpace();
        outcome.Tokens.User.Name.Should().Be("Julia Roberts");
        outcome.Tokens.User.MustChangePassword.Should().BeFalse();

        // 3. Re-accept should fail
        var reAccept = await authService.AcceptInvitationAsync(token, "ValidPass1234!", "browser-device");
        reAccept.Ok.Should().BeFalse();
        reAccept.Failure.Should().Be(AuthFailure.InvalidRequest);
    }

    [Fact]
    public async Task GetStaffMembersQuery_HealsCredentialedStaff_FromMigrationStatusInvited_ToActive()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);

        // Pre-existing staff member whose DB status got set to Invited by migration
        var existingStaff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Wave",
            LastName = "Ambray",
            Role = StaffRole.Admin,
            Email = "wave@clinicez.ph",
            PasswordHash = "already_hashed_password",
            Status = StaffAccountStatus.Invited, // Faulty migration status
            InvitationToken = null, // No pending invitation token
            IsActive = true,
            CreatedAt = DateTime.UtcNow.AddMonths(-1)
        };

        // Genuinely invited staff member
        var invitedStaff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "New",
            LastName = "Doctor",
            Role = StaffRole.Doctor,
            Email = "newdoc@clinicez.ph",
            PasswordHash = null,
            Status = StaffAccountStatus.Invited,
            InvitationToken = "active_invite_token_123",
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };

        await staffRepo.AddAsync(existingStaff);
        await staffRepo.AddAsync(invitedStaff);
        await uow.SaveChangesAsync();

        var queryHandler = new ClinicEz.Clinic.Application.Features.Staff.Queries.GetStaffMembersQueryHandler(
            staffRepo,
            clinicContext);

        var list = await queryHandler.Handle(
            new ClinicEz.Clinic.Application.Features.Staff.Queries.GetStaffMembersQuery(),
            CancellationToken.None);

        var waveDto = list.First(s => s.Id == existingStaff.Id);
        waveDto.Status.Should().Be(StaffAccountStatus.Active);
        waveDto.HasCredentials.Should().BeTrue();

        var invitedDto = list.First(s => s.Id == invitedStaff.Id);
        invitedDto.Status.Should().Be(StaffAccountStatus.Invited);
        invitedDto.HasCredentials.Should().BeFalse();
    }

    [Fact]
    public async Task ResetStaffPassword_WithSendResetEmail_EnqueuesPasswordResetEmailAndAllowsAcceptance()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_reset_email";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var notifier = Substitute.For<IClinicStaffInvitationNotifier>();
        notifier.BuildInviteUrl(Arg.Any<string>(), Arg.Any<string?>(), Arg.Any<string?>())
            .Returns(ci => $"https://nextstep.clinic.dev.clinicez.net/invitations/{ci.ArgAt<string>(0)}");

        await settingsRepo.AddAsync(new ClinicSettings
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            ClinicName = "Nextstep Clinic",
            TenantSlug = "nextstep",
            FacilitySlug = "nextstep"
        });

        var hasher = new FacilityPasswordHasher();
        var activeStaff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Wave",
            LastName = "Ambray",
            Role = StaffRole.Doctor,
            Email = "wave@clinicez.ph",
            PasswordHash = hasher.Hash("OldPass123!"),
            Status = StaffAccountStatus.Active,
            MustChangePassword = false,
            IsActive = true,
            TokenVersion = 1
        };

        await staffRepo.AddAsync(activeStaff);
        await uow.SaveChangesAsync();

        var resetHandler = new ResetStaffPasswordCommandHandler(
            staffRepo,
            uow,
            clinicContext,
            hasher,
            settingsRepo,
            notifier);

        var resetResult = await resetHandler.Handle(
            new ResetStaffPasswordCommand(
                activeStaff.Id,
                TemporaryPassword: null,
                SendResetEmail: true,
                GenerateResetLink: true),
            CancellationToken.None);

        resetResult.EmailSent.Should().BeTrue();
        resetResult.ResetToken.Should().NotBeNullOrWhiteSpace();
        resetResult.ResetToken!.Length.Should().Be(64);
        resetResult.ResetUrl.Should().Contain(resetResult.ResetToken);
        resetResult.TemporaryPassword.Should().BeEmpty();

        notifier.Received(1).EnqueuePasswordResetEmail(
            tenantId,
            clinicId,
            "Nextstep Clinic",
            "nextstep",
            "nextstep",
            Arg.Is<StaffMember>(s => s.Id == activeStaff.Id),
            resetResult.ResetToken!);

        // Verify invitation details query allows viewing the reset link for Active member with MustChangePassword=true
        var detailsHandler = new GetClinicInvitationDetailsQueryHandler(staffRepo, settingsRepo);
        var details = await detailsHandler.Handle(new GetClinicInvitationDetailsQuery(resetResult.ResetToken!), CancellationToken.None);
        details.IsAlreadyAccepted.Should().BeFalse();
        details.IsExpired.Should().BeFalse();

        // Verify accepting the reset link updates the password and clears MustChangePassword
        var acceptHandler = new AcceptClinicStaffInvitationCommandHandler(staffRepo, hasher, uow);
        var accepted = await acceptHandler.Handle(
            new AcceptClinicStaffInvitationCommand(resetResult.ResetToken!, "NewSecurePass123!"),
            CancellationToken.None);

        accepted.Status.Should().Be(StaffAccountStatus.Active);
        accepted.MustChangePassword.Should().BeFalse();
        accepted.HasCredentials.Should().BeTrue();
    }

    [Fact]
    public async Task ResetStaffPassword_WithGenerateResetLinkOnly_DoesNotEnqueueEmail()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_reset_link";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var notifier = Substitute.For<IClinicStaffInvitationNotifier>();
        notifier.BuildInviteUrl(Arg.Any<string>(), Arg.Any<string?>(), Arg.Any<string?>())
            .Returns(ci => $"https://nextstep.clinic.dev.clinicez.net/invitations/{ci.ArgAt<string>(0)}");

        var activeStaff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            FirstName = "Wave",
            LastName = "Ambray",
            Role = StaffRole.Doctor,
            Email = "wave@clinicez.ph",
            PasswordHash = "existing_hash",
            Status = StaffAccountStatus.Active,
            MustChangePassword = false,
            IsActive = true
        };

        await staffRepo.AddAsync(activeStaff);
        await uow.SaveChangesAsync();

        var resetHandler = new ResetStaffPasswordCommandHandler(
            staffRepo,
            uow,
            clinicContext,
            new FacilityPasswordHasher(),
            settingsRepo,
            notifier);

        var resetResult = await resetHandler.Handle(
            new ResetStaffPasswordCommand(
                activeStaff.Id,
                TemporaryPassword: null,
                SendResetEmail: false,
                GenerateResetLink: true),
            CancellationToken.None);

        resetResult.EmailSent.Should().BeFalse();
        resetResult.ResetToken.Should().NotBeNullOrWhiteSpace();
        resetResult.ResetUrl.Should().Contain(resetResult.ResetToken!);

        notifier.DidNotReceiveWithAnyArgs().EnqueuePasswordResetEmail(default!, default, default!, default, default, default!, default!);
    }
}
