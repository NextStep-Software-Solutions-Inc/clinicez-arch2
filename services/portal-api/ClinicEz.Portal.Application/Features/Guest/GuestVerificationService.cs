using System;
using System.Collections.Concurrent;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;

namespace ClinicEz.Portal.Application.Features.Guest;

public sealed record StoredGuestInvite(
    Guid InviteId,
    string TenantId,
    string FacilityId,
    Guid CallId,
    string InviteTokenHash,
    string ExpectedDobHash,
    string OtpHash,
    DateTime ExpiresAtUtc)
{
    public int AttemptCount { get; set; } = 0;
    public bool IsLockedOut { get; set; } = false;
    public bool IsVerified { get; set; } = false;
    public DateTime? VerifiedAtUtc { get; set; }
}

public sealed partial class GuestVerificationService : IGuestVerificationService
{
    private static readonly ConcurrentDictionary<string, StoredGuestInvite> InvitesByTokenHash = new();
    private static readonly ConcurrentDictionary<Guid, StoredGuestInvite> InvitesById = new();

    private readonly IInteropPublisher _publisher;
    private readonly IConfiguration _configuration;
    private readonly ILogger<GuestVerificationService> _logger;

    public GuestVerificationService(
        IInteropPublisher publisher,
        IConfiguration configuration,
        ILogger<GuestVerificationService> logger)
    {
        _publisher = publisher;
        _configuration = configuration;
        _logger = logger;
    }

    /// <summary>
    /// Provisions or registers a guest invite in the verification store.
    /// Can be called by appointment booking workflows or unit tests.
    /// </summary>
    public static StoredGuestInvite RegisterInvite(
        Guid inviteId,
        string tenantId,
        string facilityId,
        Guid callId,
        string inviteToken,
        string dateOfBirth,
        string otp,
        DateTime expiresAtUtc)
    {
        var tokenHash = ComputeHash(inviteToken.Trim());
        var dobHash = ComputeSaltedHash(inviteId, dateOfBirth.Trim());
        var otpHash = ComputeSaltedHash(inviteId, otp.Trim());

        var stored = new StoredGuestInvite(
            inviteId, tenantId, facilityId, callId, tokenHash, dobHash, otpHash, expiresAtUtc);

        InvitesByTokenHash[tokenHash] = stored;
        InvitesById[inviteId] = stored;
        return stored;
    }

    public static void ClearStore()
    {
        InvitesByTokenHash.Clear();
        InvitesById.Clear();
    }

    public async Task<GuestVerificationResult> VerifyGuestAsync(
        string inviteToken,
        string dateOfBirth,
        string otp,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(inviteToken))
        {
            return new GuestVerificationResult(
                Success: false, null, null, null, null, 0, false, false,
                "INVALID_TOKEN", "Invite token is required.");
        }

        var cleanToken = inviteToken.Trim().ToLowerInvariant();
        if (cleanToken.StartsWith("rx-") || cleanToken.StartsWith("mc-") || cleanToken.StartsWith("ref-") || cleanToken.StartsWith("lab-") || cleanToken.StartsWith("sec-sha256-"))
        {
            return new GuestVerificationResult(
                Success: false, null, null, null, null, 0, false, false,
                "DOCUMENT_KIND_MISMATCH", "The provided token is for a clinical document, not a teleconsultation invitation.");
        }

        if (cleanToken.Length == 65 && cleanToken[32] == '.')
        {
            return new GuestVerificationResult(
                Success: false, null, null, null, null, 0, false, false,
                "DOCUMENT_KIND_MISMATCH", "The provided token is an e-prescription verification token, not a teleconsultation invitation.");
        }

        if (cleanToken.Length >= 50 && cleanToken.Length <= 60 && cleanToken.IndexOf('.') == 32)
        {
            return new GuestVerificationResult(
                Success: false, null, null, null, null, 0, false, false,
                "DOCUMENT_KIND_MISMATCH", "The provided token is a laboratory upload token, not a teleconsultation invitation.");
        }

        if (string.IsNullOrWhiteSpace(dateOfBirth) || !DobRegex().IsMatch(dateOfBirth))
        {
            return new GuestVerificationResult(
                Success: false, null, null, null, null, 0, false, false,
                "INVALID_FORMAT", "Date of birth must be strictly in YYYY-MM-DD format.");
        }

        if (string.IsNullOrWhiteSpace(otp) || !OtpRegex().IsMatch(otp))
        {
            return new GuestVerificationResult(
                Success: false, null, null, null, null, 0, false, false,
                "INVALID_FORMAT", "OTP must be strictly a 6-digit number.");
        }

        var tokenHash = ComputeHash(inviteToken.Trim());
        if (!InvitesByTokenHash.TryGetValue(tokenHash, out var invite))
        {
            _logger.LogWarning("[GuestVerificationService] No guest invite found for provided token hash.");
            return new GuestVerificationResult(
                Success: false, null, null, null, null, 0, false, false,
                "GUEST_INVITE_NOT_FOUND", "No teleconsultation found for this link.");
        }

        var now = DateTime.UtcNow;

        // Check permanent lockout
        if (invite.IsLockedOut || invite.AttemptCount >= 5)
        {
            invite.IsLockedOut = true;
            _logger.LogWarning("[GuestVerificationService] Invite {InviteId} is locked out.", invite.InviteId);
            return new GuestVerificationResult(
                Success: false, invite.CallId, null, null, null, 0, true, false,
                "GUEST_INVITE_LOCKED_OUT", "This link is permanently locked after 5 failed verification attempts.");
        }

        // Check expiration
        if (now > invite.ExpiresAtUtc)
        {
            _logger.LogWarning("[GuestVerificationService] Invite {InviteId} has expired.", invite.InviteId);
            return new GuestVerificationResult(
                Success: false, invite.CallId, null, null, null, 0, false, true,
                "GUEST_INVITE_EXPIRED", "This teleconsultation link has expired.");
        }

        // Constant-time hash verification
        var computedDobHash = ComputeSaltedHash(invite.InviteId, dateOfBirth.Trim());
        var computedOtpHash = ComputeSaltedHash(invite.InviteId, otp.Trim());

        var dobMatches = CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(computedDobHash),
            Encoding.UTF8.GetBytes(invite.ExpectedDobHash));

        var otpMatches = CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(computedOtpHash),
            Encoding.UTF8.GetBytes(invite.OtpHash));

        if (!dobMatches || !otpMatches)
        {
            invite.AttemptCount++;
            var remaining = Math.Max(0, 5 - invite.AttemptCount);
            if (invite.AttemptCount >= 5)
            {
                invite.IsLockedOut = true;
                _logger.LogWarning("[GuestVerificationService] Invite {InviteId} locked out on attempt 5.", invite.InviteId);
                return new GuestVerificationResult(
                    Success: false, invite.CallId, null, null, null, 0, true, false,
                    "GUEST_INVITE_LOCKED_OUT", "This link is permanently locked after 5 failed verification attempts.");
            }

            _logger.LogWarning("[GuestVerificationService] Failed attempt {Count}/5 for invite {InviteId}.", invite.AttemptCount, invite.InviteId);
            return new GuestVerificationResult(
                Success: false, invite.CallId, null, null, null, remaining, false, false,
                "INVALID_VERIFICATION_CREDENTIALS", $"Invalid verification credentials. {remaining} attempts remaining.");
        }

        // Verified successfully
        invite.IsVerified = true;
        invite.VerifiedAtUtc = now;

        var roomName = $"call-{invite.CallId:N}";
        var guestIdentity = $"guest:otp-{invite.InviteId:N}";
        var relayUrl = _configuration["Media:RelayUrl"] ?? "wss://media.clinicez.internal";
        var guestToken = MintLiveKitGuestToken(roomName, guestIdentity);

        // Enqueue comms.guest.call.join.requested on Interop Hub for comms-api audit and media session tracking
        try
        {
            var payload = new GuestCallJoinRequestedPayload(
                CallId: invite.CallId,
                InviteId: invite.InviteId,
                Otp: otp.Trim(),
                DateOfBirth: dateOfBirth.Trim(),
                RequestedAtUtc: now
            );

            _publisher.Enqueue(
                InteropTypes.GuestCallJoinRequested,
                Party.Portal,
                Party.ForFacility(invite.TenantId, invite.FacilityId, FacilityType.Clinic, InteropServices.Comms),
                invite.CallId,
                payload
            );
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[GuestVerificationService] Could not enqueue hub message for Call {CallId}", invite.CallId);
        }

        return new GuestVerificationResult(
            Success: true,
            CallId: invite.CallId,
            RoomName: roomName,
            RelayUrl: relayUrl,
            GuestToken: guestToken,
            RemainingAttempts: 5 - invite.AttemptCount,
            IsLockedOut: false,
            IsExpired: false,
            ErrorCode: null,
            ErrorMessage: null);
    }

    private string MintLiveKitGuestToken(string roomName, string guestIdentity)
    {
        var apiKey = _configuration["Media:ApiKey"] ?? "clinicez-guest-key";
        var apiSecret = _configuration["Media:ApiSecret"] ?? "clinicez-production-secret-key-32bytes-minimum!!";

        var securityKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(apiSecret));
        var credentials = new SigningCredentials(securityKey, SecurityAlgorithms.HmacSha256);

        var videoGrant = new Dictionary<string, object>
        {
            ["room"] = roomName,
            ["roomJoin"] = true,
            ["canPublish"] = true,
            ["canSubscribe"] = true,
            ["canPublishData"] = true
        };

        var claims = new List<Claim>
        {
            new("sub", guestIdentity),
            new("video", JsonSerializer.Serialize(videoGrant), JsonClaimValueTypes.Json)
        };

        var token = new JwtSecurityToken(
            issuer: apiKey,
            notBefore: DateTime.UtcNow,
            expires: DateTime.UtcNow.AddMinutes(30),
            claims: claims,
            signingCredentials: credentials
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static string ComputeHash(string input)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    private static string ComputeSaltedHash(Guid salt, string input)
    {
        var combined = $"{salt:N}:{input}";
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(combined));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    [GeneratedRegex(@"^\d{4}-\d{2}-\d{2}$", RegexOptions.Compiled)]
    private static partial Regex DobRegex();

    [GeneratedRegex(@"^\d{6}$", RegexOptions.Compiled)]
    private static partial Regex OtpRegex();
}
