using System;
using System.Linq;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Auth.DTOs;
using ClinicEz.Clinic.Infrastructure.Auth;
using ClinicEz.Clinic.Infrastructure.Context;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.LocalAuth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace ClinicEz.Clinic.Api.Controllers;

/// <summary>
/// Facility-local sign-in. Credentials live in the clinic database and tokens are signed by this service,
/// so the clinic works with no internet connection (LAN / air-gapped installs).
/// </summary>
[ApiController]
[Route("api/v1/auth")]
[EnableRateLimiting(FacilityLocalAuthExtensions.AuthRateLimitPolicy)]
public sealed class AuthController : ControllerBase
{
    private readonly IClinicAuthService _auth;

    public AuthController(IClinicAuthService auth) => _auth = auth;

    private string? FacilityHeader =>
        Request.Headers.TryGetValue("X-Facility-Slug", out var f) && !string.IsNullOrWhiteSpace(f) ? f.ToString().Trim() : null;

    private string? TenantHeader =>
        Request.Headers.TryGetValue("X-Tenant-Id", out var v) && !string.IsNullOrWhiteSpace(v) ? v.ToString().Trim() : null;

    private string? ClinicIdHeader =>
        Request.Headers.TryGetValue("X-Clinic-Id", out var c) && !string.IsNullOrWhiteSpace(c) ? c.ToString().Trim() : null;

    private string? WorkspaceHeader =>
        FacilityHeader ?? TenantHeader ?? ClinicIdHeader;

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

    [HttpGet("invitations/{token}")]
    [AllowAnonymous]
    public async Task<ActionResult<ApiResponse<ClinicStaffInvitationDetailsDto>>> GetInvitationDetails(string token, CancellationToken ct)
    {
        var details = await _auth.GetInvitationDetailsAsync(token, ct);
        if (details == null)
        {
            return NotFound(ApiResponse<ClinicStaffInvitationDetailsDto>.Fail("Invitation was not found or is invalid."));
        }
        return Ok(ApiResponse<ClinicStaffInvitationDetailsDto>.Success(details));
    }

    [HttpPost("invitations/{token}/accept")]
    [AllowAnonymous]
    public async Task<IActionResult> AcceptInvitation(string token, [FromBody] AcceptClinicInvitationRequest request, CancellationToken ct)
    {
        var outcome = await _auth.AcceptInvitationAsync(token, request.Password, Request.Headers.UserAgent.ToString(), ct);
        return ToResult(outcome);
    }

    [HttpPost("change-password")]
    [Authorize]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request, CancellationToken ct)
    {
        if (!TryGetStaffId(out var staffId)) return Unauthorized();
        return ToResult(await _auth.ChangePasswordAsync(staffId, request, Request.Headers.UserAgent.ToString(), ct));
    }

    [HttpGet("me")]
    [Authorize]
    public async Task<IActionResult> Me(CancellationToken ct)
    {
        if (!TryGetStaffId(out var staffId)) return Unauthorized();
        var me = await _auth.GetCurrentUserAsync(staffId, ct);
        return me is null
            ? Unauthorized()
            : Ok(ApiResponse<AuthUserDto>.Success(me with { Permissions = User.FindAll(ClinicClaimTypes.Permission).Select(c => c.Value).ToList() }));
    }

    private bool TryGetStaffId(out Guid staffId)
    {
        staffId = Guid.Empty;
        if (User.HasClaim(FacilityAuthSchemes.InternalClaim, "true")) return false;
        return Guid.TryParse(User.FindFirst(ClinicClaimTypes.Subject)?.Value, out staffId);
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

public sealed record AcceptClinicInvitationRequest(string Password);

