using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Guest;

namespace ClinicEz.Portal.Application.Interfaces;

public sealed record GuestVerificationResult(
    bool Success,
    Guid? CallId,
    string? RoomName,
    string? RelayUrl,
    string? GuestToken,
    int RemainingAttempts,
    bool IsLockedOut,
    bool IsExpired,
    string? ErrorCode,
    string? ErrorMessage,
    string? GuestDisplayName = null,
    string? ClinicName = null,
    string? ClinicSupportPhone = null,
    string? ClinicianName = null,
    DateTime? ScheduledAtUtc = null);

public interface IGuestVerificationService
{
    Task<GuestVerificationResult> VerifyGuestAsync(
        string inviteToken,
        string dateOfBirth,
        string otp,
        CancellationToken ct = default);

    StoredGuestInvite RegisterPreHashedInvite(
        Guid inviteId,
        string tenantId,
        string facilityId,
        Guid callId,
        string inviteTokenHash,
        string expectedDobHash,
        string otpHash,
        DateTime expiresAtUtc,
        string? clinicName = null,
        string? clinicSupportPhone = null,
        string? clinicianName = null,
        DateTime? scheduledAtUtc = null,
        string? encryptedGuestContext = null);

    bool RevokeInviteByCall(Guid callId, string? reason = null, DateTime? revokedAtUtc = null);

    StoredGuestInvite? GetInviteByToken(string inviteToken);
}
