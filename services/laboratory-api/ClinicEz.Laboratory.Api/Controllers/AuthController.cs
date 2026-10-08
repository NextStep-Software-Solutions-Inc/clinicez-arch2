using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Infrastructure.Auth;
using ClinicEz.Laboratory.Infrastructure.Context;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.LocalAuth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace ClinicEz.Laboratory.Api.Controllers;

/// <summary>
/// Facility-local sign-in. Credentials live in the laboratory database and tokens are signed by this service,
/// so the laboratory works with no internet connection (LAN / air-gapped installs).
/// </summary>
[ApiController]
[Route("api/v1/auth")]
[EnableRateLimiting(FacilityLocalAuthExtensions.AuthRateLimitPolicy)]
public sealed class AuthController : ControllerBase
{
    private readonly ILabAuthService _auth;

    public AuthController(ILabAuthService auth) => _auth = auth;

    private string? FacilityHeader =>
        Request.Headers.TryGetValue("X-Facility-Slug", out var f) && !string.IsNullOrWhiteSpace(f) ? f.ToString().Trim() : null;

    private string? TenantHeader =>
        Request.Headers.TryGetValue("X-Tenant-Id", out var v) && !string.IsNullOrWhiteSpace(v) ? v.ToString().Trim() : null;

    private string? WorkspaceHeader =>
        FacilityHeader ?? TenantHeader;

    [HttpGet("status")]
    [AllowAnonymous]
    public async Task<ActionResult<ApiResponse<AuthStatusDto>>> GetStatus([FromQuery] string? workspace, CancellationToken ct)
    {
        var status = await _auth.GetStatusAsync(workspace ?? WorkspaceHeader, ct);
        return Ok(ApiResponse<AuthStatusDto>.Success(status));
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login([FromBody] LoginRequest request, CancellationToken ct)
    {
        var outcome = await _auth.LoginAsync(request with { Workspace = request.Workspace ?? WorkspaceHeader }, ct);
        return ToResult(outcome);
    }

    [HttpPost("refresh")]
    [AllowAnonymous]
    public async Task<IActionResult> Refresh([FromBody] RefreshRequest request, CancellationToken ct) =>
        ToResult(await _auth.RefreshAsync(request.RefreshToken, ct));

    [HttpPost("logout")]
    [AllowAnonymous]
    public async Task<IActionResult> Logout([FromBody] RefreshRequest request, CancellationToken ct)
    {
        await _auth.LogoutAsync(request.RefreshToken, ct);
        return Ok(ApiResponse<object>.Success(new { }, "Signed out."));
    }

    [HttpPost("bootstrap")]
    [AllowAnonymous]
    public async Task<IActionResult> Bootstrap([FromBody] BootstrapRequest request, CancellationToken ct) =>
        ToResult(await _auth.BootstrapAsync(request with { Workspace = request.Workspace ?? WorkspaceHeader }, ct));

    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request, CancellationToken ct)
    {
        if (!TryGetStaffId(out var staffId)) return Unauthorized();
        return ToResult(await _auth.ChangePasswordAsync(staffId, request, Request.Headers.UserAgent.ToString(), ct));
    }

    [HttpGet("me")]
    public async Task<IActionResult> Me(CancellationToken ct)
    {
        if (!TryGetStaffId(out var staffId)) return Unauthorized();
        var me = await _auth.GetCurrentUserAsync(staffId, ct);
        return me is null
            ? Unauthorized()
            : Ok(ApiResponse<AuthUserDto>.Success(me with { Permissions = User.FindAll(LabClaimTypes.Permission).Select(c => c.Value).ToList() }));
    }

    private bool TryGetStaffId(out Guid staffId)
    {
        staffId = Guid.Empty;
        if (User.HasClaim(FacilityAuthSchemes.InternalClaim, "true")) return false;
        return Guid.TryParse(User.FindFirst(LabClaimTypes.Subject)?.Value, out staffId);
    }

    private IActionResult ToResult(AuthOutcome outcome)
    {
        if (outcome.Ok)
        {
            return Ok(ApiResponse<AuthTokensDto>.Success(outcome.Tokens!));
        }

        var status = outcome.Failure switch
        {
            AuthFailure.InvalidCredentials => StatusCodes.Status401Unauthorized,
            AuthFailure.InvalidToken => StatusCodes.Status401Unauthorized,
            AuthFailure.AccountLocked => StatusCodes.Status423Locked,
            AuthFailure.WorkspaceNotFound => StatusCodes.Status404NotFound,
            AuthFailure.NotFound => StatusCodes.Status404NotFound,
            AuthFailure.ActivationRequired => StatusCodes.Status403Forbidden,
            AuthFailure.LicenseTampered => StatusCodes.Status403Forbidden,
            AuthFailure.AlreadyBootstrapped => StatusCodes.Status409Conflict,
            _ => StatusCodes.Status400BadRequest
        };

        var errors = outcome.Errors?.Select(e => new ApiFieldError("Password", outcome.Failure.ToString().ToUpperInvariant(), e)).ToArray();
        return StatusCode(status, ApiResponse<object>.Fail(outcome.Message ?? "Request failed.", errors));
    }
}
