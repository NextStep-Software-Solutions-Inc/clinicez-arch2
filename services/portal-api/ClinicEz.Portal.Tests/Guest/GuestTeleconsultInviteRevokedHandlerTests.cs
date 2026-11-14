using System;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Endpoints;
using ClinicEz.Portal.Application.Features.Guest;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Infrastructure.Messaging.Handlers;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace ClinicEz.Portal.Tests.Guest;

/// <summary>
/// Comprehensive verification of Guest Teleconsult Invite Revocation, Preflight Status Check,
/// Lockout Defense, and Expiration Differentiation in Portal API.
/// Verifies:
/// - TC-T1.5.4: Guest invite revoked via handler.
/// - TC-T1.5.5: Preflight zero-PHI guest status check (returns 410 Gone for revoked consultation).
/// - TC-T2.1.7: 5-attempt guest lockout (permanent lockout, returns 423 Locked).
/// - TC-T2.5.7: Expired vs revoked invite differentiation and credential bypass.
/// Follows Portal API conventions: Moq + InMemory EF Core.
/// </summary>
public class GuestTeleconsultInviteRevokedHandlerTests : IDisposable
{
    private readonly Mock<IInteropPublisher> _publisherMock = new();
    private readonly IConfiguration _config;
    private readonly GuestVerificationService _verificationService;

    public GuestTeleconsultInviteRevokedHandlerTests()
    {
        GuestVerificationService.ClearStore();

        var inMemorySettings = new System.Collections.Generic.Dictionary<string, string?>
        {
            ["LIVEKIT_URL"] = "wss://media.clinicez.internal",
            ["LIVEKIT_API_KEY"] = "test-api-key",
            ["LIVEKIT_API_SECRET"] = "secret-test-key-32bytes-for-hmac!!"
        };
        _config = new ConfigurationBuilder().AddInMemoryCollection(inMemorySettings).Build();
        _verificationService = new GuestVerificationService(_publisherMock.Object, _config, NullLogger<GuestVerificationService>.Instance);
    }

    public void Dispose()
    {
        GuestVerificationService.ClearStore();
    }

    private static string Hash(string input) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(input))).ToLowerInvariant();

    private static string SaltedHash(Guid salt, string input) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{salt:N}:{input}"))).ToLowerInvariant();

    private (string rawToken, Guid inviteId, Guid callId) RegisterTestInvite(
        DateTime? expiresAt = null,
        string dob = "1990-05-15",
        string otp = "123456")
    {
        var rawToken = $"tok-test-{Guid.NewGuid():N}";
        var inviteId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        var tokenHash = Hash(rawToken);
        var dobHash = SaltedHash(inviteId, dob);
        var otpHash = SaltedHash(inviteId, otp);

        GuestVerificationService.RegisterPreHashedInvite(
            inviteId, "tenant-portal-01", "clinic-01", callId,
            tokenHash, dobHash, otpHash, expiresAt ?? DateTime.UtcNow.AddMinutes(60));

        return (rawToken, inviteId, callId);
    }

    // =========================================================================
    // TC-T1.5.4: Guest Invite Revoked via Interop Handler
    // =========================================================================
    [Fact]
    public async Task TC_T1_5_4_HandleAsync_RevokesActiveInvite_AndMarksRevokedReason()
    {
        // ARRANGE: Stored invite for a call
        var (rawToken, inviteId, callId) = RegisterTestInvite();
        var handler = new GuestTeleconsultInviteRevokedHandler(_verificationService, NullLogger<GuestTeleconsultInviteRevokedHandler>.Instance);

        var revokedAt = DateTime.UtcNow;
        var appointmentId = Guid.NewGuid();
        var payload = new GuestTeleconsultInviteRevokedPayload(appointmentId, callId, "tenant-portal-01", "clinic-01", revokedAt, "Ended by physician");
        var envelope = InteropEnvelope.Create(
            InteropTypes.GuestTeleconsultInviteRevoked,
            Party.ForFacility("tenant-01", "clinic-01", FacilityType.Clinic),
            Party.Portal,
            callId,
            payload);
        var context = new InteropMessageContext(envelope);

        // ACT
        await handler.HandleAsync(payload, context, CancellationToken.None);

        // ASSERT: Invite is now revoked
        var invite = GuestVerificationService.GetInviteByToken(rawToken);
        Assert.NotNull(invite);
        Assert.True(invite.IsRevoked);
        Assert.Equal("Ended by physician", invite.RevokedReason);
        Assert.Equal(revokedAt, invite.RevokedAtUtc);
    }

    // =========================================================================
    // TC-T1.5.5: Preflight Zero-PHI Guest Status Check
    // =========================================================================
    [Fact]
    public void TC_T1_5_5_PreflightStatus_RevokedInvite_Returns410GoneWithGuestConsultationEnded()
    {
        // ARRANGE: Stored invite that was revoked upon clinician call end
        var (rawToken, _, callId) = RegisterTestInvite();
        GuestVerificationService.RevokeInviteByCall(callId, "Consultation completed");

        // ACT: Preflight check without DOB or OTP
        var result = PublicGuestTeleconsultEndpoints.HandleStatusAsync(rawToken, _verificationService);

        // ASSERT: Must respond HTTP 410 Gone with GUEST_CONSULTATION_ENDED
        var jsonResult = result as Microsoft.AspNetCore.Http.IStatusCodeHttpResult;
        Assert.NotNull(jsonResult);
        Assert.Equal(410, jsonResult.StatusCode);

        var valResult = result as Microsoft.AspNetCore.Http.IValueHttpResult;
        Assert.NotNull(valResult);
        var apiResponse = valResult.Value as ApiResponse<GuestTeleconsultStatusResponse>;
        Assert.NotNull(apiResponse);
        Assert.False(apiResponse.Succeeded);
        Assert.Equal("GUEST_CONSULTATION_ENDED", apiResponse.ErrorCode);
    }

    // =========================================================================
    // TC-T2.1.7: 5-Attempt Guest Lockout
    // =========================================================================
    [Fact]
    public async Task TC_T2_1_7_FailedVerification_LocksOutPermanentlyAfter5Attempts()
    {
        // ARRANGE: Active invite with OTP "123456" and DOB "1990-05-15"
        var (rawToken, _, _) = RegisterTestInvite(dob: "1990-05-15", otp: "123456");

        // ACT: Submit 4 wrong attempts
        for (int i = 1; i <= 4; i++)
        {
            var res = await _verificationService.VerifyGuestAsync(rawToken, "1990-05-15", "999999", CancellationToken.None);
            Assert.False(res.Success);
            Assert.False(res.IsLockedOut);
            Assert.Equal(5 - i, res.RemainingAttempts);
            Assert.Equal("INVALID_VERIFICATION_CREDENTIALS", res.ErrorCode);
        }

        // ACT: 5th wrong attempt triggers permanent lockout
        var fifthResult = await _verificationService.VerifyGuestAsync(rawToken, "1990-05-15", "999999", CancellationToken.None);
        Assert.False(fifthResult.Success);
        Assert.True(fifthResult.IsLockedOut);
        Assert.Equal("GUEST_INVITE_LOCKED_OUT", fifthResult.ErrorCode);

        // ACT: Even subsequent correct credentials are now locked out
        var lockedResult = await _verificationService.VerifyGuestAsync(rawToken, "1990-05-15", "123456", CancellationToken.None);
        Assert.False(lockedResult.Success);
        Assert.True(lockedResult.IsLockedOut);
        Assert.Equal("GUEST_INVITE_LOCKED_OUT", lockedResult.ErrorCode);

        // Preflight status endpoint also returns HTTP 423 Locked
        var statusResult = PublicGuestTeleconsultEndpoints.HandleStatusAsync(rawToken, _verificationService);
        var statusCodeResult = statusResult as Microsoft.AspNetCore.Http.IStatusCodeHttpResult;
        Assert.NotNull(statusCodeResult);
        Assert.Equal(423, statusCodeResult.StatusCode);
    }

    // =========================================================================
    // TC-T2.5.7: Expired vs Revoked Invite Differentiation
    // =========================================================================
    [Fact]
    public void TC_T2_5_7_PreflightStatus_ExpiredInvite_Returns410GoneWithGuestInviteExpired()
    {
        // ARRANGE: Invite expired 5 minutes ago (natural TTL expiration, NOT clinician ended)
        var expiredTime = DateTime.UtcNow.AddMinutes(-5);
        var (rawToken, _, _) = RegisterTestInvite(expiresAt: expiredTime);

        // ACT
        var result = PublicGuestTeleconsultEndpoints.HandleStatusAsync(rawToken, _verificationService);

        // ASSERT: Differentiates between expired vs ended:
        // Natural expiry returns GUEST_INVITE_EXPIRED; ended returns GUEST_CONSULTATION_ENDED
        var statusCodeResult = result as Microsoft.AspNetCore.Http.IStatusCodeHttpResult;
        Assert.NotNull(statusCodeResult);
        Assert.Equal(410, statusCodeResult.StatusCode);

        var valResult = result as Microsoft.AspNetCore.Http.IValueHttpResult;
        var apiResponse = valResult!.Value as ApiResponse<GuestTeleconsultStatusResponse>;
        Assert.NotNull(apiResponse);
        Assert.False(apiResponse.Succeeded);
        Assert.Equal("GUEST_INVITE_EXPIRED", apiResponse.ErrorCode);
    }

    [Fact]
    public void TC_T2_5_7_PreflightStatus_ActiveInvite_Returns200OkWithActiveStatus()
    {
        // ARRANGE: Fresh active invite
        var (rawToken, _, _) = RegisterTestInvite(expiresAt: DateTime.UtcNow.AddMinutes(45));

        // ACT
        var result = PublicGuestTeleconsultEndpoints.HandleStatusAsync(rawToken, _verificationService);

        // ASSERT: HTTP 200 OK with ACTIVE status
        var statusCodeResult = result as Microsoft.AspNetCore.Http.IStatusCodeHttpResult;
        Assert.NotNull(statusCodeResult);
        Assert.Equal(200, statusCodeResult.StatusCode);

        var valResult = result as Microsoft.AspNetCore.Http.IValueHttpResult;
        var apiResponse = valResult!.Value as ApiResponse<GuestTeleconsultStatusResponse>;
        Assert.NotNull(apiResponse);
        Assert.True(apiResponse.Succeeded);
        Assert.Equal("Active", apiResponse.Data!.Status);
        Assert.False(apiResponse.Data.IsEnded);
        Assert.False(apiResponse.Data.IsExpired);
    }
}
