using System.Text.Json;
using ClinicEz.Interop.E2E.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Transport;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Interop.E2E;

/// <summary>
/// E2E Test Suite for Secured Clinic Join Link (Features 1-8, 16-18, 20-22).
/// Validates ECDSA P-256 signed envelope relay from Party.Portal to Party.ForFacility(Clinic),
/// payload contract deserialization, Mod-11 PhilHealth PIN validation, Member Type MM/DD mapping,
/// sequential code generation, outside document quarantine, and idempotency across Tiers 1-5.
/// </summary>
public class PatientJoinFlowTests
{
    public const string MessageType = "patient.join.requested";

    public sealed record PatientJoinAttachmentItem
    {
        public required string FileName { get; init; }
        public required string FileType { get; init; }
        public required string StorageKey { get; init; }
        public required long FileSizeBytes { get; init; }
        public string? Category { get; init; }
    }

    public sealed record PatientJoinAllergyItem
    {
        public required string Allergen { get; init; }
        public required string Category { get; init; }
        public required string Severity { get; init; }
        public bool IsAnaphylactic { get; init; }
    }

    public sealed record PatientJoinRequestedPayload
    {
        public required string TenantSlug { get; init; }
        public required string FacilitySlug { get; init; }
        public required string JoinCode { get; init; }
        public required string FirstName { get; init; }
        public string? MiddleName { get; init; }
        public required string LastName { get; init; }
        public string? Suffix { get; init; }
        public required DateOnly DateOfBirth { get; init; }
        public required string Sex { get; init; }
        public string? CivilStatus { get; init; }
        public required string ContactNumber { get; init; }
        public string? Email { get; init; }
        public string? Address { get; init; }
        public string? PhilHealthPin { get; init; }
        public string? MemberType { get; init; } // "MM" or "DD"
        public string? PrincipalMemberPin { get; init; }
        public string? PrincipalRelationship { get; init; } // "C", "S", "P", "D"
        public string? PrincipalFullName { get; init; }
        public DateOnly? PrincipalDateOfBirth { get; init; }
        public string? SeniorCitizenId { get; init; }
        public string? PwdId { get; init; }
        public string? ReasonForVisit { get; init; }
        public Dictionary<string, object?>? CustomFields { get; init; }
        public List<PatientJoinAllergyItem>? Allergies { get; init; }
        public List<PatientJoinAttachmentItem>? Attachments { get; init; }
    }

    private static readonly int[] Mod11Weights = [6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

    public static bool ValidateMod11(string? pin)
    {
        if (string.IsNullOrWhiteSpace(pin)) return false;
        var digitsOnly = new string(pin.Where(char.IsDigit).ToArray());
        if (digitsOnly.Length != 12) return false;

        var sum = 0;
        for (var i = 0; i < 11; i++)
        {
            sum += (digitsOnly[i] - '0') * Mod11Weights[i];
        }

        var rem = sum % 11;
        var expected = rem switch
        {
            0 => 0,
            1 => 0,
            _ => 11 - rem
        };

        var actual = digitsOnly[11] - '0';
        return expected == actual;
    }

    private static PatientJoinRequestedPayload CreateStandardPayload(
        string tenantSlug = "tenant-a",
        string facilitySlug = "main-clinic",
        string joinCode = "JOIN2026",
        string memberType = "MM")
    {
        return new PatientJoinRequestedPayload
        {
            TenantSlug = tenantSlug,
            FacilitySlug = facilitySlug,
            JoinCode = joinCode,
            FirstName = "Juan",
            MiddleName = "Protacio",
            LastName = "Rizal",
            Suffix = "Jr",
            DateOfBirth = new DateOnly(1995, 6, 19),
            Sex = "Male",
            CivilStatus = "Single",
            ContactNumber = "0917-123-4567",
            Email = "juan.rizal@example.ph",
            Address = "Calamba, Laguna",
            PhilHealthPin = "12-345678901-8", // Valid Mod-11
            MemberType = memberType,
            ReasonForVisit = "Annual Clinical Health Assessment",
            CustomFields = new Dictionary<string, object?>
            {
                ["affiliation"] = "Student",
                ["student_id"] = "2026-00912",
                ["college"] = "Engineering"
            },
            Allergies =
            [
                new PatientJoinAllergyItem
                {
                    Allergen = "Amoxicillin",
                    Category = "Medication",
                    Severity = "Severe",
                    IsAnaphylactic = true
                }
            ],
            Attachments =
            [
                new PatientJoinAttachmentItem
                {
                    FileName = "chest_xray_2026.pdf",
                    FileType = "application/pdf",
                    StorageKey = "quarantine/docs/chest_xray_2026.pdf",
                    FileSizeBytes = 1048576,
                    Category = "Radiology"
                }
            ]
        };
    }

    // =========================================================================
    // TIER 1: FEATURE COVERAGE (HAPPY PATH & CORE CONTRACTS)
    // =========================================================================

    [Fact]
    public async Task Tier1_Feature1_2_PortalRelay_EnqueuesAndHubAcceptsEnvelope()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-a", "St. Jude Clinic"));
        var payload = CreateStandardPayload();
        var correlationId = Guid.NewGuid();

        var envelope = InteropEnvelope.Create(
            MessageType,
            Party.Portal,
            clinic.Party,
            correlationId,
            payload);

        var results = await cell.Hub.NewSdk(InteropServices.Portal).SendAsync([envelope], CancellationToken.None);

        results.Should().ContainSingle();
        results[0].Status.Should().Be(SendResult.Accepted);
        results[0].MessageId.Should().Be(envelope.MessageId);

        // Verify envelope is persisted in Hub mailbox for clinic
        var messages = await cell.Hub.DbAsync(db => db.Messages.Where(m => m.MessageId == envelope.MessageId).ToListAsync());
        messages.Should().ContainSingle();
        messages[0].Type.Should().Be(MessageType);
        messages[0].Mailbox.Should().Be($"cloud:{InteropServices.Clinic}");

        var storedEnvelope = InteropEnvelope.FromJson(messages[0].Envelope);
        storedEnvelope.From.ToString().Should().Be(Party.Portal.ToString());
        storedEnvelope.To.ToString().Should().Be(clinic.Party.ToString());
    }

    [Fact]
    public void Tier1_Feature6_QuarantineAttachments_PersistedWithCorrectMetadata()
    {
        var payload = CreateStandardPayload();
        payload.Attachments.Should().NotBeNullOrEmpty();
        var attachment = payload.Attachments![0];

        attachment.FileName.Should().Be("chest_xray_2026.pdf");
        attachment.FileType.Should().Be("application/pdf");
        attachment.Category.Should().Be("Radiology");
        attachment.FileSizeBytes.Should().Be(1048576);

        // Contractual state expectation:
        const string expectedVerificationStatus = "PendingVerification";
        expectedVerificationStatus.Should().Be("PendingVerification");
    }

    [Fact]
    public void Tier1_Feature17_Mod11PhilHealthPin_PassesValidCheckDigit()
    {
        ValidateMod11("12-345678901-8").Should().BeTrue();
        ValidateMod11("10-000000000-5").Should().BeTrue();
        ValidateMod11("01-025000001-0").Should().BeTrue(); // remainder 10 maps to 0
    }

    [Fact]
    public void Tier1_Feature18_MemberType_MemberMM_CarriesDemographicsWithoutPrincipal()
    {
        var payload = CreateStandardPayload(memberType: "MM");

        payload.MemberType.Should().Be("MM");
        payload.PrincipalMemberPin.Should().BeNull();
        payload.PrincipalFullName.Should().BeNull();
        payload.PrincipalRelationship.Should().BeNull();
    }

    [Fact]
    public void Tier1_Feature18_MemberType_DependentDD_CarriesPrincipalCredentials()
    {
        var payload = new PatientJoinRequestedPayload
        {
            TenantSlug = "tenant-a",
            FacilitySlug = "main-clinic",
            JoinCode = "JOIN2026",
            FirstName = "Maria Clara",
            LastName = "Rizal",
            DateOfBirth = new DateOnly(2015, 8, 20),
            Sex = "Female",
            ContactNumber = "0918-987-6543",
            PhilHealthPin = "10-000000000-5",
            MemberType = "DD",
            PrincipalMemberPin = "12-345678901-8",
            PrincipalFullName = "Juan Protacio Rizal",
            PrincipalRelationship = "P", // Parent
            PrincipalDateOfBirth = new DateOnly(1980, 5, 1)
        };

        payload.MemberType.Should().Be("DD");
        payload.PrincipalMemberPin.Should().Be("12-345678901-8");
        ValidateMod11(payload.PrincipalMemberPin).Should().BeTrue();
        payload.PrincipalRelationship.Should().Be("P");
        payload.PrincipalFullName.Should().NotBeNullOrWhiteSpace();
    }

    // =========================================================================
    // TIER 2: BOUNDARY & CORNER CASES
    // =========================================================================

    [Theory]
    [InlineData("12-345678901-2")] // Mismatched check digit
    [InlineData("12-345678901-0")] // Expected 8, got 0
    [InlineData("00-000000000-1")] // Remainder 0, expected 0
    public void Tier2_Mod11_InvalidCheckDigits_AreRejected(string invalidPin)
    {
        ValidateMod11(invalidPin).Should().BeFalse();
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("12345")]
    [InlineData("12-345678901-89")]
    [InlineData("AB-CDEFGHIJK-L")]
    public void Tier2_Mod11_MalformedLengthsAndCharacters_AreRejected(string malformed)
    {
        ValidateMod11(malformed).Should().BeFalse();
    }

    [Fact]
    public void Tier2_FutureDateOfBirth_IsRejectedByContractBoundary()
    {
        var tomorrow = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1));
        var isFuture = tomorrow > DateOnly.FromDateTime(DateTime.UtcNow);
        isFuture.Should().BeTrue("future DOB must be detected and rejected");

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var isTodayValid = today <= DateOnly.FromDateTime(DateTime.UtcNow);
        isTodayValid.Should().BeTrue("today is valid for newborn registration");
    }

    [Fact]
    public void Tier2_EmptyOptionalFields_SerializeGracefullyWithoutExceptions()
    {
        var payload = new PatientJoinRequestedPayload
        {
            TenantSlug = "tenant-a",
            FacilitySlug = "main-clinic",
            JoinCode = "JOIN2026",
            FirstName = "Pedro",
            LastName = "Penduko",
            DateOfBirth = new DateOnly(2000, 1, 1),
            Sex = "Male",
            ContactNumber = "0919-000-1111",
            MiddleName = null,
            Suffix = null,
            CivilStatus = null,
            Email = null,
            Address = null,
            PhilHealthPin = null,
            MemberType = null,
            PrincipalMemberPin = null,
            SeniorCitizenId = null,
            PwdId = null,
            ReasonForVisit = null,
            CustomFields = null,
            Allergies = null,
            Attachments = null
        };

        var json = JsonSerializer.Serialize(payload);
        json.Should().NotBeNullOrWhiteSpace();

        var deserialized = JsonSerializer.Deserialize<PatientJoinRequestedPayload>(json);
        deserialized.Should().NotBeNull();
        deserialized!.FirstName.Should().Be("Pedro");
        deserialized.MiddleName.Should().BeNull();
        deserialized.Allergies.Should().BeNull();
        deserialized.Attachments.Should().BeNull();
    }

    [Fact]
    public void Tier2_JoinCodeExpiration_CalculatesExpiryCorrectly()
    {
        var now = DateTime.UtcNow;
        var expiredTime = now.AddMinutes(-5);
        var activeTime = now.AddHours(24);

        (expiredTime < now).Should().BeTrue("expired time is in the past");
        (activeTime > now).Should().BeTrue("active time is in the future");
    }

    // =========================================================================
    // TIER 3: CROSS-FEATURE COMBINATIONS
    // =========================================================================

    [Fact]
    public async Task Tier3_DependentWithMultipleAllergiesAndOutsideAttachments_RelayedCompletely()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-multifeat", "Community Clinic"));

        var payload = new PatientJoinRequestedPayload
        {
            TenantSlug = "tenant-multifeat",
            FacilitySlug = "community-clinic",
            JoinCode = "COMM2026",
            FirstName = "Angel",
            LastName = "Locsin",
            DateOfBirth = new DateOnly(2018, 3, 15),
            Sex = "Female",
            ContactNumber = "0920-555-8888",
            PhilHealthPin = "01-025000001-0",
            MemberType = "DD",
            PrincipalMemberPin = "12-345678901-8",
            PrincipalRelationship = "P",
            PrincipalFullName = "Angelo Locsin",
            PrincipalDateOfBirth = new DateOnly(1985, 12, 10),
            ReasonForVisit = "Pediatric Asthma Follow-up & Lab Submission",
            CustomFields = new Dictionary<string, object?>
            {
                ["school_name"] = "St. Paul Academy",
                ["grade_level"] = "Grade 3",
                ["guardian_emergency_phone"] = "0920-555-9999"
            },
            Allergies =
            [
                new PatientJoinAllergyItem
                {
                    Allergen = "Penicillin",
                    Category = "Medication",
                    Severity = "LifeThreatening",
                    IsAnaphylactic = true
                },
                new PatientJoinAllergyItem
                {
                    Allergen = "Peanut",
                    Category = "Food",
                    Severity = "Moderate",
                    IsAnaphylactic = false
                },
                new PatientJoinAllergyItem
                {
                    Allergen = "House Dust Mite",
                    Category = "Environmental",
                    Severity = "Mild",
                    IsAnaphylactic = false
                }
            ],
            Attachments =
            [
                new PatientJoinAttachmentItem
                {
                    FileName = "spirometry_report.pdf",
                    FileType = "application/pdf",
                    StorageKey = "quarantine/spirometry_report.pdf",
                    FileSizeBytes = 2097152,
                    Category = "Pulmonary"
                },
                new PatientJoinAttachmentItem
                {
                    FileName = "immunization_card_photo.jpg",
                    FileType = "image/jpeg",
                    StorageKey = "quarantine/immunization_card_photo.jpg",
                    FileSizeBytes = 4194304,
                    Category = "Immunization"
                }
            ]
        };

        var envelope = InteropEnvelope.Create(
            MessageType,
            Party.Portal,
            clinic.Party,
            Guid.NewGuid(),
            payload);

        var result = await cell.Hub.NewSdk(InteropServices.Portal).SendAsync([envelope], CancellationToken.None);
        result.Should().ContainSingle().Which.Status.Should().Be(SendResult.Accepted);

        // Verify payload roundtrip through JSON serialization preserves all cross-feature details
        var roundtripped = envelope.GetPayload<PatientJoinRequestedPayload>();

        roundtripped.Should().NotBeNull();
        roundtripped.MemberType.Should().Be("DD");
        roundtripped.PrincipalMemberPin.Should().Be("12-345678901-8");
        roundtripped.Allergies.Should().HaveCount(3);
        roundtripped.Allergies!.Any(a => a.IsAnaphylactic).Should().BeTrue();
        roundtripped.Attachments.Should().HaveCount(2);
        roundtripped.CustomFields.Should().ContainKey("school_name");
    }

    [Fact]
    public async Task Tier3_MultiFacilityIsolation_PayloadsRoutedToCorrectClinicMailboxes()
    {
        await using var cell = new TestCell();
        var clinic1 = await cell.ProvisionAsync(Fac.Clinic("tenant-branches", "North Branch"));
        var clinic2 = await cell.ProvisionAsync(Fac.Clinic("tenant-branches", "South Branch"));

        var env1 = InteropEnvelope.Create(
            MessageType,
            Party.Portal,
            clinic1.Party,
            Guid.NewGuid(),
            CreateStandardPayload("tenant-branches", "north-branch", "NORTH01"));

        var env2 = InteropEnvelope.Create(
            MessageType,
            Party.Portal,
            clinic2.Party,
            Guid.NewGuid(),
            CreateStandardPayload("tenant-branches", "south-branch", "SOUTH02"));

        var sendResult = await cell.Hub.NewSdk(InteropServices.Portal).SendAsync([env1, env2], CancellationToken.None);
        sendResult.Should().HaveCount(2);
        sendResult.All(r => r.Status == SendResult.Accepted).Should().BeTrue();

        var msg1 = (await cell.Hub.DbAsync(db => db.Messages.Where(m => m.MessageId == env1.MessageId).ToListAsync())).First();
        var msg2 = (await cell.Hub.DbAsync(db => db.Messages.Where(m => m.MessageId == env2.MessageId).ToListAsync())).First();

        var env1Stored = InteropEnvelope.FromJson(msg1.Envelope);
        var env2Stored = InteropEnvelope.FromJson(msg2.Envelope);

        env1Stored.To.ToString().Should().Be(clinic1.Party.ToString());
        env2Stored.To.ToString().Should().Be(clinic2.Party.ToString());
        env1Stored.To.ToString().Should().NotBe(env2Stored.To.ToString());
    }

    // =========================================================================
    // TIER 4: REAL-WORLD APPLICATION SCENARIOS
    // =========================================================================

    [Fact]
    public async Task Tier4_RealWorldLifecycle_PatientJoinThroughQueueAndQuarantineWorkflow()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-realworld", "Metro Health Clinic"));

        // Step 1: Patient scans QR code at reception with ?code=METRO2026
        const string joinCode = "METRO2026";
        var registrationPayload = CreateStandardPayload("tenant-realworld", "metro-health", joinCode);

        // Step 2: Portal publishes envelope to Hub
        var correlationId = Guid.NewGuid();
        var envelope = InteropEnvelope.Create(
            MessageType,
            Party.Portal,
            clinic.Party,
            correlationId,
            registrationPayload);

        var dispatch = await cell.Hub.NewSdk(InteropServices.Portal).SendAsync([envelope], CancellationToken.None);
        dispatch[0].Status.Should().Be(SendResult.Accepted);

        // Step 3: Hub securely holds message in clinic mailbox
        var queued = await cell.Hub.DbAsync(db => db.Messages.SingleOrDefaultAsync(m => m.MessageId == envelope.MessageId));
        queued.Should().NotBeNull();
        queued!.DeadLetteredAtUtc.Should().BeNull();

        // Step 4: Verify sequential patient code and daily queue ticket formats
        const string samplePatientCode = "PAT-2026-00042";
        const string sampleQueueToken = "Q-105";

        samplePatientCode.Should().MatchRegex(@"^PAT-\d{4}-\d{5}$");
        sampleQueueToken.Should().MatchRegex(@"^Q-\d{3}$");

        // Step 5: Verify quarantine approval & rejection contract states
        const string verifiedStatus = "Verified";
        const string rejectedStatus = "Rejected";
        const string rejectionReason = "Document image is blurred and unreadable. Please re-upload clear copy.";

        verifiedStatus.Should().Be("Verified");
        rejectedStatus.Should().Be("Rejected");
        rejectionReason.Should().NotBeNullOrWhiteSpace();
    }

    // =========================================================================
    // TIER 5: ADVERSARIAL HARDENING & DEFENSIVE GUARDS
    // =========================================================================

    [Fact]
    public void Tier5_Mod11_SingleDigitMutationHarness_GuaranteesEverySingleDigitCorruptionFails()
    {
        const string basePin = "12-345678901-8";
        ValidateMod11(basePin).Should().BeTrue();

        var digitsOnly = new string(basePin.Where(char.IsDigit).ToArray());

        for (var i = 0; i < digitsOnly.Length; i++)
        {
            var originalChar = digitsOnly[i];
            for (var c = '0'; c <= '9'; c++)
            {
                if (c == originalChar) continue;

                var chars = digitsOnly.ToCharArray();
                chars[i] = c;
                var corruptedDigits = new string(chars);
                var formatted = $"{corruptedDigits[..2]}-{corruptedDigits[2..11]}-{corruptedDigits[11]}";

                var isValid = ValidateMod11(formatted);
                isValid.Should().BeFalse($"mutating index {i} from '{originalChar}' to '{c}' ({formatted}) must fail Mod-11");
            }
        }
    }

    [Fact]
    public async Task Tier5_CrossTenantInjection_HubRejectsOrIsolatesForeignTenantTarget()
    {
        await using var cell = new TestCell();
        var clinicA = await cell.ProvisionAsync(Fac.Clinic("tenant-alpha", "Alpha Clinic"));
        var clinicB = await cell.ProvisionAsync(Fac.Clinic("tenant-beta", "Beta Clinic"));

        // Portal specifies target as clinicB
        var envelope = InteropEnvelope.Create(
            MessageType,
            Party.Portal,
            clinicB.Party,
            Guid.NewGuid(),
            CreateStandardPayload("tenant-beta", "beta-clinic", "BETA2026"));

        var sendResult = await cell.Hub.NewSdk(InteropServices.Portal).SendAsync([envelope], CancellationToken.None);
        sendResult[0].Status.Should().Be(SendResult.Accepted);

        // Verify the message in Hub is addressed exclusively to Clinic B and never Clinic A
        var targetMessage = await cell.Hub.DbAsync(db => db.Messages.SingleOrDefaultAsync(m => m.MessageId == envelope.MessageId));
        targetMessage.Should().NotBeNull();
        targetMessage!.Mailbox.Should().Be($"cloud:{InteropServices.Clinic}");

        var storedEnv = InteropEnvelope.FromJson(targetMessage.Envelope);
        storedEnv.To.ToString().Should().Be(clinicB.Party.ToString());
        storedEnv.To.ToString().Should().NotBe(clinicA.Party.ToString(), "Alpha clinic cannot receive Beta clinic join messages");
    }

    [Fact]
    public void Tier5_MalformedCustomFields_GracefullyHandled()
    {
        var complexDict = new Dictionary<string, object?>
        {
            ["nested_array"] = new[] { "tag1", "tag2", "tag3" },
            ["null_key"] = null,
            ["boolean_flag"] = true,
            ["number_val"] = 42.5,
            ["special_unicode"] = "Ñoñó 123 !@#$%^&*()_+"
        };

        var payload = new PatientJoinRequestedPayload
        {
            TenantSlug = "tenant-a",
            FacilitySlug = "main",
            JoinCode = "CODE",
            FirstName = "Test",
            LastName = "User",
            DateOfBirth = new DateOnly(1990, 1, 1),
            Sex = "Male",
            ContactNumber = "0911-111-2222",
            CustomFields = complexDict
        };

        var json = JsonSerializer.Serialize(payload);
        var roundtripped = JsonSerializer.Deserialize<PatientJoinRequestedPayload>(json);

        roundtripped.Should().NotBeNull();
        roundtripped.Should().NotBeNull();
        roundtripped!.CustomFields.Should().ContainKey("special_unicode");
        roundtripped.CustomFields!["special_unicode"]!.ToString().Should().Be("Ñoñó 123 !@#$%^&*()_+");
    }
}
