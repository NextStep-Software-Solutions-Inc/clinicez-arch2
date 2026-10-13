using System;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ClinicEz.Shared.Security.ClaimTokens;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Shared.Tests.Security.ClaimTokens;

/// <summary>
/// Tier 5 Adversarial Probes for ClaimTokenService:
/// - Cryptographic signature tampering & boundary mutations (indices 41, 42, 43)
/// - Base64Url padding injection attacks
/// - Epoch boundaries (Unix 0, negative timestamps, Year 2038 / 2099 / 3000)
/// - Clock skew tolerance analysis (+/- 5 seconds)
/// </summary>
public class ClaimTokenTier5ProbesTests
{
    private sealed class MutableTimeProvider(DateTimeOffset initialUtcNow) : TimeProvider
    {
        private DateTimeOffset _utcNow = initialUtcNow;
        public override DateTimeOffset GetUtcNow() => _utcNow;
        public void SetUtcNow(DateTimeOffset utcNow) => _utcNow = utcNow;
    }

    private static readonly byte[] SigningKey = Encoding.UTF8.GetBytes("Tier5-Adversarial-Signing-Key-32B!");

    private static ClaimTokenClaims CreateSampleClaims(
        DateTime? expiresAt = null,
        DateTime? issuedAt = null,
        string? email = "adversarial@clinicez.ph",
        string firstName = "Jose",
        string lastName = "Rizal",
        DateOnly? dob = null,
        string? memberType = "MM") => new(
        joinRequestId: Guid.Parse("f1e2d3c4-b5a6-7890-1234-567890abcdef"),
        tenantSlug: "taguig-health",
        facilitySlug: "bgc-main",
        email: email,
        firstName: firstName,
        lastName: lastName,
        dateOfBirth: dob ?? new DateOnly(1985, 12, 30),
        memberType: memberType,
        issuedAtUtc: issuedAt ?? new DateTime(2026, 10, 13, 12, 0, 0, DateTimeKind.Utc),
        expiresAtUtc: expiresAt ?? new DateTime(2026, 10, 15, 12, 0, 0, DateTimeKind.Utc)
    );

    #region Probe 1: Signature Boundary Mutations at Index 41, 42, 43

    [Fact]
    public void Probe1_SignatureCharacterMutation_AtIndex41_IsRejectedAsBadSignature()
    {
        var service = new ClaimTokenService(SigningKey);
        var token = service.IssueToken(CreateSampleClaims());
        var parts = token.Split('.');

        parts[1].Length.Should().Be(43);

        // Mutate character at index 41 (second-to-last char)
        var original = parts[1][41];
        var replacement = original == 'A' ? 'B' : (original == 'Z' ? 'Y' : (char)(original + 1));
        var tamperedSig = parts[1][..41] + replacement + parts[1][42..];

        var result = service.ValidateToken($"{parts[0]}.{tamperedSig}");
        result.IsValid.Should().BeFalse();
        result.Status.Should().Be(ClaimTokenValidationStatus.BadSignature);
    }

    [Fact]
    public void Probe1_SignatureCharacterMutation_AtIndex42_IsRejectedAsBadSignature()
    {
        var service = new ClaimTokenService(SigningKey);
        var token = service.IssueToken(CreateSampleClaims());
        var parts = token.Split('.');

        parts[1].Length.Should().Be(43);

        // Mutate character at index 42 (last char)
        var original = parts[1][42];
        var replacement = original == 'A' ? 'B' : (original == 'Z' ? 'Y' : (char)(original + 1));
        var tamperedSig = parts[1][..42] + replacement;

        var result = service.ValidateToken($"{parts[0]}.{tamperedSig}");
        result.IsValid.Should().BeFalse();
        result.Status.Should().Be(ClaimTokenValidationStatus.BadSignature);
    }

    [Fact]
    public void Probe1_SignatureCharacterMutation_AtIndex43_LengthMismatch_IsRejectedAsMalformed()
    {
        var service = new ClaimTokenService(SigningKey);
        var token = service.IssueToken(CreateSampleClaims());
        var parts = token.Split('.');

        // Append 44th character (index 43)
        var tamperedSig = parts[1] + "A";
        tamperedSig.Length.Should().Be(44);

        var result = service.ValidateToken($"{parts[0]}.{tamperedSig}");
        result.IsValid.Should().BeFalse();
        result.Status.Should().Be(ClaimTokenValidationStatus.Malformed);
        result.ErrorMessage.Should().Contain("Signature length is invalid");
    }

    #endregion

    #region Probe 2: Base64Url Padding Injection

    [Theory]
    [InlineData("=")]
    [InlineData("==")]
    [InlineData("===")]
    public void Probe2_Base64UrlPaddingInjection_InSignature_IsRejectedAsMalformed(string padding)
    {
        var service = new ClaimTokenService(SigningKey);
        var token = service.IssueToken(CreateSampleClaims());
        var parts = token.Split('.');

        var paddedSig = parts[1] + padding;
        var result = service.ValidateToken($"{parts[0]}.{paddedSig}");

        result.IsValid.Should().BeFalse();
        result.Status.Should().Be(ClaimTokenValidationStatus.Malformed);
    }

    [Theory]
    [InlineData("=")]
    [InlineData("==")]
    public void Probe2_Base64UrlPaddingInjection_InPayload_IsRejectedAsBadSignature(string padding)
    {
        var service = new ClaimTokenService(SigningKey);
        var token = service.IssueToken(CreateSampleClaims());
        var parts = token.Split('.');

        // Injecting padding into payload changes its ASCII bytes and invalidates HMAC signature
        var paddedPayload = parts[0] + padding;
        var result = service.ValidateToken($"{paddedPayload}.{parts[1]}");

        result.IsValid.Should().BeFalse();
        result.Status.Should().BeOneOf(ClaimTokenValidationStatus.BadSignature, ClaimTokenValidationStatus.Malformed);
    }

    #endregion

    #region Probe 3: Epoch Boundaries & Time Probes

    [Fact]
    public void Probe3_EpochBoundary_UnixEpochZero_IsRejectedAsExpired()
    {
        var timeProvider = new MutableTimeProvider(new DateTimeOffset(2026, 10, 13, 12, 0, 0, TimeSpan.Zero));
        var service = new ClaimTokenService(SigningKey, timeProvider);

        // Expired at Unix epoch (1970-01-01)
        var claims = CreateSampleClaims(
            issuedAt: new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc),
            expiresAt: new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc));

        var token = service.IssueToken(claims);
        var result = service.ValidateToken(token);

        result.IsValid.Should().BeFalse();
        result.Status.Should().Be(ClaimTokenValidationStatus.Expired);
    }

    [Fact]
    public void Probe3_EpochBoundary_NegativeUnixTimestamp_IsRejectedAsExpired()
    {
        var timeProvider = new MutableTimeProvider(new DateTimeOffset(2026, 10, 13, 12, 0, 0, TimeSpan.Zero));
        var service = new ClaimTokenService(SigningKey, timeProvider);

        // Pre-1970 negative Unix timestamp (1969-12-31)
        var claims = CreateSampleClaims(
            issuedAt: new DateTime(1969, 12, 31, 0, 0, 0, DateTimeKind.Utc),
            expiresAt: new DateTime(1969, 12, 31, 23, 59, 59, DateTimeKind.Utc));

        var token = service.IssueToken(claims);
        var result = service.ValidateToken(token);

        result.IsValid.Should().BeFalse();
        result.Status.Should().Be(ClaimTokenValidationStatus.Expired);
    }

    [Fact]
    public void Probe3_EpochBoundary_Post2038Year2099_RoundtripsSuccessfully()
    {
        var fixedTime = new DateTimeOffset(2026, 10, 13, 12, 0, 0, TimeSpan.Zero);
        var timeProvider = new MutableTimeProvider(fixedTime);
        var service = new ClaimTokenService(SigningKey, timeProvider);

        // Far future expiration: Year 2099 (well past 32-bit signed int 2038 overflow)
        var futureExpiry = new DateTime(2099, 12, 31, 23, 59, 59, DateTimeKind.Utc);
        var claims = CreateSampleClaims(expiresAt: futureExpiry);

        var token = service.IssueToken(claims);
        var result = service.ValidateToken(token);

        result.IsValid.Should().BeTrue();
        result.Claims!.ExpiresAtUtc.Should().Be(futureExpiry);
    }

    #endregion

    #region Probe 4: Clock Skew Tolerance Probes (+/- 5 seconds)

    [Fact]
    public void Probe4_ClockSkew_ExactBoundaryEvaluation()
    {
        var t0 = new DateTimeOffset(2026, 10, 13, 12, 0, 0, TimeSpan.Zero);
        var timeProvider = new MutableTimeProvider(t0);
        var service = new ClaimTokenService(SigningKey, timeProvider);

        // Token expires at t0 + 10s
        var claims = CreateSampleClaims(expiresAt: t0.UtcDateTime.AddSeconds(10));
        var token = service.IssueToken(claims);

        // When clock is at t0 + 5s (5 seconds before expiry): Valid
        timeProvider.SetUtcNow(t0.AddSeconds(5));
        service.ValidateToken(token).IsValid.Should().BeTrue();

        // When clock is skewed ahead by +5 seconds at expiry (at t0 + 10s): Expired (strict <= check)
        timeProvider.SetUtcNow(t0.AddSeconds(10));
        service.ValidateToken(token).Status.Should().Be(ClaimTokenValidationStatus.Expired);

        // When clock is skewed ahead to t0 + 15s (+5s past expiry): Expired
        timeProvider.SetUtcNow(t0.AddSeconds(15));
        service.ValidateToken(token).Status.Should().Be(ClaimTokenValidationStatus.Expired);
    }

    [Fact]
    public void Probe4_ClockSkew_48HourClaimWindow_SurvivesClockSkewVariances()
    {
        var t0 = new DateTimeOffset(2026, 10, 13, 12, 0, 0, TimeSpan.Zero);
        var timeProvider = new MutableTimeProvider(t0);
        var service = new ClaimTokenService(SigningKey, timeProvider);

        // Standard 48-hour claim window
        var claims = CreateSampleClaims(expiresAt: t0.UtcDateTime.AddHours(48));
        var token = service.IssueToken(claims);

        // Clock skewed by -5 seconds: Valid
        timeProvider.SetUtcNow(t0.AddSeconds(-5));
        service.ValidateToken(token).IsValid.Should().BeTrue();

        // Clock skewed by +5 seconds: Valid
        timeProvider.SetUtcNow(t0.AddSeconds(5));
        service.ValidateToken(token).IsValid.Should().BeTrue();

        // Clock at 47 hours, 59 minutes, 50 seconds: Valid
        timeProvider.SetUtcNow(t0.AddHours(48).AddSeconds(-10));
        service.ValidateToken(token).IsValid.Should().BeTrue();

        // Clock at exactly 48 hours + 1 second: Expired
        timeProvider.SetUtcNow(t0.AddHours(48).AddSeconds(1));
        service.ValidateToken(token).Status.Should().Be(ClaimTokenValidationStatus.Expired);
    }

    #endregion
}
