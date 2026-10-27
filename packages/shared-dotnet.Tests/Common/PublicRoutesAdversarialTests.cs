using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Threading.Tasks;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Documents.Security;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Shared.Tests.Common;

/// <summary>
/// Adversarial stress tests and boundary challenge harness for ClinicEz.Shared.Common.PublicRoutes
/// and DocumentSecurityService.GenerateVerificationUrl.
/// </summary>
public class PublicRoutesAdversarialTests
{
    #region 1. Concurrency & Static State Safety

    [Fact]
    public async Task Concurrency_MixedMethodLoad_ThreadSafeUnderHighContention()
    {
        const int concurrencyLevel = 100;
        const int iterationsPerWorker = 100;
        var exceptions = new ConcurrentBag<Exception>();
        var results = new ConcurrentBag<string>();

        var tasks = Enumerable.Range(0, concurrencyLevel).Select(workerId => Task.Run(() =>
        {
            try
            {
                for (var i = 0; i < iterationsPerWorker; i++)
                {
                    var code = $"W{workerId:D3}-C{i:D4}";
                    var token = $"TOKEN-{workerId}-{i}";

                    // Exercise every PublicRoutes static method
                    var join = PublicRoutes.Join("https://portal.clinicez.ph/", code);
                    join.Should().Be($"https://portal.clinicez.ph/join?code={code}");

                    var facJoin = PublicRoutes.FacilityJoin($"tenant-{workerId}", $"facility-{i}", "https://portal.clinicez.ph", code);
                    facJoin.Should().Be($"https://portal.clinicez.ph/join/tenant-{workerId}/facility-{i}?code={code}");

                    var claim = PublicRoutes.Claim(token, "https://portal.clinicez.ph");
                    claim.Should().Be($"https://portal.clinicez.ph/claim?token={token}");

                    var lookup = PublicRoutes.VerifyLookup("https://portal.clinicez.ph", $"REF-{i}", $"SEC-SHA256-4FA8B19C30E2{i:X4}");
                    lookup.Should().Be($"https://portal.clinicez.ph/verify?ref=REF-{i}&sig=4FA8B19C30E2");

                    var kind = PublicRoutes.VerifyKind("med-cert", token, "https://portal.clinicez.ph", "SEC-SHA256-ABCDEF123456");
                    kind.Should().Be($"https://portal.clinicez.ph/verify/med-cert/{token}?sig=ABCDEF123456");

                    var rx = PublicRoutes.VerifyRx(token, "https://portal.clinicez.ph");
                    rx.Should().Be($"https://portal.clinicez.ph/verify/rx/{token}");

                    var deepLink = PublicRoutes.MobileJoinDeepLink(code);
                    deepLink.Should().Be($"clinicez://join?code={code}");

                    var isValid = PublicRoutes.IsValidJoinCode(code);
                    isValid.Should().BeTrue();

                    var normalized = PublicRoutes.NormalizeJoinCode(code.ToLowerInvariant());
                    normalized.Should().Be(code);

                    results.Add(join);
                }
            }
            catch (Exception ex)
            {
                exceptions.Add(ex);
            }
        })).ToArray();

        await Task.WhenAll(tasks);

        exceptions.Should().BeEmpty("no exceptions must be thrown during concurrent static method access");
        results.Should().HaveCount(concurrencyLevel * iterationsPerWorker);
    }

    #endregion

    #region 2. Long String & ReDoS Boundary Hardening

    [Fact]
    public void LongString_10000Chars_EscapesWithoutBufferOverflowOrCrash()
    {
        var longCode = new string('A', 10000);
        var url = PublicRoutes.Join("https://portal.clinicez.ph", longCode);
        url.Should().StartWith("https://portal.clinicez.ph/join?code=");
        url.Length.Should().Be("https://portal.clinicez.ph/join?code=".Length + 10000);

        var deepLink = PublicRoutes.MobileJoinDeepLink(longCode);
        deepLink.Should().StartWith("clinicez://join?code=");
        deepLink.Length.Should().Be("clinicez://join?code=".Length + 10000);
    }

    [Fact]
    public void IsValidJoinCode_MassiveString_EvaluatesInO1SubMillisecondTime()
    {
        var massiveCode = new string('A', 100_000);

        var sw = Stopwatch.StartNew();
        var isValid = PublicRoutes.IsValidJoinCode(massiveCode);
        sw.Stop();

        isValid.Should().BeFalse();
        sw.ElapsedMilliseconds.Should().BeLessThan(50, "length guard must short-circuit without regex backtracking");
    }

    [Theory]
    [InlineData(2, false, "Below min length (3)")]
    [InlineData(3, true, "Min length unprefixed (3)")]
    [InlineData(50, true, "Max length unprefixed (50)")]
    [InlineData(51, false, "Above max length unprefixed (51)")]
    public void IsValidJoinCode_ExactBoundaryLengths_ReturnsExpected(int length, bool expected, string desc)
    {
        var code = new string('X', length);
        PublicRoutes.IsValidJoinCode(code).Should().Be(expected, desc);
    }

    [Theory]
    [InlineData(1, true, "Min suffix length (1) -> total 6")]
    [InlineData(45, true, "Max suffix length (45) -> total 50")]
    [InlineData(46, false, "Exceeds max suffix length (46) -> total 51")]
    public void IsValidJoinCode_PrefixedExactBoundaryLengths_ReturnsExpected(int suffixLength, bool expected, string desc)
    {
        var code = "B4C7-" + new string('X', suffixLength);
        PublicRoutes.IsValidJoinCode(code).Should().Be(expected, desc);
    }

    [Theory]
    [InlineData("ABC-JOIN", false, "Prefix has 3 chars (must be 4)")]
    [InlineData("ABCDE-JOIN", false, "Prefix has 5 chars (must be 4)")]
    [InlineData("-JOIN", false, "Empty prefix")]
    [InlineData("B4C7-", false, "Empty suffix")]
    [InlineData("B4C7--JOIN", false, "Double hyphen")]
    [InlineData("B4C7-A-B", false, "Multiple hyphens")]
    public void IsValidJoinCode_PrefixedMalformedStructures_ReturnsFalse(string code, bool expected, string desc)
    {
        PublicRoutes.IsValidJoinCode(code).Should().Be(expected, desc);
    }

    #endregion

    #region 3. Malformed Escape Sequences, Control Characters & Hostile Inputs

    [Fact]
    public void PathTraversal_InSlugsAndTokens_IsStrictlyUriEscaped()
    {
        var hostileSlug = "../../../etc/passwd";
        var result = PublicRoutes.FacilityJoin(hostileSlug, "facility", "https://portal.clinicez.ph");

        result.Should().Be("https://portal.clinicez.ph/join/..%2F..%2F..%2Fetc%2Fpasswd/facility");
        result.Should().NotContain("../");
    }

    [Fact]
    public void QueryAndFragmentInjection_InParameters_IsStrictlyUriEscaped()
    {
        var hostileCode = "APEX2026&role=admin#section";
        var result = PublicRoutes.Join("https://portal.clinicez.ph", hostileCode);

        result.Should().Be("https://portal.clinicez.ph/join?code=APEX2026%26role%3Dadmin%23section");
        result.Should().NotContain("&role=admin");
        result.Should().NotContain("#section");
    }

    [Fact]
    public void XssPayload_InVerifyToken_IsStrictlyUriEscaped()
    {
        var xssToken = "<script>alert('xss')</script>";
        var result = PublicRoutes.VerifyKind("med-cert", xssToken, "https://portal.clinicez.ph");

        result.Should().Be("https://portal.clinicez.ph/verify/med-cert/%3Cscript%3Ealert%28%27xss%27%29%3C%2Fscript%3E");
        result.Should().NotContain("<script>");
    }

    [Fact]
    public void ControlCharacters_InParameters_AreStrictlyUriEscaped()
    {
        var controlCode = "CODE\r\n\t\0VALUE";
        var result = PublicRoutes.Join("https://portal.clinicez.ph", controlCode);

        result.Should().Be("https://portal.clinicez.ph/join?code=CODE%0D%0A%09%00VALUE");
        result.Should().NotContain("\r");
        result.Should().NotContain("\n");
        result.Should().NotContain("\0");
    }

    [Fact]
    public void UnicodeAndEmojis_InSlugsAndTokens_AreUtf8PercentEncoded()
    {
        var unicodeToken = "Dr-José-Rizal-🩺";
        var result = PublicRoutes.VerifyKind("referral", unicodeToken, "https://portal.clinicez.ph");

        result.Should().Be("https://portal.clinicez.ph/verify/referral/Dr-Jos%C3%A9-Rizal-%F0%9F%A9%BA");
    }

    #endregion

    #region 4. Signature Trimming & Prefix Extraction

    [Theory]
    [InlineData("SEC-SHA256-4FA8B19C30E2", "4FA8B19C30E2", "Exact 12-char digest with uppercase prefix")]
    [InlineData("sec-sha256-4fa8b19c30e2", "4fa8b19c30e2", "Exact 12-char digest with lowercase prefix")]
    [InlineData("SeC-sHa256-4Fa8B19c30E2", "4Fa8B19c30E2", "Exact 12-char digest with mixed-case prefix")]
    [InlineData("SEC-SHA256-4FA8B19C30E29999", "4FA8B19C30E2", "Longer digest (16 chars) trims to exactly 12")]
    [InlineData("SEC-SHA256-4FA8", "4FA8", "Short digest (4 chars) kept intact without out-of-range exception")]
    [InlineData("SEC-SHA256-A", "A", "Single char digest kept intact")]
    [InlineData("4FA8B19C30E29999", "4FA8B19C30E29999", "Digest without prefix preserves full content")]
    [InlineData("SEC-SHA512-4FA8B19C30E2", "SEC-SHA512-4FA8B19C30E2", "Non-SHA256 prefix preserved without trimming")]
    public void VerifyKind_SignatureNormalization_ProducesExpectedSigQuery(
        string rawSig, string expectedSigInUrl, string desc)
    {
        var result = PublicRoutes.VerifyKind("med-cert", "MC-01", baseUrl: null, sig: rawSig);
        result.Should().Be($"/verify/med-cert/MC-01?sig={expectedSigInUrl}", desc);
    }

    [Fact]
    public void VerifyKind_EmptyOrBarePrefixSig_OmitsSigQueryParameter()
    {
        PublicRoutes.VerifyKind("med-cert", "MC-01", sig: null)
            .Should().Be("/verify/med-cert/MC-01");
        PublicRoutes.VerifyKind("med-cert", "MC-01", sig: "")
            .Should().Be("/verify/med-cert/MC-01");
        PublicRoutes.VerifyKind("med-cert", "MC-01", sig: "   ")
            .Should().Be("/verify/med-cert/MC-01");
        PublicRoutes.VerifyKind("med-cert", "MC-01", sig: "SEC-SHA256-")
            .Should().Be("/verify/med-cert/MC-01");
        PublicRoutes.VerifyKind("med-cert", "MC-01", sig: "sec-sha256-   ")
            .Should().Be("/verify/med-cert/MC-01");
    }

    [Fact]
    public void VerifyLookup_SignatureNormalization_MatchesVerifyKindRules()
    {
        PublicRoutes.VerifyLookup(reference: "MC-01", sig: "SEC-SHA256-4FA8B19C30E29999")
            .Should().Be("/verify?ref=MC-01&sig=4FA8B19C30E2");

        PublicRoutes.VerifyLookup(reference: "MC-01", sig: "sec-sha256-")
            .Should().Be("/verify?ref=MC-01");

        PublicRoutes.VerifyLookup(reference: null, sig: "SEC-SHA256-4FA8B19C30E2")
            .Should().Be("/verify?sig=4FA8B19C30E2");
    }

    #endregion

    #region 5. DocumentSecurityService.GenerateVerificationUrl Parity with PublicRoutes.VerifyKind

    [Theory]
    [InlineData("https://portal.clinicez.ph", "rx", "RX-20261025-0001", "SEC-SHA256-4FA8B19C30E20102")]
    [InlineData("https://portal.clinicez.ph/", "med-cert", "MC-2026-0001", "SEC-SHA256-A1B2C3D4E5F6")]
    [InlineData("http://localhost:3000", "referral", "REF-001", "sec-sha256-a1b2c3d4e5f6")]
    [InlineData("https://portal.clinicez.ph", "LAB", "LAB-999", "SEC-SHA256-0123456789AB")]
    public void DocumentSecurityService_GenerateVerificationUrl_MatchesPublicRoutesVerifyKind(
        string baseUrl, string docType, string token, string digest)
    {
        var service = new DocumentSecurityService("test-development-signing-key-minimum-32-bytes-long");

        var serviceUrl = service.GenerateVerificationUrl(baseUrl, docType, token, digest);
        var expectedUrl = PublicRoutes.VerifyKind(docType, token, baseUrl, digest);

        serviceUrl.Should().Be(expectedUrl, "DocumentSecurityService output must match PublicRoutes.VerifyKind exactly");
    }

    [Fact]
    public void DocumentSecurityService_GenerateVerificationUrl_WhenIncludePublicIsFalse_ReturnsNull()
    {
        var service = new DocumentSecurityService("test-development-signing-key-minimum-32-bytes-long");

        var url = service.GenerateVerificationUrl("https://portal.clinicez.ph", "rx", "RX-01", "SEC-SHA256-4FA8B19C30E2", includePublicVerificationUrl: false);
        url.Should().BeNull();
    }

    [Theory]
    [InlineData(null, "rx", "RX-01", "SEC-SHA256-4FA8B19C30E2")]
    [InlineData("", "rx", "RX-01", "SEC-SHA256-4FA8B19C30E2")]
    [InlineData("https://portal.clinicez.ph", null, "RX-01", "SEC-SHA256-4FA8B19C30E2")]
    [InlineData("https://portal.clinicez.ph", "rx", null, "SEC-SHA256-4FA8B19C30E2")]
    [InlineData("https://portal.clinicez.ph", "rx", "RX-01", null)]
    [InlineData("https://portal.clinicez.ph", "rx", "RX-01", "SEC-SHA256-SHORT")] // Clean digest length < 12
    public void DocumentSecurityService_GenerateVerificationUrl_InvalidInputs_ReturnsEmptyOrNull(
        string? baseUrl, string? docType, string? token, string? digest)
    {
        var service = new DocumentSecurityService("test-development-signing-key-minimum-32-bytes-long");

        var url4Arg = service.GenerateVerificationUrl(baseUrl!, docType!, token!, digest!);
        url4Arg.Should().BeEmpty();

        var url5Arg = service.GenerateVerificationUrl(baseUrl!, docType!, token!, digest!, includePublicVerificationUrl: true);
        url5Arg.Should().BeNull();
    }

    #endregion

    #region 6. BaseUrl Edge Cases

    [Theory]
    [InlineData(null, "/join")]
    [InlineData("", "/join")]
    [InlineData("   ", "/join")]
    [InlineData("https://portal.clinicez.ph", "https://portal.clinicez.ph/join")]
    [InlineData("https://portal.clinicez.ph/", "https://portal.clinicez.ph/join")]
    [InlineData("https://portal.clinicez.ph///", "https://portal.clinicez.ph/join")]
    [InlineData("https://portal.clinicez.ph/portal", "https://portal.clinicez.ph/portal/join")]
    [InlineData("https://portal.clinicez.ph/portal/", "https://portal.clinicez.ph/portal/join")]
    [InlineData("  https://portal.clinicez.ph/  ", "https://portal.clinicez.ph/join")]
    public void BaseUrl_EdgeCases_NormalizedConsistently(string? baseUrl, string expected)
    {
        PublicRoutes.Join(baseUrl).Should().Be(expected);
    }

    #endregion
}
