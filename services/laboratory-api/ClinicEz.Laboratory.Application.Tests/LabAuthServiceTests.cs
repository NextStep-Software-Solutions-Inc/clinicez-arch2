using System;
using System.Linq;
using System.Security.Cryptography;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Laboratory.Infrastructure.Auth;
using ClinicEz.Laboratory.Infrastructure.Persistence;
using ClinicEz.Shared.Licensing;
using ClinicEz.Shared.LocalAuth;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using NSubstitute;
using Xunit;

namespace ClinicEz.Laboratory.Application.Tests;

public class LabAuthServiceTests
{
    private const string StrongPassword = "Sup3rSecret-Pass!";

    private sealed class Fixture
    {
        public required ApplicationDbContext Db { get; init; }
        public required LabAuthService Service { get; init; }
        public required IFacilityTokenService Tokens { get; init; }
        public required Guid LaboratoryId { get; init; }
        public required string TenantId { get; init; }
        public required string License { get; init; }
        public required IStaffAccessCache AccessCache { get; init; }
    }

    private static string SignLicense(Guid laboratoryId, string tenantId, string? ownerEmail, string? ownerName = null, DateTime? expires = null) =>
        new FacilityLicenseSigner().SignLicense(new FacilityLicensePayload
        {
            FacilityId = laboratoryId,
            TenantId = tenantId,
            TenantSlug = "test-lab",
            FacilityName = "Test Laboratory",
            FacilityType = "Laboratory",
            OwnerEmail = ownerEmail,
            OwnerName = ownerName,
            PlanTier = "Community",
            Limits = PlanTierDefaults.GetLimitsForTier("Community"),
            EnabledFeatures = PlanTierDefaults.GetFeaturesForTier("Community"),
            IssuedAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = expires ?? DateTime.UtcNow.AddYears(1)
        });

    private static async Task<Fixture> CreateAsync(string? ownerEmail = "owner@lab.test", bool withSettings = true)
    {
        var (db, _, _) = LabTestDbHelper.CreateTestContext();

        var laboratoryId = Guid.NewGuid();
        var tenantId = Guid.NewGuid().ToString();
        var license = SignLicense(laboratoryId, tenantId, ownerEmail, "Olivia Owner");

        if (withSettings)
        {
            db.LabSettings.Add(new LabSettings
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                LaboratoryId = laboratoryId,
                LaboratoryName = "Test Laboratory",
                LicenseToken = license,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "test"
            });
            await db.SaveChangesAsync();
        }

        var tokens = new FacilityTokenService(
            Options.Create(new FacilityJwtOptions
            {
                Issuer = "clinicez-lab",
                Audience = "clinicez-lab",
                SigningKey = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64))
            }),
            NullLogger<FacilityTokenService>.Instance);

        var accessCache = Substitute.For<IStaffAccessCache>();
        var workspaces = new WorkspaceResolver(db, new ConfigurationBuilder().Build());
        var service = new LabAuthService(
            db,
            workspaces,
            new FacilityLicenseValidator(),
            tokens,
            new FacilityPasswordHasher(),
            accessCache,
            NullLogger<LabAuthService>.Instance);

        return new Fixture
        {
            Db = db,
            Service = service,
            Tokens = tokens,
            LaboratoryId = laboratoryId,
            TenantId = tenantId,
            License = license,
            AccessCache = accessCache
        };
    }

    private static BootstrapRequest Bootstrap(Fixture f, string? password = StrongPassword, string? license = null) =>
        new(null, license ?? f.License, null, password, null);

    private static LabStaffMember NewStaff(Fixture f, string email, LabStaffRole role = LabStaffRole.MedicalTechnologist) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = f.TenantId,
        LaboratoryId = f.LaboratoryId,
        FirstName = "Mia",
        LastName = "Medtech",
        Email = email,
        Role = role,
        IsActive = true,
        CreatedAt = DateTime.UtcNow,
        CreatedBy = "test"
    };

    [Fact]
    public async Task Bootstrap_CreatesAdminFromSignedOwnerEmail_AndLoginWorksOffline()
    {
        var f = await CreateAsync();

        var boot = await f.Service.BootstrapAsync(Bootstrap(f));

        boot.Ok.Should().BeTrue(boot.Message);
        boot.Tokens!.User.Role.Should().Be("LabAdmin");
        boot.Tokens.User.Name.Should().Be("Olivia Owner");
        boot.Tokens.User.LaboratoryId.Should().Be(f.LaboratoryId);
        boot.Tokens.User.Permissions.Should().Contain("staff:manage").And.Contain("reports:verify");

        var login = await f.Service.LoginAsync(new LoginRequest(null, "OWNER@lab.test", StrongPassword, "unit-test"));
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
        (await f.Db.LabStaffMembers.AnyAsync()).Should().BeFalse();
    }

    [Fact]
    public async Task Bootstrap_RequiresALicenseKey()
    {
        var f = await CreateAsync();

        var result = await f.Service.BootstrapAsync(Bootstrap(f, license: " "));

        result.Ok.Should().BeFalse();
        result.Failure.Should().Be(AuthFailure.InvalidRequest);
    }

    [Fact]
    public async Task Bootstrap_RejectsTamperedLicense()
    {
        var f = await CreateAsync();
        var settings = await f.Db.LabSettings.SingleAsync();
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
        after.LaboratoryName.Should().Be("Test Laboratory");
    }

    [Fact]
    public async Task Login_UnknownUserAndWrongPassword_ReturnTheSameGenericFailure()
    {
        var f = await CreateAsync();
        await f.Service.BootstrapAsync(Bootstrap(f));

        var unknown = await f.Service.LoginAsync(new LoginRequest(null, "nobody@lab.test", StrongPassword, null));
        var wrong = await f.Service.LoginAsync(new LoginRequest(null, "owner@lab.test", "Wrong-Password-1", null));

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
            (await f.Service.LoginAsync(new LoginRequest(null, "owner@lab.test", "Wrong-Password-1", null)))
                .Failure.Should().Be(AuthFailure.InvalidCredentials);
        }

        // Even the correct password is refused while locked out.
        var locked = await f.Service.LoginAsync(new LoginRequest(null, "owner@lab.test", StrongPassword, null));
        locked.Ok.Should().BeFalse();
        locked.Failure.Should().Be(AuthFailure.AccountLocked);
    }

    [Fact]
    public async Task Login_RejectsDeactivatedStaff()
    {
        var f = await CreateAsync();
        await f.Service.BootstrapAsync(Bootstrap(f));
        var admin = await f.Db.LabStaffMembers.SingleAsync();
        admin.IsActive = false;
        await f.Db.SaveChangesAsync();

        var result = await f.Service.LoginAsync(new LoginRequest(null, "owner@lab.test", StrongPassword, null));

        result.Ok.Should().BeFalse();
        result.Failure.Should().Be(AuthFailure.InvalidCredentials);
    }

    [Fact]
    public async Task Login_BeforeBootstrapAndWithoutLicense_IsRefused()
    {
        var f = await CreateAsync();
        var settings = await f.Db.LabSettings.SingleAsync();
        settings.LicenseToken = null;
        await f.Db.SaveChangesAsync();

        var result = await f.Service.LoginAsync(new LoginRequest(null, "owner@lab.test", StrongPassword, null));

        result.Ok.Should().BeFalse();
        result.Failure.Should().Be(AuthFailure.ActivationRequired);
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

        var stored = await f.Db.LabRefreshTokens.SingleAsync();
        stored.ExpiresAt = DateTime.UtcNow.AddMinutes(-1);
        await f.Db.SaveChangesAsync();
        (await f.Service.RefreshAsync(tokens.RefreshToken)).Ok.Should().BeFalse();
    }

    [Fact]
    public async Task RefreshTokens_AreStoredHashedOnly()
    {
        var f = await CreateAsync();
        var tokens = (await f.Service.BootstrapAsync(Bootstrap(f))).Tokens!;

        var stored = await f.Db.LabRefreshTokens.SingleAsync();

        stored.TokenHash.Should().NotBe(tokens.RefreshToken).And.Be(f.Tokens.HashRefreshToken(tokens.RefreshToken));
    }

    [Fact]
    public async Task AdminTemporaryPassword_ForcesChange_AndRevokesPreviousSessions()
    {
        var f = await CreateAsync();
        await f.Service.BootstrapAsync(Bootstrap(f));

        var medtech = NewStaff(f, "mia@lab.test");
        f.Db.LabStaffMembers.Add(medtech);
        await f.Db.SaveChangesAsync();

        (await f.Service.SetTemporaryPasswordAsync(medtech.Id, f.LaboratoryId, "Temp-Pass-12345")).Ok.Should().BeTrue();
        f.AccessCache.Received().Invalidate(medtech.Id);

        var login = await f.Service.LoginAsync(new LoginRequest(null, "mia@lab.test", "Temp-Pass-12345", null));
        login.Ok.Should().BeTrue(login.Message);
        login.Tokens!.User.MustChangePassword.Should().BeTrue();
        login.Tokens.User.Permissions.Should().Contain("results:write").And.NotContain("reports:verify");

        var changed = await f.Service.ChangePasswordAsync(medtech.Id, new ChangePasswordRequest("Temp-Pass-12345", "Brand-New-Pass-99"), null);
        changed.Ok.Should().BeTrue(changed.Message);
        changed.Tokens!.User.MustChangePassword.Should().BeFalse();

        // The pre-change session cannot be refreshed any more.
        (await f.Service.RefreshAsync(login.Tokens.RefreshToken)).Ok.Should().BeFalse();
        (await f.Service.LoginAsync(new LoginRequest(null, "mia@lab.test", "Temp-Pass-12345", null))).Ok.Should().BeFalse();
        (await f.Service.LoginAsync(new LoginRequest(null, "mia@lab.test", "Brand-New-Pass-99", null))).Ok.Should().BeTrue();
    }

    [Fact]
    public async Task AdminCannotManageStaffOfAnotherLaboratory()
    {
        var f = await CreateAsync();
        await f.Service.BootstrapAsync(Bootstrap(f));
        var medtech = NewStaff(f, "mia@lab.test");
        f.Db.LabStaffMembers.Add(medtech);
        await f.Db.SaveChangesAsync();

        var otherLab = Guid.NewGuid();

        (await f.Service.SetTemporaryPasswordAsync(medtech.Id, otherLab, "Temp-Pass-12345")).Failure.Should().Be(AuthFailure.NotFound);
        (await f.Service.RevokeSessionsAsync(medtech.Id, otherLab)).Should().BeFalse();
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
        var before = (await f.Db.LabStaffMembers.SingleAsync()).TokenVersion;

        (await f.Service.RevokeSessionsAsync(tokens.User.Id, f.LaboratoryId)).Should().BeTrue();

        (await f.Db.LabStaffMembers.SingleAsync()).TokenVersion.Should().Be(before + 1);
        (await f.Service.RefreshAsync(tokens.RefreshToken)).Ok.Should().BeFalse();
        f.AccessCache.Received().Invalidate(tokens.User.Id);
    }

    [Fact]
    public async Task ExpiredLicense_StillAllowsSignIn_ButTamperedLicenseDoesNot()
    {
        var f = await CreateAsync();
        await f.Service.BootstrapAsync(Bootstrap(f));

        var settings = await f.Db.LabSettings.SingleAsync();
        settings.LicenseToken = SignLicense(f.LaboratoryId, f.TenantId, "owner@lab.test", expires: DateTime.UtcNow.AddDays(-2));
        await f.Db.SaveChangesAsync();
        (await f.Service.LoginAsync(new LoginRequest(null, "owner@lab.test", StrongPassword, null))).Ok
            .Should().BeTrue("an expired license runs the laboratory in read-only grace mode instead of locking staff out");

        settings.LicenseToken = settings.LicenseToken![..^4] + "AAAA";
        await f.Db.SaveChangesAsync();
        (await f.Service.LoginAsync(new LoginRequest(null, "owner@lab.test", StrongPassword, null))).Failure
            .Should().Be(AuthFailure.LicenseTampered);
    }

    [Fact]
    public async Task IssuedAccessToken_CarriesLaboratoryScope_AndIsBoundToTheLabAudience()
    {
        var f = await CreateAsync();
        var tokens = (await f.Service.BootstrapAsync(Bootstrap(f))).Tokens!;

        var jwt = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler().ReadJwtToken(tokens.AccessToken);

        jwt.Audiences.Should().ContainSingle().Which.Should().Be("clinicez-lab");
        jwt.Issuer.Should().Be("clinicez-lab");
        jwt.Claims.Single(c => c.Type == "laboratory_id").Value.Should().Be(f.LaboratoryId.ToString());
        jwt.Claims.Single(c => c.Type == "tenant_id").Value.Should().Be(f.TenantId);
        jwt.Claims.Should().NotContain(c => c.Type == "permission", "permissions are resolved from the database on every request");
    }
}
