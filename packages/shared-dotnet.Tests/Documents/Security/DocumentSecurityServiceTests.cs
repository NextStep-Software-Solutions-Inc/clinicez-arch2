using System;
using System.Security.Cryptography;
using ClinicEz.Shared.Documents.Security;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Shared.Tests.Documents.Security;

public class DocumentSecurityServiceTests
{
    private readonly DocumentSecurityService _service;

    public DocumentSecurityServiceTests()
    {
        // 32-byte key for HMAC-SHA256
        var key = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        _service = new DocumentSecurityService(key);
    }

    #region 1. VerifyShortSignature Positive Cases

    [Fact]
    public void VerifyShortSignature_WithStandardPrefixedDigest_ReturnsTrue()
    {
        var storedDigest = "SEC-SHA256-4FA8B19C30E291F0";
        var candidateSig = "4FA8B19C30E2";

        DocumentSecurityService.VerifyShortSignature(storedDigest, candidateSig).Should().BeTrue();
        ((IDocumentSecurityService)_service).VerifyShortSignature(storedDigest, candidateSig).Should().BeTrue();
    }

    [Fact]
    public void VerifyShortSignature_WithoutPrefix_ReturnsTrue()
    {
        var storedDigest = "4FA8B19C30E291F0";
        var candidateSig = "4FA8B19C30E2";

        DocumentSecurityService.VerifyShortSignature(storedDigest, candidateSig).Should().BeTrue();
    }

    [Fact]
    public void VerifyShortSignature_WithCandidateContainingPrefix_ReturnsTrue()
    {
        var storedDigest = "SEC-SHA256-4FA8B19C30E291F0";
        var candidateSig = "SEC-SHA256-4FA8B19C30E2";

        DocumentSecurityService.VerifyShortSignature(storedDigest, candidateSig).Should().BeTrue();
    }

    [Fact]
    public void VerifyShortSignature_CaseInsensitive_ReturnsTrue()
    {
        var storedUpper = "SEC-SHA256-4FA8B19C30E291F0";
        var storedLower = "sec-sha256-4fa8b19c30e291f0";
        var candidateUpper = "4FA8B19C30E2";
        var candidateLower = "4fa8b19c30e2";
        var candidateMixed = "4fA8b19C30e2";

        DocumentSecurityService.VerifyShortSignature(storedUpper, candidateLower).Should().BeTrue();
        DocumentSecurityService.VerifyShortSignature(storedLower, candidateUpper).Should().BeTrue();
        DocumentSecurityService.VerifyShortSignature(storedUpper, candidateMixed).Should().BeTrue();
        DocumentSecurityService.VerifyShortSignature(storedLower, candidateMixed).Should().BeTrue();
    }

    [Fact]
    public void VerifyShortSignature_WithWhitespace_Trimmed_ReturnsTrue()
    {
        var storedDigest = "   SEC-SHA256-4FA8B19C30E291F0   \t";
        var candidateSig = "   4FA8B19C30E2  \n";

        DocumentSecurityService.VerifyShortSignature(storedDigest, candidateSig).Should().BeTrue();
    }

    #endregion

    #region 2. VerifyShortSignature Negative Cases & Boundary Checks

    [Theory]
    [InlineData(null, "4FA8B19C30E2")]
    [InlineData("", "4FA8B19C30E2")]
    [InlineData("   ", "4FA8B19C30E2")]
    [InlineData("SEC-SHA256-4FA8B19C30E291F0", null)]
    [InlineData("SEC-SHA256-4FA8B19C30E291F0", "")]
    [InlineData("SEC-SHA256-4FA8B19C30E291F0", "   ")]
    [InlineData(null, null)]
    public void VerifyShortSignature_NullOrWhitespace_ReturnsFalse(string? stored, string? candidate)
    {
        DocumentSecurityService.VerifyShortSignature(stored, candidate).Should().BeFalse();
        ((IDocumentSecurityService)_service).VerifyShortSignature(stored, candidate).Should().BeFalse();
    }

    [Theory]
    [InlineData("0FA8B19C30E2")] // First char mismatch
    [InlineData("4FA8B09C30E2")] // Middle char mismatch
    [InlineData("4FA8B19C30E0")] // Last char mismatch
    [InlineData("DEADBEEF1234")] // Completely wrong
    public void VerifyShortSignature_TamperedSignature_ReturnsFalse(string badCandidate)
    {
        var storedDigest = "SEC-SHA256-4FA8B19C30E291F0";
        DocumentSecurityService.VerifyShortSignature(storedDigest, badCandidate).Should().BeFalse();
    }

    [Theory]
    [InlineData("4FA8B19C30E")]       // 11 chars (too short)
    [InlineData("4FA8B19C30E29")]      // 13 chars (too long)
    [InlineData("4FA8B19C30E291F0")]  // 16 chars (full digest passed as candidate)
    public void VerifyShortSignature_InvalidCandidateLength_ReturnsFalse(string invalidCandidate)
    {
        var storedDigest = "SEC-SHA256-4FA8B19C30E291F0";
        DocumentSecurityService.VerifyShortSignature(storedDigest, invalidCandidate).Should().BeFalse();
    }

    [Theory]
    [InlineData("SEC-SHA256-SHORT")] // only 5 chars after prefix
    [InlineData("SEC-SHA256-")]      // empty after prefix
    [InlineData("SHORT")]            // 5 chars
    public void VerifyShortSignature_StoredDigestTooShort_ReturnsFalse(string shortStored)
    {
        DocumentSecurityService.VerifyShortSignature(shortStored, "4FA8B19C30E2").Should().BeFalse();
    }

    #endregion

    #region 3. GenerateVerificationUrl & includePublicVerificationUrl

    [Fact]
    public void GenerateVerificationUrl_Default_ProducesExpectedUrl()
    {
        var url = _service.GenerateVerificationUrl(
            "https://portal.clinicez.ph",
            "med-cert",
            "MC-2026-0001",
            "SEC-SHA256-4FA8B19C30E291F0");

        url.Should().Be("https://portal.clinicez.ph/verify/med-cert/MC-2026-0001?sig=4FA8B19C30E2");
    }

    [Fact]
    public void GenerateVerificationUrl_WithIncludePublicVerificationUrlTrue_ReturnsValidUrl()
    {
        var url = _service.GenerateVerificationUrl(
            "https://portal.clinicez.ph",
            "referral",
            "REF-001",
            "SEC-SHA256-4FA8B19C30E291F0",
            includePublicVerificationUrl: true);

        url.Should().Be("https://portal.clinicez.ph/verify/referral/REF-001?sig=4FA8B19C30E2");
    }

    [Theory]
    [InlineData("daily-eod")]
    [InlineData("doh-morbidity")]
    [InlineData("bir-tax-audit")]
    [InlineData("doctor-shares")]
    [InlineData("clinic-analytics")]
    public void GenerateVerificationUrl_WithIncludePublicVerificationUrlFalse_ReturnsNullForInternalReports(string docType)
    {
        var url = _service.GenerateVerificationUrl(
            "https://portal.clinicez.ph",
            docType,
            "DOC-12345",
            "SEC-SHA256-4FA8B19C30E291F0",
            includePublicVerificationUrl: false);

        url.Should().BeNull();
    }

    [Theory]
    [InlineData("daily-eod", true)]
    [InlineData("doh-morbidity", true)]
    [InlineData("bir-tax-audit", true)]
    [InlineData("doctor-shares", true)]
    [InlineData("clinic-analytics", true)]
    [InlineData("DAILY-EOD", true)]
    [InlineData("med-cert", false)]
    [InlineData("referral", false)]
    [InlineData("rx", false)]
    [InlineData("lab-report", false)]
    [InlineData("receipt", false)]
    [InlineData(null, false)]
    [InlineData("", false)]
    public void IsInternalReportType_CorrectlyIdentifiesInternalReports(string? docType, bool expected)
    {
        DocumentSecurityService.IsInternalReportType(docType).Should().Be(expected);
    }

    [Fact]
    public void GenerateVerificationUrl_HandlesMalformedOrShortDigest_ReturnsNullOrEmpty()
    {
        var url5 = _service.GenerateVerificationUrl("https://portal.clinicez.ph", "rx", "RX-01", "SHORT", includePublicVerificationUrl: true);
        url5.Should().BeNull();

        var url4 = _service.GenerateVerificationUrl("https://portal.clinicez.ph", "rx", "RX-01", "SHORT");
        url4.Should().BeEmpty();
    }

    #endregion

    #region 4. VerifyDigest Constant-Time Verification

    [Fact]
    public void VerifyDigest_ValidDigest_ReturnsTrue()
    {
        var tenantId = "tenant-prod-1";
        var docType = "MED-CERT";
        var docNumber = "MC-2026-9999";
        var patientId = Guid.NewGuid();
        var doctorPrc = "PRC-1234567";
        var issuedAt = DateTime.UtcNow;

        var digest = _service.ComputeDocumentDigest(tenantId, docType, docNumber, patientId, doctorPrc, issuedAt);
        _service.VerifyDigest(tenantId, docType, docNumber, patientId, doctorPrc, issuedAt, digest).Should().BeTrue();
    }

    [Fact]
    public void VerifyDigest_TamperedDigest_ReturnsFalse()
    {
        var tenantId = "tenant-prod-1";
        var docType = "MED-CERT";
        var docNumber = "MC-2026-9999";
        var patientId = Guid.NewGuid();
        var doctorPrc = "PRC-1234567";
        var issuedAt = DateTime.UtcNow;

        var digest = _service.ComputeDocumentDigest(tenantId, docType, docNumber, patientId, doctorPrc, issuedAt);
        var tampered = digest[..^1] + (digest[^1] == '0' ? '1' : '0');

        _service.VerifyDigest(tenantId, docType, docNumber, patientId, doctorPrc, issuedAt, tampered).Should().BeFalse();
    }

    [Fact]
    public void VerifyDigest_NullOrEmptyProvidedDigest_ReturnsFalse()
    {
        var tenantId = "tenant-prod-1";
        var docType = "MED-CERT";
        var docNumber = "MC-2026-9999";
        var patientId = Guid.NewGuid();
        var doctorPrc = "PRC-1234567";
        var issuedAt = DateTime.UtcNow;

        _service.VerifyDigest(tenantId, docType, docNumber, patientId, doctorPrc, issuedAt, null!).Should().BeFalse();
        _service.VerifyDigest(tenantId, docType, docNumber, patientId, doctorPrc, issuedAt, "").Should().BeFalse();
    }

    #endregion

    #region 5. End-to-End Compute -> Generate -> Verify Short Signature Flow

    [Fact]
    public void EndToEnd_Compute_GenerateUrl_VerifyShortSignature_Succeeds()
    {
        var tenantId = "tenant-prod-1";
        var docType = "MED-CERT";
        var docNumber = "MC-2026-9999";
        var patientId = Guid.NewGuid();
        var doctorPrc = "PRC-1234567";
        var issuedAt = DateTime.UtcNow;

        var digest = _service.ComputeDocumentDigest(tenantId, docType, docNumber, patientId, doctorPrc, issuedAt);
        digest.Should().StartWith("SEC-SHA256-");

        var verifyUrl = _service.GenerateVerificationUrl("https://portal.clinicez.ph", "med-cert", docNumber, digest);
        verifyUrl.Should().NotBeNull();

        // Extract ?sig= parameter
        var uri = new Uri(verifyUrl!);
        var query = System.Web.HttpUtility.ParseQueryString(uri.Query);
        var sig = query["sig"];
        sig.Should().NotBeNullOrWhiteSpace();
        sig!.Length.Should().Be(12);

        // Verify short signature against stored digest
        var isValid = DocumentSecurityService.VerifyShortSignature(digest, sig);
        isValid.Should().BeTrue();

        // Tampering any character in sig fails
        var tampered = sig.Substring(0, 11) + (sig[^1] == '0' ? '1' : '0');
        DocumentSecurityService.VerifyShortSignature(digest, tampered).Should().BeFalse();
    }

    #endregion
}
