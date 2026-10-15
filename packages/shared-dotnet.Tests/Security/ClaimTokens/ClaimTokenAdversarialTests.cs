using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ClinicEz.Shared.Security.ClaimTokens;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Shared.Tests.Security.ClaimTokens;

/// <summary>
/// Empirical adversarial challenger test suite for progressive claim token cryptography.
/// Stress-tests bit mutation, expiration edge cases, internationalized claims,
/// constant-time verification, and false-positive/false-negative guarantees.
/// </summary>
public class ClaimTokenAdversarialTests
{
    private sealed class MutableTimeProvider(DateTimeOffset initialUtcNow) : TimeProvider
    {
        private DateTimeOffset _utcNow = initialUtcNow;
        public override DateTimeOffset GetUtcNow() => _utcNow;
        public void SetUtcNow(DateTimeOffset utcNow) => _utcNow = utcNow;
    }

    private static readonly byte[] AdversarialKey = Encoding.UTF8.GetBytes("AdversarialKey-32Bytes-Long-123!");

    private static ClaimTokenClaims CreateBaselineClaims(
        DateTime? expiresAt = null,
        DateTime? issuedAt = null,
        string? email = "maria.santos@clinicez.ph",
        string firstName = "Maria",
        string lastName = "Santos",
        DateOnly? dob = null,
        string? memberType = "MM") => new(
        joinRequestId: Guid.Parse("a1b2c3d4-e5f6-7890-abcd-ef1234567890"),
        tenantSlug: "metro-health",
        facilitySlug: "ortigas-clinic",
        email: email,
        firstName: firstName,
        lastName: lastName,
        dateOfBirth: dob ?? new DateOnly(1995, 8, 24),
        memberType: memberType,
        issuedAtUtc: issuedAt ?? new DateTime(2026, 10, 13, 12, 0, 0, DateTimeKind.Utc),
        expiresAtUtc: expiresAt ?? new DateTime(2035, 1, 1, 0, 0, 0, DateTimeKind.Utc)
    );

    #region Dimension 1: Bit Mutation & Tamper Resistance (100% Rejection)

    [Fact]
    public void BitMutation_SignatureCharacters_Indices0To41_Asserts100PercentRejection()
    {
        var timeProvider = new MutableTimeProvider(new DateTimeOffset(2026, 10, 13, 12, 0, 0, TimeSpan.Zero));
        var service = new ClaimTokenService(AdversarialKey, timeProvider);
        var token = service.IssueToken(CreateBaselineClaims());

        var parts = token.Split('.');
        parts.Length.Should().Be(2);
        var payloadPart = parts[0];
        var sigPart = parts[1];

        // Characters 0 through 41 encode full 6-bit chunks of the 256-bit hash.
        // Mutating any of these characters alters the decoded hash bytes and must be rejected.
        var rejectedCount = 0;
        for (var i = 0; i < 42; i++)
        {
            var originalChar = sigPart[i];
            var alternateChar = originalChar == 'A' ? 'B' : (originalChar == 'Z' ? 'Y' : (char)(originalChar + 1));

            var tamperedSig = sigPart[..i] + alternateChar + sigPart[(i + 1)..];
            var tamperedToken = $"{payloadPart}.{tamperedSig}";

            var result = service.ValidateToken(tamperedToken);
            result.IsValid.Should().BeFalse($"Mutating signature at char index {i} must be rejected");
            result.Status.Should().BeOneOf(ClaimTokenValidationStatus.BadSignature, ClaimTokenValidationStatus.Malformed);

            rejectedCount++;
        }

        rejectedCount.Should().Be(42);
    }

    [Fact]
    public void SignatureMalleability_UnusedPaddingBitsAtChar42_MustBeRejected()
    {
        // VULNERABILITY REPRODUCTION TEST:
        // Character index 42 (the 43rd base64url character) encodes 4 bits of the 256-bit hash and 2 padding bits.
        // In canonical base64url encoding (RFC 4648 Section 3.5), those 2 padding bits must be 00.
        // However, Convert.FromBase64String ignores non-zero padding bits, allowing up to 3 alternate characters
        // that decode to identical 32 bytes, causing ValidateToken to accept the tampered token.
        // This test asserts that mutating character 42 is rejected.
        var timeProvider = new MutableTimeProvider(new DateTimeOffset(2026, 10, 13, 12, 0, 0, TimeSpan.Zero));
        var service = new ClaimTokenService(AdversarialKey, timeProvider);
        var token = service.IssueToken(CreateBaselineClaims());

        var parts = token.Split('.');
        var payloadPart = parts[0];
        var sigPart = parts[1];

        var lastChar = sigPart[42];
        var alternateChar = (char)(lastChar + 1);

        var tamperedToken = $"{payloadPart}.{sigPart[..42]}{alternateChar}";
        var result = service.ValidateToken(tamperedToken);

        result.IsValid.Should().BeFalse(
            "Modifying signature character at index 42 must be rejected to prevent signature malleability");
    }

    [Fact]
    public void BitMutation_EveryPayloadCharacterFlipped_Asserts100PercentRejection()
    {
        var timeProvider = new MutableTimeProvider(new DateTimeOffset(2026, 10, 13, 12, 0, 0, TimeSpan.Zero));
        var service = new ClaimTokenService(AdversarialKey, timeProvider);
        var token = service.IssueToken(CreateBaselineClaims());

        var parts = token.Split('.');
        var payloadPart = parts[0];
        var sigPart = parts[1];

        var rejectedCount = 0;
        var totalAttempts = 0;

        for (var i = 0; i < payloadPart.Length; i++)
        {
            var originalChar = payloadPart[i];
            var alternateChar = originalChar == 'a' ? 'b' : (originalChar == 'z' ? 'y' : (char)(originalChar + 1));

            var tamperedPayload = payloadPart[..i] + alternateChar + payloadPart[(i + 1)..];
            var tamperedToken = $"{tamperedPayload}.{sigPart}";

            var result = service.ValidateToken(tamperedToken);
            result.IsValid.Should().BeFalse($"Mutating payload at char index {i} must be rejected");
            result.Status.Should().BeOneOf(ClaimTokenValidationStatus.BadSignature, ClaimTokenValidationStatus.Malformed);

            rejectedCount++;
            totalAttempts++;
        }

        rejectedCount.Should().Be(totalAttempts);
        totalAttempts.Should().BeGreaterThan(100);
    }

    [Theory]
    [InlineData(".")]
    [InlineData("..")]
    [InlineData("...")]
    [InlineData("payload")]
    [InlineData("payload.")]
    [InlineData(".sig")]
    [InlineData("payload.sig.extra")]
    [InlineData("payload:sig")]
    [InlineData("payload/sig")]
    [InlineData("payload sig")]
    [InlineData("payload\tsig")]
    [InlineData("payload\nsig")]
    public void DelimiterTampering_MalformedStructures_Are100PercentRejected(string malformed)
    {
        var service = new ClaimTokenService(AdversarialKey);
        var result = service.ValidateToken(malformed);

        result.IsValid.Should().BeFalse();
        result.Status.Should().Be(ClaimTokenValidationStatus.Malformed);
    }

    [Fact]
    public void TruncatedAndExtendedSignatures_Are100PercentRejected()
    {
        var service = new ClaimTokenService(AdversarialKey);
        var validToken = service.IssueToken(CreateBaselineClaims());
        var parts = validToken.Split('.');

        // 1-char signature
        var res1 = service.ValidateToken($"{parts[0]}.A");
        res1.IsValid.Should().BeFalse();

        // 16-byte signature (shorter than HMAC-SHA256 32 bytes)
        var shortSig = Convert.ToBase64String(new byte[16]).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        var resShort = service.ValidateToken($"{parts[0]}.{shortSig}");
        resShort.IsValid.Should().BeFalse();

        // 64-byte signature (longer than HMAC-SHA256 32 bytes)
        var longSig = Convert.ToBase64String(new byte[64]).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        var resLong = service.ValidateToken($"{parts[0]}.{longSig}");
        resLong.IsValid.Should().BeFalse();
    }

    #endregion

    #region Dimension 2: Expiration Edge Cases & Time Resolution Probes

    [Fact]
    public void Expiration_ExpiringAtExactUtcNow_IsRejectedAsExpired()
    {
        var fixedTime = new DateTimeOffset(2026, 10, 13, 12, 0, 0, TimeSpan.Zero);
        var timeProvider = new MutableTimeProvider(fixedTime);
        var service = new ClaimTokenService(AdversarialKey, timeProvider);

        // Token expires exactly at current UtcNow
        var claims = CreateBaselineClaims(expiresAt: fixedTime.UtcDateTime);
        var token = service.IssueToken(claims);

        var result = service.ValidateToken(token);
        result.IsValid.Should().BeFalse();
        result.Status.Should().Be(ClaimTokenValidationStatus.Expired);
    }

    [Fact]
    public void Expiration_Expiring1MillisecondInPast_IsRejectedAsExpired()
    {
        var fixedTime = new DateTimeOffset(2026, 10, 13, 12, 0, 0, TimeSpan.Zero);
        var timeProvider = new MutableTimeProvider(fixedTime);
        var service = new ClaimTokenService(AdversarialKey, timeProvider);

        // Token expires 1ms before current UtcNow
        var claims = CreateBaselineClaims(expiresAt: fixedTime.UtcDateTime.AddMilliseconds(-1));
        var token = service.IssueToken(claims);

        var result = service.ValidateToken(token);
        result.IsValid.Should().BeFalse();
        result.Status.Should().Be(ClaimTokenValidationStatus.Expired);
    }

    [Fact]
    public void Expiration_SubSecondFlooringBehavior_DocumentsUnixSecondTruncation()
    {
        // Demonstrates and verifies the documented Unix second resolution:
        // ClaimTokenService stores Unix timestamps in whole seconds (RFC 7519 NumericDate standard).
        // If current time is 12:00:00.000 and expiration is set to 12:00:00.001 (1ms future),
        // ToUnixSeconds floors to 12:00:00.000, which evaluates as expired at 12:00:00.000.
        var baseSecond = new DateTimeOffset(2026, 10, 13, 12, 0, 0, TimeSpan.Zero);
        var timeProvider = new MutableTimeProvider(baseSecond);
        var service = new ClaimTokenService(AdversarialKey, timeProvider);

        var claimsNominal1ms = CreateBaselineClaims(expiresAt: baseSecond.UtcDateTime.AddMilliseconds(1));
        var tokenNominal1ms = service.IssueToken(claimsNominal1ms);
        var res1ms = service.ValidateToken(tokenNominal1ms);
        res1ms.Status.Should().Be(ClaimTokenValidationStatus.Expired,
            "1ms in future within same second truncates to current second, resulting in Expired");

        // When expiration is set across the second boundary (e.g., +1000ms = 1 full second into the future):
        var claims1SecondFuture = CreateBaselineClaims(expiresAt: baseSecond.UtcDateTime.AddSeconds(1));
        var token1Sec = service.IssueToken(claims1SecondFuture);
        var res1Sec = service.ValidateToken(token1Sec);
        res1Sec.IsValid.Should().BeTrue("A full second future expiration is strictly Valid");

        // When clock advances by exactly 1 second, it becomes Expired:
        timeProvider.SetUtcNow(baseSecond.AddSeconds(1));
        var resExpired = service.ValidateToken(token1Sec);
        resExpired.Status.Should().Be(ClaimTokenValidationStatus.Expired);
    }

    [Fact]
    public void Expiration_BoundaryStep_TransitsPreciselyOnSecondTick()
    {
        var t0 = new DateTimeOffset(2026, 10, 13, 14, 30, 0, TimeSpan.Zero);
        var timeProvider = new MutableTimeProvider(t0);
        var service = new ClaimTokenService(AdversarialKey, timeProvider);

        var claims = CreateBaselineClaims(expiresAt: t0.UtcDateTime.AddSeconds(10));
        var token = service.IssueToken(claims);

        // At t0 + 9.999s: Valid
        timeProvider.SetUtcNow(t0.AddSeconds(9).AddMilliseconds(999));
        service.ValidateToken(token).IsValid.Should().BeTrue();

        // At t0 + 10.000s: Expired (expiresAtUtc <= clock)
        timeProvider.SetUtcNow(t0.AddSeconds(10));
        service.ValidateToken(token).Status.Should().Be(ClaimTokenValidationStatus.Expired);

        // At t0 + 10.001s: Expired
        timeProvider.SetUtcNow(t0.AddSeconds(10).AddMilliseconds(1));
        service.ValidateToken(token).Status.Should().Be(ClaimTokenValidationStatus.Expired);
    }

    #endregion

    #region Dimension 3: Edge-Case Claims & Internationalization

    [Fact]
    public void EdgeCaseClaims_NullEmail_RoundtripsAsNull()
    {
        var service = new ClaimTokenService(AdversarialKey);
        var claims = CreateBaselineClaims(email: null);
        var token = service.IssueToken(claims);

        var result = service.ValidateToken(token);
        result.IsValid.Should().BeTrue();
        result.Claims!.Email.Should().BeNull();
    }

    [Fact]
    public void EdgeCaseClaims_WhitespaceEmail_TrimsToNull()
    {
        var service = new ClaimTokenService(AdversarialKey);
        var claims = CreateBaselineClaims(email: "   ");
        var token = service.IssueToken(claims);

        var result = service.ValidateToken(token);
        result.IsValid.Should().BeTrue();
        result.Claims!.Email.Should().BeNull();
    }

    [Fact]
    public void EdgeCaseClaims_SpecialCharactersInNamesAndSlugs_RoundtripsSafely()
    {
        var service = new ClaimTokenService(AdversarialKey);
        var claims = CreateBaselineClaims(
            firstName: "Dr. O'Connor-Smith & Sons <CEO>",
            lastName: "\"Bobby\" / Drop Table --",
            memberType: "DD-Dependent#1"
        );
        var token = service.IssueToken(claims);

        var result = service.ValidateToken(token);
        result.IsValid.Should().BeTrue();
        result.Claims!.FirstName.Should().Be("Dr. O'Connor-Smith & Sons <CEO>");
        result.Claims.LastName.Should().Be("\"Bobby\" / Drop Table --");
        result.Claims.MemberType.Should().Be("DD-Dependent#1");
    }

    [Fact]
    public void EdgeCaseClaims_InternationalAndUnicodeCharacters_RoundtripsSafely()
    {
        var service = new ClaimTokenService(AdversarialKey);

        // Filipino Ñ, Japanese Kanji, Cyrillic, Arabic, Emojis
        var testCases = new (string First, string Last)[]
        {
            ("Niño", "Dela Peña"),
            ("José", "Rizal-Mercado y Alonso Realonda"),
            ("太郎", "山田"),
            ("Иван", "Иванович"),
            ("فاطمة", "الزهراء"),
            ("Alex 🌟", "Nurse ❤️🩺")
        };

        foreach (var (first, last) in testCases)
        {
            var claims = CreateBaselineClaims(firstName: first, lastName: last);
            var token = service.IssueToken(claims);

            var result = service.ValidateToken(token);
            result.IsValid.Should().BeTrue($"Unicode characters '{first}' '{last}' must validate cleanly");
            result.Claims!.FirstName.Should().Be(first.Trim());
            result.Claims.LastName.Should().Be(last.Trim());
        }
    }

    [Fact]
    public void EdgeCaseClaims_ExtremeLengthNames_RoundtripsSafely()
    {
        var service = new ClaimTokenService(AdversarialKey);
        var longFirst = new string('A', 1000);
        var longLast = new string('B', 2000);

        var claims = CreateBaselineClaims(firstName: longFirst, lastName: longLast);
        var token = service.IssueToken(claims);

        var result = service.ValidateToken(token);
        result.IsValid.Should().BeTrue();
        result.Claims!.FirstName.Should().Be(longFirst);
        result.Claims.LastName.Should().Be(longLast);
    }

    [Theory]
    [InlineData(2000, 2, 29)] // Century leap year
    [InlineData(2024, 2, 29)] // Quadrennial leap year
    [InlineData(1996, 2, 29)] // Standard leap year
    [InlineData(1900, 2, 28)] // Non-leap century year (last day of Feb)
    [InlineData(1, 1, 1)]     // Minimum DateOnly
    [InlineData(9999, 12, 31)]// Maximum DateOnly
    public void EdgeCaseClaims_LeapDayAndBoundaryDatesOfBirth_RoundtripsSafely(int year, int month, int day)
    {
        var service = new ClaimTokenService(AdversarialKey);
        var dob = new DateOnly(year, month, day);

        var claims = CreateBaselineClaims(dob: dob);
        var token = service.IssueToken(claims);

        var result = service.ValidateToken(token);
        result.IsValid.Should().BeTrue();
        result.Claims!.DateOfBirth.Should().Be(dob);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Validation_MissingRequiredClaims_ThrowsAtIssuance(string invalid)
    {
        var service = new ClaimTokenService(AdversarialKey);

        Assert.Throws<ArgumentException>(() => service.IssueToken(new ClaimTokenClaims(
            Guid.Empty, "tenant", "facility", "email@test.com", "First", "Last", new DateOnly(1990, 1, 1), "MM", DateTime.UtcNow.AddHours(48))));

        Assert.Throws<ArgumentException>(() => service.IssueToken(new ClaimTokenClaims(
            Guid.NewGuid(), invalid, "facility", "email@test.com", "First", "Last", new DateOnly(1990, 1, 1), "MM", DateTime.UtcNow.AddHours(48))));

        Assert.Throws<ArgumentException>(() => service.IssueToken(new ClaimTokenClaims(
            Guid.NewGuid(), "tenant", invalid, "email@test.com", "First", "Last", new DateOnly(1990, 1, 1), "MM", DateTime.UtcNow.AddHours(48))));

        Assert.Throws<ArgumentException>(() => service.IssueToken(new ClaimTokenClaims(
            Guid.NewGuid(), "tenant", "facility", "email@test.com", invalid, "Last", new DateOnly(1990, 1, 1), "MM", DateTime.UtcNow.AddHours(48))));

        Assert.Throws<ArgumentException>(() => service.IssueToken(new ClaimTokenClaims(
            Guid.NewGuid(), "tenant", "facility", "email@test.com", "First", invalid, new DateOnly(1990, 1, 1), "MM", DateTime.UtcNow.AddHours(48))));
    }

    #endregion

    #region Dimension 4: Constant-Time Comparison & Side-Channel Timing Audit

    [Fact]
    public void ConstantTime_CryptographicOperationsFixedTimeEquals_ResistsTimingAnalysis()
    {
        var service = new ClaimTokenService(AdversarialKey);
        var token = service.IssueToken(CreateBaselineClaims());
        var parts = token.Split('.');
        var payload = parts[0];
        var validSig = parts[1];

        // Decode signature bytes to craft deliberate mismatches at position 0, 15, and 31
        var padded = validSig.Replace('-', '+').Replace('_', '/');
        padded = padded.PadRight(padded.Length + (4 - padded.Length % 4) % 4, '=');
        var sigBytes = Convert.FromBase64String(padded);
        sigBytes.Length.Should().Be(32); // HMAC-SHA256 output length

        string CreateAlteredToken(int byteIndex)
        {
            var altered = (byte[])sigBytes.Clone();
            altered[byteIndex] ^= 0xFF;
            var alteredSig = Convert.ToBase64String(altered).TrimEnd('=').Replace('+', '-').Replace('/', '_');
            return $"{payload}.{alteredSig}";
        }

        var tokenMismatchAt0 = CreateAlteredToken(0);
        var tokenMismatchAt15 = CreateAlteredToken(15);
        var tokenMismatchAt31 = CreateAlteredToken(31);

        // Warm up JIT (including Tier-1 Dynamic PGO promotion)
        for (var i = 0; i < 2000; i++)
        {
            service.ValidateToken(tokenMismatchAt0);
            service.ValidateToken(tokenMismatchAt15);
            service.ValidateToken(tokenMismatchAt31);
            service.ValidateToken(token);
        }

        GC.Collect();
        GC.WaitForPendingFinalizers();
        GC.Collect();

        // Measure across interleaved rounds and compare medians so single-round GC pauses
        // or shared CI runner CPU preemption spikes do not skew sequential batch measurements.
        const int rounds = 9;
        const int iterationsPerRound = 350;
        var samples0 = new long[rounds];
        var samples15 = new long[rounds];
        var samples31 = new long[rounds];

        for (var round = 0; round < rounds; round++)
        {
            var sw0 = Stopwatch.StartNew();
            for (var i = 0; i < iterationsPerRound; i++)
            {
                var r = service.ValidateToken(tokenMismatchAt0);
                if (r.IsValid) throw new Exception("Must fail");
            }
            sw0.Stop();
            samples0[round] = sw0.ElapsedTicks;

            var sw15 = Stopwatch.StartNew();
            for (var i = 0; i < iterationsPerRound; i++)
            {
                var r = service.ValidateToken(tokenMismatchAt15);
                if (r.IsValid) throw new Exception("Must fail");
            }
            sw15.Stop();
            samples15[round] = sw15.ElapsedTicks;

            var sw31 = Stopwatch.StartNew();
            for (var i = 0; i < iterationsPerRound; i++)
            {
                var r = service.ValidateToken(tokenMismatchAt31);
                if (r.IsValid) throw new Exception("Must fail");
            }
            sw31.Stop();
            samples31[round] = sw31.ElapsedTicks;
        }

        Array.Sort(samples0);
        Array.Sort(samples15);
        Array.Sort(samples31);

        var median0 = samples0[rounds / 2];
        var median31 = samples31[rounds / 2];

        // FixedTimeEquals ensures execution time is dominated by hashing and decoding,
        // without an early-exit branch based on which byte mismatched.
        var ratio = (double)Math.Max(median0, median31) / Math.Max(1L, Math.Min(median0, median31));
        ratio.Should().BeLessThan(3.0,
            $"Median timing difference between mismatch at byte 0 ({median0} ticks) and byte 31 ({median31} ticks) must remain bounded by constant-time verification");
    }

    #endregion

    #region Dimension 5: Zero False Positives & Zero False Negatives Guarantee

    [Fact]
    public void StressGenerator_100DiverseValidTokens_ZeroFalseNegatives()
    {
        var timeProvider = new MutableTimeProvider(new DateTimeOffset(2026, 10, 13, 12, 0, 0, TimeSpan.Zero));
        var service = new ClaimTokenService(AdversarialKey, timeProvider);

        var firstNames = new[] { "Juan", "Maria", "Pedro", "Liza", "Antonio", "Beatriz", "Clara", "Diego", "Elena", "Fernando" };
        var lastNames = new[] { "Dela Cruz", "Santos", "Reyes", "Gonzales", "Bautista", "Villanueva", "Ramos", "Castro", "Aquino", "Mendoza" };
        var memberTypes = new[] { "MM", "DD", null };

        var generatedCount = 0;
        var validCount = 0;

        for (var i = 0; i < 100; i++)
        {
            var claims = new ClaimTokenClaims(
                joinRequestId: Guid.NewGuid(),
                tenantSlug: $"tenant-{i}",
                facilitySlug: $"facility-{i % 5}",
                email: i % 4 == 0 ? null : $"patient_{i}@test.clinicez.ph",
                firstName: firstNames[i % firstNames.Length],
                lastName: lastNames[i % lastNames.Length],
                dateOfBirth: new DateOnly(1970 + (i % 50), (i % 12) + 1, (i % 28) + 1),
                memberType: memberTypes[i % memberTypes.Length],
                issuedAtUtc: timeProvider.GetUtcNow().UtcDateTime,
                expiresAtUtc: timeProvider.GetUtcNow().UtcDateTime.AddHours(48)
            );

            var token = service.IssueToken(claims);
            var result = service.ValidateToken(token);

            result.IsValid.Should().BeTrue($"Valid token {i} must be accepted without false negatives");
            result.Status.Should().Be(ClaimTokenValidationStatus.Valid);
            result.Claims.Should().NotBeNull();
            result.Claims!.JoinRequestId.Should().Be(claims.JoinRequestId);
            result.Claims.TenantSlug.Should().Be(claims.TenantSlug);
            result.Claims.Email.Should().Be(claims.Email);

            generatedCount++;
            validCount++;
        }

        generatedCount.Should().Be(100);
        validCount.Should().Be(100);
    }

    [Fact]
    public void StressGenerator_500AdversarialInvalidTokens_ZeroFalsePositives()
    {
        var timeProvider = new MutableTimeProvider(new DateTimeOffset(2026, 10, 13, 12, 0, 0, TimeSpan.Zero));
        var service = new ClaimTokenService(AdversarialKey, timeProvider);
        var validClaims = CreateBaselineClaims();
        var validToken = service.IssueToken(validClaims);
        var parts = validToken.Split('.');

        var rng = new Random(9999);
        var falsePositives = 0;
        const int totalTests = 500;

        for (var i = 0; i < totalTests; i++)
        {
            string candidate;
            switch (i % 5)
            {
                case 0: // Altered signature (random mutation)
                    var sigChars = parts[1].ToCharArray();
                    var sigIdx = rng.Next(0, sigChars.Length);
                    char sigNew;
                    do
                    {
                        sigNew = (char)('0' + rng.Next(0, 10));
                    } while (sigNew == sigChars[sigIdx]);
                    sigChars[sigIdx] = sigNew;
                    candidate = $"{parts[0]}.{new string(sigChars)}";
                    break;
                case 1: // Altered payload
                    var payChars = parts[0].ToCharArray();
                    var payIdx = rng.Next(0, payChars.Length);
                    char payNew;
                    do
                    {
                        payNew = (char)('a' + rng.Next(0, 26));
                    } while (payNew == payChars[payIdx]);
                    payChars[payIdx] = payNew;
                    candidate = $"{new string(payChars)}.{parts[1]}";
                    break;
                case 2: // Random garbage
                    var len = rng.Next(10, 80);
                    var buf = new byte[len];
                    rng.NextBytes(buf);
                    candidate = Convert.ToBase64String(buf);
                    break;
                case 3: // Expired token
                    var expiredClaims = CreateBaselineClaims(expiresAt: timeProvider.GetUtcNow().UtcDateTime.AddSeconds(-rng.Next(1, 1000)));
                    candidate = service.IssueToken(expiredClaims);
                    break;
                default: // Wrong signing key
                    var rogueService = new ClaimTokenService(Encoding.UTF8.GetBytes("Rogue-Key-Different-Secret-32!12"));
                    candidate = rogueService.IssueToken(validClaims);
                    break;
            }

            var result = service.ValidateToken(candidate);
            if (result.IsValid)
            {
                falsePositives++;
            }
        }

        falsePositives.Should().Be(0, "Adversarial stress generator must yield exactly zero false positives");
    }

    #endregion
}
