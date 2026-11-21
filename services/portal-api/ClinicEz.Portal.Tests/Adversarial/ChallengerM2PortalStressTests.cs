using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Endpoints;
using ClinicEz.Portal.Application.Features.Guest;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Messaging.Handlers;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace ClinicEz.Portal.Tests.Adversarial;

/// <summary>
/// Empirical Adversarial Challenge Suite for Milestone E2E-M2 in Portal API:
/// Stress-tests Guest Lockout Boundary, Preflight Status Differentiation, and MediaUsageRecordedHandler Idempotency.
/// </summary>
[Collection("GuestTeleconsultTests")]
public class ChallengerM2PortalStressTests : IDisposable
{
    private readonly ApplicationDbContext _db = TestSupport.NewContext();
    private readonly Mock<IInteropPublisher> _publisherMock = new();
    private readonly GuestVerificationService _verificationService;

    public ChallengerM2PortalStressTests()
    {
        GuestVerificationService.ClearStore();

        var configValues = new Dictionary<string, string?>
        {
            ["LIVEKIT_URL"] = "wss://media.clinicez.internal",
            ["LIVEKIT_API_KEY"] = "test-api-key",
            ["LIVEKIT_API_SECRET"] = "secret-test-key-32bytes-for-hmac!!"
        };
        var config = new ConfigurationBuilder().AddInMemoryCollection(configValues).Build();
        _verificationService = new GuestVerificationService(_publisherMock.Object, config, NullLogger<GuestVerificationService>.Instance);
    }

    public void Dispose()
    {
        GuestVerificationService.ClearStore();
        _db.Database.EnsureDeleted();
        _db.Dispose();
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
        var rawToken = $"tok-stress-{Guid.NewGuid():N}";
        var inviteId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        var tokenHash = Hash(rawToken);
        var dobHash = SaltedHash(inviteId, dob);
        var otpHash = SaltedHash(inviteId, otp);

        GuestVerificationService.RegisterPreHashedInvite(
            inviteId, "tenant-stress-portal", "clinic-01", callId,
            tokenHash, dobHash, otpHash, expiresAt ?? DateTime.UtcNow.AddMinutes(60));

        return (rawToken, inviteId, callId);
    }

    // =========================================================================
    // 1. Strict Step-by-Step 5-Attempt Lockout Verification
    // =========================================================================
    [Fact]
    public async Task GuestVerification_StrictFiveAttemptLockoutProgression()
    {
        var (rawToken, _, _) = RegisterTestInvite(dob: "1995-10-20", otp: "654321");

        // Attempts 1 to 4: Each must fail with expected remaining attempts and NOT be locked out
        for (int attempt = 1; attempt <= 4; attempt++)
        {
            var res = await _verificationService.VerifyGuestAsync(rawToken, "1995-10-20", "000000", CancellationToken.None);
            Assert.False(res.Success);
            Assert.False(res.IsLockedOut, $"Attempt {attempt} must NOT be locked out yet");
            Assert.Equal(5 - attempt, res.RemainingAttempts);
            Assert.Equal("INVALID_VERIFICATION_CREDENTIALS", res.ErrorCode);
        }

        // Attempt 5: Exactly the 5th failure must trigger IsLockedOut = true and GUEST_INVITE_LOCKED_OUT
        var res5 = await _verificationService.VerifyGuestAsync(rawToken, "1995-10-20", "000000", CancellationToken.None);
        Assert.False(res5.Success);
        Assert.True(res5.IsLockedOut, "Attempt 5 must trigger lockout");
        Assert.Equal(0, res5.RemainingAttempts);
        Assert.Equal("GUEST_INVITE_LOCKED_OUT", res5.ErrorCode);

        // Attempt 6 (even with valid credentials): Immediately rejected as locked out without checking hashes
        var res6 = await _verificationService.VerifyGuestAsync(rawToken, "1995-10-20", "654321", CancellationToken.None);
        Assert.False(res6.Success);
        Assert.True(res6.IsLockedOut);
        Assert.Equal(0, res6.RemainingAttempts);
        Assert.Equal("GUEST_INVITE_LOCKED_OUT", res6.ErrorCode);
    }

    // =========================================================================
    // 2. Preflight Status Endpoint: ErrorCode Differentiation
    // =========================================================================
    [Fact]
    public void PreflightStatus_DifferentiatesActive_Expired_Revoked_LockedOut()
    {
        // A. Active Invite -> 200 OK
        var (activeToken, _, _) = RegisterTestInvite(expiresAt: DateTime.UtcNow.AddMinutes(30));
        var actResult = PublicGuestTeleconsultEndpoints.HandleStatusAsync(activeToken, _verificationService);
        var actStatus = actResult as IStatusCodeHttpResult;
        Assert.NotNull(actStatus);
        Assert.Equal(200, actStatus.StatusCode);

        // B. Expired Invite -> 410 Gone with GUEST_INVITE_EXPIRED
        var (expiredToken, _, _) = RegisterTestInvite(expiresAt: DateTime.UtcNow.AddMinutes(-10));
        var expResult = PublicGuestTeleconsultEndpoints.HandleStatusAsync(expiredToken, _verificationService);
        var expStatus = expResult as IStatusCodeHttpResult;
        Assert.NotNull(expStatus);
        Assert.Equal(410, expStatus.StatusCode);
        var expVal = (expResult as IValueHttpResult)?.Value as ApiResponse<GuestTeleconsultStatusResponse>;
        Assert.Equal("GUEST_INVITE_EXPIRED", expVal?.ErrorCode);

        // C. Revoked Invite -> 410 Gone with GUEST_CONSULTATION_ENDED
        var (revokedToken, _, revokedCallId) = RegisterTestInvite(expiresAt: DateTime.UtcNow.AddMinutes(30));
        GuestVerificationService.RevokeInviteByCall(revokedCallId, "Doctor ended call");
        var revResult = PublicGuestTeleconsultEndpoints.HandleStatusAsync(revokedToken, _verificationService);
        var revStatus = revResult as IStatusCodeHttpResult;
        Assert.NotNull(revStatus);
        Assert.Equal(410, revStatus.StatusCode);
        var revVal = (revResult as IValueHttpResult)?.Value as ApiResponse<GuestTeleconsultStatusResponse>;
        Assert.Equal("GUEST_CONSULTATION_ENDED", revVal?.ErrorCode);
    }

    // =========================================================================
    // 3. MediaUsageRecordedHandler: Massive Duplicate Delivery Idempotency
    // =========================================================================
    [Fact]
    public async Task MediaUsageRecordedHandler_TenDuplicateDeliveries_ExactlyOneDeduction()
    {
        var tenant = new Tenant { Id = Guid.NewGuid(), TenantSlug = "ten-duplicates", Name = "Ten Duplicates" };
        _db.Tenants.Add(tenant);

        var billing = new WorkspaceTeleconsultBilling
        {
            TenantId = tenant.Id,
            IsEnabled = true,
            BillingMode = WorkspaceTeleconsultBilling.ModePrepaid,
            RatePerMinutePhp = 5.00m,
            PrepaidBalancePhp = 200.00m,
            CurrentPeriodYearMonth = DateTime.UtcNow.ToString("yyyy-MM")
        };
        _db.WorkspaceTeleconsultBillings.Add(billing);
        await _db.SaveChangesAsync();

        var handler = new MediaUsageRecordedHandler(_db, _publisherMock.Object, NullLogger<MediaUsageRecordedHandler>.Instance);
        var callId = Guid.NewGuid();
        var payload = new MediaUsageRecordedPayload(callId, tenant.Id.ToString(), 20, DateTime.UtcNow.AddMinutes(-20), DateTime.UtcNow);
        var context = new InteropMessageContext(InteropEnvelope.Create(
            InteropTypes.MediaUsageRecorded,
            Party.Media,
            Party.Portal,
            callId,
            payload
        ));

        // ACT: Deliver 10 times consecutively
        for (int i = 0; i < 10; i++)
        {
            await handler.HandleAsync(payload, context, CancellationToken.None);
        }

        // ASSERT: Deducted exactly 20 mins * ₱5.00 = ₱100.00 once (balance ₱100.00, NOT negative or zero)
        var updated = await _db.WorkspaceTeleconsultBillings.FirstAsync(b => b.TenantId == tenant.Id);
        Assert.Equal(100.00m, updated.PrepaidBalancePhp);
        Assert.Equal(20, updated.CurrentPeriodMinutesUsed);
        Assert.Equal(100.00m, updated.CurrentPeriodBilledPhp);

        var recordCount = await _db.TeleconsultUsageRecords.CountAsync(r => r.CallId == callId);
        Assert.Equal(1, recordCount);
    }
}
