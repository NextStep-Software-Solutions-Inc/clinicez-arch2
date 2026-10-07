using System;
using System.Linq;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Auth;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Licensing;
using ClinicEz.Shared.LocalAuth;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class ClinicAuthServiceTests
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
        var clinicContext = Substitute.For<IClinicContext>();
        var (db, _, _) = TestDbHelper.CreateTestContext(clinicContext);

        var clinicId = Guid.NewGuid();
        var tenantId = Guid.NewGuid().ToString();
        var license = SignLicense(clinicId, tenantId, ownerEmail, "Olivia Owner");

        if (withSettings)
        {
            db.ClinicSettings.Add(new ClinicSettings
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

    private static BootstrapRequest Bootstrap(Fixture f, string? password = StrongPassword, string? license = null) =>
        new(null, license ?? f.License, null, password, null);

    [Fact]
    public async Task Bootstrap_CreatesAdminFromSignedOwnerEmail_AndLoginWorksOffline()
    {
        var f = await CreateAsync();

        var boot = await f.Service.BootstrapAsync(Bootstrap(f));

        boot.Ok.Should().BeTrue(boot.Message);
        boot.Tokens!.User.Role.Should().Be("Admin");
        boot.Tokens.User.Name.Should().Be("Olivia Owner");
        boot.Tokens.User.ClinicId.Should().Be(f.ClinicId);
        boot.Tokens.User.Permissions.Should().Contain("staff:manage");

        var login = await f.Service.LoginAsync(new LoginRequest(null, "OWNER@clinic.test", StrongPassword, "unit-test"));
        login.Ok.Should().BeTrue(login.Message);
        login.Tokens!.AccessToken.Should().NotBeNullOrWhiteSpace();
        login.Tokens.RefreshToken.Should().NotBe(boot.Tokens.RefreshToken);
    }

    [Fact]
    public async Task Bootstrap_WorksOnlyOnce()
    {
        var f = await CreateAsync();
        (await f.Service.BootstrapAsync(Bootstrap(f))).Ok.Should().BeTrue();

        var second = await f.Service.BootstrapAsync(Bootstrap(f));

        second.Ok.Should().BeFalse();
        second.Failure.Should().Be(AuthFailure.AlreadyBootstrapped);
    }

    [Fact]
    public async Task Bootstrap_RejectsLicenseThatIsNotTheInstalledOne()
    {
        var f = await CreateAsync();
        var foreign = SignLicense(Guid.NewGuid(), Guid.NewGuid().ToString(), "attacker@evil.test");

        var result = await f.Service.BootstrapAsync(Bootstrap(f, license: foreign));

        result.Ok.Should().BeFalse();
        result.Failure.Should().Be(AuthFailure.InvalidCredentials);
        (await f.Db.StaffMembers.AnyAsync()).Should().BeFalse();
    }

    [Fact]
    public async Task Bootstrap_RejectsTamperedLicense()
    {
        var f = await CreateAsync();
        var settings = await f.Db.ClinicSettings.SingleAsync();
        var tampered = settings.LicenseToken![..^4] + "AAAA";
        settings.LicenseToken = tampered;
        await f.Db.SaveChangesAsync();

        var result = await f.Service.BootstrapAsync(Bootstrap(f, license: tampered));

        result.Ok.Should().BeFalse();
        result.Failure.Should().Be(AuthFailure.LicenseTampered);
    }

    [Theory]
    [InlineData("short1")]
    [InlineData("alllettersnodigits")]
    [InlineData("12345678901234")]
    public async Task Bootstrap_RejectsWeakPasswords(string password)
    {
        var f = await CreateAsync();

        var result = await f.Service.BootstrapAsync(Bootstrap(f, password));

        result.Ok.Should().BeFalse();
        result.Failure.Should().Be(AuthFailure.WeakPassword);
    }

    [Fact]
    public async Task Bootstrap_FailsWhenWorkspaceIsNotActivated()
    {
        var f = await CreateAsync(withSettings: false);

        var result = await f.Service.BootstrapAsync(Bootstrap(f));

        result.Ok.Should().BeFalse();
        result.Failure.Should().Be(AuthFailure.WorkspaceNotFound);
    }

    [Fact]
    public async Task Status_ReportsBootstrapRequiredUntilAdminExists()
    {
        var f = await CreateAsync();

        (await f.Service.GetStatusAsync(null)).RequiresBootstrap.Should().BeTrue();
        await f.Service.BootstrapAsync(Bootstrap(f));
        var after = await f.Service.GetStatusAsync(null);

        after.WorkspaceFound.Should().BeTrue();
        after.LicenseStatus.Should().Be("Active");
        after.RequiresBootstrap.Should().BeFalse();
    }

    [Fact]
    public async Task Login_UnknownUserAndWrongPassword_ReturnTheSameGenericFailure()
    {
        var f = await CreateAsync();
        await f.Service.BootstrapAsync(Bootstrap(f));

        var unknown = await f.Service.LoginAsync(new LoginRequest(null, "nobody@clinic.test", StrongPassword, null));
        var wrong = await f.Service.LoginAsync(new LoginRequest(null, "owner@clinic.test", "Wrong-Password-1", null));

        unknown.Failure.Should().Be(AuthFailure.InvalidCredentials);
        wrong.Failure.Should().Be(AuthFailure.InvalidCredentials);
        unknown.Message.Should().Be(wrong.Message);
    }

    [Fact]
    public async Task Login_LocksAccountAfterRepeatedFailures()
    {
        var f = await CreateAsync();
        await f.Service.BootstrapAsync(Bootstrap(f));

        for (var i = 0; i < f.Tokens.Options.MaxFailedLoginAttempts; i++)
        {
            (await f.Service.LoginAsync(new LoginRequest(null, "owner@clinic.test", "Wrong-Password-1", null)))
                .Failure.Should().Be(AuthFailure.InvalidCredentials);
        }

        // Even the correct password is refused while locked out.
        var locked = await f.Service.LoginAsync(new LoginRequest(null, "owner@clinic.test", StrongPassword, null));
        locked.Ok.Should().BeFalse();
        locked.Failure.Should().Be(AuthFailure.AccountLocked);
    }

    [Fact]
    public async Task Login_RejectsDeactivatedStaff()
    {
        var f = await CreateAsync();
        await f.Service.BootstrapAsync(Bootstrap(f));
        var admin = await f.Db.StaffMembers.SingleAsync();
        admin.IsActive = false;
        await f.Db.SaveChangesAsync();

        var result = await f.Service.LoginAsync(new LoginRequest(null, "owner@clinic.test", StrongPassword, null));

        result.Ok.Should().BeFalse();
        result.Failure.Should().Be(AuthFailure.InvalidCredentials);
    }

    [Fact]
    public async Task Refresh_RotatesTokens_AndReuseOfOldTokenRevokesTheWholeFamily()
    {
        var f = await CreateAsync();
        var first = (await f.Service.BootstrapAsync(Bootstrap(f))).Tokens!;

        var rotated = await f.Service.RefreshAsync(first.RefreshToken);
        rotated.Ok.Should().BeTrue(rotated.Message);
        rotated.Tokens!.RefreshToken.Should().NotBe(first.RefreshToken);

        // Replaying the already-rotated token is treated as theft.
        var replay = await f.Service.RefreshAsync(first.RefreshToken);
        replay.Ok.Should().BeFalse();

        // ...and kills the descendant token too.
        var descendant = await f.Service.RefreshAsync(rotated.Tokens.RefreshToken);
        descendant.Ok.Should().BeFalse();
    }

    [Fact]
    public async Task Logout_RevokesTheSession()
    {
        var f = await CreateAsync();
        var tokens = (await f.Service.BootstrapAsync(Bootstrap(f))).Tokens!;

        await f.Service.LogoutAsync(tokens.RefreshToken);

        (await f.Service.RefreshAsync(tokens.RefreshToken)).Ok.Should().BeFalse();
    }

    [Fact]
    public async Task Refresh_RejectsUnknownAndExpiredTokens()
    {
        var f = await CreateAsync();
        var tokens = (await f.Service.BootstrapAsync(Bootstrap(f))).Tokens!;

        (await f.Service.RefreshAsync("not-a-real-token")).Ok.Should().BeFalse();

        var stored = await f.Db.RefreshTokens.SingleAsync();
        stored.ExpiresAt = DateTime.UtcNow.AddMinutes(-1);
        await f.Db.SaveChangesAsync();
        (await f.Service.RefreshAsync(tokens.RefreshToken)).Ok.Should().BeFalse();
    }

    [Fact]
    public async Task AdminTemporaryPassword_ForcesChange_AndRevokesPreviousSessions()
    {
        var f = await CreateAsync();
        await f.Service.BootstrapAsync(Bootstrap(f));

        var nurse = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = f.TenantId,
            ClinicId = f.ClinicId,
            FirstName = "Nina",
            LastName = "Nurse",
            Email = "nina@clinic.test",
            Role = StaffRole.Nurse,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "test"
        };
        f.Db.StaffMembers.Add(nurse);
        await f.Db.SaveChangesAsync();

        (await f.Service.SetTemporaryPasswordAsync(nurse.Id, "Temp-Pass-12345")).Ok.Should().BeTrue();
        f.AccessCache.Received().Invalidate(nurse.Id);

        var login = await f.Service.LoginAsync(new LoginRequest(null, "nina@clinic.test", "Temp-Pass-12345", null));
        login.Ok.Should().BeTrue(login.Message);
        login.Tokens!.User.MustChangePassword.Should().BeTrue();
        login.Tokens.User.Permissions.Should().BeEmpty("a nurse with no clinic role has no permissions");

        var changed = await f.Service.ChangePasswordAsync(nurse.Id, new ChangePasswordRequest("Temp-Pass-12345", "Brand-New-Pass-99"), null);
        changed.Ok.Should().BeTrue(changed.Message);
        changed.Tokens!.User.MustChangePassword.Should().BeFalse();

        // The pre-change session cannot be refreshed any more.
        (await f.Service.RefreshAsync(login.Tokens.RefreshToken)).Ok.Should().BeFalse();
        (await f.Service.LoginAsync(new LoginRequest(null, "nina@clinic.test", "Temp-Pass-12345", null))).Ok.Should().BeFalse();
        (await f.Service.LoginAsync(new LoginRequest(null, "nina@clinic.test", "Brand-New-Pass-99", null))).Ok.Should().BeTrue();
    }

    [Fact]
    public async Task ChangePassword_RequiresCurrentPassword_AndStrongNewOne()
    {
        var f = await CreateAsync();
        var admin = (await f.Service.BootstrapAsync(Bootstrap(f))).Tokens!.User;

        (await f.Service.ChangePasswordAsync(admin.Id, new ChangePasswordRequest("nope", "Another-Strong-1"), null))
            .Failure.Should().Be(AuthFailure.InvalidCredentials);
        (await f.Service.ChangePasswordAsync(admin.Id, new ChangePasswordRequest(StrongPassword, "weak"), null))
            .Failure.Should().Be(AuthFailure.WeakPassword);
        (await f.Service.ChangePasswordAsync(admin.Id, new ChangePasswordRequest(StrongPassword, StrongPassword), null))
            .Failure.Should().Be(AuthFailure.WeakPassword);
    }

    [Fact]
    public async Task RevokeSessions_BumpsTokenVersion_AndInvalidatesRefreshTokens()
    {
        var f = await CreateAsync();
        var tokens = (await f.Service.BootstrapAsync(Bootstrap(f))).Tokens!;
        var before = (await f.Db.StaffMembers.SingleAsync()).TokenVersion;

        (await f.Service.RevokeSessionsAsync(tokens.User.Id)).Should().BeTrue();

        (await f.Db.StaffMembers.SingleAsync()).TokenVersion.Should().Be(before + 1);
        (await f.Service.RefreshAsync(tokens.RefreshToken)).Ok.Should().BeFalse();
        f.AccessCache.Received().Invalidate(tokens.User.Id);
    }

    [Fact]
    public async Task ExpiredLicense_StillAllowsSignIn_ButTamperedLicenseDoesNot()
    {
        var f = await CreateAsync();
        await f.Service.BootstrapAsync(Bootstrap(f));

        var settings = await f.Db.ClinicSettings.SingleAsync();
        settings.LicenseToken = SignLicense(f.ClinicId, f.TenantId, "owner@clinic.test", expires: DateTime.UtcNow.AddDays(-2));
        await f.Db.SaveChangesAsync();
        (await f.Service.LoginAsync(new LoginRequest(null, "owner@clinic.test", StrongPassword, null))).Ok
            .Should().BeTrue("an expired license runs the clinic in read-only grace mode instead of locking staff out");

        settings.LicenseToken = settings.LicenseToken![..^4] + "AAAA";
        await f.Db.SaveChangesAsync();
        (await f.Service.LoginAsync(new LoginRequest(null, "owner@clinic.test", StrongPassword, null))).Failure
            .Should().Be(AuthFailure.LicenseTampered);
    }
}
