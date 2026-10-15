using System;
using System.Text;
using ClinicEz.Shared.Security.ClaimTokens;
using Xunit;

namespace ClinicEz.Shared.Tests.Security.ClaimTokens;

public class ClaimTokenServiceTests
{
    private sealed class TestTimeProvider(DateTimeOffset initialUtcNow) : TimeProvider
    {
        private DateTimeOffset _utcNow = initialUtcNow;
        public override DateTimeOffset GetUtcNow() => _utcNow;
        public void SetUtcNow(DateTimeOffset utcNow) => _utcNow = utcNow;
    }
    private static readonly byte[] ValidKey = Encoding.UTF8.GetBytes("0123456789abcdef0123456789abcdef"); // 32 bytes

    private static ClaimTokenClaims SampleClaims(DateTime? expiresAt = null, DateTime? issuedAt = null) => new(
        joinRequestId: Guid.Parse("11111111-2222-3333-4444-555555555555"),
        tenantSlug: "metro-health",
        facilitySlug: "central-clinic",
        email: "patient@example.ph",
        firstName: "Juan",
        lastName: "Dela Cruz",
        dateOfBirth: new DateOnly(1990, 5, 15),
        memberType: "MM",
        issuedAtUtc: issuedAt ?? new DateTime(2026, 10, 13, 10, 0, 0, DateTimeKind.Utc),
        expiresAtUtc: expiresAt ?? new DateTime(2035, 1, 1, 0, 0, 0, DateTimeKind.Utc)
    );

    [Fact]
    public void Constructor_RejectsKeyShorterThan32Bytes()
    {
        var shortKey = new byte[31];
        Assert.Throws<ArgumentException>(() => new ClaimTokenService(shortKey));
    }

    [Fact]
    public void IssueAndValidate_RoundTripsAllClaimsSuccessfully()
    {
        var timeProvider = new TestTimeProvider(new DateTimeOffset(2026, 10, 13, 11, 0, 0, TimeSpan.Zero));
        var service = new ClaimTokenService(ValidKey, timeProvider);

        var originalClaims = SampleClaims();
        var token = service.IssueToken(originalClaims);

        Assert.NotNull(token);
        Assert.Contains(".", token);

        var result = service.ValidateToken(token);
        Assert.True(result.IsValid);
        Assert.Equal(ClaimTokenValidationStatus.Valid, result.Status);
        Assert.NotNull(result.Claims);

        Assert.Equal(originalClaims.JoinRequestId, result.Claims.JoinRequestId);
        Assert.Equal(originalClaims.TenantSlug, result.Claims.TenantSlug);
        Assert.Equal(originalClaims.FacilitySlug, result.Claims.FacilitySlug);
        Assert.Equal(originalClaims.Email, result.Claims.Email);
        Assert.Equal(originalClaims.FirstName, result.Claims.FirstName);
        Assert.Equal(originalClaims.LastName, result.Claims.LastName);
        Assert.Equal(originalClaims.DateOfBirth, result.Claims.DateOfBirth);
        Assert.Equal(originalClaims.MemberType, result.Claims.MemberType);
        Assert.Equal(originalClaims.IssuedAtUtc, result.Claims.IssuedAtUtc);
        Assert.Equal(originalClaims.ExpiresAtUtc, result.Claims.ExpiresAtUtc);
    }

    [Fact]
    public void ValidateToken_RejectsExpiredToken()
    {
        var timeProvider = new TestTimeProvider(new DateTimeOffset(2026, 10, 13, 10, 0, 0, TimeSpan.Zero));
        var service = new ClaimTokenService(ValidKey, timeProvider);

        var claims = SampleClaims(expiresAt: new DateTime(2026, 10, 14, 10, 0, 0, DateTimeKind.Utc));
        var token = service.IssueToken(claims);

        // Advance time past expiration
        timeProvider.SetUtcNow(new DateTimeOffset(2026, 10, 14, 10, 0, 1, TimeSpan.Zero));

        var result = service.ValidateToken(token);
        Assert.False(result.IsValid);
        Assert.Equal(ClaimTokenValidationStatus.Expired, result.Status);
        Assert.Null(result.Claims);
        Assert.NotNull(result.ErrorMessage);
    }

    [Fact]
    public void ValidateToken_RejectsTamperedPayload()
    {
        var service = new ClaimTokenService(ValidKey);
        var token = service.IssueToken(SampleClaims());
        var parts = token.Split('.');

        // Tamper with base64url payload
        var padded = parts[0].Replace('-', '+').Replace('_', '/');
        padded = padded.PadRight(padded.Length + (4 - padded.Length % 4) % 4, '=');
        var payloadBytes = Convert.FromBase64String(padded);
        var payloadJson = Encoding.UTF8.GetString(payloadBytes);
        var tamperedJson = payloadJson.Replace("Juan", "Pedro");
        var tamperedPayload = Convert.ToBase64String(Encoding.UTF8.GetBytes(tamperedJson))
            .TrimEnd('=').Replace('+', '-').Replace('/', '_');

        var tamperedToken = $"{tamperedPayload}.{parts[1]}";
        var result = service.ValidateToken(tamperedToken);

        Assert.False(result.IsValid);
        Assert.Equal(ClaimTokenValidationStatus.BadSignature, result.Status);
        Assert.Null(result.Claims);
    }

    [Fact]
    public void ValidateToken_RejectsTamperedSignature()
    {
        var service = new ClaimTokenService(ValidKey);
        var token = service.IssueToken(SampleClaims());
        var parts = token.Split('.');

        // Change the last character of the signature
        var lastChar = parts[1][^1];
        var replacementChar = lastChar == 'A' ? 'B' : 'A';
        var tamperedSignature = parts[1][..^1] + replacementChar;

        var tamperedToken = $"{parts[0]}.{tamperedSignature}";
        var result = service.ValidateToken(tamperedToken);

        Assert.False(result.IsValid);
        Assert.Equal(ClaimTokenValidationStatus.BadSignature, result.Status);
        Assert.Null(result.Claims);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("singlepart")]
    [InlineData("part1.part2.part3")]
    [InlineData("invalid_base64!.signature")]
    [InlineData("eyJsbiI6IkRlbGEgQ3J1eiJ9.not-valid-base64-sig!!!")]
    public void ValidateToken_RejectsMalformedTokens(string malformedToken)
    {
        var service = new ClaimTokenService(ValidKey);
        var result = service.ValidateToken(malformedToken);

        Assert.False(result.IsValid);
        Assert.Equal(ClaimTokenValidationStatus.Malformed, result.Status);
    }

    [Fact]
    public void ValidateToken_RejectsTokenSignedWithDifferentKey()
    {
        var otherKey = Encoding.UTF8.GetBytes("different-key-0123456789abcdef01");
        var signer = new ClaimTokenService(ValidKey);
        var verifier = new ClaimTokenService(otherKey);

        var token = signer.IssueToken(SampleClaims());
        var result = verifier.ValidateToken(token);

        Assert.False(result.IsValid);
        Assert.Equal(ClaimTokenValidationStatus.BadSignature, result.Status);
    }

    [Fact]
    public void NineArgumentConstructor_DefaultsIssuedAtToCurrentUtc()
    {
        var before = DateTime.UtcNow.AddSeconds(-1);
        var claims = new ClaimTokenClaims(
            joinRequestId: Guid.NewGuid(),
            tenantSlug: "t",
            facilitySlug: "f",
            email: "test@domain.ph",
            firstName: "Maria",
            lastName: "Clara",
            dateOfBirth: new DateOnly(1995, 1, 1),
            memberType: "DD",
            expiresAtUtc: DateTime.UtcNow.AddHours(48)
        );
        var after = DateTime.UtcNow.AddSeconds(1);

        Assert.InRange(claims.IssuedAtUtc, before, after);
    }

    [Fact]
    public void DevelopmentEnvironmentFallback_DerivesSecretWithoutFailing()
    {
        // When CLINICEZ_DEV_KEYS is true (which test runsettings configures), default constructor succeeds
        var devService = new ClaimTokenService();
        var claims = SampleClaims();

        var token = devService.IssueToken(claims);
        var result = devService.ValidateToken(token);

        Assert.True(result.IsValid);
        Assert.NotNull(result.Claims);
    }
}
