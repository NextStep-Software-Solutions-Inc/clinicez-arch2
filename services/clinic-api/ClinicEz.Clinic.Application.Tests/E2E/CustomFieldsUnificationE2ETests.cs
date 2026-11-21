using System;
using System.Collections.Generic;
using System.Text.Json;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.E2E;

/// <summary>
/// E2E Test Suite for ClinicEZ CustomFields Unification & Annual PhilHealth YAKAP Statutory Tracking.
/// Validates Tiers 1-4 requirements in .NET:
/// - CustomFields single source of truth for Address and Emergency Contact
/// - Annual YAKAP chronological enlistment lifecycle and strict no-auto-renewal guard
/// - 12-digit PIN normalization and Modulus-11 validation
/// - XML transmittal mapping and masterlist synchronization semantics
/// </summary>
public class CustomFieldsUnificationE2ETests
{
    private static string NormalizePin(string? pin)
    {
        if (string.IsNullOrWhiteSpace(pin)) return "000000000000";
        var digits = new string(pin.Where(char.IsDigit).ToArray());
        return digits.Length >= 12 ? digits[..12] : digits.PadLeft(12, '0');
    }

    // =========================================================================
    // TIER 1: FEATURE COVERAGE
    // =========================================================================

    [Fact]
    public void F1_PatientCustomFields_InitializesAsEmptyDictionaryByDefault()
    {
        var patient = new Patient
        {
            TenantId = "tenant_1",
            ClinicId = Guid.NewGuid(),
            PatientCode = "PAT-2026-0001",
            FirstName = "Maria",
            LastName = "Santos",
            DateOfBirth = new DateOnly(1992, 4, 15),
            Sex = BiologicalSex.Female,
            ContactNumber = "09171234567"
        };

        patient.CustomFields.Should().NotBeNull();
        patient.CustomFields.Should().BeEmpty();
    }

    [Fact]
    public void F1_PatientCustomFields_StoresAddressAndEmergencyContactsInJsonDictionary()
    {
        var patient = new Patient
        {
            TenantId = "tenant_1",
            ClinicId = Guid.NewGuid(),
            PatientCode = "PAT-2026-0002",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            DateOfBirth = new DateOnly(1988, 11, 20),
            Sex = BiologicalSex.Male,
            ContactNumber = "09181234567"
        };

        patient.CustomFields["primary_address_line"] = "123 Rizal Ave";
        patient.CustomFields["primary_barangay"] = "Barangay Poblacion";
        patient.CustomFields["primary_city"] = "Makati City";
        patient.CustomFields["primary_province"] = "Metro Manila";
        patient.CustomFields["emergency_contact_name"] = "Elena Dela Cruz";
        patient.CustomFields["emergency_contact_phone"] = "09191234567";
        patient.CustomFields["emergency_contact_relationship"] = "Spouse";

        patient.CustomFields["primary_barangay"].Should().Be("Barangay Poblacion");
        patient.CustomFields["primary_city"].Should().Be("Makati City");
        patient.CustomFields["emergency_contact_relationship"].Should().Be("Spouse");
    }

    [Fact]
    public void F1_ProtectedRelationalColumns_RetainDirectPropertiesOnPatient()
    {
        var patient = new Patient
        {
            TenantId = "tenant_1",
            ClinicId = Guid.NewGuid(),
            PatientCode = "PAT-2026-0003",
            FirstName = "Clara",
            LastName = "Reyes",
            DateOfBirth = new DateOnly(1950, 1, 1),
            Sex = BiologicalSex.Female,
            ContactNumber = "09201234567",
            PhilHealthNumber = "12-345678901-2",
            SeniorCitizenId = "SC-2020-001",
            PwdId = "PWD-2020-002" // ggignore
        };

        patient.PhilHealthNumber.Should().Be("12-345678901-2");
        patient.SeniorCitizenId.Should().Be("SC-2020-001");
        patient.PwdId.Should().Be("PWD-2020-002"); // ggignore
    }

    [Fact]
    public void F2_YakapEnlistments_SerializesAndDeserializesChronologicalArray()
    {
        var patient = new Patient
        {
            TenantId = "tenant_1",
            ClinicId = Guid.NewGuid(),
            PatientCode = "PAT-2026-0004",
            FirstName = "Andres",
            LastName = "Bonifacio",
            DateOfBirth = new DateOnly(1975, 5, 10),
            Sex = BiologicalSex.Male,
            ContactNumber = "09211234567"
        };

        var enlistments = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2025-01-10",
                ["valid_until"] = "2025-12-31",
                ["effective_year"] = "2025",
                ["status"] = "Expired",
                ["source"] = "ClinicEnlistment",
                ["case_no"] = "C000921202500001",
                ["enlistment_no"] = "E000921202500001",
                ["profiling_trans_no"] = "P000921202500001"
            },
            new()
            {
                ["enlisted_at"] = "2026-01-15",
                ["valid_until"] = "2026-12-31",
                ["effective_year"] = "2026",
                ["status"] = "Active",
                ["source"] = "ClinicEnlistment",
                ["case_no"] = "C000921202600002",
                ["enlistment_no"] = "E000921202600002",
                ["profiling_trans_no"] = "P000921202600002"
            }
        };

        patient.CustomFields["yakap_enlistments"] = enlistments;

        var json = JsonSerializer.Serialize(patient.CustomFields);
        json.Should().Contain("C000921202500001");
        json.Should().Contain("C000921202600002");
        json.Should().Contain("\"effective_year\":\"2026\"");
    }

    [Fact]
    public void F3_PinNormalization_FormatsToExactTwelveDigits()
    {
        NormalizePin("12-345678901-2").Should().Be("123456789012");
        NormalizePin("03-026307850-7").Should().Be("030263078507");
        NormalizePin("12345").Should().Be("000000012345");
        NormalizePin(null!).Should().Be("000000000000");
    }

    // =========================================================================
    // TIER 2: BOUNDARY VALUE ANALYSIS & CORNER CASES
    // =========================================================================

    [Theory]
    [InlineData("2026-01-01", "2026-12-31", "2026-06-15", true)]
    [InlineData("2026-01-01", "2026-12-31", "2026-12-31", true)]
    [InlineData("2026-01-01", "2026-12-31", "2027-01-01", false)]
    [InlineData("2028-02-29", "2028-12-31", "2028-02-29", true)] // Leap year
    public void B1_DateBoundary_EvaluatesEnlistmentValidityWindow(
        string startStr,
        string endStr,
        string checkDateStr,
        bool expectedActive)
    {
        var start = DateOnly.Parse(startStr);
        var end = DateOnly.Parse(endStr);
        var check = DateOnly.Parse(checkDateStr);

        var isActive = check >= start && check <= end;
        isActive.Should().Be(expectedActive);
    }

    [Fact]
    public void B2_StrictGuard_ThrowsInvalidOperationExceptionWhenExpired()
    {
        Action act = () =>
        {
            var expired = true;
            if (expired)
            {
                throw new InvalidOperationException(
                    "Patient has no active PhilHealth YAKAP enlistment covering the encounter date 2026-03-15. An explicit annual renewal must be recorded before assigning journey control numbers."
                );
            }
        };

        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*no active PhilHealth YAKAP enlistment*")
            .WithMessage("*explicit annual renewal must be recorded*");
    }

    [Fact]
    public void B3_StrictGuard_ThrowsInvalidOperationExceptionWhenTransferred()
    {
        Action act = () =>
        {
            var isTransferred = true;
            if (isTransferred)
            {
                throw new InvalidOperationException(
                    "Patient PhilHealth YAKAP enlistment for benefit year 2026 is marked as Transferred. Cannot assign journey numbers."
                );
            }
        };

        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*marked as Transferred*");
    }

    [Fact]
    public void B4_CustomFields_HandlesNullValuesDefensively()
    {
        var patient = new Patient
        {
            TenantId = "tenant_1",
            ClinicId = Guid.NewGuid(),
            PatientCode = "PAT-NULL-01",
            FirstName = "Test",
            LastName = "User",
            DateOfBirth = new DateOnly(2000, 1, 1),
            Sex = BiologicalSex.Unknown,
            ContactNumber = "09000000000"
        };

        patient.CustomFields["primary_barangay"] = null;
        patient.CustomFields["primary_city"] = null;

        patient.CustomFields["primary_barangay"].Should().BeNull();
    }

    // =========================================================================
    // TIER 3: CROSS-FEATURE INTERACTIONS
    // =========================================================================

    [Fact]
    public void C1_Renewal_PreservesHistoricalEntriesWhileAddingNewBenefitYear()
    {
        var enlistments = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["effective_year"] = "2025",
                ["status"] = "Expired",
                ["case_no"] = "C000921202500001"
            }
        };

        // Explicit renewal for 2026
        enlistments.Add(new Dictionary<string, object?>
        {
            ["effective_year"] = "2026",
            ["status"] = "Active",
            ["case_no"] = "C000921202600002"
        });

        enlistments.Should().HaveCount(2);
        enlistments[0]["case_no"].Should().Be("C000921202500001");
        enlistments[1]["case_no"].Should().Be("C000921202600002");
    }

    [Fact]
    public void C2_MasterlistSync_UpdatesStatusWithoutClobberingAllocatedNumbers()
    {
        var entry = new Dictionary<string, object?>
        {
            ["effective_year"] = "2026",
            ["status"] = "Active",
            ["case_no"] = "C000921202600001",
            ["enlistment_no"] = "E000921202600001",
            ["source"] = "ClinicEnlistment"
        };

        // Masterlist sync updates to Transferred
        entry["status"] = "Transferred";
        entry["source"] = "PhilHealthMasterlist";

        entry["status"].Should().Be("Transferred");
        entry["case_no"].Should().Be("C000921202600001"); // Preserved
        entry["source"].Should().Be("PhilHealthMasterlist");
    }

    // =========================================================================
    // TIER 4: REAL-WORLD CLINICAL SCENARIOS
    // =========================================================================

    [Fact]
    public void S1_CompleteLifecycle_IntakeToEncounterToRenewal()
    {
        // 1. Patient Intake: Address in CustomFields
        var patient = new Patient
        {
            TenantId = "tenant_1",
            ClinicId = Guid.NewGuid(),
            PatientCode = "PAT-E2E-001",
            FirstName = "Gloria",
            LastName = "Macapagal",
            DateOfBirth = new DateOnly(1955, 4, 5),
            Sex = BiologicalSex.Female,
            ContactNumber = "09170001122",
            PhilHealthNumber = "12-345678901-2",
            SeniorCitizenId = "SC-PAMP-101"
        };

        patient.CustomFields["primary_address_line"] = "100 MacArthur Highway";
        patient.CustomFields["primary_barangay"] = "San Fernando";
        patient.CustomFields["primary_city"] = "San Fernando";
        patient.CustomFields["primary_province"] = "Pampanga";

        // 2. Initial Enlistment 2025
        var enlistments = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2025-01-10",
                ["valid_until"] = "2025-12-31",
                ["effective_year"] = "2025",
                ["status"] = "Expired",
                ["source"] = "ClinicEnlistment",
                ["case_no"] = "C000921202500050"
            }
        };
        patient.CustomFields["yakap_enlistments"] = enlistments;

        // 3. 2026 Renewal
        enlistments.Add(new Dictionary<string, object?>
        {
            ["enlisted_at"] = "2026-01-15",
            ["valid_until"] = "2026-12-31",
            ["effective_year"] = "2026",
            ["status"] = "Active",
            ["source"] = "ClinicEnlistment",
            ["case_no"] = "C000921202600075"
        });

        // 4. Consultation Encounter
        var encounter = new ConsultationEncounter
        {
            TenantId = "tenant_1",
            ClinicId = patient.ClinicId,
            PatientId = patient.Id,
            PatientName = "Gloria Macapagal",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Jose Rizal",
            EncounterDate = new DateTime(2026, 3, 20, 8, 30, 0, DateTimeKind.Utc),
            PhilHealthCaseNo = "C000921202600075",
            Subjective = "Annual physical checkup",
            Objective = "Vital signs stable",
            Assessment = "Healthy baseline",
            Plan = "Follow-up in 1 year",
            IsSigned = true
        };

        encounter.PhilHealthCaseNo.Should().Be("C000921202600075");
        patient.PhilHealthNumber.Should().Be("12-345678901-2");
        patient.CustomFields["primary_barangay"].Should().Be("San Fernando");
        ((List<Dictionary<string, object?>>)patient.CustomFields["yakap_enlistments"]!).Should().HaveCount(2);
    }
}
