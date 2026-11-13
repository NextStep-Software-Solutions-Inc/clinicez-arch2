using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
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
public class GuestTeleconsultInviteIssuedHandlerTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly IInteropPublisher _publisher;
    private readonly IConfiguration _configuration;
    private readonly IGuestVerificationService _verificationService;
    private readonly GuestTeleconsultInviteIssuedHandler _handler;

    public GuestTeleconsultInviteIssuedHandlerTests()
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
    public async Task HandleAsync_RegistersPreHashedInvite_AllowsGuestVerificationAndTokenMinting()
    {
        // Arrange
        var appointmentId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        var rawToken = "fedcba98765432100123456789abcdef";
        var rawDob = "1992-08-24";
        var rawOtp = "654321";

        var tokenHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawToken))).ToLowerInvariant();
        var dobHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{appointmentId:N}:{rawDob}"))).ToLowerInvariant();
        var otpHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{appointmentId:N}:{rawOtp}"))).ToLowerInvariant();

        var payload = new GuestTeleconsultInviteIssuedPayload(
            AppointmentId: appointmentId,
            CallId: callId,
            TenantId: "tenant-hospital",
            FacilityId: "clinic-main",
            InviteTokenHash: tokenHash,
            ExpectedDobHash: dobHash,
            OtpHash: otpHash,
            ExpiresAtUtc: DateTime.UtcNow.AddMinutes(45),
            IssuedAtUtc: DateTime.UtcNow);

        var envelope = InteropEnvelope.Create(
            InteropTypes.GuestTeleconsultInviteIssued,
            Party.ForFacility("tenant-hospital", "clinic-main", FacilityType.Clinic),
            Party.Portal,
            appointmentId,
            payload);

        var context = new InteropMessageContext(envelope);

        // Act - 1. Handle interop message from clinic-api
        await _handler.HandleAsync(payload, context, CancellationToken.None);

        // Act - 2. Guest verifies via portal with plaintext credentials
        var result = await _verificationService.VerifyGuestAsync(rawToken, rawDob, rawOtp, CancellationToken.None);

        // Assert
        Assert.NotNull(result);
        Assert.True(result.Success);
        Assert.Equal(callId, result.CallId);
        Assert.Equal($"call-{callId:N}", result.RoomName);
        Assert.Equal("wss://livekit.clinicez.test", result.RelayUrl);
        Assert.False(string.IsNullOrWhiteSpace(result.GuestToken));

        // Verify JWT token claims
        var tokenHandler = new JwtSecurityTokenHandler();
        var jwt = tokenHandler.ReadJwtToken(result.GuestToken);
        Assert.Equal("devkey", jwt.Issuer);
        Assert.Equal($"guest:otp-{appointmentId:N}", jwt.Subject);
    }

    [Fact]
    public async Task HandleAsync_InvalidCredentials_VerificationFails()
    {
        // Arrange
        var appointmentId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        var rawToken = "fedcba98765432100123456789abcdef";
        var rawDob = "1992-08-24";
        var rawOtp = "654321";

        var tokenHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawToken))).ToLowerInvariant();
        var dobHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{appointmentId:N}:{rawDob}"))).ToLowerInvariant();
        var otpHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{appointmentId:N}:{rawOtp}"))).ToLowerInvariant();

        var payload = new GuestTeleconsultInviteIssuedPayload(
            AppointmentId: appointmentId,
            CallId: callId,
            TenantId: "tenant-hospital",
            FacilityId: "clinic-main",
            InviteTokenHash: tokenHash,
            ExpectedDobHash: dobHash,
            OtpHash: otpHash,
            ExpiresAtUtc: DateTime.UtcNow.AddMinutes(45),
            IssuedAtUtc: DateTime.UtcNow);

        var envelope = InteropEnvelope.Create(
            InteropTypes.GuestTeleconsultInviteIssued,
            Party.ForFacility("tenant-hospital", "clinic-main", FacilityType.Clinic),
            Party.Portal,
            appointmentId,
            payload);

        var context = new InteropMessageContext(envelope);

        await _handler.HandleAsync(payload, context, CancellationToken.None);

        // Act - with wrong OTP
        var result = await _verificationService.VerifyGuestAsync(rawToken, rawDob, "999999", CancellationToken.None);

        // Assert
        Assert.NotNull(result);
        Assert.False(result.Success);
        Assert.Equal("INVALID_VERIFICATION_CREDENTIALS", result.ErrorCode);
        Assert.Equal(4, result.RemainingAttempts);
    }
}
