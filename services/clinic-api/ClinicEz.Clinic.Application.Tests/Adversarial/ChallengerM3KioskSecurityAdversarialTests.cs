using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Claims;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Kiosk.Commands;
using ClinicEz.Clinic.Application.Features.Kiosk.DTOs;
using ClinicEz.Clinic.Application.Features.Kiosk.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Auth;
using ClinicEz.Clinic.Infrastructure.Context;
using ClinicEz.Shared.LocalAuth;
using FluentAssertions;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Adversarial Security Verification Suite for Milestone M3 Kiosk Security & Policy Isolation.
/// Stress-tests:
/// 1. Kiosk token lifecycle: minting, claims structure, expiry bounds, revocation.
/// 2. KioskAccessCache: DB query caching and invalidation.
/// 3. ClinicTokenEvents.OnTokenValidated: version verification, disabled intake gating, zero permissions.
/// 4. ClinicContext: kiosk isolation from staff identity, permissions stripping, tenant/clinic claim extraction.
/// 5. ClinicScopeMiddleware: header spoofing prevention (X-Clinic-Id, X-Tenant-Id) and KioskIntake policy gating.
/// </summary>
public class ChallengerM3KioskSecurityAdversarialTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant-kiosk-adversarial";

    [Fact]
    public async Task MintKioskTokenCommand_MintsValidKioskToken_WithCorrectClaimsAndVersion()
    {
        // Arrange
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.TenantId.Returns(_tenantId);

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(db, sieve);

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Security Test Clinic",
            IsKioskIntakeEnabled = false,
            KioskTokenVersion = 3
        };
        await settingsRepo.AddAsync(settings);
        await uow.SaveChangesAsync();

        var tokenService = Substitute.For<IKioskTokenService>();
        var expectedExpiry = DateTime.UtcNow.AddDays(90);
        tokenService.MintToken(_tenantId, _clinicId, 3, "Front Desk Tablet", 90)
            .Returns(("jwt-kiosk-test-token", expectedExpiry));

        var invalidator = Substitute.For<IKioskAccessInvalidator>();

        var handler = new MintKioskTokenCommandHandler(settingsRepo, clinicContext, tokenService, invalidator, uow);

        // Act
        var result = await handler.Handle(new MintKioskTokenCommand("Front Desk Tablet", 90), CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.Token.Should().Be("jwt-kiosk-test-token");
        result.ClinicId.Should().Be(_clinicId);
        result.TokenVersion.Should().Be(3);
        result.DeviceLabel.Should().Be("Front Desk Tablet");

        // Verify settings was updated to enable kiosk intake and invalidator called
        settings.IsKioskIntakeEnabled.Should().BeTrue();
        invalidator.Received(1).Invalidate(_clinicId);
    }

    [Fact]
    public async Task RevokeKioskTokenCommand_IncrementsTokenVersion_And_InvalidatesCache()
    {
        // Arrange
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.TenantId.Returns(_tenantId);

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(db, sieve);

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Security Test Clinic",
            IsKioskIntakeEnabled = true,
            KioskTokenVersion = 1
        };
        await settingsRepo.AddAsync(settings);
        await uow.SaveChangesAsync();

        var invalidator = Substitute.For<IKioskAccessInvalidator>();
        var handler = new RevokeKioskTokenCommandHandler(settingsRepo, invalidator, uow);

        // Act
        var result = await handler.Handle(new RevokeKioskTokenCommand("Compromised tablet"), CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.PreviousVersion.Should().Be(1);
        result.NewVersion.Should().Be(2);
        settings.KioskTokenVersion.Should().Be(2);
        invalidator.Received(1).Invalidate(_clinicId);
    }

    [Fact]
    public async Task GetKioskTokenStatusQuery_ReturnsAccurateSettingsState()
    {
        // Arrange
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.TenantId.Returns(_tenantId);

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(db, sieve);

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Security Test Clinic",
            IsKioskIntakeEnabled = true,
            KioskTokenVersion = 5
        };
        await settingsRepo.AddAsync(settings);
        await uow.SaveChangesAsync();

        var handler = new GetKioskTokenStatusQueryHandler(settingsRepo);

        // Act
        var result = await handler.Handle(new GetKioskTokenStatusQuery(), CancellationToken.None);

        // Assert
        result.ClinicId.Should().Be(_clinicId);
        result.IsKioskIntakeEnabled.Should().BeTrue();
        result.CurrentTokenVersion.Should().Be(5);
    }

    [Fact]
    public async Task KioskTokenService_MintsValidSignedJwt_WithMandatoryKioskClaims()
    {
        // Arrange
        var keyBytes = new byte[32];
        for (int i = 0; i < 32; i++) keyBytes[i] = (byte)(i + 1);
        var securityKey = new SymmetricSecurityKey(keyBytes);

        var tokenServiceMock = Substitute.For<IFacilityTokenService>();
        tokenServiceMock.SecurityKey.Returns(securityKey);
        tokenServiceMock.Options.Returns(new FacilityJwtOptions
        {
            Issuer = "https://test.clinicez.internal",
            Audience = "clinicez-facility-client"
        });

        var kioskTokenService = new KioskTokenService(tokenServiceMock);

        // Act
        var (token, expires) = kioskTokenService.MintToken(_tenantId, _clinicId, 2, "Kiosk Tablet A", 30);

        // Assert
        token.Should().NotBeNullOrWhiteSpace();
        expires.Should().BeAfter(DateTime.UtcNow.AddDays(29));

        var handler = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(token);

        jwt.Issuer.Should().Be("https://test.clinicez.internal");
        jwt.Audiences.Should().Contain("clinicez-facility-client");
        jwt.Claims.Should().Contain(c => c.Type == ClinicClaimTypes.TokenType && c.Value == "kiosk");
        jwt.Claims.Should().Contain(c => c.Type == ClinicClaimTypes.TenantId && c.Value == _tenantId);
        jwt.Claims.Should().Contain(c => c.Type == ClinicClaimTypes.ClinicId && c.Value == _clinicId.ToString());
        jwt.Claims.Should().Contain(c => c.Type == ClinicClaimTypes.TokenVersion && c.Value == "2");
        jwt.Claims.Should().Contain(c => c.Type == ClinicClaimTypes.Name && c.Value == "Kiosk Tablet A");
    }

    [Fact]
    public async Task OnTokenValidated_WhenKioskTokenVersionMismatch_FailsValidation()
    {
        // Arrange
        var kioskCache = Substitute.For<IKioskAccessCache>();
        // DB says version is 2, token presents version 1
        kioskCache.GetAsync(_clinicId, Arg.Any<CancellationToken>())
            .Returns(new KioskAccessInfo(IsKioskIntakeEnabled: true, KioskTokenVersion: 2));

        var services = new ServiceCollection();
        services.AddSingleton(kioskCache);
        var provider = services.BuildServiceProvider();

        var httpContext = new DefaultHttpContext { RequestServices = provider };
        var claims = new List<Claim>
        {
            new(ClinicClaimTypes.TokenType, "kiosk"),
            new(ClinicClaimTypes.ClinicId, _clinicId.ToString()),
            new(ClinicClaimTypes.TokenVersion, "1")
        };
        var identity = new ClaimsIdentity(claims, "Bearer");
        var principal = new ClaimsPrincipal(identity);

        var scheme = new AuthenticationScheme("Bearer", "Bearer", typeof(JwtBearerHandler));
        var options = new JwtBearerOptions();
        var context = new TokenValidatedContext(httpContext, scheme, options)
        {
            Principal = principal
        };

        // Act
        await ClinicTokenEvents.OnTokenValidated(context);

        // Assert
        context.Result.Should().NotBeNull();
        context.Result.Failure.Should().NotBeNull();
        context.Result.Failure!.Message.Should().Contain("Kiosk session is no longer valid");
    }

    [Fact]
    public async Task OnTokenValidated_WhenKioskIntakeDisabled_FailsValidation()
    {
        // Arrange
        var kioskCache = Substitute.For<IKioskAccessCache>();
        // Intake is disabled
        kioskCache.GetAsync(_clinicId, Arg.Any<CancellationToken>())
            .Returns(new KioskAccessInfo(IsKioskIntakeEnabled: false, KioskTokenVersion: 1));

        var services = new ServiceCollection();
        services.AddSingleton(kioskCache);
        var provider = services.BuildServiceProvider();

        var httpContext = new DefaultHttpContext { RequestServices = provider };
        var claims = new List<Claim>
        {
            new(ClinicClaimTypes.TokenType, "kiosk"),
            new(ClinicClaimTypes.ClinicId, _clinicId.ToString()),
            new(ClinicClaimTypes.TokenVersion, "1")
        };
        var identity = new ClaimsIdentity(claims, "Bearer");
        var principal = new ClaimsPrincipal(identity);

        var scheme = new AuthenticationScheme("Bearer", "Bearer", typeof(JwtBearerHandler));
        var options = new JwtBearerOptions();
        var context = new TokenValidatedContext(httpContext, scheme, options)
        {
            Principal = principal
        };

        // Act
        await ClinicTokenEvents.OnTokenValidated(context);

        // Assert
        context.Result.Should().NotBeNull();
        context.Result.Failure.Should().NotBeNull();
        context.Result.Failure!.Message.Should().Contain("Kiosk session is no longer valid");
    }

    [Fact]
    public async Task OnTokenValidated_WhenValidKioskToken_GrantsZeroStaffPermissions()
    {
        // Arrange
        var kioskCache = Substitute.For<IKioskAccessCache>();
        kioskCache.GetAsync(_clinicId, Arg.Any<CancellationToken>())
            .Returns(new KioskAccessInfo(IsKioskIntakeEnabled: true, KioskTokenVersion: 1));

        var services = new ServiceCollection();
        services.AddSingleton(kioskCache);
        var provider = services.BuildServiceProvider();

        var httpContext = new DefaultHttpContext { RequestServices = provider };
        var claims = new List<Claim>
        {
            new(ClinicClaimTypes.TokenType, "kiosk"),
            new(ClinicClaimTypes.ClinicId, _clinicId.ToString()),
            new(ClinicClaimTypes.TokenVersion, "1")
        };
        var identity = new ClaimsIdentity(claims, "Bearer");
        var principal = new ClaimsPrincipal(identity);

        var scheme = new AuthenticationScheme("Bearer", "Bearer", typeof(JwtBearerHandler));
        var options = new JwtBearerOptions();
        var context = new TokenValidatedContext(httpContext, scheme, options)
        {
            Principal = principal
        };

        // Act
        await ClinicTokenEvents.OnTokenValidated(context);

        // Assert
        context.Result.Should().BeNull(); // No failure
        identity.Claims.Should().NotContain(c => c.Type == ClinicClaimTypes.Permission);
    }

    [Fact]
    public void ClinicContext_WhenCallerIsKiosk_ExtractsTenantAndClinic_And_StripsStaffIdentity()
    {
        // Arrange
        var httpAccessor = Substitute.For<IHttpContextAccessor>();
        var config = Substitute.For<IConfiguration>();

        var claims = new List<Claim>
        {
            new(ClinicClaimTypes.TokenType, "kiosk"),
            new(ClinicClaimTypes.TenantId, _tenantId),
            new(ClinicClaimTypes.ClinicId, _clinicId.ToString()),
            new(ClinicClaimTypes.Name, "Kiosk Tablet")
        };
        var user = new ClaimsPrincipal(new ClaimsIdentity(claims, "Bearer"));
        var http = new DefaultHttpContext { User = user };
        httpAccessor.HttpContext.Returns(http);

        var clinicContext = new ClinicContext(httpAccessor, config);

        // Act & Assert
        clinicContext.TenantId.Should().Be(_tenantId);
        clinicContext.ClinicId.Should().Be(_clinicId);
        clinicContext.StaffId.Should().BeNull();
        clinicContext.StaffName.Should().BeNull();
        clinicContext.Permissions.Should().BeEmpty();
        clinicContext.HasPermission(ClinicPermissions.PatientsRead).Should().BeFalse();
        clinicContext.HasPermission(ClinicPermissions.SettingsManage).Should().BeFalse();
    }

    [Fact]
    public async Task ClinicScopeMiddleware_WhenClinicHeaderSpoofed_Returns403Forbidden()
    {
        // Arrange
        var middleware = new ClinicScopeMiddleware(ctx => Task.CompletedTask);
        var workspaces = Substitute.For<IWorkspaceResolver>();

        var context = new DefaultHttpContext();
        var claims = new List<Claim>
        {
            new(ClinicClaimTypes.TokenType, "kiosk"),
            new(ClinicClaimTypes.ClinicId, _clinicId.ToString()),
            new(ClinicClaimTypes.TenantId, _tenantId)
        };
        context.User = new ClaimsPrincipal(new ClaimsIdentity(claims, "Bearer"));

        // Spoof different clinic in header
        var spoofedClinicId = Guid.NewGuid();
        context.Request.Headers["X-Clinic-Id"] = spoofedClinicId.ToString();
        context.Response.Body = new MemoryStream();

        // Act
        await middleware.InvokeAsync(context, workspaces);

        // Assert
        context.Response.StatusCode.Should().Be(StatusCodes.Status403Forbidden);
    }

    [Fact]
    public async Task ClinicScopeMiddleware_WhenTenantHeaderSpoofed_Returns403Forbidden()
    {
        // Arrange
        var middleware = new ClinicScopeMiddleware(ctx => Task.CompletedTask);
        var workspaces = Substitute.For<IWorkspaceResolver>();

        var context = new DefaultHttpContext();
        var claims = new List<Claim>
        {
            new(ClinicClaimTypes.TokenType, "kiosk"),
            new(ClinicClaimTypes.ClinicId, _clinicId.ToString()),
            new(ClinicClaimTypes.TenantId, _tenantId)
        };
        context.User = new ClaimsPrincipal(new ClaimsIdentity(claims, "Bearer"));

        // Spoof different tenant in header
        context.Request.Headers["X-Tenant-Id"] = "attacker-tenant-999";
        context.Response.Body = new MemoryStream();

        // Act
        await middleware.InvokeAsync(context, workspaces);

        // Assert
        context.Response.StatusCode.Should().Be(StatusCodes.Status403Forbidden);
    }

    [Fact]
    public async Task ClinicScopeMiddleware_WhenKioskAttemptsStaffEndpoint_Returns403Forbidden()
    {
        // Arrange
        var middleware = new ClinicScopeMiddleware(ctx => Task.CompletedTask);
        var workspaces = Substitute.For<IWorkspaceResolver>();

        var context = new DefaultHttpContext();
        var claims = new List<Claim>
        {
            new(ClinicClaimTypes.TokenType, "kiosk"),
            new(ClinicClaimTypes.ClinicId, _clinicId.ToString()),
            new(ClinicClaimTypes.TenantId, _tenantId)
        };
        context.User = new ClaimsPrincipal(new ClaimsIdentity(claims, "Bearer"));

        // Endpoint requires PatientsRead (not KioskIntake)
        var endpoint = new Endpoint(
            ctx => Task.CompletedTask,
            new EndpointMetadataCollection(new AuthorizeAttribute { Policy = "PatientsRead" }),
            "StaffEndpoint");
        context.SetEndpoint(endpoint);
        context.Response.Body = new MemoryStream();

        // Act
        await middleware.InvokeAsync(context, workspaces);

        // Assert
        context.Response.StatusCode.Should().Be(StatusCodes.Status403Forbidden);
    }

    [Fact]
    public async Task ClinicScopeMiddleware_WhenKioskCallsKioskIntakeEndpoint_AllowsExecution()
    {
        // Arrange
        var nextExecuted = false;
        var middleware = new ClinicScopeMiddleware(ctx =>
        {
            nextExecuted = true;
            return Task.CompletedTask;
        });
        var workspaces = Substitute.For<IWorkspaceResolver>();

        var context = new DefaultHttpContext();
        var claims = new List<Claim>
        {
            new(ClinicClaimTypes.TokenType, "kiosk"),
            new(ClinicClaimTypes.ClinicId, _clinicId.ToString()),
            new(ClinicClaimTypes.TenantId, _tenantId)
        };
        context.User = new ClaimsPrincipal(new ClaimsIdentity(claims, "Bearer"));

        // Endpoint requires ClinicPolicies.KioskIntake
        var endpoint = new Endpoint(
            ctx => Task.CompletedTask,
            new EndpointMetadataCollection(new AuthorizeAttribute { Policy = ClinicPolicies.KioskIntake }),
            "KioskIntakeEndpoint");
        context.SetEndpoint(endpoint);

        // Act
        await middleware.InvokeAsync(context, workspaces);

        // Assert
        nextExecuted.Should().BeTrue();
        context.Response.StatusCode.Should().Be(StatusCodes.Status200OK);
    }

    // ── EMPIRICAL ADVERSARIAL STRESS TEST SUITE (challenger_m3_1) ──

    [Theory]
    [InlineData(0, 90)]
    [InlineData(-5, 90)]
    [InlineData(366, 90)]
    [InlineData(500, 90)]
    [InlineData(1, 1)]
    [InlineData(365, 365)]
    [InlineData(null, 90)]
    public void KioskTokenService_ExpiryDaysBoundaryConditions_CapsCorrectly(int? inputDays, int expectedDays)
    {
        var keyBytes = new byte[32];
        for (int i = 0; i < 32; i++) keyBytes[i] = (byte)(i + 1);
        var securityKey = new SymmetricSecurityKey(keyBytes);

        var tokenServiceMock = Substitute.For<IFacilityTokenService>();
        tokenServiceMock.SecurityKey.Returns(securityKey);
        tokenServiceMock.Options.Returns(new FacilityJwtOptions
        {
            Issuer = "https://test.clinicez.internal",
            Audience = "clinicez-facility-client"
        });

        var kioskTokenService = new KioskTokenService(tokenServiceMock);

        var before = DateTime.UtcNow;
        var (token, expires) = kioskTokenService.MintToken(_tenantId, _clinicId, 1, null, inputDays);
        var after = DateTime.UtcNow;

        expires.Should().BeOnOrAfter(before.AddDays(expectedDays).AddSeconds(-5));
        expires.Should().BeOnOrBefore(after.AddDays(expectedDays).AddSeconds(5));
    }

    [Theory]
    [InlineData(null, "Self-Service Kiosk")]
    [InlineData("", "Self-Service Kiosk")]
    [InlineData("   ", "Self-Service Kiosk")]
    [InlineData(" Reception Desk 2 ", "Reception Desk 2")]
    public void KioskTokenService_DeviceLabelFallback_DefaultsWhenEmptyOrWhitespace(string? inputLabel, string expectedLabel)
    {
        var keyBytes = new byte[32];
        for (int i = 0; i < 32; i++) keyBytes[i] = (byte)(i + 1);
        var securityKey = new SymmetricSecurityKey(keyBytes);

        var tokenServiceMock = Substitute.For<IFacilityTokenService>();
        tokenServiceMock.SecurityKey.Returns(securityKey);
        tokenServiceMock.Options.Returns(new FacilityJwtOptions
        {
            Issuer = "https://test.clinicez.internal",
            Audience = "clinicez-facility-client"
        });

        var kioskTokenService = new KioskTokenService(tokenServiceMock);
        var (token, _) = kioskTokenService.MintToken(_tenantId, _clinicId, 1, inputLabel);

        var handler = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(token);

        jwt.Claims.First(c => c.Type == ClinicClaimTypes.Name).Value.Should().Be(expectedLabel);
    }

    [Fact]
    public void KioskTokenService_DiscrepancyProbe_EmpiricalVerificationOfClaimTypes()
    {
        var keyBytes = new byte[32];
        for (int i = 0; i < 32; i++) keyBytes[i] = (byte)(i + 1);
        var securityKey = new SymmetricSecurityKey(keyBytes);

        var tokenServiceMock = Substitute.For<IFacilityTokenService>();
        tokenServiceMock.SecurityKey.Returns(securityKey);
        tokenServiceMock.Options.Returns(new FacilityJwtOptions
        {
            Issuer = "https://test.clinicez.internal",
            Audience = "clinicez-facility-client"
        });

        var kioskTokenService = new KioskTokenService(tokenServiceMock);
        var (token, _) = kioskTokenService.MintToken(_tenantId, _clinicId, 1, "Kiosk");

        var handler = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(token);

        // Standard claims verified
        jwt.Claims.Should().Contain(c => c.Type == ClinicClaimTypes.TokenType && c.Value == "kiosk");
        jwt.Claims.Should().Contain(c => c.Type == ClinicClaimTypes.ClinicId && c.Value == _clinicId.ToString());
        jwt.Claims.Should().Contain(c => c.Type == ClinicClaimTypes.TenantId && c.Value == _tenantId);
        jwt.Claims.Should().Contain(c => c.Type == ClinicClaimTypes.TokenVersion && c.Value == "1");

        // Empirical check: claim name is "ver", NOT "kiosk_version"
        jwt.Claims.Should().NotContain(c => c.Type == "kiosk_version");

        // Empirical check: BranchId is NOT minted into token by KioskTokenService
        jwt.Claims.Should().NotContain(c => c.Type == ClinicClaimTypes.BranchId);
    }

    [Theory]
    [InlineData("not-an-int")]
    [InlineData("")]
    [InlineData(" ")]
    [InlineData("2.5")]
    public async Task OnTokenValidated_WhenTokenVersionNonNumericOrMalformed_FailsValidation(string badVersion)
    {
        var kioskCache = Substitute.For<IKioskAccessCache>();
        var services = new ServiceCollection();
        services.AddSingleton(kioskCache);
        var provider = services.BuildServiceProvider();

        var httpContext = new DefaultHttpContext { RequestServices = provider };
        var claims = new List<Claim>
        {
            new(ClinicClaimTypes.TokenType, "kiosk"),
            new(ClinicClaimTypes.ClinicId, _clinicId.ToString()),
            new(ClinicClaimTypes.TokenVersion, badVersion)
        };
        var identity = new ClaimsIdentity(claims, "Bearer");
        var principal = new ClaimsPrincipal(identity);

        var scheme = new AuthenticationScheme("Bearer", "Bearer", typeof(JwtBearerHandler));
        var options = new JwtBearerOptions();
        var context = new TokenValidatedContext(httpContext, scheme, options)
        {
            Principal = principal
        };

        await ClinicTokenEvents.OnTokenValidated(context);

        context.Result.Should().NotBeNull();
        context.Result.Failure.Should().NotBeNull();
        context.Result.Failure!.Message.Should().Contain("Malformed kiosk token claims.");
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("not-a-guid")]
    [InlineData("12345")]
    public async Task OnTokenValidated_WhenClinicIdMissingOrMalformed_FailsValidation(string? badClinicId)
    {
        var kioskCache = Substitute.For<IKioskAccessCache>();
        var services = new ServiceCollection();
        services.AddSingleton(kioskCache);
        var provider = services.BuildServiceProvider();

        var httpContext = new DefaultHttpContext { RequestServices = provider };
        var claims = new List<Claim>
        {
            new(ClinicClaimTypes.TokenType, "kiosk"),
            new(ClinicClaimTypes.TokenVersion, "1")
        };
        if (badClinicId != null)
        {
            claims.Add(new(ClinicClaimTypes.ClinicId, badClinicId));
        }
        var identity = new ClaimsIdentity(claims, "Bearer");
        var principal = new ClaimsPrincipal(identity);

        var scheme = new AuthenticationScheme("Bearer", "Bearer", typeof(JwtBearerHandler));
        var options = new JwtBearerOptions();
        var context = new TokenValidatedContext(httpContext, scheme, options)
        {
            Principal = principal
        };

        await ClinicTokenEvents.OnTokenValidated(context);

        context.Result.Should().NotBeNull();
        context.Result.Failure.Should().NotBeNull();
        context.Result.Failure!.Message.Should().Contain("Malformed kiosk token claims.");
    }

    [Fact]
    public async Task OnTokenValidated_WhenSettingsRowMissingFromDatabase_FailsValidation()
    {
        var kioskCache = Substitute.For<IKioskAccessCache>();
        kioskCache.GetAsync(_clinicId, Arg.Any<CancellationToken>())
            .Returns((KioskAccessInfo?)null);

        var services = new ServiceCollection();
        services.AddSingleton(kioskCache);
        var provider = services.BuildServiceProvider();

        var httpContext = new DefaultHttpContext { RequestServices = provider };
        var claims = new List<Claim>
        {
            new(ClinicClaimTypes.TokenType, "kiosk"),
            new(ClinicClaimTypes.ClinicId, _clinicId.ToString()),
            new(ClinicClaimTypes.TokenVersion, "1")
        };
        var identity = new ClaimsIdentity(claims, "Bearer");
        var principal = new ClaimsPrincipal(identity);

        var scheme = new AuthenticationScheme("Bearer", "Bearer", typeof(JwtBearerHandler));
        var options = new JwtBearerOptions();
        var context = new TokenValidatedContext(httpContext, scheme, options)
        {
            Principal = principal
        };

        await ClinicTokenEvents.OnTokenValidated(context);

        context.Result.Should().NotBeNull();
        context.Result.Failure.Should().NotBeNull();
        context.Result.Failure!.Message.Should().Contain("Kiosk session is no longer valid.");
    }

    [Fact]
    public async Task OnTokenValidated_WhenTokenVersionIsFuture_FailsValidation()
    {
        var kioskCache = Substitute.For<IKioskAccessCache>();
        // DB says version is 2, token presents version 99
        kioskCache.GetAsync(_clinicId, Arg.Any<CancellationToken>())
            .Returns(new KioskAccessInfo(IsKioskIntakeEnabled: true, KioskTokenVersion: 2));

        var services = new ServiceCollection();
        services.AddSingleton(kioskCache);
        var provider = services.BuildServiceProvider();

        var httpContext = new DefaultHttpContext { RequestServices = provider };
        var claims = new List<Claim>
        {
            new(ClinicClaimTypes.TokenType, "kiosk"),
            new(ClinicClaimTypes.ClinicId, _clinicId.ToString()),
            new(ClinicClaimTypes.TokenVersion, "99")
        };
        var identity = new ClaimsIdentity(claims, "Bearer");
        var principal = new ClaimsPrincipal(identity);

        var scheme = new AuthenticationScheme("Bearer", "Bearer", typeof(JwtBearerHandler));
        var options = new JwtBearerOptions();
        var context = new TokenValidatedContext(httpContext, scheme, options)
        {
            Principal = principal
        };

        await ClinicTokenEvents.OnTokenValidated(context);

        context.Result.Should().NotBeNull();
        context.Result.Failure.Should().NotBeNull();
        context.Result.Failure!.Message.Should().Contain("Kiosk session is no longer valid.");
    }

    [Fact]
    public void ClinicContext_WhenKioskForgesStaffPermissionsAndRole_StrictlyStripsAllPermissions()
    {
        var httpAccessor = Substitute.For<IHttpContextAccessor>();
        var config = Substitute.For<IConfiguration>();

        var claims = new List<Claim>
        {
            new(ClinicClaimTypes.TokenType, "kiosk"),
            new(ClinicClaimTypes.TenantId, _tenantId),
            new(ClinicClaimTypes.ClinicId, _clinicId.ToString()),
            new(ClinicClaimTypes.Subject, Guid.NewGuid().ToString()),
            new(ClinicClaimTypes.StaffRole, "Admin"),
            new(ClinicClaimTypes.Permission, "*"),
            new(ClinicClaimTypes.Permission, ClinicPermissions.PatientsRead),
            new(ClinicClaimTypes.Permission, ClinicPermissions.SettingsManage),
            new(ClinicClaimTypes.Name, "Hacked Kiosk")
        };
        var user = new ClaimsPrincipal(new ClaimsIdentity(claims, "Bearer"));
        var http = new DefaultHttpContext { User = user };
        httpAccessor.HttpContext.Returns(http);

        var clinicContext = new ClinicContext(httpAccessor, config);

        clinicContext.StaffId.Should().BeNull();
        clinicContext.StaffName.Should().BeNull();
        clinicContext.Permissions.Should().BeEmpty();
        clinicContext.HasPermission(ClinicPermissions.PatientsRead).Should().BeFalse();
        clinicContext.HasPermission(ClinicPermissions.SettingsManage).Should().BeFalse();
        clinicContext.HasPermission("*").Should().BeFalse();
    }

    [Theory]
    [InlineData("PatientsRead")]
    [InlineData("PatientsWrite")]
    [InlineData("SettingsManage")]
    [InlineData("BillingRead")]
    [InlineData("ConsultationsWrite")]
    [InlineData("AuditRead")]
    [InlineData(null)]
    public async Task ClinicScopeMiddleware_WhenKioskAttemptsVariousStaffEndpoints_StrictlyReturns403Forbidden(string? policy)
    {
        var middleware = new ClinicScopeMiddleware(ctx => Task.CompletedTask);
        var workspaces = Substitute.For<IWorkspaceResolver>();

        var context = new DefaultHttpContext();
        var claims = new List<Claim>
        {
            new(ClinicClaimTypes.TokenType, "kiosk"),
            new(ClinicClaimTypes.ClinicId, _clinicId.ToString()),
            new(ClinicClaimTypes.TenantId, _tenantId)
        };
        context.User = new ClaimsPrincipal(new ClaimsIdentity(claims, "Bearer"));

        var endpoint = policy != null
            ? new Endpoint(
                ctx => Task.CompletedTask,
                new EndpointMetadataCollection(new AuthorizeAttribute { Policy = policy }),
                "StaffEndpoint")
            : new Endpoint(
                ctx => Task.CompletedTask,
                new EndpointMetadataCollection(new AuthorizeAttribute()),
                "DefaultAuthorizedEndpoint");

        context.SetEndpoint(endpoint);
        context.Response.Body = new MemoryStream();

        await middleware.InvokeAsync(context, workspaces);

        context.Response.StatusCode.Should().Be(StatusCodes.Status403Forbidden);
    }

    [Fact]
    public async Task ClinicScopeMiddleware_WhenKioskCallsEndpointWithoutEndpointMetadata_Returns403Forbidden()
    {
        var middleware = new ClinicScopeMiddleware(ctx => Task.CompletedTask);
        var workspaces = Substitute.For<IWorkspaceResolver>();

        var context = new DefaultHttpContext();
        var claims = new List<Claim>
        {
            new(ClinicClaimTypes.TokenType, "kiosk"),
            new(ClinicClaimTypes.ClinicId, _clinicId.ToString()),
            new(ClinicClaimTypes.TenantId, _tenantId)
        };
        context.User = new ClaimsPrincipal(new ClaimsIdentity(claims, "Bearer"));
        context.SetEndpoint(null);
        context.Response.Body = new MemoryStream();

        await middleware.InvokeAsync(context, workspaces);

        context.Response.StatusCode.Should().Be(StatusCodes.Status403Forbidden);
    }

    [Theory]
    [InlineData(true, true, true)]    // Matching clinic, matching tenant -> ALLOW
    [InlineData(true, null, true)]    // Matching clinic, missing tenant -> ALLOW
    [InlineData(null, true, true)]    // Missing clinic, matching tenant -> ALLOW
    [InlineData(null, null, true)]    // Missing clinic, missing tenant -> ALLOW
    [InlineData(false, true, false)]  // Mismatched clinic, matching tenant -> 403
    [InlineData(true, false, false)]  // Matching clinic, mismatched tenant -> 403
    [InlineData(false, false, false)] // Mismatched clinic, mismatched tenant -> 403
    public async Task ClinicScopeMiddleware_HeaderSpoofing_ComprehensiveMatrix(
        bool? clinicMatch,
        bool? tenantMatch,
        bool shouldAllow)
    {
        var nextExecuted = false;
        var middleware = new ClinicScopeMiddleware(ctx =>
        {
            nextExecuted = true;
            return Task.CompletedTask;
        });
        var workspaces = Substitute.For<IWorkspaceResolver>();

        var context = new DefaultHttpContext();
        var claims = new List<Claim>
        {
            new(ClinicClaimTypes.TokenType, "kiosk"),
            new(ClinicClaimTypes.ClinicId, _clinicId.ToString()),
            new(ClinicClaimTypes.TenantId, _tenantId)
        };
        context.User = new ClaimsPrincipal(new ClaimsIdentity(claims, "Bearer"));

        if (clinicMatch.HasValue)
        {
            context.Request.Headers["X-Clinic-Id"] = clinicMatch.Value
                ? _clinicId.ToString()
                : Guid.NewGuid().ToString();
        }

        if (tenantMatch.HasValue)
        {
            context.Request.Headers["X-Tenant-Id"] = tenantMatch.Value
                ? _tenantId
                : "spoofed-tenant-999";
        }

        var endpoint = new Endpoint(
            ctx => Task.CompletedTask,
            new EndpointMetadataCollection(new AuthorizeAttribute { Policy = ClinicPolicies.KioskIntake }),
            "KioskEndpoint");
        context.SetEndpoint(endpoint);
        context.Response.Body = new MemoryStream();

        await middleware.InvokeAsync(context, workspaces);

        if (shouldAllow)
        {
            nextExecuted.Should().BeTrue();
            context.Response.StatusCode.Should().Be(StatusCodes.Status200OK);
        }
        else
        {
            nextExecuted.Should().BeFalse();
            context.Response.StatusCode.Should().Be(StatusCodes.Status403Forbidden);
        }
    }

    [Fact]
    public async Task ClinicScopeMiddleware_HeaderSpoofing_TenantCaseInsensitive_AllowsExecution()
    {
        var nextExecuted = false;
        var middleware = new ClinicScopeMiddleware(ctx =>
        {
            nextExecuted = true;
            return Task.CompletedTask;
        });
        var workspaces = Substitute.For<IWorkspaceResolver>();

        var context = new DefaultHttpContext();
        var claims = new List<Claim>
        {
            new(ClinicClaimTypes.TokenType, "kiosk"),
            new(ClinicClaimTypes.ClinicId, _clinicId.ToString()),
            new(ClinicClaimTypes.TenantId, "my-tenant-123")
        };
        context.User = new ClaimsPrincipal(new ClaimsIdentity(claims, "Bearer"));
        context.Request.Headers["X-Tenant-Id"] = "MY-TENANT-123";

        var endpoint = new Endpoint(
            ctx => Task.CompletedTask,
            new EndpointMetadataCollection(new AuthorizeAttribute { Policy = ClinicPolicies.KioskIntake }),
            "KioskEndpoint");
        context.SetEndpoint(endpoint);

        await middleware.InvokeAsync(context, workspaces);

        nextExecuted.Should().BeTrue();
        context.Response.StatusCode.Should().Be(StatusCodes.Status200OK);
    }

    [Fact]
    public void PatientsController_StudentIntakeEndpoint_ReflectionVerification()
    {
        var method = typeof(ClinicEz.Clinic.Api.Controllers.PatientsController)
            .GetMethod(nameof(ClinicEz.Clinic.Api.Controllers.PatientsController.PublicStudentSelfEnroll));

        method.Should().NotBeNull();

        // Must NOT allow anonymous
        var allowAnon = method!.GetCustomAttributes(typeof(AllowAnonymousAttribute), inherit: true);
        allowAnon.Should().BeEmpty("PublicStudentSelfEnroll must not allow anonymous callers.");

        // Must require Authorize with KioskIntake policy
        var authAttrs = method.GetCustomAttributes(typeof(AuthorizeAttribute), inherit: true)
            .Cast<AuthorizeAttribute>()
            .ToList();
        authAttrs.Should().NotBeEmpty("PublicStudentSelfEnroll must have AuthorizeAttribute.");
        authAttrs.Should().Contain(a => a.Policy == ClinicPolicies.KioskIntake);
    }

    [Theory]
    [InlineData(false, null, null, false)]                         // Unauthenticated -> Fail
    [InlineData(true, "staff", "clinic-guid", false)]             // Authenticated staff -> Fail
    [InlineData(true, null, "clinic-guid", false)]                // Authenticated no token_type -> Fail
    [InlineData(true, "kiosk", null, false)]                      // Authenticated kiosk, missing clinic_id -> Fail
    [InlineData(true, "kiosk", "", false)]                        // Authenticated kiosk, empty clinic_id -> Fail
    [InlineData(true, "kiosk", "clinic-guid", true)]              // Authenticated kiosk, valid clinic_id -> PASS
    public async Task KioskIntakePolicy_AuthorizationRequirement_ComprehensiveEvaluation(
        bool isAuthenticated,
        string? tokenType,
        string? clinicId,
        bool shouldSucceed)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddAuthorization(options =>
        {
            options.AddPolicy(ClinicPolicies.KioskIntake, policy =>
                policy.RequireAssertion(ctx =>
                    ctx.User.Identity?.IsAuthenticated == true &&
                    ctx.User.HasClaim(ClinicClaimTypes.TokenType, "kiosk") &&
                    !string.IsNullOrWhiteSpace(ctx.User.FindFirst(ClinicClaimTypes.ClinicId)?.Value)));
        });

        var provider = services.BuildServiceProvider();
        var authService = provider.GetRequiredService<IAuthorizationService>();

        var claims = new List<Claim>();
        if (tokenType != null) claims.Add(new(ClinicClaimTypes.TokenType, tokenType));
        if (clinicId != null) claims.Add(new(ClinicClaimTypes.ClinicId, clinicId == "clinic-guid" ? _clinicId.ToString() : clinicId));

        var identity = isAuthenticated
            ? new ClaimsIdentity(claims, "Bearer")
            : new ClaimsIdentity(); // Unauthenticated

        var principal = new ClaimsPrincipal(identity);

        var result = await authService.AuthorizeAsync(principal, ClinicPolicies.KioskIntake);
        result.Succeeded.Should().Be(shouldSucceed);
    }

    [Fact]
    public async Task MintKioskTokenCommand_WhenSettingsMissing_ThrowsInvalidOperationException()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.TenantId.Returns(_tenantId);

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(db, sieve);
        var tokenService = Substitute.For<IKioskTokenService>();
        var invalidator = Substitute.For<IKioskAccessInvalidator>();

        var handler = new MintKioskTokenCommandHandler(settingsRepo, clinicContext, tokenService, invalidator, uow);

        var act = () => handler.Handle(new MintKioskTokenCommand(), CancellationToken.None);
        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*Clinic facility settings not initialized*");
    }

    [Fact]
    public async Task RevokeKioskTokenCommand_WhenSettingsMissing_ThrowsInvalidOperationException()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.TenantId.Returns(_tenantId);

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(db, sieve);
        var invalidator = Substitute.For<IKioskAccessInvalidator>();

        var handler = new RevokeKioskTokenCommandHandler(settingsRepo, invalidator, uow);

        var act = () => handler.Handle(new RevokeKioskTokenCommand("Test"), CancellationToken.None);
        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*Clinic facility settings not initialized*");
    }

    [Fact]
    public void KioskController_Endpoints_AreGuardedBySettingsPermissions()
    {
        var mintMethod = typeof(ClinicEz.Clinic.Api.Controllers.KioskController)
            .GetMethod(nameof(ClinicEz.Clinic.Api.Controllers.KioskController.Mint));
        mintMethod.Should().NotBeNull();
        var mintPerm = mintMethod!.GetCustomAttributes(typeof(ClinicEz.Clinic.Api.Authorization.HasPermissionAttribute), false)
            .Cast<ClinicEz.Clinic.Api.Authorization.HasPermissionAttribute>()
            .FirstOrDefault();
        mintPerm.Should().NotBeNull();
        mintPerm!.Permission.Should().Be(ClinicPermissions.SettingsManage);

        var revokeMethod = typeof(ClinicEz.Clinic.Api.Controllers.KioskController)
            .GetMethod(nameof(ClinicEz.Clinic.Api.Controllers.KioskController.Revoke));
        revokeMethod.Should().NotBeNull();
        var revokePerm = revokeMethod!.GetCustomAttributes(typeof(ClinicEz.Clinic.Api.Authorization.HasPermissionAttribute), false)
            .Cast<ClinicEz.Clinic.Api.Authorization.HasPermissionAttribute>()
            .FirstOrDefault();
        revokePerm.Should().NotBeNull();
        revokePerm!.Permission.Should().Be(ClinicPermissions.SettingsManage);

        var statusMethod = typeof(ClinicEz.Clinic.Api.Controllers.KioskController)
            .GetMethod(nameof(ClinicEz.Clinic.Api.Controllers.KioskController.GetStatus));
        statusMethod.Should().NotBeNull();
        var statusPerm = statusMethod!.GetCustomAttributes(typeof(ClinicEz.Clinic.Api.Authorization.HasPermissionAttribute), false)
            .Cast<ClinicEz.Clinic.Api.Authorization.HasPermissionAttribute>()
            .FirstOrDefault();
        statusPerm.Should().NotBeNull();
        statusPerm!.Permission.Should().Be(ClinicPermissions.SettingsRead);
    }

    [Fact]
    public async Task KioskToken_WhenTamperedOrExpired_FailsJwtValidation()
    {
        var keyBytes = new byte[32];
        for (int i = 0; i < 32; i++) keyBytes[i] = (byte)(i + 1);
        var securityKey = new SymmetricSecurityKey(keyBytes);

        var tokenServiceMock = Substitute.For<IFacilityTokenService>();
        tokenServiceMock.SecurityKey.Returns(securityKey);
        tokenServiceMock.Options.Returns(new FacilityJwtOptions
        {
            Issuer = "https://test.clinicez.internal",
            Audience = "clinicez-facility-client"
        });

        var kioskTokenService = new KioskTokenService(tokenServiceMock);
        var (token, _) = kioskTokenService.MintToken(_tenantId, _clinicId, 1, "Kiosk");

        var tokenHandler = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler();
        var validationParams = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = "https://test.clinicez.internal",
            ValidateAudience = true,
            ValidAudience = "clinicez-facility-client",
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = securityKey,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.Zero
        };

        // 1. Valid token succeeds
        var validResult = await tokenHandler.ValidateTokenAsync(token, validationParams);
        validResult.IsValid.Should().BeTrue();

        // 2. Tampered signature fails
        var parts = token.Split('.');
        var tamperedSignature = parts[2].Substring(0, parts[2].Length - 4) + "XXXX";
        var tamperedToken = $"{parts[0]}.{parts[1]}.{tamperedSignature}";

        var tamperedResult = await tokenHandler.ValidateTokenAsync(tamperedToken, validationParams);
        tamperedResult.IsValid.Should().BeFalse();
        tamperedResult.Exception.Should().NotBeNull();
    }
}
