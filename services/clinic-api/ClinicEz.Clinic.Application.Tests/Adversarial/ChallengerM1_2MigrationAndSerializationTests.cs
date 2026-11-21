using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Infrastructure.Migrations;
using FluentAssertions;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Empirical Adversarial Verification Suite for Milestone 1 Challenger 2:
/// Migration Schema, SQL Backfill Edge Cases, Down Reversibility, and DTO JSON Round-Tripping.
/// </summary>
public class ChallengerM1_2MigrationAndSerializationTests
{
    // =========================================================================
    // SECTION 1: MIGRATION CLASS STRUCTURE & OPERATIONS VERIFICATION
    // =========================================================================

    [Fact]
    public void Migration_InitialCreate_UpOperations_ContainsPure1NfTablesAndIndexes()
    {
        // Arrange
        var migration = new InitialCreate();
        var migrationBuilder = new MigrationBuilder("Npgsql");

        // Act - invoke protected Up via reflection
        var upMethod = typeof(InitialCreate)
            .GetMethod("Up", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
        upMethod.Should().NotBeNull();
        upMethod!.Invoke(migration, new object[] { migrationBuilder });

        // Assert operations include 1NF tables and indexes
        var createTables = migrationBuilder.Operations.OfType<CreateTableOperation>().ToList();
        createTables.Should().Contain(t => t.Name == "PatientPhilHealthMemberships");
        createTables.Should().Contain(t => t.Name == "PatientYakapEnlistments");
        createTables.Should().Contain(t => t.Name == "PatientSocialHistories");
        createTables.Should().Contain(t => t.Name == "PatientReproductiveHistories");

        var createIndexes = migrationBuilder.Operations.OfType<CreateIndexOperation>().ToList();
        // Jsonb GIN index on Patient.CustomFields
        createIndexes.Should().Contain(i => i.Table == "Patients" && i.Name == "IX_Patients_CustomFields");
        // Filtered unique index on DoctorScheduleTemplate
        createIndexes.Should().Contain(i => i.Table == "DoctorScheduleTemplates" && i.IsUnique && i.Filter != null && i.Filter.Contains("IsDeleted"));
    }

    [Fact]
    public void Migration_InitialCreate_DownOperations_DropsTablesAndIndexes()
    {
        // Arrange
        var migration = new InitialCreate();
        var migrationBuilder = new MigrationBuilder("Npgsql");

        // Act - invoke protected Down via reflection
        var downMethod = typeof(InitialCreate)
            .GetMethod("Down", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
        downMethod.Should().NotBeNull();
        downMethod!.Invoke(migration, new object[] { migrationBuilder });

        var dropTables = migrationBuilder.Operations.OfType<DropTableOperation>().ToList();
        dropTables.Should().Contain(t => t.Name == "PatientPhilHealthMemberships");
        dropTables.Should().Contain(t => t.Name == "PatientYakapEnlistments");
        dropTables.Should().Contain(t => t.Name == "PatientSocialHistories");
        dropTables.Should().Contain(t => t.Name == "PatientReproductiveHistories");
    }

    // =========================================================================
    // SECTION 2: SQL BACKFILL LOGIC SIMULATION & EDGE CASES
    // =========================================================================

    /// <summary>
    /// Oracle simulating the exact SQL semantics of the Up migration backfill script:
    /// - COALESCE(NULLIF(trim(CustomFields), ''), '{}')::jsonb || jsonb_strip_nulls(jsonb_build_object(...))
    /// - Regex (20[2-9][0-9]) year extraction
    /// - Fallback to CreatedAt year
    /// - CaseNo, EnlistmentNo, ProfilingTransNo null stripping
    /// </summary>
    private static Dictionary<string, object?> SimulateSqlUpMigration(
        string? addressLine,
        string? barangay,
        string? city,
        string? province,
        string? emergencyContactName,
        string? emergencyContactPhone,
        string? emergencyContactRelationship,
        string? philHealthCaseNo,
        string? philHealthEnlistmentNo,
        string? philHealthProfilingTransNo,
        DateTime createdAt,
        string? existingCustomFieldsJson)
    {
        // 1. Parse existing CustomFields
        Dictionary<string, object?> target;
        if (string.IsNullOrWhiteSpace(existingCustomFieldsJson) || existingCustomFieldsJson.Trim() == "{}")
        {
            target = new Dictionary<string, object?>();
        }
        else
        {
            target = JsonSerializer.Deserialize<Dictionary<string, object?>>(existingCustomFieldsJson) ?? new();
        }

        // Helper for NULLIF(trim(val), '')
        static string? NullIfTrim(string? val) => string.IsNullOrWhiteSpace(val) ? null : val.Trim();

        var cleanAddr = NullIfTrim(addressLine);
        var cleanBrgy = NullIfTrim(barangay);
        var cleanCity = NullIfTrim(city);
        var cleanProv = NullIfTrim(province);
        var cleanEmName = NullIfTrim(emergencyContactName);
        var cleanEmPhone = NullIfTrim(emergencyContactPhone);
        var cleanEmRel = NullIfTrim(emergencyContactRelationship);

        var cleanCase = NullIfTrim(philHealthCaseNo);
        var cleanEnlist = NullIfTrim(philHealthEnlistmentNo);
        var cleanProf = NullIfTrim(philHealthProfilingTransNo);

        if (cleanAddr != null) target["primary_address_line"] = cleanAddr;
        if (cleanBrgy != null) target["primary_barangay"] = cleanBrgy;
        if (cleanCity != null) target["primary_city"] = cleanCity;
        if (cleanProv != null) target["primary_province"] = cleanProv;
        if (cleanEmName != null) target["emergency_contact_name"] = cleanEmName;
        if (cleanEmPhone != null) target["emergency_contact_phone"] = cleanEmPhone;
        if (cleanEmRel != null) target["emergency_contact_relationship"] = cleanEmRel;

        if (cleanCase != null || cleanEnlist != null || cleanProf != null)
        {
            // If already an array in existing customFields, keep it
            if (target.TryGetValue("yakap_enlistments", out var existingArray) && existingArray != null)
            {
                // Preserve
            }
            else
            {
                // Extract year via regex (20[2-9][0-9])
                var candidate = cleanCase ?? cleanEnlist ?? cleanProf;
                var match = Regex.Match(candidate ?? "", @"(20[2-9][0-9])");
                var effectiveYear = match.Success ? int.Parse(match.Value) : createdAt.Year;
                var validUntil = $"{effectiveYear}-12-31";

                var entry = new Dictionary<string, object?>
                {
                    ["enlisted_at"] = createdAt.ToString("yyyy-MM-dd"),
                    ["valid_until"] = validUntil,
                    ["effective_year"] = effectiveYear,
                    ["status"] = "Active",
                    ["source"] = "ClinicEnlistment",
                    ["case_no"] = cleanCase,
                    ["enlistment_no"] = cleanEnlist,
                    ["profiling_trans_no"] = cleanProf
                };

                target["yakap_enlistments"] = new List<Dictionary<string, object?>> { entry };
            }
        }

        return target;
    }

    /// <summary>
    /// Oracle simulating the exact SQL semantics of the Down migration reverse script:
    /// Re-populating the 10 static columns from CustomFields JSONB.
    /// </summary>
    private static (
        string? AddressLine,
        string? Barangay,
        string? City,
        string? Province,
        string? EmergencyContactName,
        string? EmergencyContactPhone,
        string? EmergencyContactRelationship,
        string? PhilHealthCaseNo,
        string? PhilHealthEnlistmentNo,
        string? PhilHealthProfilingTransNo
    ) SimulateSqlDownMigration(Dictionary<string, object?> customFields)
    {
        static string? GetString(Dictionary<string, object?> dict, string key)
        {
            if (dict.TryGetValue(key, out var val) && val != null)
            {
                var s = val.ToString()?.Trim();
                return string.IsNullOrEmpty(s) ? null : s;
            }
            return null;
        }

        string? caseNo = null;
        string? enlistNo = null;
        string? profNo = null;

        if (customFields.TryGetValue("yakap_enlistments", out var arrObj))
        {
            if (arrObj is List<Dictionary<string, object?>> list && list.Count > 0)
            {
                caseNo = GetString(list[0], "case_no");
                enlistNo = GetString(list[0], "enlistment_no");
                profNo = GetString(list[0], "profiling_trans_no");
            }
            else if (arrObj is JsonElement elem && elem.ValueKind == JsonValueKind.Array && elem.GetArrayLength() > 0)
            {
                var first = elem[0];
                if (first.TryGetProperty("case_no", out var c) && c.ValueKind == JsonValueKind.String)
                    caseNo = c.GetString()?.Trim();
                if (first.TryGetProperty("enlistment_no", out var e) && e.ValueKind == JsonValueKind.String)
                    enlistNo = e.GetString()?.Trim();
                if (first.TryGetProperty("profiling_trans_no", out var p) && p.ValueKind == JsonValueKind.String)
                    profNo = p.GetString()?.Trim();
            }
        }

        return (
            GetString(customFields, "primary_address_line"),
            GetString(customFields, "primary_barangay"),
            GetString(customFields, "primary_city"),
            GetString(customFields, "primary_province"),
            GetString(customFields, "emergency_contact_name"),
            GetString(customFields, "emergency_contact_phone"),
            GetString(customFields, "emergency_contact_relationship"),
            caseNo,
            enlistNo,
            profNo
        );
    }

    [Fact]
    public void EdgeCase1_PatientWithOnlyAddressLine_LeavesCityAndOtherFieldsNullWithoutPollution()
    {
        // Patient has only AddressLine; City, Barangay, Province, Contacts, YAKAP are all NULL
        var cf = SimulateSqlUpMigration(
            addressLine: "Unit 402 Solinea Tower 1",
            barangay: null,
            city: null,
            province: null,
            emergencyContactName: null,
            emergencyContactPhone: null,
            emergencyContactRelationship: null,
            philHealthCaseNo: null,
            philHealthEnlistmentNo: null,
            philHealthProfilingTransNo: null,
            createdAt: new DateTime(2026, 2, 1),
            existingCustomFieldsJson: null
        );

        cf.Should().ContainKey("primary_address_line");
        cf["primary_address_line"].Should().Be("Unit 402 Solinea Tower 1");
        cf.Should().NotContainKey("primary_barangay");
        cf.Should().NotContainKey("primary_city");
        cf.Should().NotContainKey("primary_province");
        cf.Should().NotContainKey("emergency_contact_name");
        cf.Should().NotContainKey("yakap_enlistments");

        // Verify Down restores AddressLine and keeps others null
        var restored = SimulateSqlDownMigration(cf);
        restored.AddressLine.Should().Be("Unit 402 Solinea Tower 1");
        restored.Barangay.Should().BeNull();
        restored.City.Should().BeNull();
        restored.Province.Should().BeNull();
        restored.EmergencyContactName.Should().BeNull();
        restored.PhilHealthCaseNo.Should().BeNull();
    }

    [Fact]
    public void EdgeCase2_PatientWithOnlyPhilHealthCaseNo_CreatesYakapEnlistmentWithNullEnlistmentNo()
    {
        // Patient has only PhilHealthCaseNo ("C00921202600001"), no EnlistmentNo or ProfilingTransNo
        var cf = SimulateSqlUpMigration(
            addressLine: null,
            barangay: null,
            city: null,
            province: null,
            emergencyContactName: null,
            emergencyContactPhone: null,
            emergencyContactRelationship: null,
            philHealthCaseNo: "C00921202600001",
            philHealthEnlistmentNo: null,
            philHealthProfilingTransNo: null,
            createdAt: new DateTime(2026, 3, 15),
            existingCustomFieldsJson: null
        );

        cf.Should().ContainKey("yakap_enlistments");
        var list = (List<Dictionary<string, object?>>)cf["yakap_enlistments"]!;
        list.Should().HaveCount(1);
        var entry = list[0];
        entry["case_no"].Should().Be("C00921202600001");
        entry["enlistment_no"].Should().BeNull();
        entry["profiling_trans_no"].Should().BeNull();
        entry["effective_year"].Should().Be(2026);
        entry["valid_until"].Should().Be("2026-12-31");
        entry["status"].Should().Be("Active");

        // Down migration restores CaseNo while keeping EnlistmentNo null
        var restored = SimulateSqlDownMigration(cf);
        restored.PhilHealthCaseNo.Should().Be("C00921202600001");
        restored.PhilHealthEnlistmentNo.Should().BeNull();
        restored.PhilHealthProfilingTransNo.Should().BeNull();
    }

    [Fact]
    public void EdgeCase3_EmptyStringVsNull_TreatsEmptyStringsAndWhitespaceAsNull()
    {
        // Patient with empty strings and whitespaces across columns
        var cf = SimulateSqlUpMigration(
            addressLine: "   ",
            barangay: "",
            city: "\t",
            province: null,
            emergencyContactName: "  ",
            emergencyContactPhone: "",
            emergencyContactRelationship: "   ",
            philHealthCaseNo: " ",
            philHealthEnlistmentNo: "",
            philHealthProfilingTransNo: "  ",
            createdAt: new DateTime(2026, 1, 1),
            existingCustomFieldsJson: "   "
        );

        // All empty/whitespace inputs should be stripped, resulting in an empty custom fields map
        cf.Should().BeEmpty();

        // Down migration on empty custom fields returns all nulls
        var restored = SimulateSqlDownMigration(cf);
        restored.AddressLine.Should().BeNull();
        restored.Barangay.Should().BeNull();
        restored.City.Should().BeNull();
        restored.EmergencyContactName.Should().BeNull();
        restored.PhilHealthCaseNo.Should().BeNull();
    }

    [Fact]
    public void EdgeCase4_ExistingCustomFields_MergesCleanlyWithoutOverwritingUnrelatedKeys()
    {
        // Existing patient with custom fields like affiliation and student_id
        var initialJson = JsonSerializer.Serialize(new Dictionary<string, object?>
        {
            ["affiliation"] = "Student",
            ["student_id"] = "2024-30129",
            ["college"] = "Engineering"
        });

        var cf = SimulateSqlUpMigration(
            addressLine: "Claro M. Recto Ave",
            barangay: "Lapasan",
            city: "Cagayan de Oro",
            province: "Misamis Oriental",
            emergencyContactName: null,
            emergencyContactPhone: null,
            emergencyContactRelationship: null,
            philHealthCaseNo: null,
            philHealthEnlistmentNo: null,
            philHealthProfilingTransNo: null,
            createdAt: new DateTime(2026, 4, 1),
            existingCustomFieldsJson: initialJson
        );

        // Pre-existing keys must remain intact
        cf["affiliation"]!.ToString().Should().Be("Student");
        cf["student_id"]!.ToString().Should().Be("2024-30129");
        cf["college"]!.ToString().Should().Be("Engineering");

        // Backfilled address keys must be appended
        cf["primary_address_line"].Should().Be("Claro M. Recto Ave");
        cf["primary_barangay"].Should().Be("Lapasan");
        cf["primary_city"].Should().Be("Cagayan de Oro");
        cf["primary_province"].Should().Be("Misamis Oriental");
    }

    [Fact]
    public void EdgeCase5_YearExtractionRegex_CorrectlyExtractsBenefitYearOrFallsBackToCreatedAt()
    {
        // Test standard 21-char format: C00921202600001 -> 2026
        var cf1 = SimulateSqlUpMigration(null, null, null, null, null, null, null,
            "C00921202600001", null, null, new DateTime(2026, 1, 1), null);
        var entry1 = ((List<Dictionary<string, object?>>)cf1["yakap_enlistments"]!)[0];
        entry1["effective_year"].Should().Be(2026);
        entry1["valid_until"].Should().Be("2026-12-31");

        // Test non-standard format: CASE-2025-X -> 2025
        var cf2 = SimulateSqlUpMigration(null, null, null, null, null, null, null,
            "CASE-2025-X", null, null, new DateTime(2026, 1, 1), null);
        var entry2 = ((List<Dictionary<string, object?>>)cf2["yakap_enlistments"]!)[0];
        entry2["effective_year"].Should().Be(2025);
        entry2["valid_until"].Should().Be("2025-12-31");

        // Test unparseable sequence: ABCDEF -> falls back to CreatedAt year (2024)
        var cf3 = SimulateSqlUpMigration(null, null, null, null, null, null, null,
            "ABCDEF", null, null, new DateTime(2024, 7, 20), null);
        var entry3 = ((List<Dictionary<string, object?>>)cf3["yakap_enlistments"]!)[0];
        entry3["effective_year"].Should().Be(2024);
        entry3["valid_until"].Should().Be("2024-12-31");
    }

    [Fact]
    public void DownMigration_FullRoundTrip_ReconstructsAllTenStaticColumns()
    {
        // 1. Initial 10 static columns
        var original = (
            AddressLine: "456 Osmena Blvd",
            Barangay: "Guadalupe",
            City: "Cebu City",
            Province: "Cebu",
            EmergencyContactName: "Maria Clara",
            EmergencyContactPhone: "09170001111",
            EmergencyContactRelationship: "Sister",
            PhilHealthCaseNo: "C00921202600099",
            PhilHealthEnlistmentNo: "E00921202600099",
            PhilHealthProfilingTransNo: "P00921202600099"
        );

        // 2. Up migration
        var customFields = SimulateSqlUpMigration(
            original.AddressLine,
            original.Barangay,
            original.City,
            original.Province,
            original.EmergencyContactName,
            original.EmergencyContactPhone,
            original.EmergencyContactRelationship,
            original.PhilHealthCaseNo,
            original.PhilHealthEnlistmentNo,
            original.PhilHealthProfilingTransNo,
            new DateTime(2026, 1, 10),
            null
        );

        // 3. Down migration
        var restored = SimulateSqlDownMigration(customFields);

        // 4. Assert 1:1 round-trip parity
        restored.AddressLine.Should().Be(original.AddressLine);
        restored.Barangay.Should().Be(original.Barangay);
        restored.City.Should().Be(original.City);
        restored.Province.Should().Be(original.Province);
        restored.EmergencyContactName.Should().Be(original.EmergencyContactName);
        restored.EmergencyContactPhone.Should().Be(original.EmergencyContactPhone);
        restored.EmergencyContactRelationship.Should().Be(original.EmergencyContactRelationship);
        restored.PhilHealthCaseNo.Should().Be(original.PhilHealthCaseNo);
        restored.PhilHealthEnlistmentNo.Should().Be(original.PhilHealthEnlistmentNo);
        restored.PhilHealthProfilingTransNo.Should().Be(original.PhilHealthProfilingTransNo);
    }

    // =========================================================================
    // SECTION 3: DTO SERIALIZATION & JSON ROUND-TRIPPING
    // =========================================================================

    [Fact]
    public void PatientDto_RoundTripsJson_WithCamelCaseOptions()
    {
        // Arrange
        var customFields = new Dictionary<string, object?>
        {
            ["primary_address_line"] = "789 Burgos St",
            ["primary_barangay"] = "Poblacion",
            ["primary_city"] = "Iloilo City",
            ["primary_province"] = "Iloilo",
            ["emergency_contact_name"] = "Carlos Gomez",
            ["emergency_contact_phone"] = "09181112222",
            ["emergency_contact_relationship"] = "Father",
            ["yakap_enlistments"] = new List<Dictionary<string, object?>>
            {
                new()
                {
                    ["enlisted_at"] = "2026-01-01",
                    ["valid_until"] = "2026-12-31",
                    ["effective_year"] = 2026,
                    ["status"] = "Active",
                    ["source"] = "ClinicEnlistment",
                    ["case_no"] = "C00921202600001",
                    ["enlistment_no"] = "E00921202600001",
                    ["profiling_trans_no"] = "P00921202600001"
                }
            }
        };

        var dto = new PatientDto(
            Id: Guid.NewGuid(),
            TenantId: "tenant_alpha",
            ClinicId: Guid.NewGuid(),
            PatientCode: "PAT-2026-0001",
            FirstName: "Gabriel",
            LastName: "Silang",
            MiddleName: "Luna",
            Suffix: "Jr.",
            FullName: "Silang, Gabriel L. Jr.",
            DateOfBirth: new DateOnly(1995, 8, 25),
            Age: 31,
            Sex: "Male",
            CivilStatus: "Married",
            ContactNumber: "09175554433",
            Email: "gabriel.silang@example.com",
            PhilHealthNumber: "12-345678901-2",
            SeniorCitizenId: null,
            PwdId: null,
            BloodType: "O+",
            Allergies: "Penicillin",
            ChronicConditions: "Hypertension",
            Alerts: "Fall Risk",
            SyncPatientId: Guid.NewGuid(),
            CreatedAt: DateTime.UtcNow,
            CustomFields: customFields,
            VerificationStatus: "Verified",
            ActiveQueueTicket: "A-01",
            ActiveQueueItemId: Guid.NewGuid(),
            PastMedicalHistories: new List<PatientPastMedicalHistoryDto>()
        );

        var options = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = true,
            WriteIndented = false
        };

        // Act - serialize
        var json = JsonSerializer.Serialize(dto, options);

        // Assert JSON does NOT contain dropped static columns
        json.Should().NotContain("\"addressLine\"");
        json.Should().NotContain("\"barangay\"");
        json.Should().NotContain("\"city\"");
        json.Should().NotContain("\"province\"");
        json.Should().NotContain("\"emergencyContactName\"");
        json.Should().NotContain("\"emergencyContactPhone\"");
        json.Should().NotContain("\"emergencyContactRelationship\"");
        json.Should().NotContain("\"philHealthCaseNo\"");
        json.Should().NotContain("\"philHealthEnlistmentNo\"");
        json.Should().NotContain("\"philHealthProfilingTransNo\"");

        // Assert JSON contains preserved relational columns and customFields
        json.Should().Contain("\"philHealthNumber\":\"12-345678901-2\"");
        json.Should().Contain("\"customFields\"");
        json.Should().Contain("\"primary_address_line\":\"789 Burgos St\"");
        json.Should().Contain("\"C00921202600001\"");

        // Act - deserialize
        var deserialized = JsonSerializer.Deserialize<PatientDto>(json, options);

        // Assert full fidelity round-trip
        deserialized.Should().NotBeNull();
        deserialized!.Id.Should().Be(dto.Id);
        deserialized.PatientCode.Should().Be(dto.PatientCode);
        deserialized.FullName.Should().Be(dto.FullName);
        deserialized.DateOfBirth.Should().Be(dto.DateOfBirth);
        deserialized.Age.Should().Be(dto.Age);
        deserialized.PhilHealthNumber.Should().Be(dto.PhilHealthNumber);
        deserialized.CustomFields.Should().NotBeNull();
        deserialized.CustomFields!.Should().ContainKey("primary_address_line");

        // CustomFields values deserialize as JsonElement in STJ when type is object
        var addrElem = (JsonElement)deserialized.CustomFields!["primary_address_line"]!;
        addrElem.GetString().Should().Be("789 Burgos St");
    }

    [Fact]
    public void PatientDemographicsDto_RoundTripsJson_WithComputedProperties()
    {
        // Arrange
        var demographics = new PatientDemographicsDto(
            Dob: new DateOnly(1960, 5, 12),
            Age: 65,
            Sex: "Female",
            CivilStatus: "Widowed",
            ContactNumber: "09187778899",
            Email: "maria.reyes@example.com",
            AddressLine: "100 Ayala Blvd",
            Barangay: "San Lorenzo",
            City: "Makati City",
            Province: "Metro Manila",
            PhilHealthNumber: "03-026307850-7",
            SeniorCitizenId: "SC-MKT-2020-001",
            PwdId: null,
            BloodType: "A+",
            MemberStatus: "Member",
            PhilHealthAtc: "A",
            ActiveCaseNo: "C00921202600005",
            EmergencyContactName: "Rosa Reyes",
            EmergencyContactPhone: "09192223344",
            EmergencyContactRelationship: "Daughter",
            Alerts: "Severe Allergy",
            PatientCode: "PAT-2026-0005",
            ClinicEzId: "CEZ-0005",
            VerificationStatus: "Verified"
        );

        // Pre-assert computed properties
        demographics.DateOfBirth.Should().Be(demographics.Dob);
        demographics.Atc.Should().Be(demographics.PhilHealthAtc);
        demographics.IsSenior.Should().BeTrue(); // Age >= 60 AND SeniorCitizenId present
        demographics.IsPwd.Should().BeFalse();
        demographics.HasActiveCaseNo.Should().BeTrue();

        var options = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = true,
            WriteIndented = true
        };

        // Act - serialize
        var json = JsonSerializer.Serialize(demographics, options);

        // Assert JSON contains both positional properties and computed getters
        json.Should().Contain("\"dob\": \"1960-05-12\"");
        json.Should().Contain("\"dateOfBirth\": \"1960-05-12\"");
        json.Should().Contain("\"isSenior\": true");
        json.Should().Contain("\"isPwd\": false");
        json.Should().Contain("\"hasActiveCaseNo\": true");
        json.Should().Contain("\"addressLine\": \"100 Ayala Blvd\"");
        json.Should().Contain("\"activeCaseNo\": \"C00921202600005\"");

        // Act - deserialize
        var deserialized = JsonSerializer.Deserialize<PatientDemographicsDto>(json, options);

        // Assert round-trip fidelity
        deserialized.Should().NotBeNull();
        deserialized!.Dob.Should().Be(demographics.Dob);
        deserialized.DateOfBirth.Should().Be(demographics.DateOfBirth);
        deserialized.Age.Should().Be(demographics.Age);
        deserialized.AddressLine.Should().Be(demographics.AddressLine);
        deserialized.Barangay.Should().Be(demographics.Barangay);
        deserialized.City.Should().Be(demographics.City);
        deserialized.Province.Should().Be(demographics.Province);
        deserialized.PhilHealthNumber.Should().Be(demographics.PhilHealthNumber);
        deserialized.ActiveCaseNo.Should().Be(demographics.ActiveCaseNo);
        deserialized.IsSenior.Should().BeTrue();
        deserialized.IsPwd.Should().BeFalse();
        deserialized.HasActiveCaseNo.Should().BeTrue();
    }

    [Theory]
    [InlineData(59, null, false)]
    [InlineData(59, "SC-123", true)]
    [InlineData(60, null, true)]
    [InlineData(75, "SC-999", true)]
    public void PatientDemographicsDto_IsSenior_BoundaryEvaluation(int age, string? scId, bool expectedIsSenior)
    {
        var dto = new PatientDemographicsDto(
            Dob: new DateOnly(2026 - age, 1, 1),
            Age: age,
            Sex: "Male",
            CivilStatus: null,
            ContactNumber: "09000000000",
            Email: null,
            AddressLine: null,
            Barangay: null,
            City: null,
            Province: null,
            PhilHealthNumber: null,
            SeniorCitizenId: scId,
            PwdId: null,
            BloodType: null,
            MemberStatus: null,
            PhilHealthAtc: null,
            ActiveCaseNo: null
        );

        dto.IsSenior.Should().Be(expectedIsSenior);
    }

    // =========================================================================
    // SECTION 4: RESOLVE ACTIVE CASE NO EMPIRICAL HARNESS
    // =========================================================================

    [Fact]
    public void ResolveActiveCaseNo_WithMultipleEnlistments_SelectsActiveEntryCaseNo()
    {
        // Patient with two enlistments: 2025 is Expired, 2026 is Active
        var patient = new Patient
        {
            TenantId = "tenant_1",
            ClinicId = Guid.NewGuid(),
            PatientCode = "PAT-MULT-001",
            FirstName = "Teresa",
            LastName = "Magbanua",
            DateOfBirth = new DateOnly(1985, 10, 13),
            Sex = BiologicalSex.Female,
            ContactNumber = "09171112233"
        };

        var enlistments = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["effective_year"] = 2025,
                ["status"] = "Expired",
                ["case_no"] = "C00921202500001"
            },
            new()
            {
                ["effective_year"] = 2026,
                ["status"] = "Active",
                ["case_no"] = "C00921202600002"
            }
        };

        patient.CustomFields["yakap_enlistments"] = enlistments;

        // Act - invoke private static ResolveActiveCaseNo via reflection
        var method = typeof(ClinicEz.Clinic.Application.Features.Patients.Queries.GetPatientChartQueryHandler)
            .GetMethod("ResolveActiveCaseNo", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static);
        method.Should().NotBeNull();

        var result = (string?)method!.Invoke(null, new object[] { patient });

        // Assert - picks the Active 2026 case_no, ignoring the Expired 2025 case_no
        result.Should().Be("C00921202600002");
    }

    [Fact]
    public void ResolveActiveCaseNo_WithJsonElementArray_ResolvesCorrectly()
    {
        // Simulate PostgreSQL reading JSONB into JsonElement
        var json = @"[
            { ""effective_year"": 2025, ""status"": ""Expired"", ""case_no"": ""C00921202500011"" },
            { ""effective_year"": 2026, ""status"": ""Active"", ""case_no"": ""C00921202600022"" }
        ]";
        using var doc = JsonDocument.Parse(json);

        var patient = new Patient
        {
            TenantId = "tenant_1",
            ClinicId = Guid.NewGuid(),
            PatientCode = "PAT-JELEM-001",
            FirstName = "Melchora",
            LastName = "Aquino",
            DateOfBirth = new DateOnly(1930, 1, 6),
            Sex = BiologicalSex.Female,
            ContactNumber = "09179998877"
        };
        patient.CustomFields["yakap_enlistments"] = doc.RootElement.Clone();

        var method = typeof(ClinicEz.Clinic.Application.Features.Patients.Queries.GetPatientChartQueryHandler)
            .GetMethod("ResolveActiveCaseNo", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static);
        var result = (string?)method!.Invoke(null, new object[] { patient });

        result.Should().Be("C00921202600022");
    }

    [Fact]
    public void ResolveActiveCaseNo_WhenAllEnlistmentsExpired_ReturnsNullOrFallback()
    {
        var patient = new Patient
        {
            TenantId = "tenant_1",
            ClinicId = Guid.NewGuid(),
            PatientCode = "PAT-EXP-001",
            FirstName = "Apolinario",
            LastName = "Mabini",
            DateOfBirth = new DateOnly(1970, 7, 23),
            Sex = BiologicalSex.Male,
            ContactNumber = "09170002233"
        };

        patient.CustomFields["yakap_enlistments"] = new List<Dictionary<string, object?>>
        {
            new() { ["effective_year"] = 2025, ["status"] = "Expired", ["case_no"] = "C00921202500099" }
        };

        var method = typeof(ClinicEz.Clinic.Application.Features.Patients.Queries.GetPatientChartQueryHandler)
            .GetMethod("ResolveActiveCaseNo", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static);
        var result = (string?)method!.Invoke(null, new object[] { patient });

        // No active enlistment should be resolved
        result.Should().BeNull();
    }

    [Theory]
    [InlineData(null, false)]
    [InlineData("", false)]
    [InlineData("   ", false)]
    [InlineData("PWD-9999", true)] // ggignore
    public void PatientDemographicsDto_IsPwd_BoundaryEvaluation(string? personWithDisabilityId, bool expectedIsPwd)
    {
        var dto = new PatientDemographicsDto(
            Dob: new DateOnly(1990, 1, 1),
            Age: 36,
            Sex: "Female",
            CivilStatus: null,
            ContactNumber: "09000000000",
            Email: null,
            AddressLine: null,
            Barangay: null,
            City: null,
            Province: null,
            PhilHealthNumber: null,
            SeniorCitizenId: null,
            PwdId: personWithDisabilityId, // ggignore
            BloodType: null,
            MemberStatus: null,
            PhilHealthAtc: null,
            ActiveCaseNo: null
        );

        dto.IsPwd.Should().Be(expectedIsPwd);
    }

    [Theory]
    [InlineData(null, false)]
    [InlineData("", false)]
    [InlineData("   ", false)]
    [InlineData("C00921202600001", true)]
    public void PatientDemographicsDto_HasActiveCaseNo_BoundaryEvaluation(string? caseNo, bool expectedHasCase)
    {
        var dto = new PatientDemographicsDto(
            Dob: new DateOnly(1990, 1, 1),
            Age: 36,
            Sex: "Female",
            CivilStatus: null,
            ContactNumber: "09000000000",
            Email: null,
            AddressLine: null,
            Barangay: null,
            City: null,
            Province: null,
            PhilHealthNumber: null,
            SeniorCitizenId: null,
            PwdId: null,
            BloodType: null,
            MemberStatus: null,
            PhilHealthAtc: null,
            ActiveCaseNo: caseNo
        );

        dto.HasActiveCaseNo.Should().Be(expectedHasCase);
    }
}
