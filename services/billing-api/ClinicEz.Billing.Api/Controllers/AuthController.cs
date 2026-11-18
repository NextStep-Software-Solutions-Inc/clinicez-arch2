using ClinicEz.Billing.Api.Authorization;
using ClinicEz.Billing.Domain.Constants;
using ClinicEz.Billing.Infrastructure.Auth;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.LocalAuth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
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
    public const string SessionCookieName = "clinicez_billing_session";
    private const string SessionCookiePath = "/api/v1/auth";
    private const string ClientPlatformHeader = "X-Client-Platform";

    private readonly BillingAuthService _auth;

    public AuthController(BillingAuthService auth) => _auth = auth;

    private bool IsWebClient =>
        Request.Headers.TryGetValue(ClientPlatformHeader, out var platform) &&
        string.Equals(platform.ToString().Trim(), "web", StringComparison.OrdinalIgnoreCase);

    private CookieOptions BuildSessionCookieOptions() => new()
    {
        HttpOnly = true,
        SameSite = SameSiteMode.Lax,
        Secure = Request.IsHttps,
        Path = SessionCookiePath,
        IsEssential = true
        // Intentionally omit Expires/MaxAge so the browser clears it when the browser session ends.
    };

    private void AppendSessionCookie(string token) =>
        Response.Cookies.Append(SessionCookieName, token, BuildSessionCookieOptions());

    private void ClearSessionCookie() =>
        Response.Cookies.Delete(SessionCookieName, BuildSessionCookieOptions());

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<ActionResult<ApiResponse<AuthTokenDto>>> Login([FromBody] LoginRequest request, CancellationToken ct)
    {
        if (IsWebClient)
        {
            var (access, cookie) = await _auth.LoginWebAsync(request, ct);
            AppendSessionCookie(cookie);
            return Ok(ApiResponse<AuthTokenDto>.Success(access));
        }
        return Ok(ApiResponse<AuthTokenDto>.Success(await _auth.LoginAsync(request, ct)));
    }

    [HttpPost("refresh")]
    [AllowAnonymous]
    public async Task<IActionResult> Refresh(CancellationToken ct)
    {
        var cookieToken = IsWebClient && Request.Cookies.TryGetValue(SessionCookieName, out var token) ? token : null;
        var refreshed = await _auth.RefreshWebSessionAsync(cookieToken, ct);
        if (refreshed is null)
        {
            if (IsWebClient || Request.Cookies.ContainsKey(SessionCookieName))
            {
                ClearSessionCookie();
            }
            return Unauthorized(ApiResponse<object>.Fail("Session expired or invalid."));
        }
        return Ok(ApiResponse<AuthTokenDto>.Success(refreshed));
    }

    [HttpPost("logout")]
    [AllowAnonymous]
    public IActionResult Logout()
    {
        if (IsWebClient || Request.Cookies.ContainsKey(SessionCookieName))
        {
            ClearSessionCookie();
        }
        return Ok(ApiResponse<object>.Success(new { }, "Signed out."));
    }

    /// <summary>The signed-in cashier. Any valid cashier session may call it; the internal-service principal is refused by the guard.</summary>
    [HttpGet("me")]
    public async Task<ActionResult<ApiResponse<AuthUserDto>>> Me(CancellationToken ct) =>
        Ok(ApiResponse<AuthUserDto>.Success(await _auth.CurrentUserAsync(ct)));
}

