using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Guest;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Infrastructure.Messaging.Handlers;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ClinicEz.Portal.Tests.Guest;

[Collection("GuestTeleconsultTests")]
public class AdversarialGuestVerificationTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly IInteropPublisher _publisher;
    private readonly IConfiguration _configuration;
    private readonly IGuestVerificationService _verificationService;
    private readonly GuestTeleconsultInviteIssuedHandler _handler;

    public AdversarialGuestVerificationTests()
    {
        _publisher = new InteropPublisher(_context);

        var configValues = new Dictionary<string, string?>
        {
            ["LIVEKIT_API_KEY"] = "adv-portal-key",
            ["LIVEKIT_API_SECRET"] = "adv-portal-secret-32-bytes-minimum!",
            ["LIVEKIT_URL"] = "wss://livekit.adv.clinicez.internal"
        };
        _configuration = new ConfigurationBuilder().AddInMemoryCollection(configValues).Build();

        _verificationService = new GuestVerificationService(
            _publisher,
            _configuration,
            NullLogger<GuestVerificationService>.Instance);

        _handler = new GuestTeleconsultInviteIssuedHandler(
            _verificationService,
            NullLogger<GuestTeleconsultInviteIssuedHandler>.Instance);

        GuestVerificationService.ClearStore();
    }

    public void Dispose()
    {
        GuestVerificationService.ClearStore();
        _context.Dispose();
    }

    private async Task<(Guid AppointmentId, Guid CallId, string RawToken, string RawDob, string RawOtp)> SetupPreHashedInviteAsync(DateTime? expiresAt = null)
    {
        var appointmentId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        var rawToken = "0123456789abcdef0123456789abcdef";
        var rawDob = "1988-11-25";
        var rawOtp = "481516";

        var tokenHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawToken))).ToLowerInvariant();
        var dobHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{appointmentId:N}:{rawDob}"))).ToLowerInvariant();
        var otpHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{appointmentId:N}:{rawOtp}"))).ToLowerInvariant();

        var payload = new GuestTeleconsultInviteIssuedPayload(
            AppointmentId: appointmentId,
            CallId: callId,
            TenantId: "tenant-adv",
            FacilityId: "clinic-adv",
            InviteTokenHash: tokenHash,
            ExpectedDobHash: dobHash,
            OtpHash: otpHash,
            ExpiresAtUtc: expiresAt ?? DateTime.UtcNow.AddHours(1),
            IssuedAtUtc: DateTime.UtcNow);

        var envelope = InteropEnvelope.Create(
            InteropTypes.GuestTeleconsultInviteIssued,
            Party.ForFacility("tenant-adv", "clinic-adv", FacilityType.Clinic),
            Party.Portal,
            appointmentId,
            payload);

        await _handler.HandleAsync(payload, new InteropMessageContext(envelope), CancellationToken.None);
        return (appointmentId, callId, rawToken, rawDob, rawOtp);
    }

    [Fact]
    public async Task VerifyGuest_BruteForceLockout_LocksPermanentlyAfterFiveFailedAttempts_EvenIfNextAttemptHasCorrectCredentials()
    {
        var (aptId, callId, rawToken, rawDob, rawOtp) = await SetupPreHashedInviteAsync();

        // Attempts 1 to 4: Fail with wrong OTP, decrement remaining attempts
        for (int i = 1; i <= 4; i++)
        {
            var failResult = await _verificationService.VerifyGuestAsync(rawToken, rawDob, "000000");
            Assert.False(failResult.Success);
            Assert.Equal("INVALID_VERIFICATION_CREDENTIALS", failResult.ErrorCode);
            Assert.Equal(5 - i, failResult.RemainingAttempts);
            Assert.False(failResult.IsLockedOut);
        }

        // Attempt 5: 5th failure triggers permanent lockout
        var lockoutResult = await _verificationService.VerifyGuestAsync(rawToken, rawDob, "000000");
        Assert.False(lockoutResult.Success);
        Assert.Equal("GUEST_INVITE_LOCKED_OUT", lockoutResult.ErrorCode);
        Assert.Equal(0, lockoutResult.RemainingAttempts);
        Assert.True(lockoutResult.IsLockedOut);

        // Attempt 6: Even with 100% correct credentials, must still be REJECTED with GUEST_INVITE_LOCKED_OUT
        var bypassAttempt = await _verificationService.VerifyGuestAsync(rawToken, rawDob, rawOtp);
        Assert.False(bypassAttempt.Success);
        Assert.Equal("GUEST_INVITE_LOCKED_OUT", bypassAttempt.ErrorCode);
        Assert.True(bypassAttempt.IsLockedOut);
        Assert.Null(bypassAttempt.GuestToken);
    }

    [Fact]
    public async Task VerifyGuest_ExpiredToken_RejectsWithGuestInviteExpired()
    {
        var pastExpiry = DateTime.UtcNow.AddMinutes(-5);
        var (aptId, callId, rawToken, rawDob, rawOtp) = await SetupPreHashedInviteAsync(pastExpiry);

        var result = await _verificationService.VerifyGuestAsync(rawToken, rawDob, rawOtp);

        Assert.False(result.Success);
        Assert.Equal("GUEST_INVITE_EXPIRED", result.ErrorCode);
        Assert.True(result.IsExpired);
        Assert.Null(result.GuestToken);
    }

    [Theory]
    [InlineData("1988/11/25")] // Slash delimiter
    [InlineData("25-11-1988")] // DD-MM-YYYY
    [InlineData("1988-1-25")]  // Single digit month
    [InlineData("invalid-date")]
    public async Task VerifyGuest_MalformedDateOfBirth_RejectsWithInvalidFormat_WithoutPenalizingAttemptCount(string malformedDob)
    {
        var (aptId, callId, rawToken, rawDob, rawOtp) = await SetupPreHashedInviteAsync();

        var result = await _verificationService.VerifyGuestAsync(rawToken, malformedDob, rawOtp);

        Assert.False(result.Success);
        Assert.Equal("INVALID_FORMAT", result.ErrorCode);

        // Subsequent valid attempt should have all 5 attempts intact
        var validResult = await _verificationService.VerifyGuestAsync(rawToken, rawDob, rawOtp);
        Assert.True(validResult.Success);
        Assert.Equal(5, validResult.RemainingAttempts);
    }

    [Theory]
    [InlineData("12345")]   // 5 digits
    [InlineData("1234567")] // 7 digits
    [InlineData("48151a")]  // alphanumeric
    [InlineData("      ")]  // whitespace
    public async Task VerifyGuest_MalformedOtp_RejectsWithInvalidFormat_WithoutPenalizingAttemptCount(string malformedOtp)
    {
        var (aptId, callId, rawToken, rawDob, rawOtp) = await SetupPreHashedInviteAsync();

        var result = await _verificationService.VerifyGuestAsync(rawToken, rawDob, malformedOtp);

        Assert.False(result.Success);
        Assert.Equal("INVALID_FORMAT", result.ErrorCode);

        var validResult = await _verificationService.VerifyGuestAsync(rawToken, rawDob, rawOtp);
        Assert.True(validResult.Success);
        Assert.Equal(5, validResult.RemainingAttempts);
    }

    [Theory]
    [InlineData("rx-1234567890abcdef1234567890abcdef")]
    [InlineData("mc-1234567890abcdef1234567890abcdef")]
    [InlineData("ref-1234567890abcdef1234567890abcdef")]
    [InlineData("lab-1234567890abcdef1234567890abcdef")]
    [InlineData("sec-sha256-abcdef0123456789abcdef0123")]
    public async Task VerifyGuest_ClinicalDocumentTokens_RejectedWithDocumentKindMismatch(string spoofedDocToken)
    {
        var result = await _verificationService.VerifyGuestAsync(spoofedDocToken, "1990-01-01", "123456");

        Assert.False(result.Success);
        Assert.Equal("DOCUMENT_KIND_MISMATCH", result.ErrorCode);
    }

    [Fact]
    public async Task VerifyGuest_Success_ProducesValidLiveKitJwtToken_WithZeroPhiClaims()
    {
        var (aptId, callId, rawToken, rawDob, rawOtp) = await SetupPreHashedInviteAsync();

        var result = await _verificationService.VerifyGuestAsync(rawToken, rawDob, rawOtp);

        Assert.True(result.Success);
        Assert.Equal($"call-{callId:N}", result.RoomName);
        Assert.Equal("wss://livekit.adv.clinicez.internal", result.RelayUrl);
        Assert.False(string.IsNullOrWhiteSpace(result.GuestToken));

        // Inspect token claims
        var handler = new JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(result.GuestToken);

        Assert.Equal("adv-portal-key", jwt.Issuer);
        Assert.Equal($"guest:otp-{aptId:N}", jwt.Subject);

        // Assert NO patient PHI in claims
        Assert.DoesNotContain(jwt.Claims, c => c.Type == "name");
        Assert.DoesNotContain(jwt.Claims, c => c.Type == "dob");
        Assert.DoesNotContain(jwt.Claims, c => c.Type == "birthdate");
        Assert.DoesNotContain(jwt.Claims, c => c.Type == "patient_id");

        // Validate video grant
        var videoClaim = jwt.Claims.FirstOrDefault(c => c.Type == "video");
        Assert.NotNull(videoClaim);
        using var doc = JsonDocument.Parse(videoClaim!.Value);
        var root = doc.RootElement;
        Assert.Equal($"call-{callId:N}", root.GetProperty("room").GetString());
        Assert.True(root.GetProperty("roomJoin").GetBoolean());
        Assert.True(root.GetProperty("canPublish").GetBoolean());
        Assert.True(root.GetProperty("canSubscribe").GetBoolean());
    }
}
