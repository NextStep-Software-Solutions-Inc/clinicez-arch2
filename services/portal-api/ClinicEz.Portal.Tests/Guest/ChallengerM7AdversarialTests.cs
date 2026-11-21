using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
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
public class ChallengerM7AdversarialTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly IInteropPublisher _publisher;
    private readonly IConfiguration _configuration;
    private readonly IGuestVerificationService _verificationService;
    private readonly GuestTeleconsultInviteIssuedHandler _handler;

    public ChallengerM7AdversarialTests()
    {
        _publisher = new InteropPublisher(_context);

        var configValues = new Dictionary<string, string?>
        {
            ["LIVEKIT_API_KEY"] = "devkey",
            ["LIVEKIT_API_SECRET"] = "secretsecretsecretsecretsecretsecret32bytes!",
            ["LIVEKIT_URL"] = "wss://livekit.clinicez.test"
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

    [Fact]
    public async Task ZeroPhi_StoredGuestInvite_ContainsOnlyHashes_NoPlaintextCredentials()
    {
        // Arrange
        var appointmentId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        var rawToken = "abcdef0123456789abcdef0123456789";
        var rawDob = "1988-12-05";
        var rawOtp = "123456";

        var tokenHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawToken))).ToLowerInvariant();
        var dobHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{appointmentId:N}:{rawDob}"))).ToLowerInvariant();
        var otpHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{appointmentId:N}:{rawOtp}"))).ToLowerInvariant();

        var payload = new GuestTeleconsultInviteIssuedPayload(
            AppointmentId: appointmentId,
            CallId: callId,
            TenantId: "tenant-stress",
            FacilityId: "clinic-stress",
            InviteTokenHash: tokenHash,
            ExpectedDobHash: dobHash,
            OtpHash: otpHash,
            ExpiresAtUtc: DateTime.UtcNow.AddMinutes(30),
            IssuedAtUtc: DateTime.UtcNow);

        var envelope = InteropEnvelope.Create(
            InteropTypes.GuestTeleconsultInviteIssued,
            Party.ForFacility("tenant-stress", "clinic-stress", FacilityType.Clinic),
            Party.Portal,
            appointmentId,
            payload);

        // Act
        await _handler.HandleAsync(payload, new InteropMessageContext(envelope), CancellationToken.None);

        // Assert
        var stored = GuestVerificationService.RegisterPreHashedInvite(
            appointmentId, "tenant-stress", "clinic-stress", callId, tokenHash, dobHash, otpHash, DateTime.UtcNow.AddMinutes(30));

        // Empirically verify that stored record does not contain raw credentials
        Assert.DoesNotContain(rawToken, stored.ToString());
        Assert.DoesNotContain(rawDob, stored.ToString());
        Assert.DoesNotContain(rawOtp, stored.ToString());
        Assert.Equal(tokenHash, stored.InviteTokenHash);
        Assert.Equal(dobHash, stored.ExpectedDobHash);
        Assert.Equal(otpHash, stored.OtpHash);
    }

    [Fact]
    public async Task ExpiredInvite_VerificationFailsWith_GUEST_INVITE_EXPIRED()
    {
        // Arrange
        var appointmentId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        var rawToken = "abcdef0123456789abcdef0123456789";
        var rawDob = "1988-12-05";
        var rawOtp = "123456";

        var tokenHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawToken))).ToLowerInvariant();
        var dobHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{appointmentId:N}:{rawDob}"))).ToLowerInvariant();
        var otpHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{appointmentId:N}:{rawOtp}"))).ToLowerInvariant();

        // Expired 5 minutes ago
        var payload = new GuestTeleconsultInviteIssuedPayload(
            AppointmentId: appointmentId,
            CallId: callId,
            TenantId: "tenant-stress",
            FacilityId: "clinic-stress",
            InviteTokenHash: tokenHash,
            ExpectedDobHash: dobHash,
            OtpHash: otpHash,
            ExpiresAtUtc: DateTime.UtcNow.AddMinutes(-5),
            IssuedAtUtc: DateTime.UtcNow.AddHours(-1));

        var envelope = InteropEnvelope.Create(
            InteropTypes.GuestTeleconsultInviteIssued,
            Party.ForFacility("tenant-stress", "clinic-stress", FacilityType.Clinic),
            Party.Portal,
            appointmentId,
            payload);

        await _handler.HandleAsync(payload, new InteropMessageContext(envelope), CancellationToken.None);

        // Act - Attempt verification with valid credentials
        var result = await _verificationService.VerifyGuestAsync(rawToken, rawDob, rawOtp, CancellationToken.None);

        // Assert
        Assert.NotNull(result);
        Assert.False(result.Success);
        Assert.True(result.IsExpired);
        Assert.Equal("GUEST_INVITE_EXPIRED", result.ErrorCode);
    }

    [Theory]
    [InlineData("1988/12/05", "123456")] // invalid DOB separator
    [InlineData("88-12-05", "123456")]   // 2-digit year
    [InlineData("1988-12-5", "123456")]   // single digit day
    [InlineData("1988-12-05", "12345")]   // 5 digit OTP
    [InlineData("1988-12-05", "1234567")] // 7 digit OTP
    [InlineData("1988-12-05", "abcdef")] // non-numeric OTP
    [InlineData("1988-12-05", "123 45")] // space in OTP
    public async Task MalformedInput_FailsWithInvalidFormat_WithoutAttemptCountIncrement(string dob, string otp)
    {
        var rawToken = "abcdef0123456789abcdef0123456789";
        var result = await _verificationService.VerifyGuestAsync(rawToken, dob, otp, CancellationToken.None);

        Assert.NotNull(result);
        Assert.False(result.Success);
        Assert.Equal("INVALID_FORMAT", result.ErrorCode);
    }

    [Fact]
    public async Task Adversarial_ConcurrentRegistrationAndLookup_StressTest()
    {
        // Stress test thread safety of static ConcurrentDictionary stores
        const int concurrency = 50;
        var tasks = new List<Task>();
        var registeredIds = new ConcurrentBag<Guid>();

        for (int i = 0; i < concurrency; i++)
        {
            var idx = i;
            tasks.Add(Task.Run(async () =>
            {
                var apptId = Guid.NewGuid();
                var callId = Guid.NewGuid();
                var token = $"token_{idx:D8}_{Guid.NewGuid():N}";
                var tokenHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();
                var dobHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{apptId:N}:1990-01-01"))).ToLowerInvariant();
                var otpHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{apptId:N}:111222"))).ToLowerInvariant();

                var payload = new GuestTeleconsultInviteIssuedPayload(
                    apptId, callId, "t-concurrent", "f-concurrent", tokenHash, dobHash, otpHash, DateTime.UtcNow.AddMinutes(15), DateTime.UtcNow);

                var envelope = InteropEnvelope.Create(
                    InteropTypes.GuestTeleconsultInviteIssued,
                    Party.ForFacility("t-concurrent", "f-concurrent", FacilityType.Clinic),
                    Party.Portal,
                    apptId,
                    payload);

                await _handler.HandleAsync(payload, new InteropMessageContext(envelope), CancellationToken.None);
                registeredIds.Add(apptId);

                // Immediate concurrent lookup
                var res = await _verificationService.VerifyGuestAsync(token, "1990-01-01", "111222", CancellationToken.None);
                Assert.True(res.Success);
                Assert.Equal(callId, res.CallId);
            }));
        }

        await Task.WhenAll(tasks);
        Assert.Equal(concurrency, registeredIds.Count);
    }

    [Fact]
    public async Task Concurrency_SequentialAndBurstLockout_BypassesArePrevented()
    {
        // Arrange: Register invite
        var apptId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        var rawToken = "concurrentlockouttoken0123456789";
        var rawDob = "1995-05-15";
        var rawOtp = "777888";

        var tokenHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawToken))).ToLowerInvariant();
        var dobHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{apptId:N}:{rawDob}"))).ToLowerInvariant();
        var otpHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{apptId:N}:{rawOtp}"))).ToLowerInvariant();

        var payload = new GuestTeleconsultInviteIssuedPayload(
            apptId, callId, "t-burst", "f-burst", tokenHash, dobHash, otpHash, DateTime.UtcNow.AddMinutes(15), DateTime.UtcNow);

        var envelope = InteropEnvelope.Create(
            InteropTypes.GuestTeleconsultInviteIssued,
            Party.ForFacility("t-burst", "f-burst", FacilityType.Clinic),
            Party.Portal,
            apptId,
            payload);

        await _handler.HandleAsync(payload, new InteropMessageContext(envelope), CancellationToken.None);

        // 5 consecutive failed attempts
        for (int i = 1; i <= 4; i++)
        {
            var r = await _verificationService.VerifyGuestAsync(rawToken, rawDob, "000000", CancellationToken.None);
            Assert.False(r.Success);
            Assert.Equal("INVALID_VERIFICATION_CREDENTIALS", r.ErrorCode);
            Assert.Equal(5 - i, r.RemainingAttempts);
        }

        // 5th attempt triggers permanent lockout
        var r5 = await _verificationService.VerifyGuestAsync(rawToken, rawDob, "000000", CancellationToken.None);
        Assert.False(r5.Success);
        Assert.True(r5.IsLockedOut);
        Assert.Equal("GUEST_INVITE_LOCKED_OUT", r5.ErrorCode);

        // Even with correct credentials on 6th attempt, lockout must strictly block
        var r6 = await _verificationService.VerifyGuestAsync(rawToken, rawDob, rawOtp, CancellationToken.None);
        Assert.False(r6.Success);
        Assert.True(r6.IsLockedOut);
        Assert.Equal("GUEST_INVITE_LOCKED_OUT", r6.ErrorCode);
    }
}
