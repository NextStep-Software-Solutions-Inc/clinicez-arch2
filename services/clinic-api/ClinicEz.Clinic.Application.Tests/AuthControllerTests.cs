using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Infrastructure.Auth;
using ClinicEz.Shared.Common;
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
}
