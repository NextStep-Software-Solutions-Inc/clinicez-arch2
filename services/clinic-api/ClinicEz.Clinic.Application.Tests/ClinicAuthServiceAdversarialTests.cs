using System;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Auth;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Licensing;
using ClinicEz.Shared.LocalAuth;
using ClinicEz.Shared.Security;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class ClinicAuthServiceAdversarialTests
{
    private const string StrongPassword = "Sup3rSecret-Pass!";

    private sealed class Fixture
    {
        public required ApplicationDbContext Db { get; init; }
        public required ClinicAuthService Service { get; init; }
        public required IFacilityTokenService Tokens { get; init; }
        public required Guid ClinicId { get; init; }
        public required string TenantId { get; init; }
        public required string License { get; init; }
        public required IStaffAccessCache AccessCache { get; init; }
    }

    private static string SignLicense(Guid clinicId, string tenantId, string? ownerEmail, string? ownerName = null, DateTime? expires = null) =>
        new FacilityLicenseSigner().SignLicense(new FacilityLicensePayload
        {
            FacilityId = clinicId,
            TenantId = tenantId,
            TenantSlug = "test-clinic",
            FacilityName = "Test Clinic",
            FacilityType = "Clinic",
            OwnerEmail = ownerEmail,
            OwnerName = ownerName,
            PlanTier = "Community",
            Limits = PlanTierDefaults.GetLimitsForTier("Community"),
            EnabledFeatures = PlanTierDefaults.GetFeaturesForTier("Community"),
            IssuedAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = expires ?? DateTime.UtcNow.AddYears(1)
        });

    private static async Task<Fixture> CreateAsync(string? ownerEmail = "owner@clinic.test", bool withSettings = true)
    {
        var clinicId = Guid.NewGuid();
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        var (db, _, _) = TestDbHelper.CreateTestContext(clinicContext);

        var tenantId = Guid.NewGuid().ToString();
        var license = SignLicense(clinicId, tenantId, ownerEmail, "Olivia Owner");

        if (withSettings)
        {
            db.Settings.Add(new FacilitySettings
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                ClinicName = "Test Clinic",
                LicenseToken = license,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "test"
            });
            await db.SaveChangesAsync();
        }

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
        var service = new ClinicAuthService(
            db,
            workspaces,
            new FacilityLicenseValidator(),
            tokens,
            new FacilityPasswordHasher(),
            accessCache,
            NullLogger<ClinicAuthService>.Instance);

        return new Fixture
        {
            Db = db,
            Service = service,
            Tokens = tokens,
            ClinicId = clinicId,
            TenantId = tenantId,
            License = license,
            AccessCache = accessCache
        };
    }

    private static BootstrapRequest Bootstrap(Fixture f) =>
        new(null, f.License, null, StrongPassword, null);

    // =========================================================================
    // Edge Case 1: Invalid ECDSA signature, corrupted parts, and missing fields
    // =========================================================================

    [Fact]
    public async Task RecoverAdmin_TamperedSignature_ReturnsLicenseTampered()
    {
        var f = await CreateAsync();
        await f.Service.BootstrapAsync(Bootstrap(f));

        var parts = f.License.Split('.');
        var tamperedSignature = parts[1][..^4] + "ZZZZ";
        var tamperedLicense = $"{parts[0]}.{tamperedSignature}";

        var request = new RecoverAdminRequest(null, tamperedLicense, "owner@clinic.test", "New-Strong-Pass-123!", null);
        var outcome = await f.Service.RecoverAdminAsync(request);

        outcome.Ok.Should().BeFalse();
        outcome.Failure.Should().Be(AuthFailure.LicenseTampered);
        outcome.Message.Should().Contain("license failed verification");
    }

    [Fact]
    public async Task RecoverAdmin_ForgedSignatureWithDifferentKey_ReturnsLicenseTampered()
    {
        var f = await CreateAsync();
        await f.Service.BootstrapAsync(Bootstrap(f));

        // Create a completely distinct ECDSA key pair and sign the payload with it
        using var rogueEcdsa = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var parts = f.License.Split('.');
        var payloadBytes = Base64UrlHelper.Decode(parts[0]);
        var rogueSig = rogueEcdsa.SignData(payloadBytes, HashAlgorithmName.SHA256);
        var forgedLicense = $"{parts[0]}.{Base64UrlHelper.Encode(rogueSig)}";

        var request = new RecoverAdminRequest(null, forgedLicense, "owner@clinic.test", "New-Strong-Pass-123!", null);
        var outcome = await f.Service.RecoverAdminAsync(request);

        outcome.Ok.Should().BeFalse();
        outcome.Failure.Should().Be(AuthFailure.LicenseTampered);
    }

    [Theory]
    [InlineData("not-a-license-at-all")]
    [InlineData("singletokenwithnoperiod")]
    [InlineData("too.many.periods.in.license.token")]
    public async Task RecoverAdmin_MalformedTokenFormat_ReturnsLicenseTampered(string malformedToken)
    {
        var f = await CreateAsync();
        await f.Service.BootstrapAsync(Bootstrap(f));

        var request = new RecoverAdminRequest(null, malformedToken, "owner@clinic.test", "New-Strong-Pass-123!", null);
        var outcome = await f.Service.RecoverAdminAsync(request);

        outcome.Ok.Should().BeFalse();
        outcome.Failure.Should().Be(AuthFailure.LicenseTampered);
    }

    [Fact]
    public async Task RecoverAdmin_InvalidBase64Payload_ReturnsLicenseTampered()
    {
        var f = await CreateAsync();
        await f.Service.BootstrapAsync(Bootstrap(f));

        var parts = f.License.Split('.');
        var badBase64License = $"!!!invalid_base64!!!.{parts[1]}";

        var request = new RecoverAdminRequest(null, badBase64License, "owner@clinic.test", "New-Strong-Pass-123!", null);
        var outcome = await f.Service.RecoverAdminAsync(request);

        outcome.Ok.Should().BeFalse();
        outcome.Failure.Should().Be(AuthFailure.LicenseTampered);
    }

    [Fact]
    public async Task RecoverAdmin_InvalidJsonPayload_ReturnsLicenseTampered()
    {
        var f = await CreateAsync();
        await f.Service.BootstrapAsync(Bootstrap(f));

        var malformedJsonBytes = Encoding.UTF8.GetBytes("{ this is not valid json : [ }");
        var encodedPayload = Base64UrlHelper.Encode(malformedJsonBytes);
        var fakeLicense = $"{encodedPayload}.AAAA";

        var request = new RecoverAdminRequest(null, fakeLicense, "owner@clinic.test", "New-Strong-Pass-123!", null);
        var outcome = await f.Service.RecoverAdminAsync(request);

        outcome.Ok.Should().BeFalse();
        outcome.Failure.Should().Be(AuthFailure.LicenseTampered);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public async Task RecoverAdmin_EmptyOrWhitespaceLicense_ReturnsInvalidRequest(string? emptyLicense)
    {
        var f = await CreateAsync();
        await f.Service.BootstrapAsync(Bootstrap(f));

        var request = new RecoverAdminRequest(null, emptyLicense!, "owner@clinic.test", "New-Strong-Pass-123!", null);
        var outcome = await f.Service.RecoverAdminAsync(request);

        outcome.Ok.Should().BeFalse();
        outcome.Failure.Should().Be(AuthFailure.InvalidRequest);
        outcome.Message.Should().Contain("License key is required");
    }

    [Fact]
    public async Task RecoverAdmin_ExpiredLicense_ReturnsActivationRequired()
    {
        var f = await CreateAsync();
        await f.Service.BootstrapAsync(Bootstrap(f));

        // Sign a license that expired 10 days ago
        var expiredLicense = SignLicense(f.ClinicId, f.TenantId, "owner@clinic.test", "Olivia Owner", DateTime.UtcNow.AddDays(-10));

        var request = new RecoverAdminRequest(null, expiredLicense, "owner@clinic.test", "New-Strong-Pass-123!", null);
        var outcome = await f.Service.RecoverAdminAsync(request);

        outcome.Ok.Should().BeFalse();
        outcome.Failure.Should().Be(AuthFailure.ActivationRequired);
        outcome.Message.Should().Contain("license has expired");
    }

    [Fact]
    public async Task RecoverAdmin_NoEmailInRequestAndNoOwnerEmailInLicense_ReturnsInvalidRequest()
    {
        var f = await CreateAsync(ownerEmail: null);
        // Note: For bootstrap without owner email, must provide email in bootstrap request
        var bootRequest = new BootstrapRequest(null, f.License, "admin@clinic.test", StrongPassword, null);
        (await f.Service.BootstrapAsync(bootRequest)).Ok.Should().BeTrue();

        var request = new RecoverAdminRequest(null, f.License, null, "New-Strong-Pass-123!", null);
        var outcome = await f.Service.RecoverAdminAsync(request);

        outcome.Ok.Should().BeFalse();
        outcome.Failure.Should().Be(AuthFailure.InvalidRequest);
        outcome.Message.Should().Contain("administrator email is required");
    }

    // =========================================================================
    // Edge Case 2: Far future lockout & large failed login count reset safely
    // =========================================================================

    [Fact]
    public async Task RecoverAdmin_FarFutureLockoutAndHugeFailedCount_ResetsSafelyAndAllowsImmediateLogin()
    {
        var f = await CreateAsync();
        await f.Service.BootstrapAsync(Bootstrap(f));

        var admin = await f.Db.StaffMembers.SingleAsync();
        admin.FailedLoginCount = 999_999;
        admin.LockoutEnd = DateTime.UtcNow.AddYears(50); // Locked out for 50 years!
        admin.MustChangePassword = true;
        admin.IsActive = false;
        admin.Status = StaffAccountStatus.Suspended;
        await f.Db.SaveChangesAsync();

        // Verify that standard login fails because account is locked or deactivated
        var preLogin = await f.Service.LoginAsync(new LoginRequest(null, "owner@clinic.test", StrongPassword, null));
        preLogin.Ok.Should().BeFalse();

        var request = new RecoverAdminRequest(
            null,
            f.License,
            "owner@clinic.test",
            "BrandNew-Password-456!",
            "workstation-emergency");

        var outcome = await f.Service.RecoverAdminAsync(request);

        outcome.Ok.Should().BeTrue(outcome.Message);

        // Verify database fields were properly reset
        var reloadedAdmin = await f.Db.StaffMembers.SingleAsync();
        reloadedAdmin.FailedLoginCount.Should().Be(0);
        reloadedAdmin.LockoutEnd.Should().BeNull();
        reloadedAdmin.MustChangePassword.Should().BeFalse();
        reloadedAdmin.IsActive.Should().BeTrue();
        reloadedAdmin.Status.Should().Be(StaffAccountStatus.Active);
        reloadedAdmin.UpdatedBy.Should().Be("System:AdminRecovery");

        // Immediate subsequent login with new password MUST succeed
        var postLogin = await f.Service.LoginAsync(new LoginRequest(null, "owner@clinic.test", "BrandNew-Password-456!", "workstation-1"));
        postLogin.Ok.Should().BeTrue(postLogin.Message);
        postLogin.Tokens.Should().NotBeNull();
        postLogin.Tokens!.AccessToken.Should().NotBeNullOrWhiteSpace();
    }

    // =========================================================================
    // Edge Case 3: Refresh token revocation across LAN and TokenVersion increment
    // =========================================================================

    [Fact]
    public async Task RecoverAdmin_MultipleActiveDevices_RevokesAllPriorTokensAndIncrementsVersion()
    {
        var f = await CreateAsync();
        var bootOutcome = await f.Service.BootstrapAsync(Bootstrap(f));
        var bootRefreshToken = bootOutcome.Tokens!.RefreshToken;

        var admin = await f.Db.StaffMembers.SingleAsync();
        var initialVersion = admin.TokenVersion;

        // Simulate 4 additional active sessions on different devices (e.g. tablet, reception, doctor room, lab)
        var session1 = (await f.Service.LoginAsync(new LoginRequest(null, "owner@clinic.test", StrongPassword, "tablet-1"))).Tokens!.RefreshToken;
        var session2 = (await f.Service.LoginAsync(new LoginRequest(null, "owner@clinic.test", StrongPassword, "reception-pc"))).Tokens!.RefreshToken;
        var session3 = (await f.Service.LoginAsync(new LoginRequest(null, "owner@clinic.test", StrongPassword, "doctor-room"))).Tokens!.RefreshToken;
        var session4 = (await f.Service.LoginAsync(new LoginRequest(null, "owner@clinic.test", StrongPassword, "lab-workstation"))).Tokens!.RefreshToken;

        var activeTokensBefore = await f.Db.RefreshTokens.CountAsync(t => t.StaffMemberId == admin.Id && t.RevokedAt == null);
        activeTokensBefore.Should().Be(5); // 1 bootstrap + 4 logins

        var request = new RecoverAdminRequest(
            null,
            f.License,
            "owner@clinic.test",
            "Super-Recovered-Pass-789!",
            "recovery-terminal");

        var outcome = await f.Service.RecoverAdminAsync(request);
        outcome.Ok.Should().BeTrue(outcome.Message);

        // TokenVersion MUST be incremented
        var refreshedAdmin = await f.Db.StaffMembers.SingleAsync();
        refreshedAdmin.TokenVersion.Should().Be(initialVersion + 1);

        // Every prior refresh token MUST be revoked
        (await f.Service.RefreshAsync(bootRefreshToken)).Ok.Should().BeFalse();
        (await f.Service.RefreshAsync(session1)).Ok.Should().BeFalse();
        (await f.Service.RefreshAsync(session2)).Ok.Should().BeFalse();
        (await f.Service.RefreshAsync(session3)).Ok.Should().BeFalse();
        (await f.Service.RefreshAsync(session4)).Ok.Should().BeFalse();

        // The new recovery refresh token is the ONLY active token
        var recoveryRefreshToken = outcome.Tokens!.RefreshToken;
        var refreshOutcome = await f.Service.RefreshAsync(recoveryRefreshToken);
        refreshOutcome.Ok.Should().BeTrue(refreshOutcome.Message);
        refreshOutcome.Tokens.Should().NotBeNull();
    }

    // =========================================================================
    // Edge Case 4: Non-admin roles (Doctor, Receptionist, Cashier, custom) strictly blocked
    // =========================================================================

    [Theory]
    [InlineData(StaffRole.Doctor, "doc@clinic.test", "Dr. Gregory", "House")]
    [InlineData(StaffRole.Nurse, "nurse@clinic.test", "Florence", "Nightingale")]
    [InlineData(StaffRole.Receptionist, "reception@clinic.test", "Pam", "Beesly")]
    [InlineData(StaffRole.Cashier, "cashier@clinic.test", "Oscar", "Martinez")]
    public async Task RecoverAdmin_StrictlyRejectsAllNonAdminRoles(StaffRole nonAdminRole, string email, string first, string last)
    {
        var f = await CreateAsync();
        await f.Service.BootstrapAsync(Bootstrap(f));

        var hasher = new FacilityPasswordHasher();
        var originalHash = hasher.Hash("OriginalPass123!");

        var nonAdminStaff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = f.TenantId,
            ClinicId = f.ClinicId,
            FirstName = first,
            LastName = last,
            Email = email,
            Role = nonAdminRole,
            IsActive = true,
            PasswordHash = originalHash,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "test"
        };
        f.Db.StaffMembers.Add(nonAdminStaff);
        await f.Db.SaveChangesAsync();

        var request = new RecoverAdminRequest(
            null,
            f.License,
            email,
            "Attacker-Attempt-Pass-123!",
            null);

        var outcome = await f.Service.RecoverAdminAsync(request);

        outcome.Ok.Should().BeFalse();
        outcome.Failure.Should().Be(AuthFailure.InvalidRequest);
        outcome.Message.Should().Be("Only clinic administrator accounts can be recovered using the facility license key.");

        // Credentials MUST NOT be modified
        var stored = await f.Db.StaffMembers.SingleAsync(s => s.Id == nonAdminStaff.Id);
        stored.PasswordHash.Should().Be(originalHash);
    }

    [Fact]
    public async Task RecoverAdmin_CustomRoleWithoutAdminPrivilege_IsRejected()
    {
        var f = await CreateAsync();
        await f.Service.BootstrapAsync(Bootstrap(f));

        var customRole = new Role
        {
            Id = Guid.NewGuid(),
            TenantId = f.TenantId,
            ClinicId = f.ClinicId,
            Name = "Billing Officer",
            Description = "Custom cashier/billing role",
            IsSystem = false,
            Permissions = new List<string> { "billing:read", "billing:write" },
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "test"
        };
        f.Db.Roles.Add(customRole);

        var hasher = new FacilityPasswordHasher();
        var originalHash = hasher.Hash("CustomRolePass123!");

        var customStaff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = f.TenantId,
            ClinicId = f.ClinicId,
            FirstName = "Bill",
            LastName = "Billing",
            Email = "billing@clinic.test",
            Role = StaffRole.Cashier,
            ClinicRoleId = customRole.Id,
            ClinicRole = customRole,
            IsActive = true,
            PasswordHash = originalHash,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "test"
        };
        f.Db.StaffMembers.Add(customStaff);
        await f.Db.SaveChangesAsync();

        var request = new RecoverAdminRequest(
            null,
            f.License,
            "billing@clinic.test",
            "Attacker-Attempt-Pass-123!",
            null);

        var outcome = await f.Service.RecoverAdminAsync(request);

        outcome.Ok.Should().BeFalse();
        outcome.Failure.Should().Be(AuthFailure.InvalidRequest);
        outcome.Message.Should().Be("Only clinic administrator accounts can be recovered using the facility license key.");

        var stored = await f.Db.StaffMembers.SingleAsync(s => s.Id == customStaff.Id);
        stored.PasswordHash.Should().Be(originalHash);
    }

    [Fact]
    public async Task RecoverAdmin_SoftDeletedAdmin_ReturnsNotFound()
    {
        var f = await CreateAsync();
        await f.Service.BootstrapAsync(Bootstrap(f));

        var admin = await f.Db.StaffMembers.SingleAsync();
        admin.IsDeleted = true;
        admin.DeletedAt = DateTime.UtcNow;
        await f.Db.SaveChangesAsync();

        var request = new RecoverAdminRequest(
            null,
            f.License,
            "owner@clinic.test",
            "New-Strong-Pass-123!",
            null);

        var outcome = await f.Service.RecoverAdminAsync(request);

        outcome.Ok.Should().BeFalse();
        outcome.Failure.Should().Be(AuthFailure.NotFound);
        outcome.Message.Should().Contain("No staff member matching this email address was found");
    }

    // =========================================================================
    // Edge Case 5: StaffAccessCache.Invalidate invocation
    // =========================================================================

    [Fact]
    public async Task RecoverAdmin_InvokesStaffAccessCacheInvalidate_WithExactStaffId()
    {
        var f = await CreateAsync();
        await f.Service.BootstrapAsync(Bootstrap(f));

        var admin = await f.Db.StaffMembers.SingleAsync();

        var request = new RecoverAdminRequest(
            null,
            f.License,
            "owner@clinic.test",
            "New-Strong-Pass-123!",
            null);

        var outcome = await f.Service.RecoverAdminAsync(request);

        outcome.Ok.Should().BeTrue();
        f.AccessCache.Received(1).Invalidate(admin.Id);
    }

    // =========================================================================
    // Edge Case 6: Email Normalization and Case-Insensitivity
    // =========================================================================

    [Fact]
    public async Task RecoverAdmin_AdminEmailDifferentFromLicenseOwner_Succeeds()
    {
        var f = await CreateAsync(ownerEmail: "owner@clinic.test");
        await f.Service.BootstrapAsync(Bootstrap(f));

        // Create a second admin in the facility
        var secondAdmin = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = f.TenantId,
            ClinicId = f.ClinicId,
            FirstName = "Alice",
            LastName = "Admin",
            Email = "alice.admin@clinic.test",
            Role = StaffRole.Admin,
            IsActive = true,
            PasswordHash = new FacilityPasswordHasher().Hash("AliceOldPass123!"),
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "test"
        };
        f.Db.StaffMembers.Add(secondAdmin);
        await f.Db.SaveChangesAsync();

        var request = new RecoverAdminRequest(
            null,
            f.License, // signed for owner@clinic.test
            "alice.admin@clinic.test",
            "AliceNewPass123!",
            "workstation-alice");

        var outcome = await f.Service.RecoverAdminAsync(request);

        outcome.Ok.Should().BeTrue(outcome.Message);
        outcome.Tokens!.User.Email.Should().Be("alice.admin@clinic.test");

        var login = await f.Service.LoginAsync(new LoginRequest(null, "alice.admin@clinic.test", "AliceNewPass123!", null));
        login.Ok.Should().BeTrue();
    }

    [Fact]
    public async Task RecoverAdmin_DoctorEmailSpecifiedWithValidLicense_IsBlocked()
    {
        var f = await CreateAsync(ownerEmail: "owner@clinic.test");
        await f.Service.BootstrapAsync(Bootstrap(f));

        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = f.TenantId,
            ClinicId = f.ClinicId,
            FirstName = "Dr. Stephen",
            LastName = "Strange",
            Email = "doctor.strange@clinic.test",
            Role = StaffRole.Doctor,
            IsActive = true,
            PasswordHash = new FacilityPasswordHasher().Hash("DoctorPass123!"),
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "test"
        };
        f.Db.StaffMembers.Add(doctor);
        await f.Db.SaveChangesAsync();

        var request = new RecoverAdminRequest(
            null,
            f.License,
            "doctor.strange@clinic.test",
            "AttackerPass123!",
            null);

        var outcome = await f.Service.RecoverAdminAsync(request);

        outcome.Ok.Should().BeFalse();
        outcome.Failure.Should().Be(AuthFailure.InvalidRequest);
        outcome.Message.Should().Be("Only clinic administrator accounts can be recovered using the facility license key.");
    }

    [Fact]
    public async Task RecoverAdmin_WorkspaceNotFound_WhenFacilityIdNotMatchingAndWorkspaceNotFound()
    {
        var f = await CreateAsync();
        await f.Service.BootstrapAsync(Bootstrap(f));

        // Sign a license with a random clinic ID that doesn't exist on this server
        var nonExistentClinicId = Guid.NewGuid();
        var nonExistentLicense = SignLicense(nonExistentClinicId, "non-existent-tenant", "admin@nonexistent.test");

        var request = new RecoverAdminRequest(
            "unknown-workspace-slug",
            nonExistentLicense,
            "admin@nonexistent.test",
            "NewPass123!",
            null);

        var outcome = await f.Service.RecoverAdminAsync(request);

        outcome.Ok.Should().BeFalse();
        outcome.Failure.Should().Be(AuthFailure.WorkspaceNotFound);
    }
}
