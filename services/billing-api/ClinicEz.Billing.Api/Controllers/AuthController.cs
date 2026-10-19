using ClinicEz.Billing.Api.Authorization;
using ClinicEz.Billing.Domain.Constants;
using ClinicEz.Billing.Infrastructure.Auth;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.LocalAuth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace ClinicEz.Billing.Api.Controllers;

/// <summary>
/// Cell-local sign-in. Credentials live in the billing database and tokens are signed by this service, so the counter works with no
/// internet connection (LAN / air-gapped installs).
/// </summary>
[ApiController]
[Route("api/v1/auth")]
[EnableRateLimiting(FacilityLocalAuthExtensions.AuthRateLimitPolicy)]
public sealed class AuthController : ControllerBase
{
    private readonly BillingAuthService _auth;

    public AuthController(BillingAuthService auth) => _auth = auth;

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<ActionResult<ApiResponse<AuthTokenDto>>> Login([FromBody] LoginRequest request, CancellationToken ct) =>
        Ok(ApiResponse<AuthTokenDto>.Success(await _auth.LoginAsync(request, ct)));

    /// <summary>The signed-in cashier. Any valid cashier session may call it; the internal-service principal is refused by the guard.</summary>
    [HttpGet("me")]
    public async Task<ActionResult<ApiResponse<AuthUserDto>>> Me(CancellationToken ct) =>
        Ok(ApiResponse<AuthUserDto>.Success(await _auth.CurrentUserAsync(ct)));
}

[ApiController]
[Route("api/v1/staff")]
[HasPermission(BillingPermissions.StaffManage)]
public sealed class StaffController : ControllerBase
{
    private readonly StaffAdminService _staff;

    public StaffController(StaffAdminService staff) => _staff = staff;

    [HttpGet]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<StaffDto>>>> List(CancellationToken ct) =>
        Ok(ApiResponse<IReadOnlyList<StaffDto>>.Success(await _staff.ListAsync(ct)));

    [HttpPost]
    public async Task<ActionResult<ApiResponse<StaffDto>>> Create([FromBody] CreateStaffRequest request, CancellationToken ct) =>
        StatusCode(StatusCodes.Status201Created, ApiResponse<StaffDto>.Success(await _staff.CreateAsync(request, ct)));

    [HttpPost("{staffId:guid}/deactivate")]
    public async Task<ActionResult<ApiResponse<StaffDto>>> Deactivate(Guid staffId, CancellationToken ct) =>
        Ok(ApiResponse<StaffDto>.Success(await _staff.DeactivateAsync(staffId, ct)));
}
