using System.Security.Claims;
using ClinicEz.Billing.Application.Abstractions;
using ClinicEz.Billing.Domain.Constants;
using ClinicEz.Billing.Domain.Entities;
using ClinicEz.Billing.Infrastructure.Persistence;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.LocalAuth;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Billing.Infrastructure.Auth;

/// <summary>
/// Cell-local cashier sign-in: credentials are verified against the billing database and a signed access token is issued, so the
/// counter keeps working on the LAN with no identity provider. There are no refresh tokens: sessions last a shift
/// (<c>Jwt:AccessTokenMinutes</c>) and are revoked by bumping the staff member's token version.
/// </summary>
public sealed class BillingAuthService
{
    private static readonly Lazy<string> DummyHash = new(() => new FacilityPasswordHasher().Hash("dummy-password-for-timing-only-1"));

    private readonly ApplicationDbContext _db;
    private readonly IBillingContext _context;
    private readonly IFacilityTokenService _tokens;
    private readonly IFacilityPasswordHasher _hasher;
    private readonly TimeProvider _clock;
    private readonly ILogger<BillingAuthService> _logger;

    public BillingAuthService(
        ApplicationDbContext db, IBillingContext context, IFacilityTokenService tokens, IFacilityPasswordHasher hasher, TimeProvider clock,
        ILogger<BillingAuthService> logger)
    {
        _db = db;
        _context = context;
        _tokens = tokens;
        _hasher = hasher;
        _clock = clock;
        _logger = logger;
    }

    private FacilityJwtOptions Options => _tokens.Options;

    public async Task<AuthTokenDto> LoginAsync(LoginRequest request, CancellationToken ct)
    {
        var tenantId = request.TenantId?.Trim();
        var facilityId = request.FacilityId?.Trim();
        var email = StaffNormalizer.Email(request.Email);
        if (string.IsNullOrEmpty(tenantId) || string.IsNullOrEmpty(facilityId) || email is null || string.IsNullOrEmpty(request.Password))
            throw new UnauthorizedException("Invalid credentials.");

        var staff = await _db.BillingStaff.FirstOrDefaultAsync(s => s.TenantId == tenantId && s.FacilityId == facilityId && s.Email == email, ct);
        if (staff is null || !staff.IsActive)
        {
            _hasher.Verify(DummyHash.Value, request.Password);
            throw new UnauthorizedException("Invalid credentials.");
        }

        var now = _clock.GetUtcNow().UtcDateTime;
        if (staff.LockoutEnd is { } lockoutEnd && lockoutEnd > now)
            throw new TooManyRequestsException("This account is temporarily locked. Try again later.");

        if (!_hasher.Verify(staff.PasswordHash, request.Password))
        {
            staff.FailedLoginCount++;
            if (staff.FailedLoginCount >= Options.MaxFailedLoginAttempts)
            {
                staff.LockoutEnd = now.AddMinutes(Options.LockoutMinutes);
                staff.FailedLoginCount = 0;
                _logger.LogWarning("[Auth] Billing staff {StaffId} locked out after repeated failed sign-ins.", staff.Id);
            }

            await _db.SaveChangesAsync(ct);
            throw new UnauthorizedException("Invalid credentials.");
        }

        staff.FailedLoginCount = 0;
        staff.LockoutEnd = null;
        staff.LastLoginAtUtc = now;
        await _db.SaveChangesAsync(ct);

        var access = _tokens.CreateAccessToken(new[]
        {
            new Claim(BillingClaimTypes.Subject, staff.Id.ToString()),
            new Claim(BillingClaimTypes.TenantId, staff.TenantId),
            new Claim(BillingClaimTypes.FacilityId, staff.FacilityId),
            new Claim(BillingClaimTypes.TokenVersion, staff.TokenVersion.ToString()),
            new Claim(BillingClaimTypes.StaffRole, staff.Role.ToString()),
            new Claim(BillingClaimTypes.Name, staff.FullName),
            new Claim("jti", Guid.NewGuid().ToString("N"))
        });
        return new AuthTokenDto(access.Token, access.ExpiresAtUtc, ToUser(staff));
    }

    public async Task<AuthUserDto> CurrentUserAsync(CancellationToken ct)
    {
        var caller = _context.RequireStaff();
        var staff = await _db.BillingStaff.AsNoTracking().FirstOrDefaultAsync(s => s.TenantId == caller.TenantId && s.Id == caller.UserId && s.IsActive, ct)
            ?? throw new UnauthorizedException("Session is no longer valid.");
        return ToUser(staff);
    }

    private static AuthUserDto ToUser(BillingStaff staff) =>
        new(staff.Id, staff.FullName, staff.Email, staff.Role, staff.TenantId, staff.FacilityId, BillingRolePermissions.For(staff.Role));
}

internal static class StaffNormalizer
{
    public static string? Email(string? email)
    {
        var e = email?.Trim().ToLowerInvariant();
        return string.IsNullOrEmpty(e) || !e.Contains('@') ? null : e;
    }
}
