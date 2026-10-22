using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Auth;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Licensing;
using ClinicEz.Shared.LocalAuth;
using ClinicEz.Shared.Security.Turnstile;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Settings;

public class TurnstileClinicAuthTests
{
    private const string StrongPassword = "Sup3rSecret-Pass!";

    private static string SignLicense(Guid clinicId, string tenantId, string? ownerEmail) =>
        new FacilityLicenseSigner().SignLicense(new FacilityLicensePayload
        {
            FacilityId = clinicId,
            TenantId = tenantId,
            TenantSlug = "test-clinic",
            FacilityName = "Test Clinic",
            FacilityType = "Clinic",
            OwnerEmail = ownerEmail,
            PlanTier = "Community",
            Limits = PlanTierDefaults.GetLimitsForTier("Community"),
            EnabledFeatures = PlanTierDefaults.GetFeaturesForTier("Community"),
            IssuedAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddYears(1)
        });

    private static async Task<(ClinicAuthService Service, ApplicationDbContext Db, Guid ClinicId, string Email)> CreateAuthHarnessAsync(
        bool clinicTurnstileEnabled,
        Dictionary<string, string?>? envSettings = null)
    {
        var clinicId = Guid.NewGuid();
        var tenantId = Guid.NewGuid().ToString();
        var email = "doctor@clinic.test";

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);
        var (db, _, _) = TestDbHelper.CreateTestContext(clinicContext);

        var license = SignLicense(clinicId, tenantId, email);

        db.ClinicSettings.Add(new ClinicSettings
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            ClinicName = "Test Clinic",
            LicenseToken = license,
            TurnstileEnabled = clinicTurnstileEnabled,
            TurnstileSiteKey = "clinic-site-key-123",
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "test"
        });

        var hasher = new FacilityPasswordHasher();
        db.StaffMembers.Add(new StaffMember
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            FirstName = "Dan",
            LastName = "Doctor",
            Email = email,
            PasswordHash = hasher.Hash(StrongPassword),
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = "test"
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

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(envSettings ?? new Dictionary<string, string?>())
            .Build();

        var tenantLookup = Substitute.For<ITenantLookupService>();
        var accessCache = Substitute.For<IStaffAccessCache>();
        var workspaces = new WorkspaceResolver(db, tenantLookup, config, NullLogger<WorkspaceResolver>.Instance);
        var resolver = new TurnstileSettingResolver(config);

        var hostEnv = Substitute.For<IHostEnvironment>();
        hostEnv.EnvironmentName.Returns("Development");

        var turnstileValidator = Substitute.For<ITurnstileValidator>();
        turnstileValidator.ValidateAsync(Arg.Any<string?>(), Arg.Any<string?>(), Arg.Any<CancellationToken>())
            .Returns(callInfo =>
            {
                var token = callInfo.ArgAt<string?>(0);
                if (string.IsNullOrWhiteSpace(token)) return Task.FromResult(false);
                if (token.Equals("LOCAL-OFFLINE-BYPASS", StringComparison.OrdinalIgnoreCase) ||
                    token.Equals("valid-turnstile-token", StringComparison.OrdinalIgnoreCase))
                {
                    return Task.FromResult(true);
                }
                return Task.FromResult(false);
            });

        var service = new ClinicAuthService(
            db,
            workspaces,
            new FacilityLicenseValidator(),
            tokens,
            hasher,
            accessCache,
            NullLogger<ClinicAuthService>.Instance,
            resolver,
            turnstileValidator);

        return (service, db, clinicId, email);
    }

    [Fact]
    public async Task Login_WhenTurnstileDisabledInSettings_SucceedsWithoutTurnstileToken()
    {
        var (service, _, clinicId, email) = await CreateAuthHarnessAsync(clinicTurnstileEnabled: false);

        var outcome = await service.LoginAsync(new LoginRequest(clinicId.ToString(), email, StrongPassword, "web-workstation"));

        outcome.Ok.Should().BeTrue();
        outcome.Tokens.Should().NotBeNull();
        outcome.Failure.Should().Be(AuthFailure.None);
    }

    [Fact]
    public async Task Login_WhenTurnstileEnabledInSettings_FailsWithoutToken()
    {
        var (service, _, clinicId, email) = await CreateAuthHarnessAsync(clinicTurnstileEnabled: true);

        var outcome = await service.LoginAsync(new LoginRequest(clinicId.ToString(), email, StrongPassword, "web-workstation"));

        outcome.Ok.Should().BeFalse();
        outcome.Failure.Should().Be(AuthFailure.BotChallengeFailed);
        outcome.Message.Should().Contain("bot challenge");
    }

    [Fact]
    public async Task Login_WhenTurnstileEnabledInSettings_SucceedsWithValidTokenOrOfflineBypass()
    {
        var (service, _, clinicId, email) = await CreateAuthHarnessAsync(clinicTurnstileEnabled: true);

        // Valid turnstile token
        var validOutcome = await service.LoginAsync(new LoginRequest(clinicId.ToString(), email, StrongPassword, "web-workstation", "valid-turnstile-token"));
        validOutcome.Ok.Should().BeTrue();

        // Offline bypass token (for spotty LAN / WAN dropouts)
        var bypassOutcome = await service.LoginAsync(new LoginRequest(clinicId.ToString(), email, StrongPassword, "web-workstation", "LOCAL-OFFLINE-BYPASS"));
        bypassOutcome.Ok.Should().BeTrue();
    }

    [Fact]
    public async Task Login_WhenTurnstileEnabledOverriddenByEnvironment_ForcesChallengeRegardlessOfClinicSetting()
    {
        // Clinic setting is false, but environment sets TURNSTILE_ENABLED = true (Cloud SaaS host)
        var env = new Dictionary<string, string?> { ["TURNSTILE_ENABLED"] = "true" };
        var (service, _, clinicId, email) = await CreateAuthHarnessAsync(clinicTurnstileEnabled: false, envSettings: env);

        var outcomeWithoutToken = await service.LoginAsync(new LoginRequest(clinicId.ToString(), email, StrongPassword, "web-workstation"));
        outcomeWithoutToken.Ok.Should().BeFalse();
        outcomeWithoutToken.Failure.Should().Be(AuthFailure.BotChallengeFailed);

        var outcomeWithToken = await service.LoginAsync(new LoginRequest(clinicId.ToString(), email, StrongPassword, "web-workstation", "valid-turnstile-token"));
        outcomeWithToken.Ok.Should().BeTrue();
    }

    [Fact]
    public async Task Login_WhenTurnstileDisabledOverriddenByEnvironment_BypassesChallengeRegardlessOfClinicSetting()
    {
        // Clinic setting is true, but environment sets TURNSTILE_ENABLED = false (Air-gapped on-premise)
        var env = new Dictionary<string, string?> { ["TURNSTILE_ENABLED"] = "false" };
        var (service, _, clinicId, email) = await CreateAuthHarnessAsync(clinicTurnstileEnabled: true, envSettings: env);

        var outcome = await service.LoginAsync(new LoginRequest(clinicId.ToString(), email, StrongPassword, "web-workstation"));
        outcome.Ok.Should().BeTrue();
        outcome.Failure.Should().Be(AuthFailure.None);
    }

    [Fact]
    public async Task GetStatus_ReportsTurnstileStatusAndSiteKey()
    {
        var (service, _, clinicId, _) = await CreateAuthHarnessAsync(clinicTurnstileEnabled: true);

        var status = await service.GetStatusAsync(clinicId.ToString());

        status.WorkspaceFound.Should().BeTrue();
        status.TurnstileEnabled.Should().BeTrue();
        status.TurnstileSiteKey.Should().Be("clinic-site-key-123");
    }
}
