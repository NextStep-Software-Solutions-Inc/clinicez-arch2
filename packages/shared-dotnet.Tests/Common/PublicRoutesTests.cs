using System;
using ClinicEz.Shared.Common;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Shared.Tests.Common;

public class PublicRoutesTests
{
    #region 1. Canonical 27-Row Matrix Parity (TC-01 - TC-27)

    [Fact]
    public void TC01_Join_Bare_ReturnsRelativeJoin()
    {
        PublicRoutes.Join().Should().Be("/join");
        PublicRoutes.Join(baseUrl: null, code: null).Should().Be("/join");
    }

    [Fact]
    public void TC02_Join_WithBaseUrl_ReturnsAbsoluteJoin()
    {
        PublicRoutes.Join(baseUrl: "https://portal.clinicez.ph")
            .Should().Be("https://portal.clinicez.ph/join");
    }

    [Fact]
    public void TC03_Join_WithCode_ReturnsJoinWithQuery()
    {
        PublicRoutes.Join(code: "APEX2026")
            .Should().Be("/join?code=APEX2026");
    }

    [Fact]
    public void TC04_Join_WithBaseUrlAndHyphenatedCode_TrimsTrailingSlash()
    {
        PublicRoutes.Join(baseUrl: "https://portal.clinicez.ph/", code: "B4C7-JOINNOW")
            .Should().Be("https://portal.clinicez.ph/join?code=B4C7-JOINNOW");
    }

    [Fact]
    public void TC05_Join_WithSpaceInCode_UrlEncodesQuery()
    {
        PublicRoutes.Join(baseUrl: "http://localhost:3000", code: "JOIN ME")
            .Should().Be("http://localhost:3000/join?code=JOIN%20ME");
    }

    [Fact]
    public void TC06_FacilityJoin_Bare_ReturnsRelativeFacilityJoin()
    {
        PublicRoutes.FacilityJoin("ustp", "cdo-campus")
            .Should().Be("/join/ustp/cdo-campus");
    }

    [Fact]
    public void TC07_FacilityJoin_WithBaseUrlAndCode_ReturnsAbsoluteWithQuery()
    {
        PublicRoutes.FacilityJoin("ustp", "cdo-campus", baseUrl: "https://portal.clinicez.ph", code: "USTP2026")
            .Should().Be("https://portal.clinicez.ph/join/ustp/cdo-campus?code=USTP2026");
    }

    [Fact]
    public void TC08_FacilityJoin_WithMultipleTrailingSlashes_TrimsCleanly()
    {
        PublicRoutes.FacilityJoin("st-jude", "main", baseUrl: "https://portal.clinicez.ph///", code: "B4C7-JOINNOW")
            .Should().Be("https://portal.clinicez.ph/join/st-jude/main?code=B4C7-JOINNOW");
    }

    [Fact]
    public void TC09_Claim_BareToken_ReturnsRelativeClaim()
    {
        PublicRoutes.Claim("token-12345")
            .Should().Be("/claim?token=token-12345");
    }

    [Fact]
    public void TC10_Claim_WithBaseUrlAndJwtToken_ReturnsAbsoluteClaim()
    {
        PublicRoutes.Claim("eyJhbGciOiJIUzI1NiJ9.test", baseUrl: "https://portal.clinicez.ph")
            .Should().Be("https://portal.clinicez.ph/claim?token=eyJhbGciOiJIUzI1NiJ9.test");
    }

    [Fact]
    public void TC11_Claim_WithSpecialCharacters_UrlEncodesToken()
    {
        PublicRoutes.Claim("TOKEN+SPECIAL/KEY=")
            .Should().Be("/claim?token=TOKEN%2BSPECIAL%2FKEY%3D");
    }

    [Fact]
    public void TC12_VerifyLookup_Bare_ReturnsRelativeVerify()
    {
        PublicRoutes.VerifyLookup().Should().Be("/verify");
        PublicRoutes.VerifyLookup(baseUrl: null, reference: null, sig: null).Should().Be("/verify");
    }

    [Fact]
    public void TC13_VerifyLookup_WithRef_ReturnsVerifyWithQuery()
    {
        PublicRoutes.VerifyLookup(reference: "MC-2026-0001")
            .Should().Be("/verify?ref=MC-2026-0001");
    }

    [Fact]
    public void TC14_VerifyLookup_WithBaseUrlRefAndSig_ReturnsAbsoluteVerify()
    {
        PublicRoutes.VerifyLookup(baseUrl: "https://portal.clinicez.ph", reference: "MC-2026-0001", sig: "4FA8B19C30E2")
            .Should().Be("https://portal.clinicez.ph/verify?ref=MC-2026-0001&sig=4FA8B19C30E2");
    }

    [Fact]
    public void TC15_VerifyLookup_WithPrefixedRef_DoesNotStripPrefixFromRef()
    {
        PublicRoutes.VerifyLookup(reference: "SEC-SHA256-4FA8B19C30E2")
            .Should().Be("/verify?ref=SEC-SHA256-4FA8B19C30E2");
    }

    [Fact]
    public void TC16_VerifyKind_Bare_ReturnsRelativeVerifyKind()
    {
        PublicRoutes.VerifyKind("med-cert", "MC-2026-0001")
            .Should().Be("/verify/med-cert/MC-2026-0001");
    }

    [Fact]
    public void TC17_VerifyKind_WithBaseUrlAndSig_ReturnsAbsoluteVerifyKind()
    {
        PublicRoutes.VerifyKind("med-cert", "MC-2026-0001", baseUrl: "https://portal.clinicez.ph", sig: "4FA8B19C30E2")
            .Should().Be("https://portal.clinicez.ph/verify/med-cert/MC-2026-0001?sig=4FA8B19C30E2");
    }

    [Fact]
    public void TC18_VerifyKind_WithPrefixedSig_StripsPrefixFromSig()
    {
        PublicRoutes.VerifyKind("referral", "REF-001", baseUrl: "https://portal.clinicez.ph", sig: "SEC-SHA256-4FA8B19C30E2")
            .Should().Be("https://portal.clinicez.ph/verify/referral/REF-001?sig=4FA8B19C30E2");
    }

    [Fact]
    public void TC19_VerifyKind_WithKindRx_ReturnsAbsoluteRxRoute()
    {
        PublicRoutes.VerifyKind("rx", "RX-20261025-0001", baseUrl: "https://portal.clinicez.ph")
            .Should().Be("https://portal.clinicez.ph/verify/rx/RX-20261025-0001");
    }

    [Fact]
    public void TC20_VerifyKind_WithSpacesInToken_UrlEncodesToken()
    {
        PublicRoutes.VerifyKind("med-cert", "token with spaces", baseUrl: "https://portal.clinicez.ph")
            .Should().Be("https://portal.clinicez.ph/verify/med-cert/token%20with%20spaces");
    }

    [Fact]
    public void TC21_VerifyKind_WithSlashesInToken_UrlEncodesToken()
    {
        PublicRoutes.VerifyKind("lab", "ORD/2026/01", baseUrl: "https://portal.clinicez.ph")
            .Should().Be("https://portal.clinicez.ph/verify/lab/ORD%2F2026%2F01");
    }

    [Fact]
    public void TC22_VerifyRx_Bare_ReturnsRelativeVerifyRx()
    {
        PublicRoutes.VerifyRx("test-rx-token")
            .Should().Be("/verify/rx/test-rx-token");
    }

    [Fact]
    public void TC23_VerifyRx_WithBaseUrl_ReturnsAbsoluteVerifyRx()
    {
        PublicRoutes.VerifyRx("RX-SECRET-99", baseUrl: "https://portal.clinicez.ph")
            .Should().Be("https://portal.clinicez.ph/verify/rx/RX-SECRET-99");
    }

    [Fact]
    public void TC24_VerifyRx_WithSpecialCharacters_UrlEncodesToken()
    {
        PublicRoutes.VerifyRx("rx token/123")
            .Should().Be("/verify/rx/rx%20token%2F123");
    }

    [Fact]
    public void TC25_MobileJoinDeepLink_WithAlphanumericCode_ReturnsDeepLink()
    {
        PublicRoutes.MobileJoinDeepLink("APEX2026")
            .Should().Be("clinicez://join?code=APEX2026");
    }

    [Fact]
    public void TC26_MobileJoinDeepLink_WithHyphenatedCode_ReturnsDeepLink()
    {
        PublicRoutes.MobileJoinDeepLink("B4C7-JOINNOW")
            .Should().Be("clinicez://join?code=B4C7-JOINNOW");
    }

    [Fact]
    public void TC27_MobileJoinDeepLink_WithSpaceInCode_UrlEncodesQuery()
    {
        PublicRoutes.MobileJoinDeepLink("JOIN ME")
            .Should().Be("clinicez://join?code=JOIN%20ME");
    }

    [Fact]
    public void MobileJoinDeepLink_WhenCodeOmitted_ReturnsBareDeepLink()
    {
        PublicRoutes.MobileJoinDeepLink().Should().Be("clinicez://join");
        PublicRoutes.MobileJoinDeepLink(string.Empty).Should().Be("clinicez://join");
        PublicRoutes.MobileJoinDeepLink("   ").Should().Be("clinicez://join");
        PublicRoutes.MobileJoinDeepLink(null).Should().Be("clinicez://join");
    }

    #endregion

    #region 2. Join Code Validation 20-Row Matrix (V-01 - V-20)

    [Theory]
    [InlineData("APEX2026", true, "APEX2026")]
    [InlineData("E2FW28KT", true, "E2FW28KT")]
    [InlineData("VIP888", true, "VIP888")]
    [InlineData("CDO202", true, "CDO202")]
    [InlineData("STJUDE2026", true, "STJUDE2026")]
    [InlineData("B4C7-JOINNOW", true, "B4C7-JOINNOW")]
    [InlineData("A1B2-C3D4E5F6", true, "A1B2-C3D4E5F6")]
    [InlineData("b4c7-joinnow", true, "B4C7-JOINNOW")]
    [InlineData("apex2026", true, "APEX2026")]
    [InlineData("", false, "")]
    [InlineData("   ", false, "")]
    [InlineData("AB", false, "AB")]
    [InlineData("A-B", false, "A-B")]
    [InlineData("ABCDE-JOIN", false, "ABCDE-JOIN")]
    [InlineData("AB-JOIN", false, "AB-JOIN")]
    [InlineData("B4C7--JOIN", false, "B4C7--JOIN")]
    [InlineData("-JOIN", false, "-JOIN")]
    [InlineData("JOIN-", false, "JOIN-")]
    public void ValidateJoinCode_Matrix_ReturnsExpectedValidityAndNormalization(
        string input, bool expectedValid, string expectedNormalized)
    {
        PublicRoutes.IsValidJoinCode(input).Should().Be(expectedValid);
        PublicRoutes.NormalizeJoinCode(input).Should().Be(expectedNormalized);
    }

    [Fact]
    public void ValidateJoinCode_Exceeds50Chars_ReturnsFalse()
    {
        var input51 = new string('A', 51);
        PublicRoutes.IsValidJoinCode(input51).Should().BeFalse();
        PublicRoutes.NormalizeJoinCode(input51).Should().Be(input51);
    }

    [Fact]
    public void ValidateJoinCode_PrefixedExceeds50CharsTotal_ReturnsFalse()
    {
        var input52 = "B4C7-" + new string('A', 47);
        PublicRoutes.IsValidJoinCode(input52).Should().BeFalse();
        PublicRoutes.NormalizeJoinCode(input52).Should().Be(input52);
    }

    [Theory]
    [InlineData("CODE!@#")]
    [InlineData("JOIN.NOW")]
    [InlineData("JOIN_NOW")]
    [InlineData("CODE$")]
    public void ValidateJoinCode_WithForbiddenCharacters_ReturnsFalse(string input)
    {
        PublicRoutes.IsValidJoinCode(input).Should().BeFalse();
    }

    [Fact]
    public void ValidateJoinCode_Null_ReturnsFalseAndEmptyString()
    {
        PublicRoutes.IsValidJoinCode(null).Should().BeFalse();
        PublicRoutes.NormalizeJoinCode(null).Should().Be(string.Empty);
    }

    #endregion

    #region 3. Defensive Parameter Guards

    [Theory]
    [InlineData(null, "facility")]
    [InlineData("", "facility")]
    [InlineData("   ", "facility")]
    [InlineData("tenant", null)]
    [InlineData("tenant", "")]
    [InlineData("tenant", "   ")]
    public void FacilityJoin_WithEmptySlugs_ThrowsArgumentException(string? tenant, string? facility)
    {
        Action act = () => PublicRoutes.FacilityJoin(tenant!, facility!);
        act.Should().Throw<ArgumentException>();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Claim_WithEmptyToken_ThrowsArgumentException(string? token)
    {
        Action act = () => PublicRoutes.Claim(token!);
        act.Should().Throw<ArgumentException>();
    }

    [Theory]
    [InlineData(null, "token")]
    [InlineData("", "token")]
    [InlineData("   ", "token")]
    [InlineData("kind", null)]
    [InlineData("kind", "")]
    [InlineData("kind", "   ")]
    public void VerifyKind_WithEmptyKindOrToken_ThrowsArgumentException(string? kind, string? token)
    {
        Action act = () => PublicRoutes.VerifyKind(kind!, token!);
        act.Should().Throw<ArgumentException>();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void VerifyRx_WithEmptyToken_ThrowsArgumentException(string? token)
    {
        Action act = () => PublicRoutes.VerifyRx(token!);
        act.Should().Throw<ArgumentException>();
    }

    #endregion
}
