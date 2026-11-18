using System;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Pharmacy.Api.Controllers;
using ClinicEz.Pharmacy.Infrastructure.Auth;
using ClinicEz.Pharmacy.Infrastructure.Context;
using ClinicEz.Shared.Common;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using NSubstitute;
using Xunit;

namespace ClinicEz.Pharmacy.Application.Tests;

public class PharmacyAuthControllerTests
{
    private readonly IPharmacyAuthService _auth = Substitute.For<IPharmacyAuthService>();
    private readonly AuthController _controller;

    public PharmacyAuthControllerTests()
    {
        _controller = new AuthController(_auth)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext()
            }
        };
    }

    private static AuthTokensDto SampleTokens(string refreshToken = "pharmacy-refresh-token")
    {
        var user = new AuthUserDto(
            Guid.NewGuid(),
            "Pharmacist User",
            "Pharmacist",
            null,
            Guid.NewGuid(),
            "tenant-1",
            "Test Pharmacy",
            new[] { "inventory:read" },
            false);

        return new AuthTokensDto(
            "pharmacy-access-token",
            refreshToken,
            DateTime.UtcNow.AddMinutes(15),
            DateTime.UtcNow.AddDays(7),
            user);
    }

    [Fact]
    public async Task Login_WebClient_Https_SetsHttpOnlySecureCookie_AndOmitsBodyRefreshToken()
    {
        _controller.HttpContext.Request.Headers["X-Client-Platform"] = "web";
        _controller.HttpContext.Request.IsHttps = true;
        _auth.LoginAsync(Arg.Any<LoginRequest>(), Arg.Any<CancellationToken>())
            .Returns(AuthOutcome.Success(SampleTokens("web-refresh-1")));

        var result = await _controller.Login(new LoginRequest(null, "rx@pharmacy.test", "Pass123!", "Clinic EZ web"), CancellationToken.None) as ObjectResult;

        result.Should().NotBeNull();
        result!.StatusCode.Should().Be(StatusCodes.Status200OK);
        var response = result.Value as ApiResponse<AuthTokensDto>;
        response!.Data!.AccessToken.Should().Be("pharmacy-access-token");
        response.Data.RefreshToken.Should().BeNull();

        var setCookie = _controller.HttpContext.Response.Headers.SetCookie.ToString();
        setCookie.Should().Contain($"{AuthController.RefreshCookieName}=web-refresh-1");
        setCookie.Should().Contain("httponly");
        setCookie.Should().Contain("samesite=lax");
        setCookie.Should().Contain("secure");
        setCookie.Should().Contain("path=/api/v1/auth");
        setCookie.Should().NotContain("expires=");
    }

    [Fact]
    public async Task Login_WebClient_PlainHttp_DoesNotSetSecureFlag()
    {
        _controller.HttpContext.Request.Headers["X-Client-Platform"] = "  WEB  ";
        _controller.HttpContext.Request.IsHttps = false;
        _auth.LoginAsync(Arg.Any<LoginRequest>(), Arg.Any<CancellationToken>())
            .Returns(AuthOutcome.Success(SampleTokens("lan-refresh-1")));

        var result = await _controller.Login(new LoginRequest(null, "rx@pharmacy.test", "Pass123!", "Clinic EZ web"), CancellationToken.None) as ObjectResult;

        result!.StatusCode.Should().Be(StatusCodes.Status200OK);
        var setCookie = _controller.HttpContext.Response.Headers.SetCookie.ToString();
        setCookie.Should().Contain($"{AuthController.RefreshCookieName}=lan-refresh-1");
        setCookie.Should().Contain("httponly");
        setCookie.Should().NotContain("secure");
    }

    [Fact]
    public async Task Login_NativeClient_ReturnsRefreshTokenInBody_AndSetsNoCookie()
    {
        _controller.HttpContext.Request.Headers["X-Client-Platform"] = "ios";
        _auth.LoginAsync(Arg.Any<LoginRequest>(), Arg.Any<CancellationToken>())
            .Returns(AuthOutcome.Success(SampleTokens("native-refresh-1")));

        var result = await _controller.Login(new LoginRequest(null, "rx@pharmacy.test", "Pass123!", "Clinic EZ ios"), CancellationToken.None) as ObjectResult;

        result!.StatusCode.Should().Be(StatusCodes.Status200OK);
        var response = result.Value as ApiResponse<AuthTokensDto>;
        response!.Data!.RefreshToken.Should().Be("native-refresh-1");
        _controller.HttpContext.Response.Headers.SetCookie.ToString().Should().BeEmpty();
    }

    [Fact]
    public async Task Refresh_WebClient_ReadsCookie_RotatesCookie_AndOmitsBodyToken()
    {
        _controller.HttpContext.Request.Headers["X-Client-Platform"] = "web";
        _controller.HttpContext.Request.Headers.Cookie = $"{AuthController.RefreshCookieName}=old-rx-cookie";
        _auth.RefreshAsync("old-rx-cookie", Arg.Any<CancellationToken>())
            .Returns(AuthOutcome.Success(SampleTokens("new-rx-cookie")));

        var result = await _controller.Refresh(new RefreshRequest(null), CancellationToken.None) as ObjectResult;

        result!.StatusCode.Should().Be(StatusCodes.Status200OK);
        var response = result.Value as ApiResponse<AuthTokensDto>;
        response!.Data!.RefreshToken.Should().BeNull();
        await _auth.Received(1).RefreshAsync("old-rx-cookie", Arg.Any<CancellationToken>());
        _controller.HttpContext.Response.Headers.SetCookie.ToString().Should().Contain($"{AuthController.RefreshCookieName}=new-rx-cookie");
    }

    [Fact]
    public async Task Refresh_WebClient_InvalidToken_ClearsCookie()
    {
        _controller.HttpContext.Request.Headers["X-Client-Platform"] = "web";
        _controller.HttpContext.Request.Headers.Cookie = $"{AuthController.RefreshCookieName}=stale-rx-cookie";
        _auth.RefreshAsync("stale-rx-cookie", Arg.Any<CancellationToken>())
            .Returns(AuthOutcome.Fail(AuthFailure.InvalidToken, "Invalid refresh token."));

        var result = await _controller.Refresh(null, CancellationToken.None) as ObjectResult;

        result!.StatusCode.Should().Be(StatusCodes.Status401Unauthorized);
        _controller.HttpContext.Response.Headers.SetCookie.ToString().Should().Contain($"{AuthController.RefreshCookieName}=;");
    }

    [Fact]
    public async Task Bootstrap_And_ChangePassword_WebClient_SetCookie_AndOmitBodyToken()
    {
        _controller.HttpContext.Request.Headers["X-Client-Platform"] = "web";
        _auth.BootstrapAsync(Arg.Any<BootstrapRequest>(), Arg.Any<CancellationToken>())
            .Returns(AuthOutcome.Success(SampleTokens("boot-rx-cookie")));

        var bootResult = await _controller.Bootstrap(new BootstrapRequest(null, "lic-1", "admin@pharmacy.test", "StrongPass123!", "Admin"), CancellationToken.None) as ObjectResult;
        bootResult!.StatusCode.Should().Be(StatusCodes.Status200OK);
        (bootResult.Value as ApiResponse<AuthTokensDto>)!.Data!.RefreshToken.Should().BeNull();
        _controller.HttpContext.Response.Headers.SetCookie.ToString().Should().Contain($"{AuthController.RefreshCookieName}=boot-rx-cookie");

        var staffId = Guid.NewGuid();
        _controller.HttpContext.User = new ClaimsPrincipal(
            new ClaimsIdentity(new[] { new Claim(PharmacyClaimTypes.Subject, staffId.ToString()) }, "Facility"));
        _auth.ChangePasswordAsync(staffId, Arg.Any<ChangePasswordRequest>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(AuthOutcome.Success(SampleTokens("pwd-rx-cookie")));

        var pwdResult = await _controller.ChangePassword(new ChangePasswordRequest("OldPass123!", "NewPass456!"), CancellationToken.None) as ObjectResult;
        pwdResult!.StatusCode.Should().Be(StatusCodes.Status200OK);
        (pwdResult.Value as ApiResponse<AuthTokensDto>)!.Data!.RefreshToken.Should().BeNull();
        _controller.HttpContext.Response.Headers.SetCookie.ToString().Should().Contain($"{AuthController.RefreshCookieName}=pwd-rx-cookie");
    }

    [Fact]
    public async Task Logout_WebClient_RevokesCookieToken_AndClearsCookie()
    {
        _controller.HttpContext.Request.Headers["X-Client-Platform"] = "web";
        _controller.HttpContext.Request.Headers.Cookie = $"{AuthController.RefreshCookieName}=active-rx-cookie";

        var result = await _controller.Logout(null, CancellationToken.None) as ObjectResult;

        result!.StatusCode.Should().Be(StatusCodes.Status200OK);
        await _auth.Received(1).LogoutAsync("active-rx-cookie", Arg.Any<CancellationToken>());
        _controller.HttpContext.Response.Headers.SetCookie.ToString().Should().Contain($"{AuthController.RefreshCookieName}=;");
    }
}
