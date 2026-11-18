using System;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Infrastructure.Auth;
using ClinicEz.Clinic.Infrastructure.Context;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.LocalAuth;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class AuthControllerTests
{
    private readonly IClinicAuthService _auth = Substitute.For<IClinicAuthService>();
    private readonly AuthController _controller;

    public AuthControllerTests()
    {
        _controller = new AuthController(_auth)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext()
            }
        };
    }

    [Fact]
    public async Task RecoverAdmin_Success_Returns200WithTokens()
    {
        var user = new AuthUserDto(
            Guid.NewGuid(),
            "Admin User",
            "Admin",
            null,
            Guid.NewGuid(),
            "tenant-1",
            "Test Clinic",
            new[] { "staff:manage" },
            false,
            "admin@clinic.test");

        var tokens = new AuthTokensDto(
            "access-token",
            "refresh-token",
            DateTime.UtcNow.AddMinutes(15),
            DateTime.UtcNow.AddDays(7),
            user);

        _auth.RecoverAdminAsync(Arg.Any<RecoverAdminRequest>(), Arg.Any<CancellationToken>())
            .Returns(AuthOutcome.Success(tokens));

        var request = new RecoverAdminRequest(null, "valid-token", "admin@clinic.test", "StrongPass123!", "device-1");
        var result = await _controller.RecoverAdmin(request, CancellationToken.None) as ObjectResult;

        result.Should().NotBeNull();
        result!.StatusCode.Should().Be(StatusCodes.Status200OK);
        var response = result.Value as ApiResponse<AuthTokensDto>;
        response.Should().NotBeNull();
        response!.Data!.AccessToken.Should().Be("access-token");
        response.Data.RefreshToken.Should().Be("refresh-token");
    }

    [Theory]
    [InlineData(AuthFailure.LicenseTampered, StatusCodes.Status400BadRequest)]
    [InlineData(AuthFailure.InvalidRequest, StatusCodes.Status400BadRequest)]
    [InlineData(AuthFailure.WeakPassword, StatusCodes.Status400BadRequest)]
    [InlineData(AuthFailure.NotFound, StatusCodes.Status404NotFound)]
    [InlineData(AuthFailure.WorkspaceNotFound, StatusCodes.Status404NotFound)]
    [InlineData(AuthFailure.ActivationRequired, StatusCodes.Status403Forbidden)]
    public async Task RecoverAdmin_Failures_MapToExpectedStatusCodes(AuthFailure failure, int expectedStatus)
    {
        _auth.RecoverAdminAsync(Arg.Any<RecoverAdminRequest>(), Arg.Any<CancellationToken>())
            .Returns(AuthOutcome.Fail(failure, "Failure message"));

        var request = new RecoverAdminRequest(null, "license", "admin@clinic.test", "pass", null);
        var result = await _controller.RecoverAdmin(request, CancellationToken.None) as ObjectResult;

        result.Should().NotBeNull();
        result!.StatusCode.Should().Be(expectedStatus);
    }

    [Fact]
    public async Task RecoverAdmin_UsesWorkspaceHeader_WhenRequestWorkspaceIsNull()
    {
        _controller.HttpContext.Request.Headers["X-Facility-Slug"] = "header-workspace";

        _auth.RecoverAdminAsync(Arg.Any<RecoverAdminRequest>(), Arg.Any<CancellationToken>())
            .Returns(AuthOutcome.Fail(AuthFailure.NotFound, "Not found"));

        var request = new RecoverAdminRequest(null, "license", "admin@clinic.test", "pass", null);
        await _controller.RecoverAdmin(request, CancellationToken.None);

        await _auth.Received(1).RecoverAdminAsync(
            Arg.Is<RecoverAdminRequest>(r => r.Workspace == "header-workspace"),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task RecoverAdmin_PrefersRequestWorkspace_OverHeader()
    {
        _controller.HttpContext.Request.Headers["X-Facility-Slug"] = "header-workspace";

        _auth.RecoverAdminAsync(Arg.Any<RecoverAdminRequest>(), Arg.Any<CancellationToken>())
            .Returns(AuthOutcome.Fail(AuthFailure.NotFound, "Not found"));

        var request = new RecoverAdminRequest("explicit-workspace", "license", "admin@clinic.test", "pass", null);
        await _controller.RecoverAdmin(request, CancellationToken.None);

        await _auth.Received(1).RecoverAdminAsync(
            Arg.Is<RecoverAdminRequest>(r => r.Workspace == "explicit-workspace"),
            Arg.Any<CancellationToken>());
    }

    private static AuthTokensDto SampleTokens(string refreshToken = "refresh-token")
    {
        var user = new AuthUserDto(
            Guid.NewGuid(),
            "Staff User",
            "Doctor",
            null,
            Guid.NewGuid(),
            "tenant-1",
            "Test Clinic",
            new[] { "patients:read" },
            false,
            "staff@clinic.test");

        return new AuthTokensDto(
            "access-token",
            refreshToken,
            DateTime.UtcNow.AddMinutes(15),
            DateTime.UtcNow.AddDays(7),
            user);
    }

    [Fact]
    public async Task Login_WebClient_SetsHttpOnlyCookie_AndOmitsRefreshTokenFromBody()
    {
        _controller.HttpContext.Request.Headers["X-Client-Platform"] = "web";
        _controller.HttpContext.Request.IsHttps = true;
        _auth.LoginAsync(Arg.Any<LoginRequest>(), Arg.Any<CancellationToken>())
            .Returns(AuthOutcome.Success(SampleTokens("web-refresh-123")));

        var result = await _controller.Login(new LoginRequest(null, "staff@clinic.test", "Pass123!", "Clinic EZ web"), CancellationToken.None) as ObjectResult;

        result.Should().NotBeNull();
        result!.StatusCode.Should().Be(StatusCodes.Status200OK);
        var response = result.Value as ApiResponse<AuthTokensDto>;
        response!.Data!.AccessToken.Should().Be("access-token");
        response.Data.RefreshToken.Should().BeNull();

        var setCookie = _controller.HttpContext.Response.Headers.SetCookie.ToString();
        setCookie.Should().Contain($"{AuthController.RefreshCookieName}=web-refresh-123");
        setCookie.Should().Contain("httponly");
        setCookie.Should().Contain("samesite=lax");
        setCookie.Should().Contain("secure");
        setCookie.Should().Contain("path=/api/v1/auth");
        setCookie.Should().NotContain("expires=");
    }

    [Fact]
    public async Task Refresh_WebClient_ReadsCookie_RotatesCookie_AndOmitsBodyToken()
    {
        _controller.HttpContext.Request.Headers["X-Client-Platform"] = "web";
        _controller.HttpContext.Request.Headers.Cookie = $"{AuthController.RefreshCookieName}=old-cookie-token";
        _auth.RefreshAsync("old-cookie-token", Arg.Any<CancellationToken>())
            .Returns(AuthOutcome.Success(SampleTokens("new-cookie-token")));

        var result = await _controller.Refresh(new RefreshRequest(null), CancellationToken.None) as ObjectResult;

        result.Should().NotBeNull();
        result!.StatusCode.Should().Be(StatusCodes.Status200OK);
        var response = result.Value as ApiResponse<AuthTokensDto>;
        response!.Data!.RefreshToken.Should().BeNull();

        await _auth.Received(1).RefreshAsync("old-cookie-token", Arg.Any<CancellationToken>());
        var setCookie = _controller.HttpContext.Response.Headers.SetCookie.ToString();
        setCookie.Should().Contain($"{AuthController.RefreshCookieName}=new-cookie-token");
    }

    [Fact]
    public async Task Refresh_WebClient_InvalidToken_ClearsCookie()
    {
        _controller.HttpContext.Request.Headers["X-Client-Platform"] = "web";
        _controller.HttpContext.Request.Headers.Cookie = $"{AuthController.RefreshCookieName}=stale-token";
        _auth.RefreshAsync("stale-token", Arg.Any<CancellationToken>())
            .Returns(AuthOutcome.Fail(AuthFailure.InvalidToken, "Invalid refresh token."));

        var result = await _controller.Refresh(null, CancellationToken.None) as ObjectResult;

        result.Should().NotBeNull();
        result!.StatusCode.Should().Be(StatusCodes.Status401Unauthorized);
        var setCookie = _controller.HttpContext.Response.Headers.SetCookie.ToString();
        setCookie.Should().Contain($"{AuthController.RefreshCookieName}=;");
    }

    [Fact]
    public async Task Logout_WebClient_RevokesCookieToken_AndClearsCookie()
    {
        _controller.HttpContext.Request.Headers["X-Client-Platform"] = "web";
        _controller.HttpContext.Request.Headers.Cookie = $"{AuthController.RefreshCookieName}=active-cookie-token";

        var result = await _controller.Logout(new RefreshRequest(null), CancellationToken.None) as ObjectResult;

        result.Should().NotBeNull();
        result!.StatusCode.Should().Be(StatusCodes.Status200OK);
        await _auth.Received(1).LogoutAsync("active-cookie-token", Arg.Any<CancellationToken>());

        var setCookie = _controller.HttpContext.Response.Headers.SetCookie.ToString();
        setCookie.Should().Contain($"{AuthController.RefreshCookieName}=;");
    }

    [Fact]
    public async Task Login_WebClient_PlainHttp_DoesNotSetSecureFlag()
    {
        _controller.HttpContext.Request.Headers["X-Client-Platform"] = "web";
        _controller.HttpContext.Request.IsHttps = false;
        _auth.LoginAsync(Arg.Any<LoginRequest>(), Arg.Any<CancellationToken>())
            .Returns(AuthOutcome.Success(SampleTokens("lan-refresh")));

        var result = await _controller.Login(new LoginRequest(null, "staff@clinic.test", "Pass123!", "Clinic EZ web"), CancellationToken.None) as ObjectResult;

        result.Should().NotBeNull();
        result!.StatusCode.Should().Be(StatusCodes.Status200OK);
        var response = result.Value as ApiResponse<AuthTokensDto>;
        response!.Data!.RefreshToken.Should().BeNull();

        var setCookie = _controller.HttpContext.Response.Headers.SetCookie.ToString();
        setCookie.Should().Contain($"{AuthController.RefreshCookieName}=lan-refresh");
        setCookie.Should().Contain("httponly");
        setCookie.Should().Contain("samesite=lax");
        setCookie.Should().Contain("path=/api/v1/auth");
        setCookie.Should().NotContain("secure");
    }

    [Fact]
    public async Task Login_NativeClient_ReturnsRefreshTokenInBody_AndSetsNoCookie()
    {
        _controller.HttpContext.Request.Headers["X-Client-Platform"] = "ios";
        _controller.HttpContext.Request.IsHttps = true;
        _auth.LoginAsync(Arg.Any<LoginRequest>(), Arg.Any<CancellationToken>())
            .Returns(AuthOutcome.Success(SampleTokens("native-refresh-token")));

        var result = await _controller.Login(new LoginRequest(null, "staff@clinic.test", "Pass123!", "Clinic EZ iOS"), CancellationToken.None) as ObjectResult;

        result.Should().NotBeNull();
        result!.StatusCode.Should().Be(StatusCodes.Status200OK);
        var response = result.Value as ApiResponse<AuthTokensDto>;
        response!.Data!.RefreshToken.Should().Be("native-refresh-token");

        _controller.HttpContext.Response.Headers.SetCookie.ToString().Should().BeEmpty();
    }

    [Fact]
    public async Task Refresh_NativeClient_WithBodyToken_ReturnsRefreshTokenInBody_AndSetsNoCookie()
    {
        _controller.HttpContext.Request.Headers["X-Client-Platform"] = "android";
        _auth.RefreshAsync("native-refresh-token", Arg.Any<CancellationToken>())
            .Returns(AuthOutcome.Success(SampleTokens("rotated-native-refresh")));

        var result = await _controller.Refresh(new RefreshRequest("native-refresh-token"), CancellationToken.None) as ObjectResult;

        result.Should().NotBeNull();
        result!.StatusCode.Should().Be(StatusCodes.Status200OK);
        var response = result.Value as ApiResponse<AuthTokensDto>;
        response!.Data!.RefreshToken.Should().Be("rotated-native-refresh");

        await _auth.Received(1).RefreshAsync("native-refresh-token", Arg.Any<CancellationToken>());
        _controller.HttpContext.Response.Headers.SetCookie.ToString().Should().BeEmpty();
    }

    [Fact]
    public async Task Refresh_WebClient_NullBody_NoCookie_Returns401_AndClearsCookie()
    {
        _controller.HttpContext.Request.Headers["X-Client-Platform"] = "web";
        _auth.RefreshAsync(null, Arg.Any<CancellationToken>())
            .Returns(AuthOutcome.Fail(AuthFailure.InvalidToken, "Invalid refresh token."));

        var result = await _controller.Refresh(null, CancellationToken.None) as ObjectResult;

        result.Should().NotBeNull();
        result!.StatusCode.Should().Be(StatusCodes.Status401Unauthorized);
        await _auth.Received(1).RefreshAsync(null, Arg.Any<CancellationToken>());
        var setCookie = _controller.HttpContext.Response.Headers.SetCookie.ToString();
        setCookie.Should().Contain($"{AuthController.RefreshCookieName}=;");
    }

    [Fact]
    public async Task Refresh_WebClient_PrefersBodyToken_OverCookie()
    {
        _controller.HttpContext.Request.Headers["X-Client-Platform"] = "web";
        _controller.HttpContext.Request.Headers.Cookie = $"{AuthController.RefreshCookieName}=cookie-token";
        _auth.RefreshAsync("body-token", Arg.Any<CancellationToken>())
            .Returns(AuthOutcome.Success(SampleTokens("new-rotated-token")));

        var result = await _controller.Refresh(new RefreshRequest("body-token"), CancellationToken.None) as ObjectResult;

        result.Should().NotBeNull();
        result!.StatusCode.Should().Be(StatusCodes.Status200OK);
        await _auth.Received(1).RefreshAsync("body-token", Arg.Any<CancellationToken>());
        await _auth.DidNotReceive().RefreshAsync("cookie-token", Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Bootstrap_WebClient_SetsHttpOnlyCookie_AndOmitsRefreshTokenFromBody()
    {
        _controller.HttpContext.Request.Headers["X-Client-Platform"] = "web";
        _controller.HttpContext.Request.IsHttps = true;
        _auth.BootstrapAsync(Arg.Any<BootstrapRequest>(), Arg.Any<CancellationToken>())
            .Returns(AuthOutcome.Success(SampleTokens("bootstrap-refresh-123")));

        var request = new BootstrapRequest("workspace-1", "license-token", "admin@clinic.test", "Pass123!", "Admin User");
        var result = await _controller.Bootstrap(request, CancellationToken.None) as ObjectResult;

        result.Should().NotBeNull();
        result!.StatusCode.Should().Be(StatusCodes.Status200OK);
        var response = result.Value as ApiResponse<AuthTokensDto>;
        response!.Data!.AccessToken.Should().Be("access-token");
        response.Data.RefreshToken.Should().BeNull();

        var setCookie = _controller.HttpContext.Response.Headers.SetCookie.ToString();
        setCookie.Should().Contain($"{AuthController.RefreshCookieName}=bootstrap-refresh-123");
        setCookie.Should().Contain("httponly");
        setCookie.Should().Contain("secure");
    }

    [Fact]
    public async Task RecoverAdmin_WebClient_SetsHttpOnlyCookie_AndOmitsRefreshTokenFromBody()
    {
        _controller.HttpContext.Request.Headers["X-Client-Platform"] = "web";
        _controller.HttpContext.Request.IsHttps = true;
        _auth.RecoverAdminAsync(Arg.Any<RecoverAdminRequest>(), Arg.Any<CancellationToken>())
            .Returns(AuthOutcome.Success(SampleTokens("recover-refresh-123")));

        var request = new RecoverAdminRequest("workspace-1", "license-token", "admin@clinic.test", "StrongPass123!", "web-device");
        var result = await _controller.RecoverAdmin(request, CancellationToken.None) as ObjectResult;

        result.Should().NotBeNull();
        result!.StatusCode.Should().Be(StatusCodes.Status200OK);
        var response = result.Value as ApiResponse<AuthTokensDto>;
        response!.Data!.AccessToken.Should().Be("access-token");
        response.Data.RefreshToken.Should().BeNull();

        var setCookie = _controller.HttpContext.Response.Headers.SetCookie.ToString();
        setCookie.Should().Contain($"{AuthController.RefreshCookieName}=recover-refresh-123");
        setCookie.Should().Contain("httponly");
        setCookie.Should().Contain("secure");
    }

    [Fact]
    public async Task AcceptInvitation_WebClient_SetsHttpOnlyCookie_AndOmitsRefreshTokenFromBody()
    {
        _controller.HttpContext.Request.Headers["X-Client-Platform"] = "web";
        _controller.HttpContext.Request.IsHttps = true;
        _auth.AcceptInvitationAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(AuthOutcome.Success(SampleTokens("invitation-refresh-123")));

        var request = new AcceptClinicInvitationRequest("NewPassword123!");
        var result = await _controller.AcceptInvitation("invite-token-abc", request, CancellationToken.None) as ObjectResult;

        result.Should().NotBeNull();
        result!.StatusCode.Should().Be(StatusCodes.Status200OK);
        var response = result.Value as ApiResponse<AuthTokensDto>;
        response!.Data!.AccessToken.Should().Be("access-token");
        response.Data.RefreshToken.Should().BeNull();

        var setCookie = _controller.HttpContext.Response.Headers.SetCookie.ToString();
        setCookie.Should().Contain($"{AuthController.RefreshCookieName}=invitation-refresh-123");
        setCookie.Should().Contain("httponly");
        setCookie.Should().Contain("secure");
    }

    [Fact]
    public async Task ChangePassword_WebClient_SetsHttpOnlyCookie_AndOmitsRefreshTokenFromBody()
    {
        var staffId = Guid.NewGuid();
        _controller.HttpContext.User = new ClaimsPrincipal(
            new ClaimsIdentity(new[]
            {
                new Claim(ClinicClaimTypes.Subject, staffId.ToString())
            }, "TestAuth"));

        _controller.HttpContext.Request.Headers["X-Client-Platform"] = "web";
        _controller.HttpContext.Request.IsHttps = true;
        _auth.ChangePasswordAsync(staffId, Arg.Any<ChangePasswordRequest>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(AuthOutcome.Success(SampleTokens("changed-pwd-refresh")));

        var request = new ChangePasswordRequest("OldPass123!", "NewPass123!");
        var result = await _controller.ChangePassword(request, CancellationToken.None) as ObjectResult;

        result.Should().NotBeNull();
        result!.StatusCode.Should().Be(StatusCodes.Status200OK);
        var response = result.Value as ApiResponse<AuthTokensDto>;
        response!.Data!.AccessToken.Should().Be("access-token");
        response.Data.RefreshToken.Should().BeNull();

        var setCookie = _controller.HttpContext.Response.Headers.SetCookie.ToString();
        setCookie.Should().Contain($"{AuthController.RefreshCookieName}=changed-pwd-refresh");
        setCookie.Should().Contain("httponly");
        setCookie.Should().Contain("secure");
    }

    [Fact]
    public async Task Logout_WebClient_NullBody_NoCookie_CallsLogoutWithNull_AndClearsCookie()
    {
        _controller.HttpContext.Request.Headers["X-Client-Platform"] = "web";

        var result = await _controller.Logout(null, CancellationToken.None) as ObjectResult;

        result.Should().NotBeNull();
        result!.StatusCode.Should().Be(StatusCodes.Status200OK);
        await _auth.Received(1).LogoutAsync(null, Arg.Any<CancellationToken>());

        var setCookie = _controller.HttpContext.Response.Headers.SetCookie.ToString();
        setCookie.Should().Contain($"{AuthController.RefreshCookieName}=;");
    }

    [Fact]
    public async Task PlatformHeader_WhitespaceAndCaseInsensitive_TreatedAsWeb()
    {
        _controller.HttpContext.Request.Headers["X-Client-Platform"] = "  WEB  ";
        _controller.HttpContext.Request.IsHttps = true;
        _auth.LoginAsync(Arg.Any<LoginRequest>(), Arg.Any<CancellationToken>())
            .Returns(AuthOutcome.Success(SampleTokens("case-refresh-token")));

        var result = await _controller.Login(new LoginRequest(null, "staff@clinic.test", "Pass123!", "Clinic EZ"), CancellationToken.None) as ObjectResult;

        result.Should().NotBeNull();
        result!.StatusCode.Should().Be(StatusCodes.Status200OK);
        var response = result.Value as ApiResponse<AuthTokensDto>;
        response!.Data!.RefreshToken.Should().BeNull();

        var setCookie = _controller.HttpContext.Response.Headers.SetCookie.ToString();
        setCookie.Should().Contain($"{AuthController.RefreshCookieName}=case-refresh-token");
    }
}
