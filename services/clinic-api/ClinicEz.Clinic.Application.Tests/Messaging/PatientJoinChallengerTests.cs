using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Messaging;

/// <summary>
/// Empirical Challenger verification tests for Milestone 1:
/// 1. PhilHealthMod11Validator boundary & edge cases (remainder 0, remainder 1, invalid digits, malformed strings).
/// 2. InteropJson.Options serialization roundtrip of PatientJoinRequestedPayload with DateOnly ISO and nullable dictionaries.
/// 3. Daily queue numbering progression (Q-001, Q-002, Q-003, date resetting, multi-clinic isolation).
/// </summary>
public class PatientJoinChallengerTests
{
    private const string TenantId = "tenant_challenger";

    private static PatientJoinRequestedHandler CreateHandler(ApplicationDbContext db) =>
        new(db, MessagingTestKit.Recipient(db), NullLogger<PatientJoinRequestedHandler>.Instance);

    private static InteropMessageContext Delivered(PatientJoinRequestedPayload payload, Party to, Guid? correlationId = null)
    {
        var corrId = correlationId ?? payload.JoinRequestId ?? Guid.NewGuid();
        return MessagingTestKit.Delivered(
            InteropTypes.PatientJoinRequested,
            Party.Portal,
            to,
            corrId,
            payload);
    }

    private static PatientJoinRequestedPayload BuildMinimalPayload(string firstName, string lastName) =>
        new()
        {
            JoinRequestId = Guid.NewGuid(),
            TenantSlug = "challenger-tenant",
            FacilitySlug = "main-clinic",
            JoinCode = "CHALLENGE2026",
            FirstName = firstName,
            LastName = lastName,
            DateOfBirth = new DateOnly(1990, 1, 1),
            Sex = "Female",
            ContactNumber = "0917-000-0000"
        };

    // =========================================================================
    // 1. PHILHEALTH MOD-11 VALIDATOR TESTS
    // =========================================================================

    [Theory]
    [InlineData("12-345678901-8")] // Known real-world pattern (sum % 11 == 3 -> 11 - 3 = 8)
    [InlineData("10-000000000-5")] // Valid PIN (sum % 11 == 6 -> 11 - 6 = 5)
    [InlineData("01-025000001-0")] // Remainder 1 -> expected 0
    [InlineData("00-000000000-0")] // Remainder 0 -> expected 0
    [InlineData("00-006000000-0")] // Remainder 1 (2 * 6 = 12 % 11 == 1) -> expected 0
    [InlineData("00-005000000-1")] // Remainder 10 (2 * 5 = 10 % 11 == 10) -> expected 11 - 10 = 1
    [InlineData("123456789018")]   // Unhyphenated 12 digits
    [InlineData(" 12-345678901-8 ")] // Leading and trailing whitespace
    public void Mod11_ValidPins_ReturnTrue(string validPin)
    {
        PhilHealthMod11Validator.Validate(validPin).Should().BeTrue();
    }

    [Theory]
    [InlineData("00-000000000-1")] // Remainder 0, expected 0, but check digit is 1
    [InlineData("00-000000000-9")] // Remainder 0, expected 0, but check digit is 9
    [InlineData("00-006000000-1")] // Remainder 1, expected 0, but check digit is 1
    [InlineData("00-006000000-2")] // Remainder 1, expected 0, but check digit is 2
    [InlineData("12-345678901-0")] // Expected 8, got 0
    [InlineData("12-345678901-1")] // Expected 8, got 1
    [InlineData("12-345678901-7")] // Expected 8, got 7
    [InlineData("12-345678901-9")] // Expected 8, got 9
    [InlineData("10-000000000-4")] // Expected 5, got 4
    [InlineData("10-000000000-6")] // Expected 5, got 6
    public void Mod11_InvalidCheckDigits_ReturnFalse(string invalidPin)
    {
        PhilHealthMod11Validator.Validate(invalidPin).Should().BeFalse();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("1")]
    [InlineData("12")]
    [InlineData("12345678901")]    // 11 digits (too short)
    [InlineData("1234567890123")]  // 13 digits (too long)
    [InlineData("12-345678901-89")] // 13 digits formatted
    [InlineData("abcdefghijkl")]   // Non-digits
    [InlineData("12-345678901-A")] // Letter as check digit
    [InlineData("!@#$%^&*()_+")]   // Special symbols
    public void Mod11_MalformedAndNon12DigitStrings_ReturnFalse(string? malformedPin)
    {
        PhilHealthMod11Validator.Validate(malformedPin).Should().BeFalse();
    }

    [Fact]
    public void Mod11_RemainderExhaustiveVerification_AllRemainders0Through10Tested()
    {
        // Weights: [6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
        // Index 4 has weight 2.
        // By choosing d_4 in [0..10] we can produce sum = 2 * d_4:
        // d_4 = 0: sum = 0  -> rem = 0  -> expected = 0
        // d_4 = 6: sum = 12 -> rem = 1  -> expected = 0
        // d_4 = 1: sum = 2  -> rem = 2  -> expected = 9
        // d_4 = 7: sum = 14 -> rem = 3  -> expected = 8
        // d_4 = 2: sum = 4  -> rem = 4  -> expected = 7
        // d_4 = 8: sum = 16 -> rem = 5  -> expected = 6
        // d_4 = 3: sum = 6  -> rem = 6  -> expected = 5
        // d_4 = 9: sum = 18 -> rem = 7  -> expected = 4
        // d_4 = 4: sum = 8  -> rem = 8  -> expected = 3
        // d_4 = 10: not single digit, use d_3=3, d_4=1: sum = 3*3 + 2*1 = 11? 9+2=11 -> rem 0
        // To get rem = 9: d_1=1, d_4=2: 5 + 4 = 9 -> rem 9 -> expected 11 - 9 = 2
        // To get rem = 10: d_4=5: sum = 10 -> rem 10 -> expected 11 - 10 = 1

        var testCases = new (int rem, string pin, int expectedCheck)[]
        {
            (0,  "00000000000" + "0", 0), // sum = 0, rem = 0 -> check digit 0
            (1,  "00006000000" + "0", 0), // sum = 12, rem = 1 -> check digit 0
            (2,  "00001000000" + "9", 9), // sum = 2, rem = 2 -> check digit 9
            (3,  "00007000000" + "8", 8), // sum = 14, rem = 3 -> check digit 8
            (4,  "00002000000" + "7", 7), // sum = 4, rem = 4 -> check digit 7
            (5,  "00008000000" + "6", 6), // sum = 16, rem = 5 -> check digit 6
            (6,  "00003000000" + "5", 5), // sum = 6, rem = 6 -> check digit 5
            (7,  "00009000000" + "4", 4), // sum = 18, rem = 7 -> check digit 4
            (8,  "00004000000" + "3", 3), // sum = 8, rem = 8 -> check digit 3
            (9,  "01002000000" + "2", 2), // sum = 5 + 4 = 9, rem = 9 -> check digit 2
            (10, "00005000000" + "1", 1)  // sum = 10, rem = 10 -> check digit 1
        };

        foreach (var (rem, pin, expectedCheck) in testCases)
        {
            PhilHealthMod11Validator.Validate(pin).Should().BeTrue($"PIN for remainder {rem} with check digit {expectedCheck} must be valid");

            // Also verify that any OTHER check digit is rejected
            for (var c = 0; c <= 9; c++)
            {
                if (c == expectedCheck) continue;
                var corrupted = pin[..11] + c;
                PhilHealthMod11Validator.Validate(corrupted).Should().BeFalse($"PIN for remainder {rem} with invalid check digit {c} must be rejected");
            }
        }
    }

    [Fact]
    public void Mod11_AllSingleDigitCorruptions_AreRejected()
    {
        const string validBase = "12-345678901-8";
        var digits = new string(validBase.Where(char.IsDigit).ToArray());

        for (var i = 0; i < digits.Length; i++)
        {
            var orig = digits[i];
            for (var d = '0'; d <= '9'; d++)
            {
                if (d == orig) continue;
                var corrupted = digits.ToCharArray();
                corrupted[i] = d;
                var pin = new string(corrupted);
                PhilHealthMod11Validator.Validate(pin).Should().BeFalse($"Mutating digit {i} to '{d}' must invalidate check digit");
            }
        }
    }

    // =========================================================================
    // 2. INTEROPJSON SERIALIZATION & DATEONLY ISO FIDELITY
    // =========================================================================

    [Fact]
    public void InteropJson_DateOnlyIsoFormat_SerializesAsYyyyMmDd()
    {
        var payload = new PatientJoinRequestedPayload
        {
            TenantSlug = "slug-tenant",
            FacilitySlug = "slug-facility",
            JoinCode = "CODE123",
            FirstName = "Jose",
            LastName = "Rizal",
            DateOfBirth = new DateOnly(1861, 6, 19),
            Sex = "Male",
            ContactNumber = "0917-111-2222",
            PrincipalDateOfBirth = new DateOnly(1818, 5, 11)
        };

        var json = JsonSerializer.Serialize(payload, InteropJson.Options);

        json.Should().Contain("\"dateOfBirth\":\"1861-06-19\"");
        json.Should().Contain("\"principalDateOfBirth\":\"1818-05-11\"");

        var deserialized = JsonSerializer.Deserialize<PatientJoinRequestedPayload>(json, InteropJson.Options);
        deserialized.Should().NotBeNull();
        deserialized!.DateOfBirth.Should().Be(new DateOnly(1861, 6, 19));
        deserialized.PrincipalDateOfBirth.Should().Be(new DateOnly(1818, 5, 11));
    }

    [Fact]
    public void InteropJson_NullableCustomFields_RoundtripsSuccessfully()
    {
        // 1. Null dictionary
        var payloadNullDict = new PatientJoinRequestedPayload
        {
            TenantSlug = "slug",
            FacilitySlug = "fac",
            JoinCode = "JC",
            FirstName = "A",
            LastName = "B",
            DateOfBirth = new DateOnly(2000, 1, 1),
            Sex = "Other",
            ContactNumber = "0900-000-0000",
            CustomFields = null
        };

        var jsonNull = JsonSerializer.Serialize(payloadNullDict, InteropJson.Options);
        jsonNull.Should().NotContain("\"customFields\""); // Null properties omitted per DefaultIgnoreCondition.WhenWritingNull
        var roundtripNull = JsonSerializer.Deserialize<PatientJoinRequestedPayload>(jsonNull, InteropJson.Options);
        roundtripNull!.CustomFields.Should().BeNull();

        // 2. Populated dictionary with various types
        var complexDict = new Dictionary<string, object?>
        {
            ["int_prop"] = 12345,
            ["str_prop"] = "test-string",
            ["bool_true"] = true,
            ["bool_false"] = false,
            ["null_prop"] = null,
            ["double_val"] = 98.6,
            ["array_val"] = new object?[] { "item1", 42, null }
        };

        var payloadWithDict = payloadNullDict with { CustomFields = complexDict };
        var jsonPopulated = JsonSerializer.Serialize(payloadWithDict, InteropJson.Options);
        var roundtripPopulated = JsonSerializer.Deserialize<PatientJoinRequestedPayload>(jsonPopulated, InteropJson.Options);

        roundtripPopulated.Should().NotBeNull();
        roundtripPopulated!.CustomFields.Should().NotBeNull();
        roundtripPopulated.CustomFields.Should().ContainKey("int_prop");
        roundtripPopulated.CustomFields.Should().ContainKey("str_prop");
        roundtripPopulated.CustomFields.Should().ContainKey("bool_true");
        roundtripPopulated.CustomFields.Should().ContainKey("null_prop");

        // Verify JSON elements deserialize faithfully
        var intElem = (JsonElement)roundtripPopulated.CustomFields!["int_prop"]!;
        intElem.GetInt32().Should().Be(12345);

        var strElem = (JsonElement)roundtripPopulated.CustomFields!["str_prop"]!;
        strElem.GetString().Should().Be("test-string");

        var boolElem = (JsonElement)roundtripPopulated.CustomFields!["bool_true"]!;
        boolElem.GetBoolean().Should().BeTrue();
    }

    [Fact]
    public void InteropJson_FullEnvelopeRoundtrip_PreservesAllPayloadProperties()
    {
        var originalPayload = new PatientJoinRequestedPayload
        {
            JoinRequestId = Guid.NewGuid(),
            TenantSlug = "tenant-e2e",
            FacilitySlug = "main-e2e",
            JoinCode = "E2E2026",
            FirstName = "Maria",
            MiddleName = "Santos",
            LastName = "Dela Cruz",
            Suffix = "III",
            DateOfBirth = new DateOnly(1992, 10, 15),
            Sex = "Female",
            CivilStatus = "Married",
            ContactNumber = "0919-876-5432",
            Email = "maria@example.com",
            Address = "123 Mabini St, Manila",
            PhilHealthPin = "12-345678901-8",
            MemberType = "DD",
            PrincipalMemberPin = "10-000000000-5",
            PrincipalRelationship = "S",
            PrincipalFullName = "Juan Dela Cruz",
            PrincipalDateOfBirth = new DateOnly(1989, 3, 2),
            SeniorCitizenId = "SNR-12345",
            PwdId = "PWD-67890",
            ReasonForVisit = "Pre-employment Medical Examination",
            CustomFields = new Dictionary<string, object?> { ["department"] = "IT Support" },
            Allergies =
            [
                new PatientJoinAllergyItem
                {
                    Allergen = "Ibuprofen",
                    Category = "Medication",
                    Severity = "Severe",
                    IsAnaphylactic = true,
                    OnsetDate = new DateOnly(2010, 5, 1)
                }
            ],
            Attachments =
            [
                new PatientJoinAttachmentItem
                {
                    FileName = "lab_clearance.pdf",
                    FileType = "application/pdf",
                    StorageKey = "quarantine/lab_clearance.pdf",
                    FileSizeBytes = 524288,
                    DocumentDate = new DateOnly(2026, 10, 1)
                }
            ]
        };

        var from = Party.Portal;
        var to = Party.ForFacility("tenant-e2e", Guid.NewGuid().ToString(), FacilityType.Clinic);
        var envelope = InteropEnvelope.Create(
            InteropTypes.PatientJoinRequested,
            from,
            to,
            originalPayload.JoinRequestId.Value,
            originalPayload);

        var restored = envelope.GetPayload<PatientJoinRequestedPayload>();

        restored.Should().NotBeNull();
        restored.TenantSlug.Should().Be("tenant-e2e");
        restored.FacilitySlug.Should().Be("main-e2e");
        restored.FirstName.Should().Be("Maria");
        restored.MiddleName.Should().Be("Santos");
        restored.LastName.Should().Be("Dela Cruz");
        restored.Suffix.Should().Be("III");
        restored.DateOfBirth.Should().Be(new DateOnly(1992, 10, 15));
        restored.MemberType.Should().Be("DD");
        restored.PrincipalMemberPin.Should().Be("10-000000000-5");
        restored.PrincipalRelationship.Should().Be("S");
        restored.PrincipalDateOfBirth.Should().Be(new DateOnly(1989, 3, 2));
        restored.Allergies.Should().HaveCount(1);
        restored.Allergies![0].OnsetDate.Should().Be(new DateOnly(2010, 5, 1));
        restored.Attachments.Should().HaveCount(1);
        restored.Attachments![0].DocumentDate.Should().Be(new DateOnly(2026, 10, 1));
    }

    // =========================================================================
    // 3. DAILY QUEUE NUMBERING PROGRESSION
    // =========================================================================

    [Fact]
    public async Task QueueNumbering_ThreePatientsSameDay_ReceiveAscendingQ001Q002Q003()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var clinic = MessagingTestKit.SeedClinic(db, clinicId, TenantId);
        clinic.FacilitySlug = "main-clinic";
        clinic.IsJoinEnabled = true;
        clinic.JoinCode = "CHALLENGE2026";
        db.SaveChanges();

        var handler = CreateHandler(db);
        var targetParty = MessagingTestKit.ClinicParty(TenantId, clinicId);

        var p1 = BuildMinimalPayload("First", "Patient");
        var p2 = BuildMinimalPayload("Second", "Patient");
        var p3 = BuildMinimalPayload("Third", "Patient");

        await handler.HandleAsync(p1, Delivered(p1, targetParty), CancellationToken.None);
        await handler.HandleAsync(p2, Delivered(p2, targetParty), CancellationToken.None);
        await handler.HandleAsync(p3, Delivered(p3, targetParty), CancellationToken.None);

        var queueItems = await db.QueueItems
            .IgnoreQueryFilters()
            .Where(q => q.ClinicId == clinicId)
            .OrderBy(q => q.SequenceNumber)
            .ToListAsync();

        queueItems.Should().HaveCount(3);
        queueItems[0].SequenceNumber.Should().Be(1);
        queueItems[0].QueueNumber.Should().Be("Q-001");

        queueItems[1].SequenceNumber.Should().Be(2);
        queueItems[1].QueueNumber.Should().Be("Q-002");

        queueItems[2].SequenceNumber.Should().Be(3);
        queueItems[2].QueueNumber.Should().Be("Q-003");
    }

    [Fact]
    public async Task QueueNumbering_TenPatientsSameDay_ReceiveSequentialNumbersThroughQ010()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var clinic = MessagingTestKit.SeedClinic(db, clinicId, TenantId);
        clinic.FacilitySlug = "main-clinic";
        clinic.IsJoinEnabled = true;
        clinic.JoinCode = "CHALLENGE2026";
        db.SaveChanges();

        var handler = CreateHandler(db);
        var targetParty = MessagingTestKit.ClinicParty(TenantId, clinicId);

        for (var i = 1; i <= 10; i++)
        {
            var p = BuildMinimalPayload($"Patient{i}", "Test");
            await handler.HandleAsync(p, Delivered(p, targetParty), CancellationToken.None);
        }

        var queueItems = await db.QueueItems
            .IgnoreQueryFilters()
            .Where(q => q.ClinicId == clinicId)
            .OrderBy(q => q.SequenceNumber)
            .ToListAsync();

        queueItems.Should().HaveCount(10);
        for (var i = 1; i <= 10; i++)
        {
            queueItems[i - 1].SequenceNumber.Should().Be(i);
            queueItems[i - 1].QueueNumber.Should().Be($"Q-{i:D3}");
        }
    }

    [Fact]
    public async Task QueueNumbering_ResetsAcrossDifferentDates()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var clinic = MessagingTestKit.SeedClinic(db, clinicId, TenantId);
        clinic.FacilitySlug = "main-clinic";
        clinic.IsJoinEnabled = true;
        clinic.JoinCode = "CHALLENGE2026";

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var yesterday = today.AddDays(-1);

        // Seed yesterday's queue items up to Q-005
        for (var seq = 1; seq <= 5; seq++)
        {
            db.QueueItems.Add(new QueueItem
            {
                Id = Guid.NewGuid(),
                TenantId = TenantId,
                ClinicId = clinicId,
                PatientId = Guid.NewGuid(),
                PatientName = $"Yesterday Patient {seq}",
                QueueDate = yesterday,
                SequenceNumber = seq,
                QueueNumber = $"Q-{seq:D3}",
                Priority = QueuePriority.Routine,
                Status = QueueStatus.Completed,
                CheckInTime = DateTime.UtcNow.AddDays(-1),
                CreatedAt = DateTime.UtcNow.AddDays(-1),
                CreatedBy = "seed"
            });
        }
        db.SaveChanges();

        // Ingest a patient today
        var handler = CreateHandler(db);
        var targetParty = MessagingTestKit.ClinicParty(TenantId, clinicId);
        var pToday = BuildMinimalPayload("Today", "Patient");

        await handler.HandleAsync(pToday, Delivered(pToday, targetParty), CancellationToken.None);

        var todayItems = await db.QueueItems
            .IgnoreQueryFilters()
            .Where(q => q.ClinicId == clinicId && q.QueueDate == today)
            .ToListAsync();

        todayItems.Should().ContainSingle();
        todayItems[0].SequenceNumber.Should().Be(1, "today queue sequence must reset to 1 regardless of yesterday's sequence count");
        todayItems[0].QueueNumber.Should().Be("Q-001");
    }

    [Fact]
    public async Task QueueNumbering_MultiClinicIsolation_ClinicsDoNotCollideSequences()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinic1Id = Guid.NewGuid();
        var clinic2Id = Guid.NewGuid();

        var clinic1 = MessagingTestKit.SeedClinic(db, clinic1Id, TenantId, "Clinic 1");
        clinic1.FacilitySlug = "clinic-1";
        clinic1.IsJoinEnabled = true;
        clinic1.JoinCode = "CODE1";

        var clinic2 = MessagingTestKit.SeedClinic(db, clinic2Id, TenantId, "Clinic 2");
        clinic2.FacilitySlug = "clinic-2";
        clinic2.IsJoinEnabled = true;
        clinic2.JoinCode = "CODE2";
        db.SaveChanges();

        var handler = CreateHandler(db);
        var party1 = MessagingTestKit.ClinicParty(TenantId, clinic1Id);
        var party2 = MessagingTestKit.ClinicParty(TenantId, clinic2Id);

        // Ingest 2 patients at Clinic 1
        var p1_1 = BuildMinimalPayload("C1-P1", "User") with { FacilitySlug = "clinic-1", JoinCode = "CODE1" };
        var p1_2 = BuildMinimalPayload("C1-P2", "User") with { FacilitySlug = "clinic-1", JoinCode = "CODE1" };
        await handler.HandleAsync(p1_1, Delivered(p1_1, party1), CancellationToken.None);
        await handler.HandleAsync(p1_2, Delivered(p1_2, party1), CancellationToken.None);

        // Ingest 1 patient at Clinic 2
        var p2_1 = BuildMinimalPayload("C2-P1", "User") with { FacilitySlug = "clinic-2", JoinCode = "CODE2" };
        await handler.HandleAsync(p2_1, Delivered(p2_1, party2), CancellationToken.None);

        var c1Items = await db.QueueItems.IgnoreQueryFilters().Where(q => q.ClinicId == clinic1Id).OrderBy(q => q.SequenceNumber).ToListAsync();
        var c2Items = await db.QueueItems.IgnoreQueryFilters().Where(q => q.ClinicId == clinic2Id).OrderBy(q => q.SequenceNumber).ToListAsync();

        c1Items.Should().HaveCount(2);
        c1Items[0].QueueNumber.Should().Be("Q-001");
        c1Items[1].QueueNumber.Should().Be("Q-002");

        c2Items.Should().ContainSingle();
        c2Items[0].SequenceNumber.Should().Be(1, "Clinic 2 must start its own sequence at 1");
        c2Items[0].QueueNumber.Should().Be("Q-001");
    }
}
