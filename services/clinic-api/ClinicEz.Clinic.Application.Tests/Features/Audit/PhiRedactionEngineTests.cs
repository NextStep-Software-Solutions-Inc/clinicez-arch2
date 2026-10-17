namespace ClinicEz.Clinic.Application.Tests.Features.Audit;

using System.Text.Json;
using System.Text.Json.Nodes;
using ClinicEz.Clinic.Application.Common.Privacy;
using ClinicEz.Clinic.Infrastructure.Privacy;
using FluentAssertions;
using Xunit;

public class PhiRedactionEngineTests
{
    private readonly IPhiRedactionService _service = new PhiRedactionService();

    // ── 1. Patient Name Masking Tests ─────────────────────────────────────────
    [Theory]
    [InlineData("Juan Dela Cruz", "J*** D*** C***")]
    [InlineData("John Doe", "J*** D***")]
    [InlineData("Maria Santos", "M*** S***")]
    [InlineData("Cassandra", "C***")]
    [InlineData("Dela Cruz, Juan", "D*** C***, J***")]
    [InlineData("Santos, Maria Clara", "S***, M*** C***")]
    [InlineData("Mary-Jane Watson", "M***-J*** W***")]
    [InlineData("Cassandra A.", "C*** A***")]
    [InlineData(null, "")]
    [InlineData("", "")]
    [InlineData("   ", "")]
    public void MaskPatientName_MasksAllComponentsCorrectly(string? input, string expected)
    {
        var result = _service.MaskPatientName(input);
        result.Should().Be(expected);
    }

    [Fact]
    public void MaskPatientName_WhenAlreadyMasked_IsIdempotent()
    {
        var once = _service.MaskPatientName("Juan Dela Cruz");
        var twice = _service.MaskPatientName(once);
        twice.Should().Be("J*** D*** C***");
    }

    // ── 2. PhilHealth PIN Masking Tests ───────────────────────────────────────
    [Theory]
    [InlineData("12-000005678-9", "12-****5678-9")]
    [InlineData("12-345678901-2", "12-****8901-2")]
    [InlineData("123456789012", "12-****8901-2")]
    [InlineData("12-12345678-9", "12-****5678-9")]
    [InlineData("12-****5678-9", "12-****5678-9")]
    [InlineData(null, "")]
    [InlineData("", "")]
    [InlineData("   ", "")]
    public void MaskPhilHealthPin_MasksMiddleDigits(string? input, string expected)
    {
        var result = _service.MaskPhilHealthPin(input);
        result.Should().Be(expected);
    }

    // ── 3. Phone & Email Masking Tests ────────────────────────────────────────
    [Theory]
    [InlineData("09171234567", "0917****567")]
    [InlineData("+639171234567", "+63917****567")]
    [InlineData("9171234567", "917****567")]
    [InlineData("0281234567", "02****67")]
    [InlineData(null, "")]
    [InlineData("", "")]
    public void MaskPhoneNumber_MasksMiddleDigits(string? input, string expected)
    {
        var result = _service.MaskPhoneNumber(input);
        result.Should().Be(expected);
    }

    [Theory]
    [InlineData("patient@gmail.com", "p***t@gmail.com")]
    [InlineData("juan.delacruz@domain.ph", "j***z@domain.ph")]
    [InlineData("ed@gmail.com", "e***@gmail.com")]
    [InlineData("a@x.com", "a***@x.com")]
    [InlineData("invalid-email", "****")]
    [InlineData(null, "")]
    [InlineData("", "")]
    public void MaskEmail_MasksLocalPart(string? input, string expected)
    {
        var result = _service.MaskEmail(input);
        result.Should().Be(expected);
    }

    // ── 4. Cryptographic Checksum Tests ──────────────────────────────────────
    [Fact]
    public void ComputeTextChecksum_ValidProse_ProducesDeterministicSha256()
    {
        var prose = "Patient reports intermittent coughing and low-grade fever.";
        var hash1 = _service.ComputeTextChecksum(prose);
        var hash2 = _service.ComputeTextChecksum(prose);

        hash1.Should().StartWith("sha256:");
        hash1.Length.Should().Be(7 + 64);
        hash1.Should().Be(hash2);
    }

    // ── 5. Payload JSON Redaction Tests ──────────────────────────────────────
    [Fact]
    public void RedactPayloadJson_MasksSecrets()
    {
        // Arrange
        var rawJson = JsonSerializer.Serialize(new
        {
            password = "SecretPassword123!",
            token = "jwt.token.here",
            apiKey = "prod_api_key_xyz",
            aesKey = "256bitKeyBytes",
            pin = "1234",
            username = "admin_user"
        });

        // Act
        var redactedJson = _service.RedactPayloadJson(rawJson);

        // Assert
        redactedJson.Should().NotContain("SecretPassword123!");
        redactedJson.Should().NotContain("jwt.token.here");
        redactedJson.Should().NotContain("prod_api_key_xyz");
        redactedJson.Should().NotContain("256bitKeyBytes");
        redactedJson.Should().Contain("[REDACTED_SECRET]");
        redactedJson.Should().Contain("admin_user"); // username is preserved
    }

    [Fact]
    public void RedactPayloadJson_RedactsMedicalNarrativeProse()
    {
        // Arrange
        var rawJson = JsonSerializer.Serialize(new
        {
            subjective = "Patient complains of severe chest pain radiating to left arm for 2 hours.",
            objective = "BP 160/100, PR 95. Mild diaphoresis noted.",
            assessment = "Unstable angina rule out acute coronary syndrome.",
            plan = "Emergency sublingual nitroglycerin, urgent ECG, transfer to tertiary hospital.",
            icd10Code = "I20.0",
            bloodPressureSystolic = 160,
            bloodPressureDiastolic = 100
        });

        // Act
        var redactedJson = _service.RedactPayloadJson(rawJson);

        // Assert
        redactedJson.Should().NotContain("Patient complains of severe chest pain");
        redactedJson.Should().NotContain("Mild diaphoresis noted");
        redactedJson.Should().NotContain("Emergency sublingual nitroglycerin");
        redactedJson.Should().Contain("[Clinical Text Redacted - DPA RA 10173]");

        // Preserves structural clinical codes and quantitative metrics
        redactedJson.Should().Contain("I20.0");
        redactedJson.Should().Contain("160");
        redactedJson.Should().Contain("100");
    }

    [Fact]
    public void RedactPayloadJson_DiffObject_RedactsOldAndNewWithChecksums()
    {
        var rawJson = JsonSerializer.Serialize(new
        {
            Subjective = new
            {
                old = "Patient reported mild headache",
                @new = "Headache resolved after hydration"
            },
            Icd10Code = new
            {
                old = "R51",
                @new = "R51"
            }
        });

        var redactedJson = _service.RedactPayloadJson(rawJson);
        var doc = JsonNode.Parse(redactedJson)!.AsObject();

        var subj = doc["Subjective"]!.AsObject();
        subj["old"]!.GetValue<string>().Should().Be(PhiRedactionService.ClinicalRedactedToken);
        subj["new"]!.GetValue<string>().Should().Be(PhiRedactionService.ClinicalRedactedToken);
        subj["oldChecksum"]!.GetValue<string>().Should().StartWith("sha256:");
        subj["newChecksum"]!.GetValue<string>().Should().StartWith("sha256:");

        var icd = doc["Icd10Code"]!.AsObject();
        icd["old"]!.GetValue<string>().Should().Be("R51");
        icd["new"]!.GetValue<string>().Should().Be("R51");
    }

    [Fact]
    public void RedactPayloadJson_EmbeddedJsonString_RedactsNestedRemarks()
    {
        var rawJson = JsonSerializer.Serialize(new
        {
            encounterId = "encounter-123",
            physicalExamFindingsJson = "{\"Skin\":{\"IsNormal\":false,\"Remarks\":\"Eczematous rash on flexor surface\"},\"Heart\":{\"IsNormal\":true}}"
        });

        var redactedJson = _service.RedactPayloadJson(rawJson);
        var doc = JsonNode.Parse(redactedJson)!.AsObject();

        var innerJsonString = doc["physicalExamFindingsJson"]!.GetValue<string>();
        innerJsonString.Should().NotContain("Eczematous rash on flexor surface");
        innerJsonString.Should().Contain("[Clinical Text Redacted - DPA RA 10173]");
        innerJsonString.Should().Contain("IsNormal");
    }

    [Fact]
    public void RedactPayloadJson_PreservesPhilHealthStatutoryMetadata()
    {
        // Arrange
        var rawJson = JsonSerializer.Serialize(new
        {
            caseNo = "C00921202600001",
            transNo = "E00921202600001",
            atcCode = "ATC-KON-2026-001",
            vaccineCode = "BCG",
            doseSequence = 1,
            lotNumber = "LOT-2026-X",
            doctorPan = "PAN-123456789",
            prcLicense = "0098765",
            notes = "Vaccine administered smoothly without immediate adverse reaction."
        });

        // Act
        var redactedJson = _service.RedactPayloadJson(rawJson);

        // Assert
        redactedJson.Should().Contain("C00921202600001");
        redactedJson.Should().Contain("E00921202600001");
        redactedJson.Should().Contain("ATC-KON-2026-001");
        redactedJson.Should().Contain("BCG");
        redactedJson.Should().Contain("LOT-2026-X");
        redactedJson.Should().Contain("PAN-123456789");
        redactedJson.Should().Contain("0098765");
        redactedJson.Should().NotContain("Vaccine administered smoothly");
        redactedJson.Should().Contain("[Clinical Text Redacted - DPA RA 10173]");
    }

    [Fact]
    public void RedactPayloadJson_ComputesCryptographicChecksumsForRedactedProse()
    {
        // Arrange
        var prose = "Confidential patient psychiatric narrative details";
        var rawJson = JsonSerializer.Serialize(new
        {
            clinicalNotes = prose
        });

        // Act
        var redactedJson = _service.RedactPayloadJson(rawJson);

        // Assert
        redactedJson.Should().Contain("sha256:");
        redactedJson.Should().NotContain(prose);
    }
}
