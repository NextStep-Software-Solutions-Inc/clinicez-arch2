using System;
using System.Security.Cryptography;
using System.Text;

namespace ClinicEz.Comms.Domain.Entities;

public enum GuestInviteStatus
{
    Pending = 0,
    Verified = 1,
    LockedOut = 2,
    Expired = 3,
    Revoked = 4
}

public sealed class GuestInvite
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string TenantId { get; set; } = string.Empty;
    public string FacilityId { get; set; } = string.Empty;
    public Guid CallId { get; set; }
    public Guid? AppointmentId { get; set; }

    /// <summary>Hex-encoded SHA-256 hash of the 32-byte invite token.</summary>
    public string InviteTokenHash { get; set; } = string.Empty;

    /// <summary>Salted SHA-256 hash of normalized Date of Birth (YYYY-MM-DD): SHA256($"{Id:N}:{dob}").</summary>
    public string ExpectedDobHash { get; set; } = string.Empty;

    /// <summary>Salted SHA-256 hash of the 6-digit numeric OTP code: SHA256($"{Id:N}:{otp}").</summary>
    public string OtpHash { get; set; } = string.Empty;

    /// <summary>Failed verification attempt counter. Permanent lockout occurs when AttemptCount >= MaxAllowedAttempts.</summary>
    public int AttemptCount { get; set; } = 0;
    public const int MaxAllowedAttempts = 5;

    public bool IsLockedOut { get; set; } = false;
    public GuestInviteStatus Status { get; set; } = GuestInviteStatus.Pending;

    public DateTime ExpiresAtUtc { get; set; }
    public DateTime? VerifiedAtUtc { get; set; }
    public DateTime? ConsumedAtUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public string? CreatedByStaffId { get; set; }
    public string? MaskedRecipientPhone { get; set; }

    public bool CanAttemptVerification(DateTime nowUtc)
    {
        if (IsLockedOut || Status == GuestInviteStatus.LockedOut) return false;
        if (Status == GuestInviteStatus.Revoked) return false;
        if (nowUtc > ExpiresAtUtc || Status == GuestInviteStatus.Expired) return false;
        return AttemptCount < MaxAllowedAttempts;
    }

    public static string ComputeTokenHash(string token)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(token.Trim()));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    public static string ComputeExpectedDobHash(Guid inviteId, string dob)
    {
        var input = $"{inviteId:N}:{dob.Trim()}";
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    public static string ComputeOtpHash(Guid inviteId, string otp)
    {
        var input = $"{inviteId:N}:{otp.Trim()}";
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}
