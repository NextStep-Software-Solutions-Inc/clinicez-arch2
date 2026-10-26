using System;
using System.Threading;
using System.Threading.Tasks;

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
}
