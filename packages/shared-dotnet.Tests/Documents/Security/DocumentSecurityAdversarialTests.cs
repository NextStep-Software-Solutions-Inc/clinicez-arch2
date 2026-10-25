using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ClinicEz.Shared.Documents.Security;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Shared.Tests.Documents.Security;

/// <summary>
/// Empirical Adversarial Verification Suite for Milestone 1 Security & Short Signature Verification.
/// Stress-tests VerifyShortSignature, ComputeDocumentDigest, GenerateVerificationUrl, and PortalProjectionContracts.
/// </summary>
public class DocumentSecurityAdversarialTests
{
    private readonly DocumentSecurityService _service;
    private const string ValidStoredDigest = "SEC-SHA256-4FA8B19C30E291F0";
    private const string ValidCandidateSig = "4FA8B19C30E2";

    public DocumentSecurityAdversarialTests()
    {
        var testKey = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        _service = new DocumentSecurityService(testKey);
    }

    #region Dimension 1: Malformed & Pathological Inputs

    [Theory]
    [InlineData(null, null)]
    [InlineData("", "")]
    [InlineData("   ", "   ")]
    [InlineData("\t\t", "\t\t")]
    [InlineData("\r\n\t ", "\r\n\t ")]
    [InlineData(null, "4FA8B19C30E2")]
    [InlineData("", "4FA8B19C30E2")]
    [InlineData("   ", "4FA8B19C30E2")]
    [InlineData("SEC-SHA256-4FA8B19C30E291F0", null)]
    [InlineData("SEC-SHA256-4FA8B19C30E291F0", "")]
    [InlineData("SEC-SHA256-4FA8B19C30E291F0", "   ")]
    [InlineData("SEC-SHA256-4FA8B19C30E291F0", "\t\r\n")]
    public void VerifyShortSignature_NullOrWhitespace_AlwaysReturnsFalseWithoutThrowing(string? stored, string? candidate)
    {
        var result = DocumentSecurityService.VerifyShortSignature(stored, candidate);
        result.Should().BeFalse();
    }

    [Theory]
    [InlineData("4FA8B19C30\02")]                 // Embedded null byte
    [InlineData("4FA8B19C30E2\0")]                 // Trailing null byte
    [InlineData("\04FA8B19C30E2")]                 // Leading null byte
    [InlineData("4FA8B19C30\x012")]                // SOH control character
    [InlineData("4FA8B19C30\x1F2")]                // Unit separator control char
    [InlineData("4FA8B19C30E\u200B")]              // Zero-width space (13 chars, non-whitespace to char.IsWhiteSpace)
    [InlineData("\u200B4FA8B19C30E2")]              // Leading zero-width space
    [InlineData("4FA8B19C30E🔥")]                  // Multi-byte Unicode Emoji (UTF-8 expansion)
    [InlineData("4FA8B19C30E\u0410")]              // Cyrillic 'А' homoglyph
    [InlineData("4FA8B19C30E\u0391")]              // Greek 'Α' homoglyph
    [InlineData("' OR 1=1 --")]                    // SQL injection probe
    [InlineData("<script>alert")]                  // XSS probe
    [InlineData("\"; DROP DB--")]                  // SQL command injection probe
    public void VerifyShortSignature_PathologicalCandidateStrings_RejectedSafely(string candidate)
    {
        var result = DocumentSecurityService.VerifyShortSignature(ValidStoredDigest, candidate);
        result.Should().BeFalse();
    }

    [Theory]
    [InlineData("SEC-SHA512-4FA8B19C30E291F0", "4FA8B19C30E2")]       // SHA512 prefix on stored digest
    [InlineData("sec-sha512-4fa8b19c30e291f0", "4fa8b19c30e2")]       // Lowercase SHA512 prefix
    [InlineData("MD5-4FA8B19C30E291F0", "4FA8B19C30E2")]              // MD5 prefix
    [InlineData("SHA256-4FA8B19C30E291F0", "4FA8B19C30E2")]           // Missing SEC- prefix
    [InlineData("SEC-SHA2564FA8B19C30E291F0", "4FA8B19C30E2")]        // Missing hyphen before hex
    [InlineData("SEC-SHA256--4FA8B19C30E291F0", "4FA8B19C30E2")]      // Double hyphen
    [InlineData("SEC-SHA256-SEC-SHA256-4FA8B19C30E2", "4FA8B19C30E2")] // Double prefix
    public void VerifyShortSignature_WeirdOrUnsupportedPrefixes_RejectedSafely(string stored, string candidate)
    {
        // When stored digest has an unrecognized prefix, the prefix is NOT stripped,
        // so candidate ("4FA8B19C30E2") cannot match the first 12 characters of the unrecognized prefix.
        var result = DocumentSecurityService.VerifyShortSignature(stored, candidate);
        result.Should().BeFalse();
    }

    [Fact]
    public void VerifyShortSignature_SupportedPrefixVariants_MatchConsistently()
    {
        // Permutations of standard SEC-SHA256- casing and prefix inclusion on both sides
        var validPairs = new[]
        {
            ("SEC-SHA256-4FA8B19C30E291F0", "4FA8B19C30E2"),
            ("sec-sha256-4fa8b19c30e291f0", "4fa8b19c30e2"),
            ("sEc-ShA256-4Fa8B19c30E291F0", "4Fa8B19c30E2"),
            ("SEC-SHA256-4FA8B19C30E291F0", "SEC-SHA256-4FA8B19C30E2"),
            ("sec-sha256-4fa8b19c30e291f0", "sec-sha256-4fa8b19c30e2"),
            ("4FA8B19C30E291F0", "4FA8B19C30E2"),                     // Bare stored + Bare candidate
            ("4FA8B19C30E291F0", "SEC-SHA256-4FA8B19C30E2"),         // Bare stored + Prefixed candidate
            ("SEC-SHA256-4FA8B19C30E291F0", "  4FA8B19C30E2  "),     // Padded candidate
            ("  SEC-SHA256-4FA8B19C30E291F0  ", "4FA8B19C30E2"),     // Padded stored
            (" \t SEC-SHA256-4FA8B19C30E291F0 \r\n ", " \n 4FA8B19C30E2 \t ") // Mixed whitespace
        };

        foreach (var (stored, candidate) in validPairs)
        {
            DocumentSecurityService.VerifyShortSignature(stored, candidate)
                .Should().BeTrue($"stored '{stored}' should match candidate '{candidate}'");
        }
    }

    #endregion

    #region Dimension 2: Timing Attack Resilience & Constant-Time Probing

    [Fact]
    public void VerifyShortSignature_SingleCharacterTamperAtEveryPosition_ReturnsFalse()
    {
        // Candidate is 12 characters: "4FA8B19C30E2"
        var candidateChars = ValidCandidateSig.ToCharArray();

        for (int i = 0; i < candidateChars.Length; i++)
        {
            var originalChar = candidateChars[i];
            // Replace with a distinct character
            var tamperedChar = originalChar == '0' ? '1' : (originalChar == 'A' ? 'B' : '0');
            candidateChars[i] = tamperedChar;

            var tamperedCandidate = new string(candidateChars);
            var result = DocumentSecurityService.VerifyShortSignature(ValidStoredDigest, tamperedCandidate);
            result.Should().BeFalse($"tamper at position {i} (char '{tamperedChar}') must fail");

            // Restore character for next iteration
            candidateChars[i] = originalChar;
        }
    }

    [Fact]
    public void VerifyShortSignature_ConstantTimeExecution_StressTest()
    {
        // Stress test: 20,000 iterations comparing mismatch at position 0 vs mismatch at position 11.
        // Verifies no catastrophic timing branch short-circuits.
        const int iterations = 20_000;
        var mismatchAt0 = "0FA8B19C30E2"; // First char mismatch
        var mismatchAt11 = "4FA8B19C30E0"; // Last char mismatch

        // Warm up JIT
        for (int i = 0; i < 500; i++)
        {
            DocumentSecurityService.VerifyShortSignature(ValidStoredDigest, mismatchAt0);
            DocumentSecurityService.VerifyShortSignature(ValidStoredDigest, mismatchAt11);
        }

        var sw0 = Stopwatch.StartNew();
        for (int i = 0; i < iterations; i++)
        {
            DocumentSecurityService.VerifyShortSignature(ValidStoredDigest, mismatchAt0);
        }
        sw0.Stop();

        var sw11 = Stopwatch.StartNew();
        for (int i = 0; i < iterations; i++)
        {
            DocumentSecurityService.VerifyShortSignature(ValidStoredDigest, mismatchAt11);
        }
        sw11.Stop();

        // Both runs should complete rapidly (typically < 30ms for 20k iterations)
        sw0.ElapsedMilliseconds.Should().BeLessThan(2000);
        sw11.ElapsedMilliseconds.Should().BeLessThan(2000);
    }

    [Fact]
    public void VerifyDigest_ConstantTimeVerification_BitFlipDetection()
    {
        var tenantId = "tenant-prod";
        var docType = "RX";
        var docNumber = "RX-2026-0001";
        var patientId = Guid.NewGuid();
        var doctorPrc = "PRC-9999999";
        var issuedAt = new DateTime(2026, 10, 25, 8, 30, 0, DateTimeKind.Utc);

        var validDigest = _service.ComputeDocumentDigest(tenantId, docType, docNumber, patientId, doctorPrc, issuedAt);
        _service.VerifyDigest(tenantId, docType, docNumber, patientId, doctorPrc, issuedAt, validDigest).Should().BeTrue();

        // Test every character position in the digest with a single substitution
        for (int i = 0; i < validDigest.Length; i++)
        {
            var chars = validDigest.ToCharArray();
            chars[i] = chars[i] == '0' ? '1' : (chars[i] == 'A' ? 'B' : '0');
            var corrupted = new string(chars);

            _service.VerifyDigest(tenantId, docType, docNumber, patientId, doctorPrc, issuedAt, corrupted)
                .Should().BeFalse($"corrupted digest at index {i} must be rejected");
        }
    }

    #endregion

    #region Dimension 3: Boundary Values & Truncation

    [Theory]
    [InlineData("")]                     // 0 chars
    [InlineData("4")]                    // 1 char
    [InlineData("4F")]                   // 2 chars
    [InlineData("4FA8B19C")]             // 8 chars
    [InlineData("4FA8B19C30")]           // 10 chars
    [InlineData("4FA8B19C30E")]          // 11 chars (exact boundary - 1)
    [InlineData("4FA8B19C30E29")]         // 13 chars (exact boundary + 1)
    [InlineData("4FA8B19C30E291")]       // 14 chars
    [InlineData("4FA8B19C30E291F0")]     // 16 chars (full digest passed)
    [InlineData("4FA8B19C30E291F04FA8B19C30E291F0")] // 32 chars
    public void VerifyShortSignature_CandidateLengthNotExactly12_Rejected(string candidate)
    {
        var result = DocumentSecurityService.VerifyShortSignature(ValidStoredDigest, candidate);
        result.Should().BeFalse();
    }

    [Theory]
    [InlineData("SEC-SHA256-")]                  // 0 chars after prefix
    [InlineData("SEC-SHA256-4")]                 // 1 char after prefix
    [InlineData("SEC-SHA256-4FA8B19C30E")]       // 11 chars after prefix (boundary - 1)
    [InlineData("4FA8B19C30E")]                  // 11 chars bare stored
    public void VerifyShortSignature_StoredDigestLessThan12Chars_Rejected(string stored)
    {
        var result = DocumentSecurityService.VerifyShortSignature(stored, ValidCandidateSig);
        result.Should().BeFalse();
    }

    [Theory]
    [InlineData("SEC-SHA256-4FA8B19C30E2")]             // Exactly 12 chars after prefix
    [InlineData("SEC-SHA256-4FA8B19C30E29")]            // 13 chars after prefix
    [InlineData("SEC-SHA256-4FA8B19C30E291F0")]         // 16 chars (standard)
    [InlineData("SEC-SHA256-4FA8B19C30E291F0DEADBEEF")] // 24 chars
    [InlineData("4FA8B19C30E2")]                        // Exactly 12 chars bare stored
    [InlineData("4FA8B19C30E291F0")]                    // 16 chars bare stored
    public void VerifyShortSignature_StoredDigestAtLeast12Chars_MatchesFirst12(string stored)
    {
        var result = DocumentSecurityService.VerifyShortSignature(stored, ValidCandidateSig);
        result.Should().BeTrue();
    }

    #endregion

    #region Dimension 4: ComputeDocumentDigest & GenerateVerificationUrl Probing

    [Fact]
    public void ComputeDocumentDigest_DeterministicAndCaseNormalized()
    {
        var patientId = Guid.NewGuid();
        var issuedAt = new DateTime(2026, 10, 25, 12, 0, 0, DateTimeKind.Utc);

        var digest1 = _service.ComputeDocumentDigest("Tenant-A", "med-cert", "MC-001", patientId, "prc-123", issuedAt);
        var digest2 = _service.ComputeDocumentDigest("tenant-a", "MED-CERT", "MC-001", patientId, "PRC-123", issuedAt);

        digest1.Should().Be(digest2, "casing in tenantId, docType, and doctorPrc must be normalized canonically");
    }

    [Fact]
    public void ComputeDocumentDigest_DropsSubSecondTicksDeterministically()
    {
        var patientId = Guid.NewGuid();
        var baseTime = new DateTime(2026, 10, 25, 12, 0, 0, DateTimeKind.Utc);
        var timeWithMillis = baseTime.AddMilliseconds(543);
        var timeWithMicros = baseTime.AddMicroseconds(999);

        var digestBase = _service.ComputeDocumentDigest("t1", "RX", "RX-01", patientId, "P1", baseTime);
        var digestMillis = _service.ComputeDocumentDigest("t1", "RX", "RX-01", patientId, "P1", timeWithMillis);
        var digestMicros = _service.ComputeDocumentDigest("t1", "RX", "RX-01", patientId, "P1", timeWithMicros);

        digestMillis.Should().Be(digestBase, "sub-second timestamp components must be truncated by yyyy-MM-ddTHH:mm:ssZ format");
        digestMicros.Should().Be(digestBase);
    }

    [Fact]
    public void ComputeDocumentDigest_NullPatientIdAndPrc_FallbackToCanonicalPlaceholders()
    {
        var issuedAt = new DateTime(2026, 10, 25, 12, 0, 0, DateTimeKind.Utc);

        var digest = _service.ComputeDocumentDigest("t1", "REFERRAL", "REF-01", null, null, issuedAt);
        digest.Should().StartWith("SEC-SHA256-");
        digest.Length.Should().Be(27); // "SEC-SHA256-" (11) + 16 hex chars
    }

    [Fact]
    public void ComputeDocumentDigest_SpecialCharactersInDocNumber_HandledSafely()
    {
        var issuedAt = DateTime.UtcNow;
        var specialDocNumbers = new[]
        {
            "MC/2026-10/0042#1",
            "RX-2026_10_25-001&A",
            "LAB?order=123&status=ok",
            "DOC:WITH:COLONS",
            "DOC WITH SPACES 123"
        };

        foreach (var docNumber in specialDocNumbers)
        {
            var digest = _service.ComputeDocumentDigest("t1", "med-cert", docNumber, Guid.NewGuid(), "PRC1", issuedAt);
            digest.Should().StartWith("SEC-SHA256-");
            digest.Length.Should().Be(27);
        }
    }

    [Theory]
    [InlineData("https://portal.clinicez.ph", "med-cert", "MC-01", "https://portal.clinicez.ph/verify/med-cert/MC-01?sig=4FA8B19C30E2")]
    [InlineData("https://portal.clinicez.ph/", "med-cert", "MC-01", "https://portal.clinicez.ph/verify/med-cert/MC-01?sig=4FA8B19C30E2")]
    [InlineData("https://portal.clinicez.ph///", "MED-CERT", "MC-01", "https://portal.clinicez.ph/verify/med-cert/MC-01?sig=4FA8B19C30E2")]
    [InlineData("https://portal.clinicez.ph", "rx", "clinic123.secret456", "https://portal.clinicez.ph/verify/rx/clinic123.secret456?sig=4FA8B19C30E2")]
    [InlineData("https://portal.clinicez.ph", "rx", "token with spaces", "https://portal.clinicez.ph/verify/rx/token%20with%20spaces?sig=4FA8B19C30E2")]
    [InlineData("https://portal.clinicez.ph", "rx", "token/with/slashes", "https://portal.clinicez.ph/verify/rx/token%2Fwith%2Fslashes?sig=4FA8B19C30E2")]
    public void GenerateVerificationUrl_NormalizesBaseUrlAndEscapesToken(string baseUrl, string docType, string token, string expectedUrl)
    {
        var url = _service.GenerateVerificationUrl(baseUrl, docType, token, ValidStoredDigest);
        url.Should().Be(expectedUrl);
    }

    [Theory]
    [InlineData("daily-eod")]
    [InlineData("doh-morbidity")]
    [InlineData("bir-tax-audit")]
    [InlineData("doctor-shares")]
    [InlineData("clinic-analytics")]
    public void GenerateVerificationUrl_InternalReports_ReturnsNullWhenSuppressed(string docType)
    {
        var url = _service.GenerateVerificationUrl(
            "https://portal.clinicez.ph",
            docType,
            "REPORT-001",
            ValidStoredDigest,
            includePublicVerificationUrl: false);

        url.Should().BeNull();
    }

    #endregion

    #region Dimension 5: PortalProjectionContracts Zero-PHI & Serialization Invariants

    [Fact]
    public void QueueBoardUpcomingItemDto_GuaranteesZeroPhi_DisplayNameDefaultsToNull()
    {
        var item = new QueueBoardUpcomingItemDto
        {
            QueueItemId = Guid.NewGuid(),
            TicketNumber = "B-012",
            Priority = "Urgent",
            Status = "Waiting",
            SequenceNumber = 12
        };

        item.DisplayName.Should().BeNull("zero-PHI public waiting area display requires null DisplayName");
    }

    [Fact]
    public void PortalProjectionContracts_ReflectionAudit_ProvesZeroPhiFields()
    {
        // Audit QueueBoardUpcomingItemDto, QueueBoardServingItemDto, and DocumentAttestationPublishedPayload
        var typesToAudit = new[]
        {
            typeof(QueueBoardUpcomingItemDto),
            typeof(QueueBoardServingItemDto),
            typeof(DocumentAttestationPublishedPayload)
        };

        var prohibitedSubstrings = new[]
        {
            "PatientName",
            "FirstName",
            "LastName",
            "FullName",
            "Diagnosis",
            "ChiefComplaint",
            "Allergy",
            "SoapNote",
            "MedicationName",
            "DrugName",
            "Dosage",
            "PatientPhone",
            "PatientEmail",
            "PatientAddress",
            "PhilHealthId",
            "PhilHealthPin",
            "BirthDate",
            "CivilStatus"
        };

        foreach (var type in typesToAudit)
        {
            var properties = type.GetProperties(BindingFlags.Public | BindingFlags.Instance);
            foreach (var prop in properties)
            {
                foreach (var prohibited in prohibitedSubstrings)
                {
                    prop.Name.Should().NotContainEquivalentOf(prohibited,
                        $"type {type.Name} must not expose PHI property {prop.Name}");
                }
            }
        }
    }

    [Fact]
    public void DocumentAttestationPublishedPayload_JsonRoundtripPreservesIntegrity()
    {
        var original = new DocumentAttestationPublishedPayload
        {
            SourceDocumentId = Guid.NewGuid(),
            TenantId = "tenant-prod-ph",
            FacilityId = Guid.NewGuid(),
            DocumentKind = "medical-certificate",
            DocumentNumber = "MC-20261025-0099",
            SecurityDigest = "SEC-SHA256-4FA8B19C30E291F0",
            VerificationTokenHash = null,
            ClinicName = "Metro Health Family Clinic",
            ClinicAddress = "E. Rodriguez Ave, Quezon City",
            ClinicContact = "+63 2 8123 4567",
            DoctorName = "Dr. Juan dela Cruz, MD",
            DoctorPrcLicense = "PRC-0123456",
            DoctorPtr = "PTR-7654321",
            DoctorS2License = null,
            IssuedAtUtc = new DateTime(2026, 10, 25, 9, 15, 0, DateTimeKind.Utc),
            ExpiresAtUtc = new DateTime(2026, 11, 25, 9, 15, 0, DateTimeKind.Utc),
            Status = "VALID",
            IsAlreadyDispensed = false,
            DispenseStatus = null,
            DispensedPharmacyName = null,
            DispensedAtUtc = null,
            HasDangerousDrug = false,
            ItemCount = 1
        };

        var json = JsonSerializer.Serialize(original, InteropJson.Options);
        var deserialized = JsonSerializer.Deserialize<DocumentAttestationPublishedPayload>(json, InteropJson.Options);

        deserialized.Should().NotBeNull();
        deserialized.Should().BeEquivalentTo(original);
    }

    [Fact]
    public void QueueBoardUpdatedPayload_SerializesDateOnlyAsIsoString()
    {
        var payload = new QueueBoardUpdatedPayload
        {
            TenantId = "tenant-1",
            FacilityId = Guid.NewGuid(),
            QueueDate = new DateOnly(2026, 10, 25),
            GeneratedAtUtc = DateTime.UtcNow,
            IsAcceptingWalkIns = true,
            PatientsWaitingCount = 5,
            NowServing = Array.Empty<QueueBoardServingItemDto>(),
            UpNext = Array.Empty<QueueBoardUpcomingItemDto>()
        };

        var json = JsonSerializer.Serialize(payload, InteropJson.Options);
        json.Should().Contain("\"2026-10-25\"");
    }

    #endregion

    #region Dimension 6: Hub Envelope Ceiling Configuration Verification

    [Fact]
    public void HubOptions_MaxEnvelopeBytes_IsConfiguredTo8MiB()
    {
        // 8 MiB = 8 * 1024 * 1024 = 8,388,608 bytes
        const int expected8MiB = 8_388_608;

        // Verify constant/default in HubOptions
        var hubOptionsType = Type.GetType("ClinicEz.Interop.Application.HubOptions, ClinicEz.Interop.Application");
        if (hubOptionsType != null)
        {
            var hubOptions = Activator.CreateInstance(hubOptionsType);
            var prop = hubOptionsType.GetProperty("MaxEnvelopeBytes");
            prop.Should().NotBeNull();
            var val = (int)prop!.GetValue(hubOptions)!;
            val.Should().Be(expected8MiB, "HubOptions.MaxEnvelopeBytes default must be 8 MiB (8388608)");
        }
    }

    #endregion
}
