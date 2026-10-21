using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Infrastructure.Context;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Licensing;
using ClinicEz.Shared.LocalAuth;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Configuration;
using ClinicEz.Shared.Security.Turnstile;

namespace ClinicEz.Clinic.Infrastructure.Auth;

public interface IClinicAuthService
{
    Task<AuthStatusDto> GetStatusAsync(string? workspace, CancellationToken ct = default);

    Task<AuthOutcome> LoginAsync(LoginRequest request, CancellationToken ct = default);

    Task<AuthOutcome> RefreshAsync(string? refreshToken, CancellationToken ct = default);

    Task LogoutAsync(string? refreshToken, CancellationToken ct = default);

    Task<AuthOutcome> BootstrapAsync(BootstrapRequest request, CancellationToken ct = default);

    Task<AuthOutcome> ChangePasswordAsync(Guid staffId, ChangePasswordRequest request, string? deviceLabel, CancellationToken ct = default);

    /// <summary>Admin sets a temporary password. The staff member must change it at next login.</summary>
    Task<AuthOutcome> SetTemporaryPasswordAsync(Guid staffId, string? temporaryPassword, CancellationToken ct = default);

    Task<bool> RevokeSessionsAsync(Guid staffId, CancellationToken ct = default);

    Task<AuthUserDto?> GetCurrentUserAsync(Guid staffId, CancellationToken ct = default);
}

/// <summary>
/// Facility-local authentication: verifies credentials against the clinic database and issues short-lived JWTs plus
/// rotating refresh tokens. Needs no internet, identity provider or cloud service, so a clinic keeps working on its LAN.
/// </summary>
public sealed class ClinicAuthService : IClinicAuthService
{
    private static readonly Guid LegacyDefaultClinicId = Guid.Parse("11111111-1111-1111-1111-111111111111");

    // Pre-computed hash used to equalise timing for unknown accounts.
    private readonly string _dummyHash;

    private readonly ApplicationDbContext _db;
    private readonly IWorkspaceResolver _workspaces;
    private readonly IFacilityLicenseValidator _license;
    private readonly IFacilityTokenService _tokens;
    private readonly IFacilityPasswordHasher _hasher;
    private readonly IStaffAccessCache _accessCache;
    private readonly ILogger<ClinicAuthService> _logger;
    private readonly ITurnstileSettingResolver _turnstileResolver;
    private readonly ITurnstileValidator? _turnstileValidator;

    public ClinicAuthService(
        ApplicationDbContext db,
        IWorkspaceResolver workspaces,
        IFacilityLicenseValidator license,
        IFacilityTokenService tokens,
        IFacilityPasswordHasher hasher,
        IStaffAccessCache accessCache,
        ILogger<ClinicAuthService> logger,
        ITurnstileSettingResolver? turnstileResolver = null,
        ITurnstileValidator? turnstileValidator = null)
    {
        _db = db;
        _workspaces = workspaces;
        _license = license;
        _tokens = tokens;
        _hasher = hasher;
        _accessCache = accessCache;
        _logger = logger;
        _dummyHash = _hasher.Hash("dummy-password-for-timing-only-1");
        _turnstileResolver = turnstileResolver ?? new TurnstileSettingResolver(new ConfigurationBuilder().Build());
        _turnstileValidator = turnstileValidator;
    }

    private FacilityJwtOptions Options => _tokens.Options;

    public async Task<AuthStatusDto> GetStatusAsync(string? workspace, CancellationToken ct = default)
    {
        var resolved = await _workspaces.ResolveAsync(workspace, ct);
        if (resolved is null) return new AuthStatusDto(false, "WorkspaceNotFound", false, null);

        var validation = _license.Validate(resolved.Settings.LicenseToken, resolved.ClinicId, resolved.TenantId);
        var status = validation.IsMissing ? "ActivationRequired"
            : validation.IsTampered ? "Tampered"
            : validation.IsExpired ? "Expired"
            : "Active";

        var hasCredentials = await _db.StaffMembers.IgnoreQueryFilters()
            .AnyAsync(s => s.ClinicId == resolved.ClinicId && !s.IsDeleted && s.PasswordHash != null, ct);

        var turnstileEnabled = _turnstileResolver.IsEnabled(resolved.Settings.TurnstileEnabled);
        var turnstileSiteKey = _turnstileResolver.GetSiteKey(resolved.Settings.TurnstileSiteKey);

        return new AuthStatusDto(
            true,
            status,
            status != "ActivationRequired" && status != "Tampered" && !hasCredentials,
            resolved.Settings.ClinicName,
            turnstileEnabled,
            turnstileSiteKey);
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

        if (_turnstileResolver.IsEnabled(resolved.Settings.TurnstileEnabled) && _turnstileValidator != null)
        {
            var isTurnstileValid = await _turnstileValidator.ValidateAsync(request.TurnstileToken, ct: ct);
            if (!isTurnstileValid)
            {
                _logger.LogWarning("[Auth] Login rejected: Turnstile verification failed for workspace '{Workspace}'.", request.Workspace);
                return AuthOutcome.Fail(AuthFailure.BotChallengeFailed, "Security verification failed. Please complete the bot challenge.");
            }
        }

        var matches = await _db.StaffMembers.IgnoreQueryFilters()
            .Include(s => s.ClinicRole)
            .Where(s => s.ClinicId == resolved.ClinicId && !s.IsDeleted && s.Email != null && s.Email.ToLower() == email)
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
                _logger.LogWarning("[Auth] Staff {StaffId} locked out after repeated failed logins.", staff.Id);
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
        var stored = await _db.RefreshTokens.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
        if (stored is null) return AuthOutcome.Fail(AuthFailure.InvalidToken, "Invalid refresh token.");

        var now = DateTime.UtcNow;
        if (stored.RevokedAt is not null)
        {
            // A rotated/revoked token was presented again: assume theft and revoke the whole family.
            await RevokeFamilyAsync(stored.FamilyId, now, ct);
            _logger.LogWarning("[Auth] Refresh token reuse detected for staff {StaffId}; family revoked.", stored.StaffMemberId);
            return AuthOutcome.Fail(AuthFailure.InvalidToken, "Invalid refresh token.");
        }

        if (stored.ExpiresAt <= now) return AuthOutcome.Fail(AuthFailure.InvalidToken, "Refresh token expired.");

        var staff = await _db.StaffMembers.IgnoreQueryFilters()
            .Include(s => s.ClinicRole)
            .FirstOrDefaultAsync(s => s.Id == stored.StaffMemberId && !s.IsDeleted, ct);
        if (staff is null || !staff.IsActive)
            return AuthOutcome.Fail(AuthFailure.InvalidToken, "Invalid refresh token.");

        var resolved = await ResolveByClinicAsync(staff.ClinicId, ct);
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
        var stored = await _db.RefreshTokens.IgnoreQueryFilters().FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
        if (stored is null) return;
        await RevokeFamilyAsync(stored.FamilyId, DateTime.UtcNow, ct);
    }

    public async Task<AuthOutcome> BootstrapAsync(BootstrapRequest request, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.LicenseToken))
            return AuthOutcome.Fail(AuthFailure.InvalidRequest, "License key is required.");

        var problems = _hasher.ValidateStrength(request.Password, Options.MinPasswordLength);
        if (problems.Count > 0) return AuthOutcome.Fail(AuthFailure.WeakPassword, problems[0], problems);

        var presented = request.LicenseToken.Trim();

        // 1. Possession of a valid, untampered facility license token proves ownership (verified offline).
        var validation = _license.Validate(presented, Guid.Empty, null);
        if (validation.IsMissing) return AuthOutcome.Fail(AuthFailure.ActivationRequired, "Facility activation required.");
        if (validation.IsTampered) return AuthOutcome.Fail(AuthFailure.LicenseTampered, "The facility license failed verification.");
        if (validation.IsExpired) return AuthOutcome.Fail(AuthFailure.ActivationRequired, "The facility license has expired.");

        var payload = validation.Payload;
        var tokenClinicId = payload?.FacilityId ?? Guid.Empty;

        // 2. Resolve the target facility: prefer direct binding to the token's FacilityId, fallback to workspace hint.
        ResolvedWorkspace? resolved = null;
        if (tokenClinicId != Guid.Empty)
        {
            resolved = await ResolveByClinicAsync(tokenClinicId, ct);
        }

        if (resolved is null)
        {
            resolved = await _workspaces.ResolveAsync(request.Workspace, ct);
        }

        if (resolved is null)
        {
            return AuthOutcome.Fail(AuthFailure.WorkspaceNotFound, "Workspace was not found. Activate the facility license first.");
        }

        // 4. Verify facility/tenant binding
        var isDummyPlaceholder = resolved.ClinicId == Guid.Empty ||
                                 resolved.ClinicId == LegacyDefaultClinicId ||
                                 string.Equals(resolved.TenantId, "tenant_default", StringComparison.OrdinalIgnoreCase);

        var expectedClinicId = isDummyPlaceholder ? Guid.Empty : resolved.ClinicId;
        var expectedTenantId = isDummyPlaceholder ? null : resolved.TenantId;

        var facilityValidation = _license.Validate(presented, expectedClinicId, expectedTenantId);
        if (!facilityValidation.IsValid)
        {
            var installed = resolved.Settings.LicenseToken ?? string.Empty;
            if (!FixedTimeEquals(presented, installed))
            {
                return AuthOutcome.Fail(AuthFailure.InvalidCredentials, "The license key does not match this facility.");
            }
        }

        // 5. Ensure settings has the validated license token stored and facility IDs synchronized
        var dbSettings = await _db.ClinicSettings.IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.ClinicId == resolved.ClinicId && !s.IsDeleted, ct);
        if (dbSettings != null)
        {
            bool modified = false;
            if (dbSettings.LicenseToken != presented)
            {
                dbSettings.LicenseToken = presented;
                modified = true;
            }
            if (tokenClinicId != Guid.Empty && dbSettings.ClinicId != tokenClinicId)
            {
                dbSettings.ClinicId = tokenClinicId;
                modified = true;
            }
            if (!string.IsNullOrWhiteSpace(payload?.TenantId) && dbSettings.TenantId != payload.TenantId)
            {
                dbSettings.TenantId = payload.TenantId;
                modified = true;
            }
            if (!string.IsNullOrWhiteSpace(payload?.FacilityName) && dbSettings.ClinicName != payload.FacilityName)
            {
                dbSettings.ClinicName = payload.FacilityName;
                modified = true;
            }
            if (!string.IsNullOrWhiteSpace(payload?.PlanTier) && dbSettings.PlanTier != payload.PlanTier)
            {
                dbSettings.PlanTier = payload.PlanTier;
                modified = true;
            }
            if (payload?.Limits?.MaxStaff is int maxStaff && maxStaff > 0 && dbSettings.MaxStaffLimit != maxStaff)
            {
                dbSettings.MaxStaffLimit = maxStaff;
                modified = true;
            }
            if (payload?.ExpiresAtUtc != dbSettings.LicenseExpiresAt)
            {
                dbSettings.LicenseExpiresAt = payload?.ExpiresAtUtc;
                modified = true;
            }
            if (modified)
            {
                dbSettings.UpdatedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync(ct);
                resolved = new ResolvedWorkspace(dbSettings, dbSettings.TenantId, dbSettings.ClinicId);
            }
        }

        var alreadyBootstrapped = await _db.StaffMembers.IgnoreQueryFilters()
            .AnyAsync(s => s.ClinicId == resolved.ClinicId && !s.IsDeleted && s.PasswordHash != null, ct);
        if (alreadyBootstrapped)
            return AuthOutcome.Fail(AuthFailure.AlreadyBootstrapped, "This facility already has an administrator. Sign in instead.");

        var email = NormalizeEmail(request.Email) ?? NormalizeEmail(payload?.OwnerEmail);
        if (email is null)
            return AuthOutcome.Fail(AuthFailure.InvalidRequest, "An administrator email is required.");

        await ClinicRoleSeeder.SeedDefaultRolesForClinicAsync(_db, resolved.TenantId, resolved.ClinicId, ct);
        var adminRole = await _db.ClinicRoles.IgnoreQueryFilters()
            .FirstOrDefaultAsync(r => r.ClinicId == resolved.ClinicId && r.IsSystem && r.Name == "Clinic Administrator", ct);

        var staff = await _db.StaffMembers.IgnoreQueryFilters()
            .Include(s => s.ClinicRole)
            .FirstOrDefaultAsync(s => s.ClinicId == resolved.ClinicId && !s.IsDeleted && s.Email != null && s.Email.ToLower() == email, ct);

        if (staff is null)
        {
            var rawName = !string.IsNullOrWhiteSpace(request.FullName) ? request.FullName : payload?.OwnerName;
            var (first, last) = SplitName(rawName);
            staff = new StaffMember
            {
                Id = Guid.NewGuid(),
                TenantId = resolved.TenantId,
                ClinicId = resolved.ClinicId,
                FirstName = first,
                LastName = last,
                Email = email,
                Role = StaffRole.Admin,
                ClinicRoleId = adminRole?.Id,
                ClinicRole = adminRole,
                IsActive = true,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "System:Bootstrap"
            };
            _db.StaffMembers.Add(staff);
        }
        else
        {
            staff.Role = StaffRole.Admin;
            staff.ClinicRoleId = adminRole?.Id;
            staff.ClinicRole = adminRole;
            staff.IsActive = true;
        }

        staff.PasswordHash = _hasher.Hash(request.Password!);
        staff.MustChangePassword = false;
        staff.FailedLoginCount = 0;
        staff.LockoutEnd = null;
        staff.LastLoginAt = DateTime.UtcNow;

        _logger.LogInformation("[Auth] Facility {ClinicId} bootstrapped its first administrator.", resolved.ClinicId);
        var tokens = await IssueTokensAsync(staff, resolved, Guid.NewGuid(), "bootstrap", ct);
        return AuthOutcome.Success(tokens);
    }

    public async Task<AuthOutcome> ChangePasswordAsync(Guid staffId, ChangePasswordRequest request, string? deviceLabel, CancellationToken ct = default)
    {
        var staff = await _db.StaffMembers.IgnoreQueryFilters()
            .Include(s => s.ClinicRole)
            .FirstOrDefaultAsync(s => s.Id == staffId && !s.IsDeleted && s.IsActive, ct);
        if (staff is null || string.IsNullOrEmpty(staff.PasswordHash))
            return AuthOutcome.Fail(AuthFailure.NotFound, "Account not found.");

        if (string.IsNullOrEmpty(request.CurrentPassword) || !_hasher.Verify(staff.PasswordHash, request.CurrentPassword))
            return AuthOutcome.Fail(AuthFailure.InvalidCredentials, "Current password is incorrect.");

        var problems = _hasher.ValidateStrength(request.NewPassword, Options.MinPasswordLength);
        if (problems.Count > 0) return AuthOutcome.Fail(AuthFailure.WeakPassword, problems[0], problems);

        if (_hasher.Verify(staff.PasswordHash, request.NewPassword!))
            return AuthOutcome.Fail(AuthFailure.WeakPassword, "New password must be different from the current password.");

        var resolved = await ResolveByClinicAsync(staff.ClinicId, ct);
        if (resolved is null) return AuthOutcome.Fail(AuthFailure.WorkspaceNotFound, "Workspace was not found or is not activated.");

        staff.PasswordHash = _hasher.Hash(request.NewPassword!);
        staff.MustChangePassword = false;
        staff.TokenVersion++;
        await RevokeAllRefreshTokensAsync(staff.Id, DateTime.UtcNow, ct, save: false);
        _accessCache.Invalidate(staff.Id);

        var tokens = await IssueTokensAsync(staff, resolved, Guid.NewGuid(), deviceLabel, ct);
        return AuthOutcome.Success(tokens);
    }

    public async Task<AuthOutcome> SetTemporaryPasswordAsync(Guid staffId, string? temporaryPassword, CancellationToken ct = default)
    {
        var problems = _hasher.ValidateStrength(temporaryPassword, Options.MinPasswordLength);
        if (problems.Count > 0) return AuthOutcome.Fail(AuthFailure.WeakPassword, problems[0], problems);

        // Default query filters apply: an admin can only manage staff of their own clinic.
        var staff = await _db.StaffMembers.FirstOrDefaultAsync(s => s.Id == staffId, ct);
        if (staff is null) return AuthOutcome.Fail(AuthFailure.NotFound, "Staff member not found.");

        var email = NormalizeEmail(staff.Email);
        if (email is null)
            return AuthOutcome.Fail(AuthFailure.InvalidRequest, "The staff member needs an email address before credentials can be set.");

        var duplicate = await _db.StaffMembers.AnyAsync(
            s => s.Id != staff.Id && s.ClinicId == staff.ClinicId && s.Email != null && s.Email.ToLower() == email && s.PasswordHash != null, ct);
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

    public async Task<bool> RevokeSessionsAsync(Guid staffId, CancellationToken ct = default)
    {
        var staff = await _db.StaffMembers.FirstOrDefaultAsync(s => s.Id == staffId, ct);
        if (staff is null) return false;

        staff.TokenVersion++;
        await RevokeAllRefreshTokensAsync(staff.Id, DateTime.UtcNow, ct, save: false);
        await _db.SaveChangesAsync(ct);
        _accessCache.Invalidate(staff.Id);
        return true;
    }

    public async Task<AuthUserDto?> GetCurrentUserAsync(Guid staffId, CancellationToken ct = default)
    {
        var staff = await _db.StaffMembers.IgnoreQueryFilters().AsNoTracking()
            .Include(s => s.ClinicRole)
            .FirstOrDefaultAsync(s => s.Id == staffId && !s.IsDeleted && s.IsActive, ct);
        if (staff is null) return null;

        var resolved = await ResolveByClinicAsync(staff.ClinicId, ct);
        return ToUser(staff, resolved?.Settings.ClinicName ?? string.Empty);
    }

    // â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    private AuthOutcome? CheckLicense(ResolvedWorkspace resolved)
    {
        var validation = _license.Validate(resolved.Settings.LicenseToken, resolved.ClinicId, resolved.TenantId);
        if (validation.IsMissing)
            return AuthOutcome.Fail(AuthFailure.ActivationRequired, "Facility activation required. Apply the facility license key first.");
        if (validation.IsTampered)
            return AuthOutcome.Fail(AuthFailure.LicenseTampered, "The facility license failed verification.");
        // Expired licenses still sign in: the clinic runs in read-only grace mode rather than being locked out mid-shift.
        return null;
    }

    private async Task<ResolvedWorkspace?> ResolveByClinicAsync(Guid clinicId, CancellationToken ct)
    {
        var settings = await _db.ClinicSettings.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(s => s.ClinicId == clinicId && !s.IsDeleted, ct);
        return settings is null ? null : new ResolvedWorkspace(settings, settings.TenantId, settings.ClinicId);
    }

    private async Task<AuthTokensDto> IssueTokensAsync(
        StaffMember staff,
        ResolvedWorkspace resolved,
        Guid familyId,
        string? deviceLabel,
        CancellationToken ct,
        ClinicRefreshToken? replacing = null)
    {
        var now = DateTime.UtcNow;
        var claims = new List<Claim>
        {
            new(ClinicClaimTypes.Subject, staff.Id.ToString()),
            new(ClinicClaimTypes.TenantId, resolved.TenantId),
            new(ClinicClaimTypes.ClinicId, resolved.ClinicId.ToString()),
            new(ClinicClaimTypes.TokenVersion, staff.TokenVersion.ToString()),
            new(ClinicClaimTypes.StaffRole, staff.Role.ToString()),
            new(ClinicClaimTypes.Name, $"{staff.FirstName} {staff.LastName}".Trim()),
            new("jti", Guid.NewGuid().ToString("N"))
        };
        if (staff.ClinicRoleId is { } roleId) claims.Add(new Claim(ClinicClaimTypes.RoleId, roleId.ToString()));

        var access = _tokens.CreateAccessToken(claims);

        var rawRefresh = _tokens.GenerateRefreshToken();
        var refreshExpires = now.AddDays(Options.RefreshTokenDays);
        var refresh = new ClinicRefreshToken
        {
            Id = Guid.NewGuid(),
            StaffMemberId = staff.Id,
            TenantId = resolved.TenantId,
            ClinicId = resolved.ClinicId,
            TokenHash = _tokens.HashRefreshToken(rawRefresh),
            FamilyId = familyId,
            ExpiresAt = refreshExpires,
            DeviceLabel = Truncate(deviceLabel, 150),
            CreatedAt = now,
            CreatedBy = "System:Auth"
        };
        _db.RefreshTokens.Add(refresh);

        if (replacing is not null)
        {
            replacing.RevokedAt = now;
            replacing.ReplacedByTokenId = refresh.Id;
        }

        await _db.SaveChangesAsync(ct);
        return new AuthTokensDto(access.Token, rawRefresh, access.ExpiresAtUtc, refreshExpires, ToUser(staff, resolved.Settings.ClinicName));
    }

    private static AuthUserDto ToUser(StaffMember staff, string clinicName) => new(
        staff.Id,
        $"{staff.FirstName} {staff.LastName}".Trim(),
        staff.Role.ToString(),
        staff.ClinicRole?.Name,
        staff.ClinicId,
        staff.TenantId,
        clinicName,
        StaffPermissions.For(staff),
        staff.MustChangePassword);

    private async Task RevokeFamilyAsync(Guid familyId, DateTime now, CancellationToken ct)
    {
        var family = await _db.RefreshTokens.IgnoreQueryFilters()
            .Where(t => t.FamilyId == familyId && t.RevokedAt == null).ToListAsync(ct);
        foreach (var t in family) t.RevokedAt = now;
        await _db.SaveChangesAsync(ct);
    }

    private async Task RevokeAllRefreshTokensAsync(Guid staffId, DateTime now, CancellationToken ct, bool save)
    {
        var tokens = await _db.RefreshTokens.IgnoreQueryFilters()
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
            0 => ("Clinic", "Administrator"),
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
