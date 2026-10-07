using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Laboratory.Infrastructure.Context;
using ClinicEz.Laboratory.Infrastructure.Persistence;
using ClinicEz.Shared.Licensing;
using ClinicEz.Shared.LocalAuth;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Laboratory.Infrastructure.Auth;

public interface ILabAuthService
{
    Task<AuthStatusDto> GetStatusAsync(string? workspace, CancellationToken ct = default);

    Task<AuthOutcome> LoginAsync(LoginRequest request, CancellationToken ct = default);

    Task<AuthOutcome> RefreshAsync(string? refreshToken, CancellationToken ct = default);

    Task LogoutAsync(string? refreshToken, CancellationToken ct = default);

    Task<AuthOutcome> BootstrapAsync(BootstrapRequest request, CancellationToken ct = default);

    Task<AuthOutcome> ChangePasswordAsync(Guid staffId, ChangePasswordRequest request, string? deviceLabel, CancellationToken ct = default);

    /// <summary>Admin sets a temporary password. The staff member must change it at next login.</summary>
    Task<AuthOutcome> SetTemporaryPasswordAsync(Guid staffId, Guid laboratoryId, string? temporaryPassword, CancellationToken ct = default);

    Task<bool> RevokeSessionsAsync(Guid staffId, Guid laboratoryId, CancellationToken ct = default);

    Task<AuthUserDto?> GetCurrentUserAsync(Guid staffId, CancellationToken ct = default);
}

/// <summary>
/// Facility-local authentication: verifies credentials against the laboratory database and issues short-lived JWTs plus
/// rotating refresh tokens. Needs no internet, identity provider or cloud service, so a laboratory keeps working on its LAN.
/// The laboratory has its own user store, audience and signing key: it never shares identity with the clinic.
/// </summary>
public sealed class LabAuthService : ILabAuthService
{
    // Pre-computed hash used to equalise timing for unknown accounts.
    private readonly string _dummyHash;

    private readonly ApplicationDbContext _db;
    private readonly IWorkspaceResolver _workspaces;
    private readonly IFacilityLicenseValidator _license;
    private readonly IFacilityTokenService _tokens;
    private readonly IFacilityPasswordHasher _hasher;
    private readonly IStaffAccessCache _accessCache;
    private readonly ILogger<LabAuthService> _logger;

    public LabAuthService(
        ApplicationDbContext db,
        IWorkspaceResolver workspaces,
        IFacilityLicenseValidator license,
        IFacilityTokenService tokens,
        IFacilityPasswordHasher hasher,
        IStaffAccessCache accessCache,
        ILogger<LabAuthService> logger)
    {
        _db = db;
        _workspaces = workspaces;
        _license = license;
        _tokens = tokens;
        _hasher = hasher;
        _accessCache = accessCache;
        _logger = logger;
        _dummyHash = _hasher.Hash("dummy-password-for-timing-only-1");
    }

    private FacilityJwtOptions Options => _tokens.Options;

    public async Task<AuthStatusDto> GetStatusAsync(string? workspace, CancellationToken ct = default)
    {
        var resolved = await _workspaces.ResolveAsync(workspace, ct);
        if (resolved is null) return new AuthStatusDto(false, "WorkspaceNotFound", false, null);

        var validation = _license.Validate(resolved.Settings.LicenseToken, resolved.LaboratoryId, resolved.TenantId);
        var status = validation.IsMissing ? "ActivationRequired"
            : validation.IsTampered ? "Tampered"
            : validation.IsExpired ? "Expired"
            : "Active";

        var hasCredentials = await _db.LabStaffMembers.IgnoreQueryFilters()
            .AnyAsync(s => s.LaboratoryId == resolved.LaboratoryId && !s.IsDeleted && s.PasswordHash != null, ct);

        return new AuthStatusDto(true, status, status != "ActivationRequired" && status != "Tampered" && !hasCredentials, resolved.Settings.LaboratoryName);
    }

    public async Task<AuthOutcome> LoginAsync(LoginRequest request, CancellationToken ct = default)
    {
        var email = NormalizeEmail(request.Email);
        if (email is null || string.IsNullOrEmpty(request.Password))
            return AuthOutcome.Fail(AuthFailure.InvalidCredentials, "Invalid email or password.");

        var resolved = await _workspaces.ResolveAsync(request.Workspace, ct);
        if (resolved is null)
            return AuthOutcome.Fail(AuthFailure.WorkspaceNotFound, "Workspace was not found or is not activated.");

        var gate = CheckLicense(resolved);
        if (gate is not null) return gate;

        var matches = await _db.LabStaffMembers.IgnoreQueryFilters()
            .Where(s => s.LaboratoryId == resolved.LaboratoryId && !s.IsDeleted && s.Email != null && s.Email.ToLower() == email)
            .Take(2)
            .ToListAsync(ct);

        var staff = matches.Count == 1 ? matches[0] : null;
        if (staff is null || string.IsNullOrEmpty(staff.PasswordHash) || !staff.IsActive)
        {
            _hasher.Verify(_dummyHash, request.Password);
            return AuthOutcome.Fail(AuthFailure.InvalidCredentials, "Invalid email or password.");
        }

        var now = DateTime.UtcNow;
        if (staff.LockoutEnd is { } lockoutEnd && lockoutEnd > now)
        {
            return AuthOutcome.Fail(AuthFailure.AccountLocked, "Account is temporarily locked. Try again later.");
        }

        if (!_hasher.Verify(staff.PasswordHash, request.Password))
        {
            staff.FailedLoginCount++;
            if (staff.FailedLoginCount >= Options.MaxFailedLoginAttempts)
            {
                staff.LockoutEnd = now.AddMinutes(Options.LockoutMinutes);
                staff.FailedLoginCount = 0;
                _logger.LogWarning("[Auth] Lab staff {StaffId} locked out after repeated failed logins.", staff.Id);
            }
            await _db.SaveChangesAsync(ct);
            return AuthOutcome.Fail(AuthFailure.InvalidCredentials, "Invalid email or password.");
        }

        staff.FailedLoginCount = 0;
        staff.LockoutEnd = null;
        staff.LastLoginAt = now;

        var tokens = await IssueTokensAsync(staff, resolved, Guid.NewGuid(), request.DeviceLabel, ct);
        return AuthOutcome.Success(tokens);
    }

    public async Task<AuthOutcome> RefreshAsync(string? refreshToken, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(refreshToken))
            return AuthOutcome.Fail(AuthFailure.InvalidToken, "Invalid refresh token.");

        var hash = _tokens.HashRefreshToken(refreshToken.Trim());
        var stored = await _db.LabRefreshTokens.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
        if (stored is null) return AuthOutcome.Fail(AuthFailure.InvalidToken, "Invalid refresh token.");

        var now = DateTime.UtcNow;
        if (stored.RevokedAt is not null)
        {
            // A rotated/revoked token was presented again: assume theft and revoke the whole family.
            await RevokeFamilyAsync(stored.FamilyId, now, ct);
            _logger.LogWarning("[Auth] Refresh token reuse detected for lab staff {StaffId}; family revoked.", stored.StaffMemberId);
            return AuthOutcome.Fail(AuthFailure.InvalidToken, "Invalid refresh token.");
        }

        if (stored.ExpiresAt <= now) return AuthOutcome.Fail(AuthFailure.InvalidToken, "Refresh token expired.");

        var staff = await _db.LabStaffMembers.IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.Id == stored.StaffMemberId && !s.IsDeleted, ct);
        if (staff is null || !staff.IsActive)
            return AuthOutcome.Fail(AuthFailure.InvalidToken, "Invalid refresh token.");

        var resolved = await ResolveByLaboratoryAsync(staff.LaboratoryId, ct);
        if (resolved is null) return AuthOutcome.Fail(AuthFailure.WorkspaceNotFound, "Workspace was not found or is not activated.");

        var gate = CheckLicense(resolved);
        if (gate is not null) return gate;

        var issued = await IssueTokensAsync(staff, resolved, stored.FamilyId, stored.DeviceLabel, ct, replacing: stored);
        return AuthOutcome.Success(issued);
    }

    public async Task LogoutAsync(string? refreshToken, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(refreshToken)) return;
        var hash = _tokens.HashRefreshToken(refreshToken.Trim());
        var stored = await _db.LabRefreshTokens.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
        if (stored is null) return;
        await RevokeFamilyAsync(stored.FamilyId, DateTime.UtcNow, ct);
    }

    public async Task<AuthOutcome> BootstrapAsync(BootstrapRequest request, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.LicenseToken))
            return AuthOutcome.Fail(AuthFailure.InvalidRequest, "License key is required.");

        var problems = _hasher.ValidateStrength(request.Password, Options.MinPasswordLength);
        if (problems.Count > 0) return AuthOutcome.Fail(AuthFailure.WeakPassword, problems[0], problems);

        var resolved = await _workspaces.ResolveAsync(request.Workspace, ct);
        if (resolved is null)
            return AuthOutcome.Fail(AuthFailure.WorkspaceNotFound, "Workspace was not found. Activate the facility license first.");

        // Possession of the activated license key is the proof of ownership (verified offline).
        var presented = request.LicenseToken.Trim();
        var installed = resolved.Settings.LicenseToken ?? string.Empty;
        if (!FixedTimeEquals(presented, installed))
            return AuthOutcome.Fail(AuthFailure.InvalidCredentials, "The license key does not match this facility.");

        var validation = _license.Validate(installed, resolved.LaboratoryId, resolved.TenantId);
        if (validation.IsMissing) return AuthOutcome.Fail(AuthFailure.ActivationRequired, "Facility activation required.");
        if (validation.IsTampered) return AuthOutcome.Fail(AuthFailure.LicenseTampered, "The facility license failed verification.");

        var alreadyBootstrapped = await _db.LabStaffMembers.IgnoreQueryFilters()
            .AnyAsync(s => s.LaboratoryId == resolved.LaboratoryId && !s.IsDeleted && s.PasswordHash != null, ct);
        if (alreadyBootstrapped)
            return AuthOutcome.Fail(AuthFailure.AlreadyBootstrapped, "This facility already has an administrator. Sign in instead.");

        var payload = validation.Payload;
        var email = NormalizeEmail(payload?.OwnerEmail) ?? NormalizeEmail(request.Email);
        if (email is null)
            return AuthOutcome.Fail(AuthFailure.InvalidRequest, "An administrator email is required.");

        var staff = await _db.LabStaffMembers.IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.LaboratoryId == resolved.LaboratoryId && !s.IsDeleted && s.Email != null && s.Email.ToLower() == email, ct);

        if (staff is null)
        {
            var (first, last) = SplitName(payload?.OwnerName ?? request.FullName);
            staff = new LabStaffMember
            {
                Id = Guid.NewGuid(),
                TenantId = resolved.TenantId,
                LaboratoryId = resolved.LaboratoryId,
                FirstName = first,
                LastName = last,
                Email = email,
                Role = LabStaffRole.LabAdmin,
                IsActive = true,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "System:Bootstrap"
            };
            _db.LabStaffMembers.Add(staff);
        }
        else
        {
            staff.Role = LabStaffRole.LabAdmin;
            staff.IsActive = true;
        }

        staff.PasswordHash = _hasher.Hash(request.Password!);
        staff.MustChangePassword = false;
        staff.FailedLoginCount = 0;
        staff.LockoutEnd = null;
        staff.LastLoginAt = DateTime.UtcNow;

        _logger.LogInformation("[Auth] Laboratory {LaboratoryId} bootstrapped its first administrator.", resolved.LaboratoryId);
        var tokens = await IssueTokensAsync(staff, resolved, Guid.NewGuid(), "bootstrap", ct);
        return AuthOutcome.Success(tokens);
    }

    public async Task<AuthOutcome> ChangePasswordAsync(Guid staffId, ChangePasswordRequest request, string? deviceLabel, CancellationToken ct = default)
    {
        var staff = await _db.LabStaffMembers.IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.Id == staffId && !s.IsDeleted && s.IsActive, ct);
        if (staff is null || string.IsNullOrEmpty(staff.PasswordHash))
            return AuthOutcome.Fail(AuthFailure.NotFound, "Account not found.");

        if (string.IsNullOrEmpty(request.CurrentPassword) || !_hasher.Verify(staff.PasswordHash, request.CurrentPassword))
            return AuthOutcome.Fail(AuthFailure.InvalidCredentials, "Current password is incorrect.");

        var problems = _hasher.ValidateStrength(request.NewPassword, Options.MinPasswordLength);
        if (problems.Count > 0) return AuthOutcome.Fail(AuthFailure.WeakPassword, problems[0], problems);

        if (_hasher.Verify(staff.PasswordHash, request.NewPassword!))
            return AuthOutcome.Fail(AuthFailure.WeakPassword, "New password must be different from the current password.");

        var resolved = await ResolveByLaboratoryAsync(staff.LaboratoryId, ct);
        if (resolved is null) return AuthOutcome.Fail(AuthFailure.WorkspaceNotFound, "Workspace was not found or is not activated.");

        staff.PasswordHash = _hasher.Hash(request.NewPassword!);
        staff.MustChangePassword = false;
        staff.TokenVersion++;
        await RevokeAllRefreshTokensAsync(staff.Id, DateTime.UtcNow, ct, save: false);
        _accessCache.Invalidate(staff.Id);

        var tokens = await IssueTokensAsync(staff, resolved, Guid.NewGuid(), deviceLabel, ct);
        return AuthOutcome.Success(tokens);
    }

    public async Task<AuthOutcome> SetTemporaryPasswordAsync(Guid staffId, Guid laboratoryId, string? temporaryPassword, CancellationToken ct = default)
    {
        var problems = _hasher.ValidateStrength(temporaryPassword, Options.MinPasswordLength);
        if (problems.Count > 0) return AuthOutcome.Fail(AuthFailure.WeakPassword, problems[0], problems);

        // An admin can only manage staff of their own laboratory (the id comes from their session, never from the client).
        var staff = await _db.LabStaffMembers.IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.Id == staffId && s.LaboratoryId == laboratoryId && !s.IsDeleted, ct);
        if (staff is null) return AuthOutcome.Fail(AuthFailure.NotFound, "Staff member not found.");

        var email = NormalizeEmail(staff.Email);
        if (email is null)
            return AuthOutcome.Fail(AuthFailure.InvalidRequest, "The staff member needs an email address before credentials can be set.");

        var duplicate = await _db.LabStaffMembers.IgnoreQueryFilters().AnyAsync(
            s => s.Id != staff.Id && s.LaboratoryId == staff.LaboratoryId && !s.IsDeleted && s.Email != null && s.Email.ToLower() == email && s.PasswordHash != null, ct);
        if (duplicate)
            return AuthOutcome.Fail(AuthFailure.InvalidRequest, "Another staff member with this email already has sign-in credentials.");

        staff.PasswordHash = _hasher.Hash(temporaryPassword!);
        staff.MustChangePassword = true;
        staff.FailedLoginCount = 0;
        staff.LockoutEnd = null;
        staff.TokenVersion++;
        await RevokeAllRefreshTokensAsync(staff.Id, DateTime.UtcNow, ct, save: false);
        await _db.SaveChangesAsync(ct);
        _accessCache.Invalidate(staff.Id);
        return new AuthOutcome(true, null, AuthFailure.None, null);
    }

    public async Task<bool> RevokeSessionsAsync(Guid staffId, Guid laboratoryId, CancellationToken ct = default)
    {
        var staff = await _db.LabStaffMembers.IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.Id == staffId && s.LaboratoryId == laboratoryId && !s.IsDeleted, ct);
        if (staff is null) return false;

        staff.TokenVersion++;
        await RevokeAllRefreshTokensAsync(staff.Id, DateTime.UtcNow, ct, save: false);
        await _db.SaveChangesAsync(ct);
        _accessCache.Invalidate(staff.Id);
        return true;
    }

    public async Task<AuthUserDto?> GetCurrentUserAsync(Guid staffId, CancellationToken ct = default)
    {
        var staff = await _db.LabStaffMembers.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == staffId && !s.IsDeleted && s.IsActive, ct);
        if (staff is null) return null;

        var resolved = await ResolveByLaboratoryAsync(staff.LaboratoryId, ct);
        return ToUser(staff, resolved?.Settings.LaboratoryName ?? string.Empty);
    }

    // ── helpers ─────────────────────────────────────────────────────────────────────────

    private AuthOutcome? CheckLicense(ResolvedWorkspace resolved)
    {
        var validation = _license.Validate(resolved.Settings.LicenseToken, resolved.LaboratoryId, resolved.TenantId);
        if (validation.IsMissing)
            return AuthOutcome.Fail(AuthFailure.ActivationRequired, "Facility activation required. Apply the facility license key first.");
        if (validation.IsTampered)
            return AuthOutcome.Fail(AuthFailure.LicenseTampered, "The facility license failed verification.");
        // Expired licenses still sign in: the laboratory runs in read-only grace mode rather than being locked out mid-shift.
        return null;
    }

    private async Task<ResolvedWorkspace?> ResolveByLaboratoryAsync(Guid laboratoryId, CancellationToken ct)
    {
        var settings = await _db.LabSettings.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(s => s.LaboratoryId == laboratoryId && !s.IsDeleted, ct);
        return settings is null ? null : new ResolvedWorkspace(settings, settings.TenantId, settings.LaboratoryId);
    }

    private async Task<AuthTokensDto> IssueTokensAsync(
        LabStaffMember staff,
        ResolvedWorkspace resolved,
        Guid familyId,
        string? deviceLabel,
        CancellationToken ct,
        LabRefreshToken? replacing = null)
    {
        var now = DateTime.UtcNow;
        var claims = new List<Claim>
        {
            new(LabClaimTypes.Subject, staff.Id.ToString()),
            new(LabClaimTypes.TenantId, resolved.TenantId),
            new(LabClaimTypes.LaboratoryId, resolved.LaboratoryId.ToString()),
            new(LabClaimTypes.TokenVersion, staff.TokenVersion.ToString()),
            new(LabClaimTypes.StaffRole, staff.Role.ToString()),
            new(LabClaimTypes.Name, $"{staff.FirstName} {staff.LastName}".Trim()),
            new("jti", Guid.NewGuid().ToString("N"))
        };

        var access = _tokens.CreateAccessToken(claims);

        var rawRefresh = _tokens.GenerateRefreshToken();
        var refreshExpires = now.AddDays(Options.RefreshTokenDays);
        var refresh = new LabRefreshToken
        {
            Id = Guid.NewGuid(),
            StaffMemberId = staff.Id,
            TenantId = resolved.TenantId,
            LaboratoryId = resolved.LaboratoryId,
            TokenHash = _tokens.HashRefreshToken(rawRefresh),
            FamilyId = familyId,
            ExpiresAt = refreshExpires,
            DeviceLabel = Truncate(deviceLabel, 150),
            CreatedAt = now,
            CreatedBy = "System:Auth"
        };
        _db.LabRefreshTokens.Add(refresh);

        if (replacing is not null)
        {
            replacing.RevokedAt = now;
            replacing.ReplacedByTokenId = refresh.Id;
        }

        await _db.SaveChangesAsync(ct);
        return new AuthTokensDto(access.Token, rawRefresh, access.ExpiresAtUtc, refreshExpires, ToUser(staff, resolved.Settings.LaboratoryName));
    }

    private static AuthUserDto ToUser(LabStaffMember staff, string laboratoryName) => new(
        staff.Id,
        $"{staff.FirstName} {staff.LastName}".Trim(),
        staff.Role.ToString(),
        RoleDisplayName(staff.Role),
        staff.LaboratoryId,
        staff.TenantId,
        laboratoryName,
        StaffPermissions.For(staff),
        staff.MustChangePassword);

    private static string RoleDisplayName(LabStaffRole role) => role switch
    {
        LabStaffRole.LabAdmin => "Laboratory Administrator",
        LabStaffRole.Pathologist => "Pathologist",
        LabStaffRole.MedicalTechnologist => "Medical Technologist",
        LabStaffRole.Phlebotomist => "Phlebotomist",
        LabStaffRole.LabClerk => "Laboratory Clerk",
        _ => role.ToString()
    };

    private async Task RevokeFamilyAsync(Guid familyId, DateTime now, CancellationToken ct)
    {
        var family = await _db.LabRefreshTokens.IgnoreQueryFilters()
            .Where(t => t.FamilyId == familyId && t.RevokedAt == null).ToListAsync(ct);
        foreach (var t in family) t.RevokedAt = now;
        await _db.SaveChangesAsync(ct);
    }

    private async Task RevokeAllRefreshTokensAsync(Guid staffId, DateTime now, CancellationToken ct, bool save)
    {
        var tokens = await _db.LabRefreshTokens.IgnoreQueryFilters()
            .Where(t => t.StaffMemberId == staffId && t.RevokedAt == null).ToListAsync(ct);
        foreach (var t in tokens) t.RevokedAt = now;
        if (save) await _db.SaveChangesAsync(ct);
    }

    private static string? NormalizeEmail(string? email)
    {
        var e = email?.Trim().ToLowerInvariant();
        return string.IsNullOrEmpty(e) || !e.Contains('@') ? null : e;
    }

    private static (string First, string Last) SplitName(string? fullName)
    {
        var parts = (fullName ?? string.Empty).Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        return parts.Length switch
        {
            0 => ("Laboratory", "Administrator"),
            1 => (parts[0], "Administrator"),
            _ => (string.Join(' ', parts.Take(parts.Length - 1)), parts[^1])
        };
    }

    private static string? Truncate(string? value, int max) =>
        string.IsNullOrEmpty(value) ? null : value.Length <= max ? value : value[..max];

    private static bool FixedTimeEquals(string a, string b)
    {
        var ha = SHA256.HashData(Encoding.UTF8.GetBytes(a));
        var hb = SHA256.HashData(Encoding.UTF8.GetBytes(b));
        return CryptographicOperations.FixedTimeEquals(ha, hb);
    }
}
