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
    string? ErrorMessage);

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
        DateTime expiresAtUtc);
}
