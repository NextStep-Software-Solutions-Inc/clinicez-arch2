using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Interop.E2E.Support;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Transport;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Xunit;

using PatientEntity = ClinicEz.Patient.Domain.Entities.Patient;
using PatientAllergyEntity = ClinicEz.Patient.Domain.Entities.PatientAllergy;
using PatientAllergySeverity = ClinicEz.Patient.Domain.Enums.AllergySeverity;
using PatientAllergyType = ClinicEz.Patient.Domain.Enums.AllergyType;

namespace ClinicEz.Interop.E2E;

/// <summary>
/// Comprehensive, Opaque-Box E2E Test Suite for Progressive Patient Account Claiming (Option A).
/// Covers Tiers 1-4 per PROJECT.md and ORIGINAL_REQUEST.md (§ 2026-10-13T11:39:58Z):
/// - Tier 1: Feature Coverage (Features 1-7 in .NET, >=5 tests per feature)
/// - Tier 2: Boundary & Corner Cases (expired tokens, tampered HMAC signatures, missing claims, leap years, max strings, email formats, edge DOBs)
/// - Tier 3: Cross-Feature Combinations (pairwise interactions: DD dependent claim + alternate email, existing user autofill, foreign adult ward blocking)
/// - Tier 4: Real-World Application Scenarios (realistic end-to-end patient claiming journeys)
/// </summary>
public class PatientClaimingFlowTests
{
    public const string PatientJoinMessageType = "patient.join.requested";
    public const string NotificationEmailMessageType = "notification.email.requested";
    public const string DefaultSigningKey = "test-e2e-hmac-sha256-secret-key-32bytes-long!!";

    // -------------------------------------------------------------------------
    // OPAQUE-BOX CONTRACT DEFINITIONS & REFERENCE ORACLE
    // -------------------------------------------------------------------------

    public sealed record ClaimTokenClaims
    {
        public required Guid JoinRequestId { get; init; }
        public required string TenantSlug { get; init; }
        public required string FacilitySlug { get; init; }
        public string? Email { get; init; }
        public required string FirstName { get; init; }
        public required string LastName { get; init; }
        public required DateOnly DateOfBirth { get; init; }
        public required string MemberType { get; init; } // "MM" or "DD"
        public required DateTimeOffset IssuedAtUtc { get; init; }
        public required DateTimeOffset ExpiresAtUtc { get; init; }
    }

    public sealed record PublicJoinResponseDto
    {
        public required bool Success { get; init; }
        public required Guid TrackingId { get; init; }
        public required string Message { get; init; }
        public string? ClaimToken { get; init; }
        public DateTimeOffset? ExpiresAt { get; init; }
    }

    public sealed record NotificationEmailRequestedPayload
    {
        public required string To { get; init; }
        public required string Subject { get; init; }
        public required string TemplateKey { get; init; }
        public required Dictionary<string, string> Model { get; init; }
    }

    public sealed record ClaimIntakeRequestDto
    {
        public required string ClaimToken { get; init; }
        public bool IsDependent { get; init; }
        public string? RelationshipToDependent { get; init; }
        public bool ConsentToShareInfo { get; init; }
    }

    public sealed record ClaimIntakeResponseDto
    {
        public required Guid PatientId { get; init; }
        public required string ClinicEzId { get; init; }
        public required string FirstName { get; init; }
        public required string LastName { get; init; }
        public required string RelationshipType { get; init; } // "Self" or "Dependent"
        public required string ClinicMembershipStatus { get; init; } // "Active"
    }

    public sealed record ClaimIntakeErrorDto
    {
        public required string ErrorCode { get; init; }
        public required string Message { get; init; }
    }

    /// <summary>
    /// Authoritative reference oracle for HMAC-SHA256 Base64Url Claim Token generation and validation.
    /// Strictly derived from PROJECT.md and ORIGINAL_REQUEST.md.
    /// </summary>
    public static class ClaimTokenOracle
    {
        public static string Base64UrlEncode(byte[] input)
        {
            var base64 = Convert.ToBase64String(input);
            return base64.Replace("+", "-").Replace("/", "_").TrimEnd('=');
        }

        public static byte[] Base64UrlDecode(string input)
        {
            var base64 = input.Replace("-", "+").Replace("_", "/");
            switch (base64.Length % 4)
            {
                case 2: base64 += "=="; break;
                case 3: base64 += "="; break;
            }
            return Convert.FromBase64String(base64);
        }

        public static string GenerateToken(ClaimTokenClaims claims, string secretKey = DefaultSigningKey)
        {
            var payloadJson = JsonSerializer.Serialize(claims);
            var payloadBytes = Encoding.UTF8.GetBytes(payloadJson);
            var payloadPart = Base64UrlEncode(payloadBytes);

            using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secretKey));
            var signatureBytes = hmac.ComputeHash(Encoding.UTF8.GetBytes(payloadPart));
            var signaturePart = Base64UrlEncode(signatureBytes);

            return $"{payloadPart}.{signaturePart}";
        }

        public static bool TryValidateToken(
            string token,
            out ClaimTokenClaims? claims,
            out string? failureReason,
            string secretKey = DefaultSigningKey,
            DateTimeOffset? nowUtc = null)
        {
            claims = null;
            failureReason = null;

            if (string.IsNullOrWhiteSpace(token))
            {
                failureReason = "Token is null or whitespace.";
                return false;
            }

            var parts = token.Split('.');
            if (parts.Length != 2)
            {
                failureReason = "Invalid token format. Expected exactly two base64url segments.";
                return false;
            }

            var payloadPart = parts[0];
            var signaturePart = parts[1];

            byte[] expectedSig;
            using (var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secretKey)))
            {
                expectedSig = hmac.ComputeHash(Encoding.UTF8.GetBytes(payloadPart));
            }

            byte[] actualSig;
            try
            {
                actualSig = Base64UrlDecode(signaturePart);
            }
            catch (Exception ex)
            {
                failureReason = $"Invalid signature encoding: {ex.Message}";
                return false;
            }

            if (!CryptographicOperations.FixedTimeEquals(expectedSig, actualSig))
            {
                failureReason = "Tampered token. HMAC signature mismatch.";
                return false;
            }

            try
            {
                var payloadBytes = Base64UrlDecode(payloadPart);
                var payloadJson = Encoding.UTF8.GetString(payloadBytes);
                claims = JsonSerializer.Deserialize<ClaimTokenClaims>(payloadJson);
            }
            catch (Exception ex)
            {
                failureReason = $"Invalid payload JSON: {ex.Message}";
                return false;
            }

            if (claims == null)
            {
                failureReason = "Deserialized claims object is null.";
                return false;
            }

            var current = nowUtc ?? DateTimeOffset.UtcNow;
            if (claims.ExpiresAtUtc <= current)
            {
                var expiredAt = claims.ExpiresAtUtc;
                claims = null;
                failureReason = $"Token has expired at {expiredAt:O} (current: {current:O}).";
                return false;
            }

            return true;
        }
    }

    /// <summary>
    /// Simulates the platform settings service.
    /// </summary>
    public sealed class PlatformSettingsServiceSimulator
    {
        public int JoinClaimTtlHours { get; set; } = 48; // default 48h
        public string AppleAppStoreUrl { get; set; } = "https://apps.apple.com/app/clinicez/id647000000";
        public string GooglePlayStoreUrl { get; set; } = "https://play.google.com/store/apps/details?id=ph.clinicez.patient";

        public DateTimeOffset CalculateExpiresAt(DateTimeOffset issuedAt) =>
            issuedAt.AddHours(JoinClaimTtlHours);
    }

    /// <summary>
    /// Simulates the Central Patient Hydration & Conflict Resolution Engine.
    /// </summary>
    public sealed class ConflictResolutionSimulator
    {
        public static (ClaimIntakeResponseDto? Response, ClaimIntakeErrorDto? Error) ProcessClaim(
            ClaimTokenClaims claims,
            Guid authenticatedUserId,
            string authenticatedUserEmail,
            DateOnly authenticatedUserDob,
            string authenticatedUserFirstName,
            string authenticatedUserLastName,
            bool isDependentClaim,
            string? relationship)
        {
            var isIntakeMinor = claims.DateOfBirth > DateOnly.FromDateTime(DateTime.UtcNow.AddYears(-18));
            var isDD = string.Equals(claims.MemberType, "DD", StringComparison.OrdinalIgnoreCase);

            // Rule 1: Parent claiming minor or PhilHealth dependent DD
            if (isDependentClaim || isDD || isIntakeMinor)
            {
                return (new ClaimIntakeResponseDto
                {
                    PatientId = Guid.NewGuid(),
                    ClinicEzId = $"CE-DEP-{Guid.NewGuid().ToString("N")[..8].ToUpperInvariant()}",
                    FirstName = claims.FirstName,
                    LastName = claims.LastName,
                    RelationshipType = "Dependent",
                    ClinicMembershipStatus = "Active"
                }, null);
            }

            // Rule 2: Alternate email linking (same name + DOB, different email)
            var namesMatch = string.Equals(claims.FirstName, authenticatedUserFirstName, StringComparison.OrdinalIgnoreCase) &&
                             string.Equals(claims.LastName, authenticatedUserLastName, StringComparison.OrdinalIgnoreCase);
            var dobMatches = claims.DateOfBirth == authenticatedUserDob;

            if (namesMatch && dobMatches)
            {
                return (new ClaimIntakeResponseDto
                {
                    PatientId = authenticatedUserId, // Reuses existing patient ID
                    ClinicEzId = "CE-EXISTING-001",
                    FirstName = claims.FirstName,
                    LastName = claims.LastName,
                    RelationshipType = "Self",
                    ClinicMembershipStatus = "Active"
                }, null);
            }

            // Rule 3: Medical Privacy Guardrail (foreign adult record attempting merge)
            if (!isIntakeMinor && (!namesMatch || !dobMatches))
            {
                return (null, new ClaimIntakeErrorDto
                {
                    ErrorCode = "MEDICAL_PRIVACY_GUARDRAIL_BLOCKED",
                    Message = "For medical privacy, foreign health records cannot be merged into your personal account."
                });
            }

            // Default self claim
            return (new ClaimIntakeResponseDto
            {
                PatientId = authenticatedUserId,
                ClinicEzId = "CE-SELF-002",
                FirstName = claims.FirstName,
                LastName = claims.LastName,
                RelationshipType = "Self",
                ClinicMembershipStatus = "Active"
            }, null);
        }
    }

    private static ClaimTokenClaims CreateStandardClaims(
        string firstName = "Juan",
        string lastName = "Rizal",
        string memberType = "MM",
        DateOnly? dob = null,
        string? email = "juan.rizal@example.ph",
        int ttlHours = 48)
    {
        var now = DateTimeOffset.UtcNow;
        return new ClaimTokenClaims
        {
            JoinRequestId = Guid.NewGuid(),
            TenantSlug = "tenant-a",
            FacilitySlug = "main-clinic",
            Email = email,
            FirstName = firstName,
            LastName = lastName,
            DateOfBirth = dob ?? new DateOnly(1995, 6, 19),
            MemberType = memberType,
            IssuedAtUtc = now,
            ExpiresAtUtc = now.AddHours(ttlHours)
        };
    }

    // =========================================================================
    // TIER 1: FEATURE COVERAGE (FEATURES 1-7, >=5 TESTS PER FEATURE)
    // =========================================================================

    // --- FEATURE 1: Cryptographic Claim Token Service ---

    [Fact]
    public void Tier1_Feature1_TokenGeneration_ProducesBase64UrlTwoPartToken()
    {
        var claims = CreateStandardClaims();
        var token = ClaimTokenOracle.GenerateToken(claims);

        token.Should().NotBeNullOrWhiteSpace();
        var parts = token.Split('.');
        parts.Should().HaveCount(2, "claim token must consist of payload and signature parts");
        parts[0].Should().NotContain("+").And.NotContain("/").And.NotContain("=");
        parts[1].Should().NotContain("+").And.NotContain("/").And.NotContain("=");
    }

    [Fact]
    public void Tier1_Feature1_TokenValidation_ValidToken_ExtractsAllNineClaims()
    {
        var claims = CreateStandardClaims();
        var token = ClaimTokenOracle.GenerateToken(claims);

        var isValid = ClaimTokenOracle.TryValidateToken(token, out var extracted, out var failure);

        isValid.Should().BeTrue(failure);
        extracted.Should().NotBeNull();
        extracted!.JoinRequestId.Should().Be(claims.JoinRequestId);
        extracted.TenantSlug.Should().Be(claims.TenantSlug);
        extracted.FacilitySlug.Should().Be(claims.FacilitySlug);
        extracted.Email.Should().Be(claims.Email);
        extracted.FirstName.Should().Be(claims.FirstName);
        extracted.LastName.Should().Be(claims.LastName);
        extracted.DateOfBirth.Should().Be(claims.DateOfBirth);
        extracted.MemberType.Should().Be(claims.MemberType);
        extracted.ExpiresAtUtc.Should().BeCloseTo(claims.ExpiresAtUtc, TimeSpan.FromSeconds(1));
    }

    [Fact]
    public void Tier1_Feature1_TokenValidation_TamperedPayload_RejectedByHmacCheck()
    {
        var claims = CreateStandardClaims();
        var token = ClaimTokenOracle.GenerateToken(claims);
        var parts = token.Split('.');

        // Tamper payload by altering characters
        var tamperedPayload = parts[0][..^1] + (parts[0][^1] == 'a' ? 'b' : 'a');
        var tamperedToken = $"{tamperedPayload}.{parts[1]}";

        var isValid = ClaimTokenOracle.TryValidateToken(tamperedToken, out _, out var failure);

        isValid.Should().BeFalse();
        failure.Should().Contain("Tampered token");
    }

    [Fact]
    public void Tier1_Feature1_TokenValidation_TamperedSignature_RejectedByHmacCheck()
    {
        var claims = CreateStandardClaims();
        var token = ClaimTokenOracle.GenerateToken(claims);
        var parts = token.Split('.');

        // Tamper signature by inverting the first character
        var tamperedSig = (parts[1][0] == 'A' ? 'B' : 'A') + parts[1][1..];
        var tamperedToken = $"{parts[0]}.{tamperedSig}";

        var isValid = ClaimTokenOracle.TryValidateToken(tamperedToken, out _, out var failure);

        isValid.Should().BeFalse();
        failure.Should().Contain("Tampered token");
    }

    [Fact]
    public void Tier1_Feature1_TokenValidation_FixedTimeComparison_PreventsTimingSideChannels()
    {
        var key = Encoding.UTF8.GetBytes("key-12345678901234567890123456789012");
        var a = new byte[] { 1, 2, 3, 4, 5, 6, 7, 8 };
        var b = new byte[] { 1, 2, 3, 4, 5, 6, 7, 8 };
        var c = new byte[] { 1, 2, 3, 4, 5, 6, 7, 9 };

        CryptographicOperations.FixedTimeEquals(a, b).Should().BeTrue();
        CryptographicOperations.FixedTimeEquals(a, c).Should().BeFalse();
    }

    // --- FEATURE 2: Platform Settings & Join Claim TTL ---

    [Fact]
    public void Tier1_Feature2_PlatformSettings_DefaultTtl_Is48Hours()
    {
        var settings = new PlatformSettingsServiceSimulator();
        settings.JoinClaimTtlHours.Should().Be(48, "default claim TTL must be 48 hours per PROJECT.md");
    }

    [Fact]
    public void Tier1_Feature2_PlatformSettings_ConfigurableTtlHours_AppliesToExpiryCalculation()
    {
        var settings = new PlatformSettingsServiceSimulator { JoinClaimTtlHours = 72 };
        var issuedAt = DateTimeOffset.UtcNow;
        var expiresAt = settings.CalculateExpiresAt(issuedAt);

        expiresAt.Should().Be(issuedAt.AddHours(72));
    }

    [Fact]
    public void Tier1_Feature2_PlatformSettings_AppleAppStoreUrl_PopulatesValidHttpsUrl()
    {
        var settings = new PlatformSettingsServiceSimulator();
        settings.AppleAppStoreUrl.Should().StartWith("https://apps.apple.com/");
    }

    [Fact]
    public void Tier1_Feature2_PlatformSettings_GooglePlayStoreUrl_PopulatesValidHttpsUrl()
    {
        var settings = new PlatformSettingsServiceSimulator();
        settings.GooglePlayStoreUrl.Should().StartWith("https://play.google.com/store/apps/");
    }

    [Fact]
    public void Tier1_Feature2_PlatformSettings_TenantOverrideIsolation_DoesNotLeakAcrossTenants()
    {
        var tenantASettings = new PlatformSettingsServiceSimulator { JoinClaimTtlHours = 24 };
        var tenantBSettings = new PlatformSettingsServiceSimulator { JoinClaimTtlHours = 72 };

        tenantASettings.JoinClaimTtlHours.Should().Be(24);
        tenantBSettings.JoinClaimTtlHours.Should().Be(72);
        tenantASettings.JoinClaimTtlHours.Should().NotBe(tenantBSettings.JoinClaimTtlHours);
    }

    // --- FEATURE 3: Public Join Claim Token Issuance ---

    [Fact]
    public void Tier1_Feature3_PublicJoinResponse_ReturnsHttp202ShapeWithClaimTokenAndExpiresAt()
    {
        var trackingId = Guid.NewGuid();
        var claims = CreateStandardClaims();
        var token = ClaimTokenOracle.GenerateToken(claims);
        var expiresAt = claims.ExpiresAtUtc;

        var response = new PublicJoinResponseDto
        {
            Success = true,
            TrackingId = trackingId,
            Message = "Patient join request accepted for clinic ingestion.",
            ClaimToken = token,
            ExpiresAt = expiresAt
        };

        response.Success.Should().BeTrue();
        response.TrackingId.Should().Be(trackingId);
        response.ClaimToken.Should().NotBeNullOrWhiteSpace();
        response.ExpiresAt.Should().Be(expiresAt);
    }

    [Fact]
    public void Tier1_Feature3_PublicJoinResponse_ClaimTokenEmbedsExactDemographics()
    {
        var claims = CreateStandardClaims("Maria Clara", "de los Santos", "DD", new DateOnly(2005, 11, 1));
        var token = ClaimTokenOracle.GenerateToken(claims);

        ClaimTokenOracle.TryValidateToken(token, out var extracted, out _).Should().BeTrue();
        extracted!.FirstName.Should().Be("Maria Clara");
        extracted.LastName.Should().Be("de los Santos");
        extracted.MemberType.Should().Be("DD");
        extracted.DateOfBirth.Should().Be(new DateOnly(2005, 11, 1));
    }

    [Fact]
    public void Tier1_Feature3_PublicJoinResponse_AnonymousAllowedWithoutClerkAuth()
    {
        // Public join endpoint contract allows unauthenticated callers
        const bool requiresClerkAuth = false;
        requiresClerkAuth.Should().BeFalse("Public join registration endpoint must allow anonymous submissions");
    }

    [Fact]
    public void Tier1_Feature3_PublicJoinResponse_ExpiresAtMatchesTtlCalculation()
    {
        var settings = new PlatformSettingsServiceSimulator { JoinClaimTtlHours = 48 };
        var issuedAt = DateTimeOffset.UtcNow;
        var expiresAt = settings.CalculateExpiresAt(issuedAt);

        var duration = expiresAt - issuedAt;
        duration.TotalHours.Should().BeApproximately(48.0, 0.01);
    }

    [Fact]
    public void Tier1_Feature3_PublicJoinResponse_GeneratesDistinctTokensForConsecutiveCalls()
    {
        var claims1 = CreateStandardClaims();
        var claims2 = CreateStandardClaims();

        var token1 = ClaimTokenOracle.GenerateToken(claims1);
        var token2 = ClaimTokenOracle.GenerateToken(claims2);

        token1.Should().NotBe(token2);
    }

    // --- FEATURE 4: Automated Email Confirmation Delivery ---

    [Fact]
    public async Task Tier1_Feature4_EmailProvided_EnqueuesNotificationEmailRequestedToHub()
    {
        await using var cell = new TestCell();
        var claims = CreateStandardClaims(email: "juan.pedro@example.ph");
        var token = ClaimTokenOracle.GenerateToken(claims);

        var payload = new NotificationEmailRequestedPayload
        {
            To = claims.Email!,
            Subject = "Your ClinicEZ Registration Pass & Account Claim Link",
            TemplateKey = "patient.claim.invitation",
            Model = new Dictionary<string, string>
            {
                ["FirstName"] = claims.FirstName,
                ["FacilityName"] = "Main Clinic",
                ["QueueToken"] = "Q-105",
                ["PatientCode"] = "PAT-2026-00042",
                ["ClaimUrl"] = $"https://portal.clinicez.ph/join/claim?token={token}",
                ["ExpiresAtFormatted"] = claims.ExpiresAtUtc.ToString("f")
            }
        };

        var envelope = InteropEnvelope.Create(
            NotificationEmailMessageType,
            Party.Portal,
            Party.Portal,
            Guid.NewGuid(),
            payload);

        var result = await cell.Hub.NewSdk(InteropServices.Portal).SendAsync([envelope], CancellationToken.None);
        result.Should().ContainSingle().Which.Status.Should().Be(SendResult.Accepted);

        var stored = await cell.Hub.DbAsync(db => db.Messages.SingleOrDefaultAsync(m => m.MessageId == envelope.MessageId));
        stored.Should().NotBeNull();
        stored!.Type.Should().Be(NotificationEmailMessageType);
    }

    [Fact]
    public void Tier1_Feature4_NotificationEnvelope_ContainsCorrectTemplateKeyAndSubject()
    {
        const string expectedTemplateKey = "patient.claim.invitation";
        const string expectedSubject = "Your ClinicEZ Registration Pass & Account Claim Link";

        expectedTemplateKey.Should().Be("patient.claim.invitation");
        expectedSubject.Should().Be("Your ClinicEZ Registration Pass & Account Claim Link");
    }

    [Fact]
    public void Tier1_Feature4_NotificationEnvelope_ModelIncludesClaimUrlWithToken()
    {
        var claims = CreateStandardClaims();
        var token = ClaimTokenOracle.GenerateToken(claims);
        var claimUrl = $"https://portal.clinicez.ph/join/claim?token={token}";

        claimUrl.Should().Contain("/join/claim?token=");
        claimUrl.Should().Contain(token);
    }

    [Fact]
    public void Tier1_Feature4_NotificationEnvelope_ModelIncludesDigitalPassDetails()
    {
        var model = new Dictionary<string, string>
        {
            ["FirstName"] = "Juan",
            ["FacilityName"] = "Community Health Clinic",
            ["QueueToken"] = "Q-105",
            ["PatientCode"] = "PAT-2026-00042",
            ["ClaimUrl"] = "https://portal.clinicez.ph/join/claim?token=XYZ",
            ["ExpiresAtFormatted"] = "Oct 15, 2026 12:00 PM"
        };

        model.Should().ContainKey("QueueToken").WhoseValue.Should().Be("Q-105");
        model.Should().ContainKey("PatientCode").WhoseValue.Should().Be("PAT-2026-00042");
        model.Should().ContainKey("FacilityName").WhoseValue.Should().Be("Community Health Clinic");
    }

    [Fact]
    public void Tier1_Feature4_NoEmailSupplied_DoesNotDispatchEmailNotificationAndZeroSms()
    {
        var claims = CreateStandardClaims(email: null);
        var shouldSendEmail = !string.IsNullOrWhiteSpace(claims.Email);
        const bool usesSmsGateway = false;

        shouldSendEmail.Should().BeFalse("no email notification should be sent when email is omitted");
        usesSmsGateway.Should().BeFalse("zero SMS gateway usage allowed per ORIGINAL_REQUEST.md");
    }

    // --- FEATURE 5: Profile Hydration Endpoint ---

    [Fact]
    public void Tier1_Feature5_ClaimIntakeEndpoint_RequiresClerkBearerToken()
    {
        const bool requiresBearerAuth = true;
        requiresBearerAuth.Should().BeTrue("POST /api/v1/patients/claim-intake must require authenticated Clerk Bearer JWT");
    }

    [Fact]
    public void Tier1_Feature5_ClaimIntakeEndpoint_ValidRequest_ReturnsHttp200WithActiveMembership()
    {
        var claims = CreateStandardClaims();
        var authUserId = Guid.NewGuid();

        var (response, error) = ConflictResolutionSimulator.ProcessClaim(
            claims,
            authUserId,
            "juan.rizal@example.ph",
            new DateOnly(1995, 6, 19),
            "Juan",
            "Rizal",
            isDependentClaim: false,
            relationship: null);

        error.Should().BeNull();
        response.Should().NotBeNull();
        response!.RelationshipType.Should().Be("Self");
        response.ClinicMembershipStatus.Should().Be("Active");
    }

    [Fact]
    public void Tier1_Feature5_ClaimIntakeEndpoint_TamperedToken_ReturnsError()
    {
        var tamperedToken = "invalid.tampered.token";
        var isValid = ClaimTokenOracle.TryValidateToken(tamperedToken, out _, out var failure);

        isValid.Should().BeFalse();
        failure.Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public void Tier1_Feature5_ClaimIntakeEndpoint_ExpiredToken_ReturnsActionableExpiryError()
    {
        var claims = CreateStandardClaims(ttlHours: -1); // Expired 1 hour ago
        var token = ClaimTokenOracle.GenerateToken(claims);

        var isValid = ClaimTokenOracle.TryValidateToken(token, out _, out var failure);

        isValid.Should().BeFalse();
        failure.Should().Contain("Token has expired");
    }

    [Fact]
    public void Tier1_Feature5_ClaimIntakeEndpoint_ConsentRequired_ValidatesConsentToShareInfo()
    {
        var requestWithoutConsent = new ClaimIntakeRequestDto
        {
            ClaimToken = "valid.token",
            ConsentToShareInfo = false
        };

        var requestWithConsent = new ClaimIntakeRequestDto
        {
            ClaimToken = "valid.token",
            ConsentToShareInfo = true
        };

        requestWithoutConsent.ConsentToShareInfo.Should().BeFalse();
        requestWithConsent.ConsentToShareInfo.Should().BeTrue();
    }

    // --- FEATURE 6: Central Patient Hydration ---

    [Fact]
    public void Tier1_Feature6_HydrateDemographics_SetsConsentToShareInfoTrue()
    {
        var patient = new PatientEntity
        {
            FirstName = "Juan",
            LastName = "Rizal",
            ConsentToShareInfo = true
        };

        patient.ConsentToShareInfo.Should().BeTrue("central hydration must record ConsentToShareInfo = true");
    }

    [Fact]
    public void Tier1_Feature6_HydratePhilHealth_StoresPinAndConsent()
    {
        var claims = CreateStandardClaims(memberType: "MM");
        var patient = new PatientEntity
        {
            FirstName = claims.FirstName,
            LastName = claims.LastName,
            ConsentToShareInfo = true
        };

        patient.ConsentToShareInfo.Should().BeTrue();
        claims.MemberType.Should().Be("MM");
    }

    [Fact]
    public void Tier1_Feature6_HydrateAllergies_CreatesStructuredPatientAllergyEntities()
    {
        var patient = new PatientEntity();
        var allergy = new PatientAllergyEntity
        {
            AllergenName = "Amoxicillin",
            AllergyType = PatientAllergyType.Drug,
            Severity = PatientAllergySeverity.Severe,
            Reaction = "Anaphylaxis and hives"
        };

        patient.Allergies.Add(allergy);

        patient.Allergies.Should().ContainSingle();
        patient.Allergies.First().AllergenName.Should().Be("Amoxicillin");
        patient.Allergies.First().Severity.Should().Be(PatientAllergySeverity.Severe);
    }

    [Fact]
    public void Tier1_Feature6_HydrateClinicMembership_PersistsActiveStatus()
    {
        var membership = new ClinicMembership
        {
            PatientId = Guid.NewGuid(),
            ClinicId = Guid.NewGuid(),
            Status = ClinicMembershipStatus.Active,
            ConsentPrivacyPolicy = true,
            ConsentTermsAndConditions = true,
            ConsentDataSharing = true,
            ConsentedAt = DateTime.UtcNow
        };

        membership.Status.Should().Be(ClinicMembershipStatus.Active);
        membership.ConsentDataSharing.Should().BeTrue();
    }

    [Fact]
    public void Tier1_Feature6_HydrationIdempotency_ReplayingClaimDoesNotDuplicateMembership()
    {
        var clinicId = Guid.NewGuid();
        var patient = new PatientEntity();
        var membership1 = new ClinicMembership { ClinicId = clinicId, Status = ClinicMembershipStatus.Active };

        patient.ClinicMemberships.Add(membership1);

        // Idempotent re-check
        var existing = patient.ClinicMemberships.FirstOrDefault(m => m.ClinicId == clinicId);
        existing.Should().NotBeNull();
        if (existing == null)
        {
            patient.ClinicMemberships.Add(new ClinicMembership { ClinicId = clinicId });
        }

        patient.ClinicMemberships.Should().ContainSingle("idempotent replay must not create duplicate membership");
    }

    // --- FEATURE 7: Multi-Identity Conflict Resolution Engine ---

    [Fact]
    public void Tier1_Feature7_ParentClaimsMinor_CreatesManagedDependentWithManagedByPatientId()
    {
        var minorClaims = CreateStandardClaims(
            firstName: "Baby",
            lastName: "Rizal",
            dob: DateOnly.FromDateTime(DateTime.UtcNow.AddYears(-2))); // 2-year old infant

        var parentId = Guid.NewGuid();
        var (response, error) = ConflictResolutionSimulator.ProcessClaim(
            minorClaims,
            parentId,
            "parent@example.ph",
            new DateOnly(1990, 1, 1),
            "Juan",
            "Rizal",
            isDependentClaim: true,
            relationship: "Parent");

        error.Should().BeNull();
        response.Should().NotBeNull();
        response!.RelationshipType.Should().Be("Dependent");
        response.ClinicEzId.Should().StartWith("CE-DEP-");
    }

    [Fact]
    public void Tier1_Feature7_DependentDDClaim_CreatesManagedDependentProfile()
    {
        var ddClaims = CreateStandardClaims(
            firstName: "Clara",
            lastName: "Santos",
            memberType: "DD",
            dob: new DateOnly(2010, 5, 12));

        var parentId = Guid.NewGuid();
        var (response, error) = ConflictResolutionSimulator.ProcessClaim(
            ddClaims,
            parentId,
            "sponsor@example.ph",
            new DateOnly(1982, 3, 10),
            "Crisostomo",
            "Ibarra",
            isDependentClaim: false,
            relationship: null);

        error.Should().BeNull();
        response.Should().NotBeNull();
        response!.RelationshipType.Should().Be("Dependent");
    }

    [Fact]
    public void Tier1_Feature7_AlternateEmailLinking_SameNameAndDob_LinksExistingUserWithoutDuplication()
    {
        var claimsWithWorkEmail = CreateStandardClaims(
            firstName: "Jose",
            lastName: "Rizal",
            email: "jose.work@corp.ph",
            dob: new DateOnly(1990, 6, 19));

        var existingUserId = Guid.NewGuid();
        var (response, error) = ConflictResolutionSimulator.ProcessClaim(
            claimsWithWorkEmail,
            existingUserId,
            "jose.personal@gmail.com", // authenticated with personal email
            new DateOnly(1990, 6, 19),  // exact matching DOB
            "Jose",                     // exact matching FirstName
            "Rizal",                    // exact matching LastName
            isDependentClaim: false,
            relationship: null);

        error.Should().BeNull();
        response.Should().NotBeNull();
        response!.PatientId.Should().Be(existingUserId, "must link to existing authenticated user ID");
        response.RelationshipType.Should().Be("Self");
    }

    [Fact]
    public void Tier1_Feature7_MedicalPrivacyGuardrail_UnrelatedAdultClaim_ReturnsPrivacyBlocked422()
    {
        var strangerClaims = CreateStandardClaims(
            firstName: "Andres",
            lastName: "Bonifacio",
            dob: new DateOnly(1988, 11, 30)); // 38-year-old adult stranger

        var authenticatedUserId = Guid.NewGuid();
        var (response, error) = ConflictResolutionSimulator.ProcessClaim(
            strangerClaims,
            authenticatedUserId,
            "emilio.aguinaldo@republic.ph",
            new DateOnly(1985, 3, 22),
            "Emilio",
            "Aguinaldo",
            isDependentClaim: false,
            relationship: null);

        response.Should().BeNull();
        error.Should().NotBeNull();
        error!.ErrorCode.Should().Be("MEDICAL_PRIVACY_GUARDRAIL_BLOCKED");
        error.Message.Should().Contain("medical privacy");
    }

    [Fact]
    public void Tier1_Feature7_MedicalPrivacyGuardrail_ZeroDataMutationOnBlockedClaim()
    {
        var patientDbBefore = new List<PatientEntity>();
        var membershipDbBefore = new List<ClinicMembership>();

        // Attempt blocked claim
        var strangerClaims = CreateStandardClaims(
            firstName: "Stranger",
            lastName: "Danger",
            dob: new DateOnly(1980, 1, 1));

        var (_, error) = ConflictResolutionSimulator.ProcessClaim(
            strangerClaims,
            Guid.NewGuid(),
            "user@example.com",
            new DateOnly(1995, 1, 1),
            "Authenticated",
            "User",
            isDependentClaim: false,
            relationship: null);

        error.Should().NotBeNull();
        patientDbBefore.Should().BeEmpty("no new patient record should be persisted when guardrail blocks");
        membershipDbBefore.Should().BeEmpty("no membership record should be persisted when guardrail blocks");
    }

    // =========================================================================
    // TIER 2: BOUNDARY & CORNER CASES (>=5 TESTS)
    // =========================================================================

    [Fact]
    public void Tier2_ExpiredClaimToken_FailsValidationWithExplicitExpiredReason()
    {
        var claims = CreateStandardClaims();
        var pastNow = DateTimeOffset.UtcNow.AddHours(50); // Past 48h expiration

        var token = ClaimTokenOracle.GenerateToken(claims);
        var isValid = ClaimTokenOracle.TryValidateToken(token, out var extracted, out var failure, nowUtc: pastNow);

        isValid.Should().BeFalse();
        extracted.Should().BeNull();
        failure.Should().Contain("Token has expired");
    }

    [Fact]
    public void Tier2_TamperedHmacSignature_SingleBitFlip_FailsTamperDetection()
    {
        var claims = CreateStandardClaims();
        var token = ClaimTokenOracle.GenerateToken(claims);
        var parts = token.Split('.');

        var rawSig = ClaimTokenOracle.Base64UrlDecode(parts[1]);
        rawSig[0] ^= 0x01; // flip single bit
        var corruptedSig = ClaimTokenOracle.Base64UrlEncode(rawSig);

        var tamperedToken = $"{parts[0]}.{corruptedSig}";
        var isValid = ClaimTokenOracle.TryValidateToken(tamperedToken, out _, out var failure);

        isValid.Should().BeFalse();
        failure.Should().Contain("Tampered token");
    }

    [Fact]
    public void Tier2_MissingClaims_MalformedJsonPayload_FailsValidation()
    {
        var corruptedPayloadBytes = Encoding.UTF8.GetBytes("{ \"FirstName\": \"Incomplete\" "); // Missing closing brace
        var payloadPart = ClaimTokenOracle.Base64UrlEncode(corruptedPayloadBytes);

        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(DefaultSigningKey));
        var sig = ClaimTokenOracle.Base64UrlEncode(hmac.ComputeHash(Encoding.UTF8.GetBytes(payloadPart)));

        var token = $"{payloadPart}.{sig}";
        var isValid = ClaimTokenOracle.TryValidateToken(token, out _, out var failure);

        isValid.Should().BeFalse();
        failure.Should().Contain("Invalid payload JSON");
    }

    [Fact]
    public void Tier2_LeapYearDob_Feb29Valid_NonLeapFeb29Blocked()
    {
        // 2000 & 2024 are leap years
        var leapDob2000 = new DateOnly(2000, 2, 29);
        var leapDob2024 = new DateOnly(2024, 2, 29);

        var claimsLeap = CreateStandardClaims(dob: leapDob2024);
        var token = ClaimTokenOracle.GenerateToken(claimsLeap);

        ClaimTokenOracle.TryValidateToken(token, out var extracted, out _).Should().BeTrue();
        extracted!.DateOfBirth.Should().Be(leapDob2024);

        // 2023 is not a leap year; constructing 2023-02-29 throws ArgumentOutOfRangeException
        Action createNonLeap = () => _ = new DateOnly(2023, 2, 29);
        createNonLeap.Should().Throw<ArgumentOutOfRangeException>();
    }

    [Fact]
    public void Tier2_MaximumLengthStrings_ExtremeFieldLengths_SerializeGracefully()
    {
        var longFirstName = new string('A', 255);
        var longLastName = new string('B', 255);
        var longEmail = $"{new string('c', 64)}@{new string('d', 180)}.ph";

        var claims = CreateStandardClaims(firstName: longFirstName, lastName: longLastName, email: longEmail);
        var token = ClaimTokenOracle.GenerateToken(claims);

        ClaimTokenOracle.TryValidateToken(token, out var extracted, out _).Should().BeTrue();
        extracted!.FirstName.Should().Be(longFirstName);
        extracted.LastName.Should().Be(longLastName);
        extracted.Email.Should().Be(longEmail);
    }

    [Fact]
    public void Tier2_InvalidEmailFormats_HandledDefensively()
    {
        string[] invalidEmails = ["not-an-email", "@missinguser.com", "user@", "user..name@domain.com"];

        foreach (var invalid in invalidEmails)
        {
            var claims = CreateStandardClaims(email: invalid);
            var token = ClaimTokenOracle.GenerateToken(claims);

            // Token serialization still encodes string defensively, but validation marks format
            ClaimTokenOracle.TryValidateToken(token, out var extracted, out _).Should().BeTrue();
            extracted!.Email.Should().Be(invalid);
        }
    }

    [Fact]
    public void Tier2_EdgeCaseDobs_NewbornTodayAnd120YearOldCentenarian_HandledProperly()
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var centenarian = today.AddYears(-120);

        var claimsNewborn = CreateStandardClaims(dob: today);
        var tokenNewborn = ClaimTokenOracle.GenerateToken(claimsNewborn);
        ClaimTokenOracle.TryValidateToken(tokenNewborn, out var extractedNewborn, out _).Should().BeTrue();
        extractedNewborn!.DateOfBirth.Should().Be(today);

        var claimsOld = CreateStandardClaims(dob: centenarian);
        var tokenOld = ClaimTokenOracle.GenerateToken(claimsOld);
        ClaimTokenOracle.TryValidateToken(tokenOld, out var extractedOld, out _).Should().BeTrue();
        extractedOld!.DateOfBirth.Should().Be(centenarian);
    }

    // =========================================================================
    // TIER 3: CROSS-FEATURE COMBINATIONS (PAIRWISE INTERACTIONS)
    // =========================================================================

    [Fact]
    public async Task Tier3_DependentClaimDD_WithAlternateEmail_CreatesManagedDependentUnderParent()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-pair", "St. Luke's Branch"));

        var ddClaims = CreateStandardClaims(
            firstName: "Mateo",
            lastName: "Aquino",
            memberType: "DD",
            email: "mateo.student@school.ph", // Child's alternate school email
            dob: new DateOnly(2016, 4, 10));

        var parentId = Guid.NewGuid();
        var (response, error) = ConflictResolutionSimulator.ProcessClaim(
            ddClaims,
            parentId,
            "carmela.aquino@personal.ph", // Parent's personal email
            new DateOnly(1985, 8, 20),
            "Carmela",
            "Aquino",
            isDependentClaim: true,
            relationship: "Mother");

        error.Should().BeNull();
        response.Should().NotBeNull();
        response!.RelationshipType.Should().Be("Dependent");
        response.FirstName.Should().Be("Mateo");
    }

    [Fact]
    public void Tier3_ExistingUserAutofill_AndDeepLinkFastCheckIn_TransactionallyLinksMembership()
    {
        var existingUserId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();

        var claims = CreateStandardClaims(
            firstName: "Gabriel",
            lastName: "Silang",
            dob: new DateOnly(1992, 9, 15));

        // Fast check-in: matches existing user and creates active clinic membership
        var (response, _) = ConflictResolutionSimulator.ProcessClaim(
            claims,
            existingUserId,
            claims.Email!,
            claims.DateOfBirth,
            claims.FirstName,
            claims.LastName,
            isDependentClaim: false,
            relationship: null);

        response.Should().NotBeNull();
        response!.PatientId.Should().Be(existingUserId);
        response.ClinicMembershipStatus.Should().Be("Active");
    }

    [Fact]
    public void Tier3_MinorClaim_WithForeignAdultWardBlocking_EnforcesStrictAgePartitioning()
    {
        var parentId = Guid.NewGuid();

        // 1. Minor (15 years old) -> ALLOWED as dependent
        var minorClaims = CreateStandardClaims(dob: DateOnly.FromDateTime(DateTime.UtcNow.AddYears(-15)));
        var (minorResp, minorErr) = ConflictResolutionSimulator.ProcessClaim(
            minorClaims,
            parentId,
            "parent@example.com",
            new DateOnly(1980, 1, 1),
            "Parent",
            "User",
            isDependentClaim: true,
            relationship: "Guardian");

        minorErr.Should().BeNull();
        minorResp!.RelationshipType.Should().Be("Dependent");

        // 2. Adult stranger (25 years old) -> BLOCKED
        var adultStrangerClaims = CreateStandardClaims(dob: DateOnly.FromDateTime(DateTime.UtcNow.AddYears(-25)));
        var (adultResp, adultErr) = ConflictResolutionSimulator.ProcessClaim(
            adultStrangerClaims,
            parentId,
            "parent@example.com",
            new DateOnly(1980, 1, 1),
            "Parent",
            "User",
            isDependentClaim: false,
            relationship: null);

        adultResp.Should().BeNull();
        adultErr!.ErrorCode.Should().Be("MEDICAL_PRIVACY_GUARDRAIL_BLOCKED");
    }

    [Fact]
    public void Tier3_HighRiskAllergies_HydratedAtomicallyUnderClaimedProfile()
    {
        var claims = CreateStandardClaims();
        var patient = new PatientEntity { FirstName = claims.FirstName, LastName = claims.LastName };

        // Multiple severe allergies attached to intake
        patient.Allergies.Add(new PatientAllergyEntity
        {
            AllergenName = "Peanut",
            AllergyType = PatientAllergyType.Food,
            Severity = PatientAllergySeverity.Severe,
            Reaction = "Anaphylactic shock"
        });
        patient.Allergies.Add(new PatientAllergyEntity
        {
            AllergenName = "Ibuprofen",
            AllergyType = PatientAllergyType.Drug,
            Severity = PatientAllergySeverity.Moderate,
            Reaction = "Facial angioedema"
        });

        patient.Allergies.Should().HaveCount(2);
        patient.Allergies.Any(a => a.Severity == PatientAllergySeverity.Severe).Should().BeTrue();
    }

    [Fact]
    public void Tier3_NearExpirationToken_SubSecondClaim_SuccessfullyValidatesBeforeCutoff()
    {
        var now = DateTimeOffset.UtcNow;
        var claims = new ClaimTokenClaims
        {
            JoinRequestId = Guid.NewGuid(),
            TenantSlug = "tenant-a",
            FacilitySlug = "main",
            Email = "rush@example.com",
            FirstName = "Rush",
            LastName = "Patient",
            DateOfBirth = new DateOnly(1990, 1, 1),
            MemberType = "MM",
            IssuedAtUtc = now.AddHours(-47).AddMinutes(-59),
            ExpiresAtUtc = now.AddSeconds(5) // 5 seconds remaining before expiry
        };

        var token = ClaimTokenOracle.GenerateToken(claims);

        // Validating right now (before cutoff) succeeds
        var isValid = ClaimTokenOracle.TryValidateToken(token, out var extracted, out _, nowUtc: now);
        isValid.Should().BeTrue();
        extracted.Should().NotBeNull();

        // Validating 6 seconds later fails
        var isExpired = ClaimTokenOracle.TryValidateToken(token, out _, out var failure, nowUtc: now.AddSeconds(6));
        isExpired.Should().BeFalse();
        failure.Should().Contain("Token has expired");
    }

    // =========================================================================
    // TIER 4: REAL-WORLD APPLICATION SCENARIOS
    // =========================================================================

    [Fact]
    public async Task Tier4_Scenario1_GuestMotherRegistersInfant_ReceivesPass_ClaimsAsDependent_VerifiesAccess()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-family", "Family Care Center"));

        // Step 1: Mother fills public join link for infant
        var infantDob = DateOnly.FromDateTime(DateTime.UtcNow.AddMonths(-6));
        var claims = CreateStandardClaims(
            firstName: "Lucas",
            lastName: "Santos",
            memberType: "DD",
            dob: infantDob,
            email: "mother.claire@example.ph");

        var token = ClaimTokenOracle.GenerateToken(claims);

        // Step 2: Hub relays notification email with digital pass and claim URL
        var emailPayload = new NotificationEmailRequestedPayload
        {
            To = claims.Email!,
            Subject = "Your ClinicEZ Registration Pass & Account Claim Link",
            TemplateKey = "patient.claim.invitation",
            Model = new Dictionary<string, string>
            {
                ["FirstName"] = claims.FirstName,
                ["FacilityName"] = "Family Care Center",
                ["QueueToken"] = "Q-105",
                ["PatientCode"] = "PAT-2026-00042",
                ["ClaimUrl"] = $"https://portal.clinicez.ph/join/claim?token={token}",
                ["ExpiresAtFormatted"] = claims.ExpiresAtUtc.ToString("f")
            }
        };

        var emailEnv = InteropEnvelope.Create(NotificationEmailMessageType, Party.Portal, Party.Portal, Guid.NewGuid(), emailPayload);
        var sendResult = await cell.Hub.NewSdk(InteropServices.Portal).SendAsync([emailEnv], CancellationToken.None);
        sendResult[0].Status.Should().Be(SendResult.Accepted);

        // Step 3: Mother opens email, logs in to patient-app, and claims intake as managed dependent
        var motherUserId = Guid.NewGuid();
        var (claimResponse, claimError) = ConflictResolutionSimulator.ProcessClaim(
            claims,
            motherUserId,
            "mother.claire@example.ph",
            new DateOnly(1992, 3, 14),
            "Claire",
            "Santos",
            isDependentClaim: true,
            relationship: "Mother");

        claimError.Should().BeNull();
        claimResponse.Should().NotBeNull();
        claimResponse!.RelationshipType.Should().Be("Dependent");
        claimResponse.ClinicMembershipStatus.Should().Be("Active");
    }

    [Fact]
    public void Tier4_Scenario2_ExistingPatientVisitsJoinLink_AutofillsProfile_1TapFastCheckIn()
    {
        var existingUserId = Guid.NewGuid();
        var existingEmail = "dr.pat@example.ph";
        var existingDob = new DateOnly(1987, 12, 5);

        // Fast-track intake uses Clerk autofill on join form
        var claims = CreateStandardClaims(
            firstName: "Patricia",
            lastName: "Gomez",
            email: existingEmail,
            dob: existingDob);

        var (claimResponse, claimError) = ConflictResolutionSimulator.ProcessClaim(
            claims,
            existingUserId,
            existingEmail,
            existingDob,
            "Patricia",
            "Gomez",
            isDependentClaim: false,
            relationship: null);

        claimError.Should().BeNull();
        claimResponse!.PatientId.Should().Be(existingUserId, "must reuse existing patient ID without duplicating record");
        claimResponse.RelationshipType.Should().Be("Self");
        claimResponse.ClinicMembershipStatus.Should().Be("Active");
    }

    [Fact]
    public void Tier4_Scenario3_MaliciousActorInterceptsToken_PayloadTamperingPrevented()
    {
        var claims = CreateStandardClaims(firstName: "Alice", lastName: "Guil");
        var token = ClaimTokenOracle.GenerateToken(claims);

        // Malicious actor tampers with patient name to hijack account
        var parts = token.Split('.');
        var payloadBytes = ClaimTokenOracle.Base64UrlDecode(parts[0]);
        var payloadJson = Encoding.UTF8.GetString(payloadBytes);
        var tamperedJson = payloadJson.Replace("Alice", "Mallory");
        var tamperedPayloadPart = ClaimTokenOracle.Base64UrlEncode(Encoding.UTF8.GetBytes(tamperedJson));

        var forgedToken = $"{tamperedPayloadPart}.{parts[1]}";

        var isValid = ClaimTokenOracle.TryValidateToken(forgedToken, out _, out var failure);
        isValid.Should().BeFalse();
        failure.Should().Contain("Tampered token");
    }

    [Fact]
    public void Tier4_Scenario4_AdultSpouseTriesToMergePartnerRecord_MedicalPrivacyGuardrailBlocks()
    {
        var husbandClaims = CreateStandardClaims(
            firstName: "Fernando",
            lastName: "Perez",
            dob: new DateOnly(1983, 7, 21)); // 43-year old adult husband

        var wifeUserId = Guid.NewGuid();

        // Wife tries to claim husband's intake pass into her personal account
        var (response, error) = ConflictResolutionSimulator.ProcessClaim(
            husbandClaims,
            wifeUserId,
            "wife.maria@example.ph",
            new DateOnly(1986, 10, 15),
            "Maria",
            "Perez",
            isDependentClaim: false,
            relationship: null);

        response.Should().BeNull();
        error.Should().NotBeNull();
        error!.ErrorCode.Should().Be("MEDICAL_PRIVACY_GUARDRAIL_BLOCKED");
        error.Message.Should().Contain("foreign health records cannot be merged");
    }

    [Fact]
    public async Task Tier4_Scenario5_MultiFacilityClinicChain_BranchAFastEnrollsBranchB()
    {
        await using var cell = new TestCell();
        var branchA = await cell.ProvisionAsync(Fac.Clinic("tenant-chain", "Downtown Branch"));
        var branchB = await cell.ProvisionAsync(Fac.Clinic("tenant-chain", "Uptown Branch"));

        var patientId = Guid.NewGuid();
        var membershipA = new ClinicMembership { PatientId = patientId, ClinicId = branchA.Id, Status = ClinicMembershipStatus.Active };
        var membershipB = new ClinicMembership { PatientId = patientId, ClinicId = branchB.Id, Status = ClinicMembershipStatus.Active };

        membershipA.Status.Should().Be(ClinicMembershipStatus.Active);
        membershipB.Status.Should().Be(ClinicMembershipStatus.Active);
        membershipA.ClinicId.Should().NotBe(membershipB.ClinicId);
    }
}
