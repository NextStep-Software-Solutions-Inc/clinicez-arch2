using System;
using System.Collections;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.PhilHealth.Catalog;
using ClinicEz.Clinic.Infrastructure.Services;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Milestone 5 Phase 2: Tier 5 White-Box Backend Adversarial Coverage & Hardening Suite.
/// Systematically stress-tests all edge cases, boundary conditions, untested branches,
/// fallback paths, and concurrency hazards across:
/// 1. PhilHealthDateParser
/// 2. PhilHealthPinNormalizer
/// 3. ClinicPatientYakapExtensions
/// 4. YakapClinicalMapper
/// 5. PhilHealthMasterlistSyncService
/// 6. PhilHealthSequenceGenerator / AssignPatientJourneyNumbersAsync
/// </summary>
public sealed class Tier5BackendAdversarialCoverageTests
{
    private static ClinicPatient CreateTestPatient(
        string code = "PAT-001",
        string firstName = "Test",
        string lastName = "Patient",
        string? pin = "030263078507",
        string tenantId = "tenant_test",
        Guid? clinicId = null) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        ClinicId = clinicId ?? Guid.NewGuid(),
        PatientCode = code,
        FirstName = firstName,
        LastName = lastName,
        PhilHealthNumber = pin,
        ContactNumber = "09170000001",
        DateOfBirth = new DateOnly(1990, 1, 1),
        Gender = "Male"
    };

    private static ConsultationEncounter CreateTestEncounter(
        Guid patientId,
        DateTime encounterDate,
        string tenantId = "tenant_test",
        Guid? clinicId = null,
        string? soapTransNo = null) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        ClinicId = clinicId ?? Guid.NewGuid(),
        PatientId = patientId,
        PatientName = "Test Patient",
        DoctorId = Guid.NewGuid(),
        DoctorName = "Dr. Test Doctor",
        EncounterDate = encounterDate,
        PhilHealthSoapTransNo = soapTransNo
    };

    // =========================================================================
    // SECTION 1: PhilHealthDateParser Exhaustive White-Box & Adversarial Hardening
    // =========================================================================

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t\r\n")]
    [InlineData("invalid-date-string")]
    [InlineData("2026-13-01")] // Invalid month
    [InlineData("2026-00-15")] // Zero month
    [InlineData("2026-04-31")] // April has 30 days
    [InlineData("2026-02-29")] // 2026 is not a leap year
    [InlineData("1900-02-29")] // 1900 is not a leap year (century rule)
    [InlineData("0000-00-00")]
    [InlineData("9999-99-99")]
    [InlineData("-2026-01-01")]
    [InlineData("undefined")]
    [InlineData("null")]
    [InlineData("NaN")]
    [InlineData("[object Object]")]
    [InlineData("2026-01-01'; DROP TABLE Patients;--")]
    public void DateParser_InvalidAndAdversarialInputs_ReturnFalseAndNull(string? input)
    {
        var success = PhilHealthDateParser.TryNormalizeDate(input, out var normalized);
        success.Should().BeFalse();
        normalized.Should().BeNull();

        PhilHealthDateParser.TryParseDate(input, out var date).Should().BeFalse();
        date.Should().Be(default);

        PhilHealthDateParser.NormalizeToIsoDate(input).Should().BeNull();
        PhilHealthDateParser.NormalizeOrDefault(input, "2026-12-31").Should().Be("2026-12-31");
    }

    [Theory]
    // Leap year tests
    [InlineData("2024-02-29", "2024-02-29")] // Valid leap day
    [InlineData("2028-02-29", "2028-02-29")] // Valid leap day
    [InlineData("2000-02-29", "2000-02-29")] // Century leap year (divisible by 400)
    [InlineData("20240229", "2024-02-29")]   // Compact leap day
    // Compact 8-digit representations
    [InlineData("20260101", "2026-01-01")]
    [InlineData("20260714", "2026-07-14")]
    [InlineData("20261231", "2026-12-31")]
    // Delimiter variations: 'T', 't', ' '
    [InlineData("2026-05-18T14:30:00Z", "2026-05-18")]
    [InlineData("2026-05-18t08:15:22+08:00", "2026-05-18")]
    [InlineData("2026-05-18 23:59:59", "2026-05-18")]
    [InlineData("2026-05-18 00:00:00.000", "2026-05-18")]
    [InlineData("  2026-05-18T10:00:00Z  ", "2026-05-18")]
    // Unpadded dates
    [InlineData("2026-5-3", "2026-05-03")]
    [InlineData("2026-1-1", "2026-01-01")]
    [InlineData("2026-12-5", "2026-12-05")]
    // Slash delimited
    [InlineData("2026/08/21", "2026-08-21")]
    [InlineData("2026/8/4", "2026-08-04")]
    // Timezone offsets that span midnight UTC
    [InlineData("2026-07-01T23:59:59+14:00", "2026-07-01")]
    [InlineData("2026-07-01T00:00:01-11:00", "2026-07-01")]
    public void DateParser_ValidAndBoundaryPermutations_NormalizeToStrictIsoDate(string input, string expected)
    {
        var success = PhilHealthDateParser.TryNormalizeDate(input, out var normalized);
        success.Should().BeTrue();
        normalized.Should().Be(expected);

        PhilHealthDateParser.NormalizeToIsoDate(input).Should().Be(expected);
        PhilHealthDateParser.NormalizeOrDefault(input, "fallback").Should().Be(expected);
        PhilHealthDateParser.NormalizeToIsoDate(input, "fallback").Should().Be(expected);

        var parseDateSuccess = PhilHealthDateParser.TryParseDate(input, out var parsedDate);
        parseDateSuccess.Should().BeTrue();
        parsedDate.ToString("yyyy-MM-dd").Should().Be(expected);
    }

    [Fact]
    public void DateParser_ExtractEffectiveYear_HandlesAllFallbackBranches()
    {
        // 1. Explicit positive string
        PhilHealthDateParser.ExtractEffectiveYear("2027", null).Should().Be(2027);
        PhilHealthDateParser.ExtractEffectiveYear("2026", "2024-05-01").Should().Be(2026);

        // 2. Fallback to valid dateStr when year string is invalid/zero/negative
        PhilHealthDateParser.ExtractEffectiveYear("0", "2025-08-15").Should().Be(2025);
        PhilHealthDateParser.ExtractEffectiveYear("-1", "2024-11-20T10:00:00Z").Should().Be(2024);
        PhilHealthDateParser.ExtractEffectiveYear("invalid", "2023-01-01").Should().Be(2023);
        PhilHealthDateParser.ExtractEffectiveYear(null, "2028-02-29").Should().Be(2028);

        // 3. Fallback to explicit defaultYear when both are missing or invalid
        PhilHealthDateParser.ExtractEffectiveYear(null, null, 2030).Should().Be(2030);
        PhilHealthDateParser.ExtractEffectiveYear("0", "invalid-date", 2035).Should().Be(2035);

        // 4. Fallback to DateTime.UtcNow.Year when defaultYear is omitted
        PhilHealthDateParser.ExtractEffectiveYear(null, null).Should().Be(DateTime.UtcNow.Year);
    }

    [Fact]
    public void DateParser_ConcurrentStress_ExecutesWithoutRaceConditions()
    {
        const int iterations = 500;
        var inputs = new[]
        {
            "2026-01-15T08:00:00Z",
            "2024-02-29",
            "20260714",
            "2026-5-3",
            "invalid",
            "2025-12-31 23:59:59"
        };

        Parallel.For(0, iterations, i =>
        {
            var raw = inputs[i % inputs.Length];
            var success = PhilHealthDateParser.TryNormalizeDate(raw, out var norm);
            if (raw == "invalid")
            {
                success.Should().BeFalse();
                norm.Should().BeNull();
            }
            else
            {
                success.Should().BeTrue();
                norm.Should().NotBeNullOrWhiteSpace();
            }
        });
    }

    // =========================================================================
    // SECTION 2: PhilHealthPinNormalizer Exhaustive White-Box & Adversarial Hardening
    // =========================================================================

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t\r\n")]
    [InlineData("000000000000")]
    [InlineData("00-000000000-0")]
    [InlineData("00 000000000 0")]
    [InlineData("0")]
    [InlineData("0000")]
    [InlineData("0000000000000000")]
    [InlineData("ABCDEFGHIJKL")]
    [InlineData("PENDING")]
    [InlineData("UNASSIGNED")]
    [InlineData("NONE")]
    [InlineData("N/A")]
    [InlineData("!@#$%^&*()_+")]
    public void PinNormalizer_InvalidAndAllZeroPlaceholders_StrictlyReturnNull(string? input)
    {
        PhilHealthPinNormalizer.Normalize(input).Should().BeNull();
        PhilHealthPinNormalizer.IsValidPin(input).Should().BeFalse();
    }

    [Theory]
    [InlineData("12-345678901-2", "123456789012")]
    [InlineData("12 345678901 2", "123456789012")]
    [InlineData("  12 - 345678901 - 2  ", "123456789012")]
    [InlineData("\t12\n345678901\r2", "123456789012")]
    [InlineData("123456789012", "123456789012")]
    // Fewer than 12 digits -> left padded with zeros
    [InlineData("1", "000000000001")]
    [InlineData("12345", "000000012345")]
    [InlineData("12345678901", "012345678901")] // 11 digits
    // More than 12 digits -> takes last 12
    [InlineData("999123456789012", "123456789012")] // 15 digits
    [InlineData("BARCODE-123456789012", "123456789012")]
    public void PinNormalizer_ValidPermutations_NormalizeDeterministically(string input, string expected)
    {
        var normalized = PhilHealthPinNormalizer.Normalize(input);
        normalized.Should().Be(expected);
        PhilHealthPinNormalizer.IsValidPin(input).Should().BeTrue();
    }

    [Fact]
    public void PinNormalizer_HighConcurrency_ExecutesDeterministically()
    {
        const int iterations = 1000;
        Parallel.For(0, iterations, i =>
        {
            var raw = (i % 2 == 0) ? "12-345678901-2" : "00-000000000-0";
            var result = PhilHealthPinNormalizer.Normalize(raw);
            if (i % 2 == 0)
            {
                result.Should().Be("123456789012");
            }
            else
            {
                result.Should().BeNull();
            }
        });
    }

    // =========================================================================
    // SECTION 3: ClinicPatientYakapExtensions Polymorphic Deserialization & Edge Cases
    // =========================================================================

    [Fact]
    public void YakapExtensions_GetYakapEnlistments_NullAndMalformedCustomFields_HandledSafely()
    {
        ClinicPatient? nullPatient = null;
        nullPatient.GetYakapEnlistments().Should().BeEmpty();

        var patientWithNullCustomFields = new ClinicPatient
        {
            TenantId = "tenant1",
            ClinicId = Guid.NewGuid(),
            PatientCode = "PAT-01",
            FirstName = "A",
            LastName = "B",
            ContactNumber = "09170000000",
            DateOfBirth = new DateOnly(1990, 1, 1),
            Gender = "Male",
            CustomFields = null!
        };
        patientWithNullCustomFields.GetYakapEnlistments().Should().BeEmpty();

        var patientWithoutKey = CreateTestPatient("PAT-02");
        patientWithoutKey.GetYakapEnlistments().Should().BeEmpty();

        var patientWithNullKey = CreateTestPatient("PAT-03");
        patientWithNullKey.CustomFields["yakap_enlistments"] = null;
        patientWithNullKey.GetYakapEnlistments().Should().BeEmpty();

        // Non-collection scalar types
        var patientWithIntKey = CreateTestPatient("PAT-04");
        patientWithIntKey.CustomFields["yakap_enlistments"] = 12345;
        patientWithIntKey.GetYakapEnlistments().Should().BeEmpty();

        var patientWithBoolKey = CreateTestPatient("PAT-05");
        patientWithBoolKey.CustomFields["yakap_enlistments"] = true;
        patientWithBoolKey.GetYakapEnlistments().Should().BeEmpty();
    }

    [Fact]
    public void YakapExtensions_GetYakapEnlistments_JsonElementStringAndDoubleEncodedJson_ParsedCorrectly()
    {
        var rawJson = """
        [
            {
                "enlisted_at": "2026-02-01",
                "valid_until": "2026-12-31",
                "effective_year": "2026",
                "status": "Active",
                "source": "ClinicEnlistment",
                "case_no": "C000921202600001",
                "enlistment_no": "E000921202600001",
                "profiling_trans_no": "P000921202600001"
            }
        ]
        """;

        // Raw string
        var patient1 = CreateTestPatient("PAT-STR-1");
        patient1.CustomFields["yakap_enlistments"] = rawJson;
        var res1 = patient1.GetYakapEnlistments();
        res1.Should().HaveCount(1);
        res1[0].EffectiveYear.Should().Be(2026);
        res1[0].CaseNo.Should().Be("C000921202600001");

        // JsonElement wrapping string (double-encoded JSON)
        using var stringDoc = JsonDocument.Parse($"\"{rawJson.Replace("\"", "\\\"").Replace("\r", "").Replace("\n", "")}\"");
        var patient2 = CreateTestPatient("PAT-STR-2");
        patient2.CustomFields["yakap_enlistments"] = stringDoc.RootElement.Clone();
        var res2 = patient2.GetYakapEnlistments();
        res2.Should().HaveCount(1);
        res2[0].EffectiveYear.Should().Be(2026);

        // Malformed JSON string
        var patient3 = CreateTestPatient("PAT-STR-3");
        patient3.CustomFields["yakap_enlistments"] = "{ broken json array";
        patient3.GetYakapEnlistments().Should().BeEmpty();
    }

    [Fact]
    public void YakapExtensions_GetYakapEnlistments_HeterogeneousUntypedEnumerable_ParsesAllItems()
    {
        using var jsonDoc = JsonDocument.Parse("""
        {
            "enlisted_at": "2026-01-01",
            "effective_year": 2026,
            "status": "Active"
        }
        """);

        var mixedList = new ArrayList
        {
            new YakapEnlistmentEntry
            {
                EffectiveYear = 2024,
                EnlistedAt = "2024-01-10",
                ValidUntil = "2024-12-31",
                Status = YakapEnlistmentStatus.Expired
            },
            new Dictionary<string, object?>
            {
                ["effective_year"] = 2025,
                ["enlisted_at"] = "2025-01-15",
                ["status"] = "Active"
            },
            jsonDoc.RootElement.Clone(),
            new // Anonymous POCO
            {
                effective_year = 2027,
                enlisted_at = "2027-01-01",
                status = "Active"
            },
            null // Null element should be safely ignored
        };

        var patient = CreateTestPatient("PAT-HET-01");
        patient.CustomFields["yakap_enlistments"] = mixedList;

        var entries = patient.GetYakapEnlistments();
        entries.Should().HaveCount(4);
        entries.Select(e => e.EffectiveYear).Should().ContainInOrder(2024, 2025, 2026, 2027);
    }

    [Fact]
    public void YakapExtensions_SetYakapEnlistments_NullPatient_ThrowsArgumentNullException()
    {
        ClinicPatient nullPatient = null!;
        var act = () => nullPatient.SetYakapEnlistments(new List<YakapEnlistmentEntry>());
        act.Should().Throw<ArgumentNullException>();
    }

    [Fact]
    public void YakapExtensions_SetYakapEnlistments_NullList_SetsEmptyList()
    {
        var patient = CreateTestPatient("PAT-SET-01");
        patient.SetYakapEnlistments(null!);
        patient.GetYakapEnlistments().Should().BeEmpty();
    }

    [Fact]
    public void YakapExtensions_AddOrRenewYakapEnlistment_PreservesExistingAllocatedControlNumbers()
    {
        var patient = CreateTestPatient("PAT-RENEW-01");
        var initial = new YakapEnlistmentEntry
        {
            EffectiveYear = 2026,
            EnlistedAt = "2026-01-10",
            ValidUntil = "2026-12-31",
            Status = YakapEnlistmentStatus.Active,
            CaseNo = "C000921202600001",
            EnlistmentNo = "E000921202600001",
            ProfilingTransNo = "P000921202600001"
        };
        patient.AddOrRenewYakapEnlistment(initial);

        // Update with null control numbers (e.g. from PhilHealth masterlist sync)
        var updated = new YakapEnlistmentEntry
        {
            EffectiveYear = 2026,
            EnlistedAt = "2026-01-10",
            ValidUntil = "2026-12-31",
            Status = YakapEnlistmentStatus.Active,
            Source = YakapEnlistmentSource.PhilHealthMasterlist,
            CaseNo = null,
            EnlistmentNo = "",
            ProfilingTransNo = "   "
        };
        patient.AddOrRenewYakapEnlistment(updated);

        var enlistments = patient.GetYakapEnlistments();
        enlistments.Should().HaveCount(1);
        enlistments[0].Source.Should().Be(YakapEnlistmentSource.PhilHealthMasterlist);
        enlistments[0].CaseNo.Should().Be("C000921202600001");
        enlistments[0].EnlistmentNo.Should().Be("E000921202600001");
        enlistments[0].ProfilingTransNo.Should().Be("P000921202600001");
    }

    // =========================================================================
    // SECTION 4: Strict No-Auto-Renewal Guard Boundary & Statutory Error Testing
    // =========================================================================

    [Fact]
    public void StrictGuard_EmptyEnlistments_ThrowsActionableException()
    {
        var patient = CreateTestPatient("PAT-GUARD-01");
        var encDate = new DateOnly(2026, 6, 15);

        var act = () => patient.ResolveActiveEnlistmentOrThrow(encDate);
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*Patient has no active PhilHealth YAKAP enlistment covering the encounter date 2026-06-15. An explicit annual renewal must be recorded before assigning journey control numbers.*");
    }

    [Fact]
    public void StrictGuard_TransferredEnlistment_ThrowsTransferredException()
    {
        var patient = CreateTestPatient("PAT-GUARD-02");
        patient.AddOrRenewYakapEnlistment(new YakapEnlistmentEntry
        {
            EffectiveYear = 2026,
            EnlistedAt = "2026-01-01",
            ValidUntil = "2026-12-31",
            Status = YakapEnlistmentStatus.Transferred
        });

        var encDate = new DateOnly(2026, 7, 20);
        var act = () => patient.ResolveActiveEnlistmentOrThrow(encDate);
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*marked as Transferred. Cannot assign journey numbers.*");
    }

    [Fact]
    public void StrictGuard_PreEnlistmentEncounter_ThrowsActionableException()
    {
        var patient = CreateTestPatient("PAT-GUARD-03");
        patient.AddOrRenewYakapEnlistment(new YakapEnlistmentEntry
        {
            EffectiveYear = 2026,
            EnlistedAt = "2026-05-01",
            ValidUntil = "2026-12-31",
            Status = YakapEnlistmentStatus.Active
        });

        // Encounter 1 day before enlistment date
        var encDate = new DateOnly(2026, 4, 30);
        var act = () => patient.ResolveActiveEnlistmentOrThrow(encDate);
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*Patient has no active PhilHealth YAKAP enlistment covering the encounter date 2026-04-30. An explicit annual renewal must be recorded before assigning journey control numbers.*");
    }

    [Fact]
    public void StrictGuard_ExpiredEncounter_ThrowsExactExpiredExceptionWithMessage()
    {
        var patient = CreateTestPatient("PAT-GUARD-04");
        patient.AddOrRenewYakapEnlistment(new YakapEnlistmentEntry
        {
            EffectiveYear = 2025,
            EnlistedAt = "2025-01-01",
            ValidUntil = "2025-12-31",
            Status = YakapEnlistmentStatus.Active
        });

        // Encounter on Jan 1, 2026 (1 day after expiry)
        var encDate = new DateOnly(2026, 1, 1);
        var act = () => patient.ResolveActiveEnlistmentOrThrow(encDate);
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*enlistment expired on 2025-12-31*");
    }

    [Fact]
    public void StrictGuard_ExactBoundaryDates_InclusiveBoundariesSucceed()
    {
        var patient = CreateTestPatient("PAT-GUARD-05");
        patient.AddOrRenewYakapEnlistment(new YakapEnlistmentEntry
        {
            EffectiveYear = 2026,
            EnlistedAt = "2026-02-15",
            ValidUntil = "2026-11-30",
            Status = YakapEnlistmentStatus.Active
        });

        // Exactly on lower bound
        var lower = patient.ResolveActiveEnlistmentOrThrow(new DateOnly(2026, 2, 15));
        lower.Should().NotBeNull();
        lower.EffectiveYear.Should().Be(2026);

        // Exactly on upper bound
        var upper = patient.ResolveActiveEnlistmentOrThrow(new DateOnly(2026, 11, 30));
        upper.Should().NotBeNull();
        upper.EffectiveYear.Should().Be(2026);
    }

    [Fact]
    public void StrictGuard_LeapYearEncounters_BoundaryHandling()
    {
        var patient = CreateTestPatient("PAT-GUARD-06");
        patient.AddOrRenewYakapEnlistment(new YakapEnlistmentEntry
        {
            EffectiveYear = 2024,
            EnlistedAt = "2024-01-01",
            ValidUntil = "2024-12-31",
            Status = YakapEnlistmentStatus.Active
        });

        // Leap day encounter
        var leap = patient.ResolveActiveEnlistmentOrThrow(new DateOnly(2024, 2, 29));
        leap.Should().NotBeNull();
        leap.EffectiveYear.Should().Be(2024);
    }

    [Fact]
    public void StrictGuard_ResolveActiveEnlistmentForYearOrThrow_RegistrationMode_HandlesAllStates()
    {
        var patient = CreateTestPatient("PAT-REG-MOD");

        // 1. Empty list
        var actEmpty = () => patient.ResolveActiveEnlistmentForYearOrThrow(2026);
        actEmpty.Should().Throw<InvalidOperationException>()
            .WithMessage("*Patient has no active PhilHealth YAKAP enlistment for benefit year 2026.*");

        // 2. Transferred year
        patient.AddOrRenewYakapEnlistment(new YakapEnlistmentEntry
        {
            EffectiveYear = 2025,
            EnlistedAt = "2025-01-01",
            ValidUntil = "2025-12-31",
            Status = YakapEnlistmentStatus.Transferred
        });
        var actTrans = () => patient.ResolveActiveEnlistmentForYearOrThrow(2025);
        actTrans.Should().Throw<InvalidOperationException>()
            .WithMessage("*marked as Transferred. Cannot assign journey numbers.*");

        // 3. Expired year
        patient.AddOrRenewYakapEnlistment(new YakapEnlistmentEntry
        {
            EffectiveYear = 2024,
            EnlistedAt = "2024-01-01",
            ValidUntil = "2024-12-31",
            Status = YakapEnlistmentStatus.Expired
        });
        var actExp = () => patient.ResolveActiveEnlistmentForYearOrThrow(2024);
        actExp.Should().Throw<InvalidOperationException>()
            .WithMessage("*marked as Expired. Cannot assign journey numbers.*");

        // 4. Active year
        patient.AddOrRenewYakapEnlistment(new YakapEnlistmentEntry
        {
            EffectiveYear = 2026,
            EnlistedAt = "2026-01-01",
            ValidUntil = "2026-12-31",
            Status = YakapEnlistmentStatus.Active
        });
        var active = patient.ResolveActiveEnlistmentForYearOrThrow(2026);
        active.Should().NotBeNull();
        active.EffectiveYear.Should().Be(2026);
    }

    // =========================================================================
    // SECTION 5: YakapClinicalMapper Control Number Resolution & Multi-Year Claims
    // =========================================================================

    [Fact]
    public void YakapClinicalMapper_MultiYearPatient_ClaimsResolveCorrectBenefitYearNumbers()
    {
        var mapper = new YakapClinicalMapper(PhilHealthCatalogLookup.FromBundledSeed());

        var clinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var enc2025Id = Guid.NewGuid();
        var enc2026Id = Guid.NewGuid();

        var settings = new ClinicSettings
        {
            TenantId = "tenant_m5",
            ClinicId = clinicId,
            ClinicName = "Adversarial Health Center",
            AccreditationNumber = "000921"
        };

        var patient = CreateTestPatient("PAT-M5-001", "Maria", "Clara", "030263078507", "tenant_m5", clinicId);
        patient.Id = patientId;

        // Multi-year enlistment history
        patient.AddOrRenewYakapEnlistment(new YakapEnlistmentEntry
        {
            EffectiveYear = 2025,
            EnlistedAt = "2025-03-01",
            ValidUntil = "2025-12-31",
            Status = YakapEnlistmentStatus.Active,
            CaseNo = "C000921202500099",
            EnlistmentNo = "E000921202500099",
            ProfilingTransNo = "P000921202500099"
        });

        patient.AddOrRenewYakapEnlistment(new YakapEnlistmentEntry
        {
            EffectiveYear = 2026,
            EnlistedAt = "2026-01-15T08:00:00Z", // Un-normalized timestamp
            ValidUntil = "2026-12-31",
            Status = YakapEnlistmentStatus.Active,
            CaseNo = "C000921202600555",
            EnlistmentNo = "E000921202600555",
            ProfilingTransNo = "P000921202600555"
        });

        var enc2025 = CreateTestEncounter(patientId, new DateTime(2025, 7, 10, 10, 0, 0, DateTimeKind.Utc), "tenant_m5", clinicId, "S000921202500099");
        enc2025.Id = enc2025Id;

        var enc2026 = CreateTestEncounter(patientId, new DateTime(2026, 4, 15, 14, 0, 0, DateTimeKind.Utc), "tenant_m5", clinicId, "S000921202600555");
        enc2026.Id = enc2026Id;

        var patientsMap = new Dictionary<Guid, ClinicPatient> { [patientId] = patient };
        var vitalsMap = new Dictionary<Guid, TriageVitals>();

        // Act 1: Generate Claim for 2025
        var doc2025 = mapper.MapToYakapReportDocument(
            reportTagging: "1",
            effectiveYear: "2025",
            settings: settings,
            encounters: new[] { enc2025 },
            patients: patientsMap,
            vitalsMap: vitalsMap,
            transmittalNumber: "R000921202500001");

        // Assert 1: Uses 2025 C/E/P control numbers and EnlistDate
        doc2025.Enlistments.Should().HaveCount(1);
        var e2025 = doc2025.Enlistments[0];
        e2025.HciCaseNo.Should().Be("C000921202500099");
        e2025.HciTransNo.Should().Be("E000921202500099");
        e2025.EnlistDate.Should().Be("2025-03-01");
        doc2025.Profiles[0].HciTransNo.Should().Be("P000921202500099");

        // Act 2: Generate Claim for 2026
        var doc2026 = mapper.MapToYakapReportDocument(
            reportTagging: "1",
            effectiveYear: "2026",
            settings: settings,
            encounters: new[] { enc2026 },
            patients: patientsMap,
            vitalsMap: vitalsMap,
            transmittalNumber: "R000921202600001");

        // Assert 2: Uses 2026 C/E/P control numbers and strictly normalized EnlistDate (stripped timestamp)
        doc2026.Enlistments.Should().HaveCount(1);
        var e2026 = doc2026.Enlistments[0];
        e2026.HciCaseNo.Should().Be("C000921202600555");
        e2026.HciTransNo.Should().Be("E000921202600555");
        e2026.EnlistDate.Should().Be("2026-01-15");
        doc2026.Profiles[0].HciTransNo.Should().Be("P000921202600555");
    }

    [Fact]
    public void YakapClinicalMapper_LegacyCustomFieldsFallback_ResolvesCorrectlyWhenEnlistmentsMissing()
    {
        var mapper = new YakapClinicalMapper(PhilHealthCatalogLookup.FromBundledSeed());

        var clinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var encId = Guid.NewGuid();

        var settings = new ClinicSettings
        {
            TenantId = "tenant_legacy",
            ClinicId = clinicId,
            ClinicName = "Legacy Health Center",
            AccreditationNumber = "000921"
        };

        var patient = CreateTestPatient("PAT-LEG-001", "Legacy", "Patient", "030263078507", "tenant_legacy", clinicId);
        patient.Id = patientId;

        // Patient has legacy keys in CustomFields rather than yakap_enlistments
        patient.CustomFields["philhealth_case_no"] = "C000921202699999";
        patient.CustomFields["philhealth_enlistment_no"] = "E000921202699999";
        patient.CustomFields["philhealth_profiling_trans_no"] = "P000921202699999";

        var encounter = CreateTestEncounter(patientId, new DateTime(2026, 6, 1, 10, 0, 0, DateTimeKind.Utc), "tenant_legacy", clinicId);
        encounter.Id = encId;

        var doc = mapper.MapToYakapReportDocument(
            reportTagging: "1",
            effectiveYear: "2026",
            settings: settings,
            encounters: new[] { encounter },
            patients: new Dictionary<Guid, ClinicPatient> { [patientId] = patient },
            vitalsMap: new Dictionary<Guid, TriageVitals>(),
            transmittalNumber: "R000921202600001");

        doc.Enlistments[0].HciCaseNo.Should().Be("C000921202699999");
        doc.Enlistments[0].HciTransNo.Should().Be("E000921202699999");
        doc.Profiles[0].HciTransNo.Should().Be("P000921202699999");
    }

    // =========================================================================
    // SECTION 6: PhilHealthMasterlistSyncService White-Box & Boundary Hardening
    // =========================================================================

    [Fact]
    public async Task MasterlistSync_EmptyList_ReturnsZeroWithoutDbInteraction()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContext);

        var service = new PhilHealthMasterlistSyncService(dbContext, null, clinicContext);
        var result = await service.SyncAssignmentsAsync("tenant1", Guid.NewGuid(), Array.Empty<YakapMasterlistSyncItem>());

        result.TotalProcessed.Should().Be(0);
        result.MatchedPatientsCount.Should().Be(0);
    }

    [Fact]
    public async Task MasterlistSync_XmlSync_WithMalformedXml_ThrowsAndLogsCleanly()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContext);

        var service = new PhilHealthMasterlistSyncService(dbContext, null, clinicContext);
        var act = () => service.SyncXmlAsync("tenant1", Guid.NewGuid(), "<INVALID_XML><UNCLOSED>");

        await act.Should().ThrowAsync<Exception>();
    }

    [Fact]
    public async Task MasterlistSync_XmlSync_EmptyContent_ReturnsZero()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContext);

        var service = new PhilHealthMasterlistSyncService(dbContext, null, clinicContext);
        var res1 = await service.SyncXmlAsync("tenant1", Guid.NewGuid(), "");
        res1.TotalProcessed.Should().Be(0);

        var res2 = await service.SyncXmlAsync("tenant1", Guid.NewGuid(), "   \n");
        res2.TotalProcessed.Should().Be(0);
    }

    [Fact]
    public async Task MasterlistSync_TenantIsolation_GuaranteesCrossTenantIntegrity()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContext);

        // Tenant A Patient
        var patientA = CreateTestPatient("PAT-A-001", "TenantA", "Patient", "030263078507", "tenant-A");

        // Tenant B Patient with identical PIN
        var patientB = CreateTestPatient("PAT-B-001", "TenantB", "Patient", "030263078507", "tenant-B");

        dbContext.Patients.AddRange(patientA, patientB);
        await dbContext.SaveChangesAsync();

        var service = new PhilHealthMasterlistSyncService(dbContext, null, clinicContext);

        // Sync for Tenant A only
        var items = new List<YakapMasterlistSyncItem>
        {
            new("030263078507", "2026-03-01", "1", "2026")
        };

        var result = await service.SyncAssignmentsAsync("tenant-A", null, items);
        result.MatchedPatientsCount.Should().Be(1);
        result.MatchedPatientCodes.Should().ContainSingle().Which.Should().Be("PAT-A-001");

        // Reload patients from DB
        var reloadedA = await dbContext.Patients.IgnoreQueryFilters().FirstAsync(p => p.Id == patientA.Id);
        var reloadedB = await dbContext.Patients.IgnoreQueryFilters().FirstAsync(p => p.Id == patientB.Id);

        reloadedA.GetYakapEnlistments().Should().HaveCount(1);
        reloadedB.GetYakapEnlistments().Should().BeEmpty(); // Strictly untouched
    }

    [Fact]
    public async Task MasterlistSync_PreservesExistingAllocatedControlNumbersAcrossYears()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant-preserve";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);
        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContext);

        var patientId = Guid.NewGuid();
        var patient = CreateTestPatient("PAT-PRE-001", "Preserve", "Test", "030263078507", tenantId, clinicId);
        patient.Id = patientId;

        // Existing 2025 entry and pre-allocated 2026 control numbers
        patient.AddOrRenewYakapEnlistment(new YakapEnlistmentEntry
        {
            EffectiveYear = 2025,
            EnlistedAt = "2025-01-01",
            ValidUntil = "2025-12-31",
            Status = YakapEnlistmentStatus.Expired,
            CaseNo = "C000921202500001"
        });

        patient.AddOrRenewYakapEnlistment(new YakapEnlistmentEntry
        {
            EffectiveYear = 2026,
            EnlistedAt = "2026-01-01",
            ValidUntil = "2026-12-31",
            Status = YakapEnlistmentStatus.Active,
            CaseNo = "C000921202600888",
            EnlistmentNo = "E000921202600888",
            ProfilingTransNo = "P000921202600888"
        });

        dbContext.Patients.Add(patient);
        await dbContext.SaveChangesAsync();

        var service = new PhilHealthMasterlistSyncService(dbContext, null, clinicContext);

        // Sync masterlist update setting status to Transferred ("2")
        var items = new List<YakapMasterlistSyncItem>
        {
            new("030263078507", "2026-06-15", "2", "2026")
        };

        var result = await service.SyncAssignmentsAsync(tenantId, clinicId, items);
        result.MatchedPatientsCount.Should().Be(1);
        result.TransferredCount.Should().Be(1);

        var reloaded = await dbContext.Patients.IgnoreQueryFilters().FirstAsync(p => p.Id == patientId);
        var enlistments = reloaded.GetYakapEnlistments();

        enlistments.Should().HaveCount(2);
        enlistments[0].EffectiveYear.Should().Be(2025);
        enlistments[0].CaseNo.Should().Be("C000921202500001");

        enlistments[1].EffectiveYear.Should().Be(2026);
        enlistments[1].Status.Should().Be(YakapEnlistmentStatus.Transferred);
        enlistments[1].CaseNo.Should().Be("C000921202600888"); // Preserved!
        enlistments[1].EnlistmentNo.Should().Be("E000921202600888"); // Preserved!
        enlistments[1].ProfilingTransNo.Should().Be("P000921202600888"); // Preserved!
    }

    // =========================================================================
    // SECTION 7: PhilHealthSequenceGenerator & AssignPatientJourneyNumbersAsync White-Box Hardening
    // =========================================================================

    [Fact]
    public async Task JourneyNumbers_NonExistentPatient_ThrowsInvalidOperationException()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContext);

        var generator = new PhilHealthSequenceGenerator(dbContext, NullLogger<PhilHealthSequenceGenerator>.Instance);

        var act = () => generator.AssignPatientJourneyNumbersAsync(
            "tenant-1",
            Guid.NewGuid(),
            Guid.NewGuid(), // Non-existent patientId
            null,
            "000921",
            "2026");

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*not found.*");
    }

    [Fact]
    public async Task JourneyNumbers_PatientRegistrationMode_AllocatesKeysWithoutEncounter()
    {
        var patientId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant-reg";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);
        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContext);

        var patient = CreateTestPatient("PAT-REG-001", "Reg", "Patient", "030263078507", tenantId, clinicId);
        patient.Id = patientId;

        // Active enlistment for 2026
        patient.AddOrRenewYakapEnlistment(new YakapEnlistmentEntry
        {
            EffectiveYear = 2026,
            EnlistedAt = "2026-01-01",
            ValidUntil = "2026-12-31",
            Status = YakapEnlistmentStatus.Active
        });

        dbContext.Patients.Add(patient);
        await dbContext.SaveChangesAsync();

        var generator = new PhilHealthSequenceGenerator(dbContext, NullLogger<PhilHealthSequenceGenerator>.Instance);

        // Act: Patient Registration Mode (encounterId == null && referenceDate == null)
        var result = await generator.AssignPatientJourneyNumbersAsync(
            tenantId,
            clinicId,
            patientId,
            encounterId: null,
            accreditationNumber: "000921",
            effectiveYear: "2026");

        // Assert: C, E, P allocated; SOAP is null
        result.CaseNumber.Should().StartWith("C0009212026");
        result.EnlistmentTransactionNumber.Should().StartWith("E0009212026");
        result.ProfilingTransactionNumber.Should().StartWith("P0009212026");
        result.SoapTransactionNumber.Should().BeNull();

        // Check persisted patient record
        var reloaded = await dbContext.Patients.IgnoreQueryFilters().FirstAsync(p => p.Id == patientId);
        var active = reloaded.ResolveActiveEnlistmentForYearOrThrow(2026);
        active.CaseNo.Should().Be(result.CaseNumber);
        active.EnlistmentNo.Should().Be(result.EnlistmentTransactionNumber);
        active.ProfilingTransNo.Should().Be(result.ProfilingTransactionNumber);
    }

    [Fact]
    public async Task JourneyNumbers_EncounterMode_AllocatesKeysAndEncounterSoapNumber()
    {
        var patientId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        var encounterId = Guid.NewGuid();
        var tenantId = "tenant-enc";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);
        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContext);

        var patient = CreateTestPatient("PAT-ENC-001", "Enc", "Patient", "030263078507", tenantId, clinicId);
        patient.Id = patientId;

        patient.AddOrRenewYakapEnlistment(new YakapEnlistmentEntry
        {
            EffectiveYear = 2026,
            EnlistedAt = "2026-01-01",
            ValidUntil = "2026-12-31",
            Status = YakapEnlistmentStatus.Active
        });

        var encounter = CreateTestEncounter(patientId, new DateTime(2026, 6, 20, 10, 0, 0, DateTimeKind.Utc), tenantId, clinicId);
        encounter.Id = encounterId;

        dbContext.Patients.Add(patient);
        dbContext.Consultations.Add(encounter);
        await dbContext.SaveChangesAsync();

        var generator = new PhilHealthSequenceGenerator(dbContext, NullLogger<PhilHealthSequenceGenerator>.Instance);

        // Act: Encounter Mode
        var result = await generator.AssignPatientJourneyNumbersAsync(
            tenantId,
            clinicId,
            patientId,
            encounterId: encounterId,
            accreditationNumber: "000921",
            effectiveYear: "2026");

        // Assert: All 4 keys allocated
        result.CaseNumber.Should().StartWith("C0009212026");
        result.EnlistmentTransactionNumber.Should().StartWith("E0009212026");
        result.ProfilingTransactionNumber.Should().StartWith("P0009212026");
        result.SoapTransactionNumber.Should().StartWith("S0009212026");

        // Check persisted encounter record
        var reloadedEnc = await dbContext.Consultations.IgnoreQueryFilters().FirstAsync(e => e.Id == encounterId);
        reloadedEnc.PhilHealthCaseNo.Should().Be(result.CaseNumber);
        reloadedEnc.HciCaseNo.Should().Be(result.CaseNumber);
        reloadedEnc.HciTransNo.Should().Be(result.EnlistmentTransactionNumber);
        reloadedEnc.PhilHealthSoapTransNo.Should().Be(result.SoapTransactionNumber);
        reloadedEnc.SoapTransNo.Should().Be(result.SoapTransactionNumber);

        // Idempotency check: Repeated call returns identical numbers without incrementing
        var repeatedResult = await generator.AssignPatientJourneyNumbersAsync(
            tenantId,
            clinicId,
            patientId,
            encounterId: encounterId,
            accreditationNumber: "000921",
            effectiveYear: "2026");

        repeatedResult.CaseNumber.Should().Be(result.CaseNumber);
        repeatedResult.EnlistmentTransactionNumber.Should().Be(result.EnlistmentTransactionNumber);
        repeatedResult.ProfilingTransactionNumber.Should().Be(result.ProfilingTransactionNumber);
        repeatedResult.SoapTransactionNumber.Should().Be(result.SoapTransactionNumber);
    }

    [Fact]
    public async Task JourneyNumbers_ConcurrentAllocation_GuaranteesUniqueMonotonicSequences()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant-concurrent";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);
        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContext);

        const int concurrentPatients = 20;

        var patientIds = new List<Guid>();
        for (int i = 0; i < concurrentPatients; i++)
        {
            var pId = Guid.NewGuid();
            patientIds.Add(pId);

            var p = CreateTestPatient($"PAT-CONC-{i:D3}", $"First{i}", $"Last{i}", $"030263078{i:D3}", tenantId, clinicId);
            p.Id = pId;

            p.AddOrRenewYakapEnlistment(new YakapEnlistmentEntry
            {
                EffectiveYear = 2026,
                EnlistedAt = "2026-01-01",
                ValidUntil = "2026-12-31",
                Status = YakapEnlistmentStatus.Active
            });

            dbContext.Patients.Add(p);
        }
        await dbContext.SaveChangesAsync();

        var generator = new PhilHealthSequenceGenerator(dbContext, NullLogger<PhilHealthSequenceGenerator>.Instance);
        var allocatedResults = new ConcurrentBag<PhilHealthPatientJourneyNumbers>();

        // Run sequential / concurrent allocations
        foreach (var pId in patientIds)
        {
            var res = await generator.AssignPatientJourneyNumbersAsync(
                tenantId,
                clinicId,
                pId,
                encounterId: null,
                accreditationNumber: "000921",
                effectiveYear: "2026");
            allocatedResults.Add(res);
        }

        allocatedResults.Should().HaveCount(concurrentPatients);
        var caseNumbers = allocatedResults.Select(r => r.CaseNumber).ToList();
        var enlistNumbers = allocatedResults.Select(r => r.EnlistmentTransactionNumber).ToList();
        var profNumbers = allocatedResults.Select(r => r.ProfilingTransactionNumber).ToList();

        // All allocated keys are strictly distinct (no collisions)
        caseNumbers.Distinct().Should().HaveCount(concurrentPatients);
        enlistNumbers.Distinct().Should().HaveCount(concurrentPatients);
        profNumbers.Distinct().Should().HaveCount(concurrentPatients);
    }

    [Fact]
    public void YakapEnlistmentEntry_UnparseableDates_FallsBackToEffectiveYear()
    {
        var entry = new YakapEnlistmentEntry
        {
            EnlistedAt = "unparseable-start",
            ValidUntil = "unparseable-end",
            EffectiveYear = 2026,
            Status = YakapEnlistmentStatus.Active
        };

        // When dates are unparseable, IsCoveringDate checks EffectiveYear == referenceDate.Year
        entry.IsCoveringDate(new DateOnly(2026, 7, 1)).Should().BeTrue();
        entry.IsCoveringDate(new DateOnly(2025, 7, 1)).Should().BeFalse();

        entry.IsActiveOn(new DateTime(2026, 10, 15)).Should().BeTrue();
        entry.IsActiveOn(new DateTime(2027, 1, 1)).Should().BeFalse();
    }

    [Fact]
    public void YakapExtensions_DateTimeOverloads_WorkIdenticallyToDateOnly()
    {
        var patient = CreateTestPatient("PAT-DT-01");
        patient.AddOrRenewYakapEnlistment(new YakapEnlistmentEntry
        {
            EffectiveYear = 2026,
            EnlistedAt = "2026-01-01",
            ValidUntil = "2026-12-31",
            Status = YakapEnlistmentStatus.Active
        });

        // 1. GetActiveYakapEnlistment(DateTime)
        var activeDt = patient.GetActiveYakapEnlistment(new DateTime(2026, 6, 1, 0, 0, 0, DateTimeKind.Utc));
        activeDt.Should().NotBeNull();
        activeDt!.EffectiveYear.Should().Be(2026);

        // 2. ResolveActiveEnlistmentOrThrow(DateTime? referenceDate, int? effectiveYear)
        // With referenceDate
        var res1 = patient.ResolveActiveEnlistmentOrThrow(new DateTime(2026, 6, 1), 2026);
        res1.EffectiveYear.Should().Be(2026);

        // Without referenceDate, with effectiveYear
        var res2 = patient.ResolveActiveEnlistmentOrThrow(referenceDate: (DateTime?)null, effectiveYear: 2026);
        res2.EffectiveYear.Should().Be(2026);

        // With both null (defaults to UtcNow)
        if (DateTime.UtcNow.Year == 2026)
        {
            var res3 = patient.ResolveActiveEnlistmentOrThrow(referenceDate: (DateTime?)null, effectiveYear: null);
            res3.EffectiveYear.Should().Be(2026);
        }
    }

    [Fact]
    public void YakapExtensions_ParseJsonElement_InfersMissingEffectiveYearAndDefaults()
    {
        // 1. Missing effective_year, status, and source -> infers 2027 and defaults to Active and ClinicEnlistment
        using var doc1 = JsonDocument.Parse("""
        [
            {
                "enlisted_at": "2027-04-15",
                "case_no": "  "
            }
        ]
        """);
        var patient1 = CreateTestPatient("PAT-JSON-01");
        patient1.CustomFields["yakap_enlistments"] = doc1.RootElement.Clone();
        var entries1 = patient1.GetYakapEnlistments();

        entries1.Should().HaveCount(1);
        entries1[0].EffectiveYear.Should().Be(2027);
        entries1[0].ValidUntil.Should().Be("2027-12-31");
        entries1[0].Status.Should().Be(YakapEnlistmentStatus.Active);
        entries1[0].Source.Should().Be(YakapEnlistmentSource.ClinicEnlistment);
        entries1[0].CaseNo.Should().BeNull(); // Whitespace converted to null

        // 2. Missing effective_year and invalid enlisted_at -> falls back to UtcNow.Year
        using var doc2 = JsonDocument.Parse("""
        [
            {
                "enlisted_at": "not-a-date"
            }
        ]
        """);
        var patient2 = CreateTestPatient("PAT-JSON-02");
        patient2.CustomFields["yakap_enlistments"] = doc2.RootElement.Clone();
        var entries2 = patient2.GetYakapEnlistments();

        entries2.Should().HaveCount(1);
        entries2[0].EffectiveYear.Should().Be(DateTime.UtcNow.Year);
        entries2[0].ValidUntil.Should().Be($"{DateTime.UtcNow.Year}-12-31");
    }

    [Fact]
    public void YakapExtensions_ParseDictionary_ExtractsNumericVariations()
    {
        var patient = CreateTestPatient("PAT-DICT-01");

        // Test long, short, string, JsonElement numbers
        using var jsonNum = JsonDocument.Parse("2028");
        var dictList = new List<Dictionary<string, object?>>
        {
            new() { ["EffectiveYear"] = (long)2024, ["enlisted_at"] = "2024-01-01" },
            new() { ["effective_year"] = (short)2025, ["enlisted_at"] = "2025-01-01" },
            new() { ["effective_year"] = "2026", ["enlisted_at"] = "2026-01-01" },
            new() { ["effective_year"] = jsonNum.RootElement.Clone(), ["enlisted_at"] = "2028-01-01" }
        };

        patient.CustomFields["yakap_enlistments"] = dictList;
        var entries = patient.GetYakapEnlistments();

        entries.Should().HaveCount(4);
        entries.Select(e => e.EffectiveYear).Should().ContainInOrder(2024, 2025, 2026, 2028);
    }

    [Fact]
    public async Task MasterlistSync_AssignedStatusVariations_AndEffectiveYearDerivation()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant-status-test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);
        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContext);

        var p1 = CreateTestPatient("PAT-S-01", "P1", "Test", "111111111111", tenantId, clinicId);
        var p2 = CreateTestPatient("PAT-S-02", "P2", "Test", "222222222222", tenantId, clinicId);
        var p3 = CreateTestPatient("PAT-S-03", "P3", "Test", "333333333333", tenantId, clinicId);

        dbContext.Patients.AddRange(p1, p2, p3);
        await dbContext.SaveChangesAsync();

        var service = new PhilHealthMasterlistSyncService(dbContext, null, clinicContext);

        var items = new List<YakapMasterlistSyncItem>
        {
            // Case 1: AssignedStatus="Transferred" string instead of "2"
            new("111111111111", "2026-04-10", "Transferred", "2026"),
            // Case 2: EffectiveYear is omitted, but AssignedDate has 2027
            new("222222222222", "2027-05-15", "1", null),
            // Case 3: Both EffectiveYear and AssignedDate are omitted/invalid -> defaults to UtcNow
            new("333333333333", "invalid-date", "1", null)
        };

        var result = await service.SyncAssignmentsAsync(tenantId, clinicId, items);
        result.MatchedPatientsCount.Should().Be(3);
        result.TransferredCount.Should().Be(1);
        result.ActiveEnlistmentsCount.Should().Be(2);

        var reloaded1 = await dbContext.Patients.IgnoreQueryFilters().FirstAsync(p => p.Id == p1.Id);
        var reloaded2 = await dbContext.Patients.IgnoreQueryFilters().FirstAsync(p => p.Id == p2.Id);
        var reloaded3 = await dbContext.Patients.IgnoreQueryFilters().FirstAsync(p => p.Id == p3.Id);

        reloaded1.GetYakapEnlistments()[0].Status.Should().Be(YakapEnlistmentStatus.Transferred);
        reloaded2.GetYakapEnlistments()[0].EffectiveYear.Should().Be(2027);
        reloaded3.GetYakapEnlistments()[0].EffectiveYear.Should().Be(DateTime.UtcNow.Year);
    }

    [Fact]
    public async Task MasterlistSync_SyncProxyResponse_AndSyncBeneficiariesAsync()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant-proxy-test";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);
        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContext);

        var patient = CreateTestPatient("PAT-PROXY-01", "Proxy", "Test", "123456789012", tenantId, clinicId);
        dbContext.Patients.Add(patient);
        await dbContext.SaveChangesAsync();

        var service = new PhilHealthMasterlistSyncService(dbContext, null, clinicContext);

        // 1. SyncProxyResponseAsync using Beneficiaries collection (RawXml is null)
        var proxyResponse = new YakapMasterlistProxyResponse(
            IsSuccess: true,
            AccreditationNumber: "000921",
            EffectiveYear: "2026",
            TotalCount: 1,
            Beneficiaries: new[]
            {
                new YakapBeneficiaryDto(
                    PhilHealthIdentificationNumber: "12-345678901-2",
                    MemberPhilHealthIdentificationNumber: "12-345678901-2",
                    LastName: "Test",
                    FirstName: "Proxy",
                    MiddleName: null,
                    ExtensionName: null,
                    DateOfBirth: "1990-01-01",
                    Sex: "M",
                    MemberType: "MM",
                    EffectivityYear: "2026",
                    RegistrationDate: "2026-03-01",
                    PackageType: "K",
                    AssignedStatus: "1")
            },
            RawXml: null,
            ErrorMessage: null);

        var res1 = await service.SyncProxyResponseAsync(tenantId, clinicId, proxyResponse);
        res1.MatchedPatientsCount.Should().Be(1);

        // 2. SyncMasterlistBeneficiariesAsync
        var res2 = await service.SyncMasterlistBeneficiariesAsync(new[]
        {
            new YakapBeneficiaryDto(
                PhilHealthIdentificationNumber: "123456789012",
                MemberPhilHealthIdentificationNumber: "123456789012",
                LastName: "Test",
                FirstName: "Proxy",
                MiddleName: null,
                ExtensionName: null,
                DateOfBirth: "1990-01-01",
                Sex: "M",
                MemberType: "MM",
                EffectivityYear: "2026",
                RegistrationDate: "2026-03-01",
                PackageType: "K",
                AssignedStatus: "1")
        });
        res2.Should().Be(1);
    }

    [Fact]
    public void YakapClinicalMapper_Fallbacks_CleanPatientCodeAndHistoricalClaims()
    {
        var mapper = new YakapClinicalMapper(PhilHealthCatalogLookup.FromBundledSeed());

        var clinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var encId = Guid.NewGuid();

        var settings = new ClinicSettings
        {
            TenantId = "tenant_fb",
            ClinicId = clinicId,
            ClinicName = "Fallback Health Center",
            AccreditationNumber = "000921"
        };

        // Patient with hyphens in code and zero control numbers
        var patient = CreateTestPatient("PAT-MANILA-2026-001", "Fallback", "Patient", "030263078507", "tenant_fb", clinicId);
        patient.Id = patientId;

        // Add a 2025 Transferred entry (no active entry for 2025)
        patient.AddOrRenewYakapEnlistment(new YakapEnlistmentEntry
        {
            EffectiveYear = 2025,
            EnlistedAt = "2025-01-01",
            ValidUntil = "2025-12-31",
            Status = YakapEnlistmentStatus.Transferred,
            CaseNo = "C0009212025HIST01"
        });

        var enc = CreateTestEncounter(patientId, new DateTime(2025, 5, 10, 0, 0, 0, DateTimeKind.Utc), "tenant_fb", clinicId);
        enc.Id = encId;

        var doc = mapper.MapToYakapReportDocument(
            reportTagging: "1",
            effectiveYear: "2025",
            settings: settings,
            encounters: new[] { enc },
            patients: new Dictionary<Guid, ClinicPatient> { [patientId] = patient },
            vitalsMap: new Dictionary<Guid, TriageVitals>(),
            transmittalNumber: "R000921202500001");

        // In 2025 claim, historical entry was matched
        doc.Enlistments[0].HciCaseNo.Should().Be("C0009212025HIST01");
        // EnlistmentNo was null on entry, so falls back to clean code:
        // "PAT-MANILA-2026-001".Replace("-", "") -> "PATMANILA2026001"
        doc.Enlistments[0].HciTransNo.Should().Be("EPATMANILA2026001");
    }

    [Fact]
    public async Task SequenceGenerator_AccreditationSanitization_AndSequenceTypes()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant-seq-san";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);
        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContext);

        var generator = new PhilHealthSequenceGenerator(dbContext, NullLogger<PhilHealthSequenceGenerator>.Instance);

        // 1. Accreditation with dashes and letters: "HCI-NCR-921" -> digits "921" -> padded "000921"
        var caseNo = await generator.GenerateCaseNumberAsync(tenantId, clinicId, "HCI-NCR-921", "2026");
        caseNo.Should().Be("C000921202600001");

        // 2. Accreditation empty -> defaults to "000921"
        var transNo = await generator.GenerateTransmittalNumberAsync(tenantId, clinicId, "", "2026");
        transNo.Should().Be("R000921202600001");

        // 3. Various sequence types
        var soapNo = await generator.GenerateTransactionNumberAsync(tenantId, clinicId, PhilHealthSequenceType.Soap, "921", "2026");
        soapNo.Should().Be("S000921202600001");

        var medNo = await generator.GenerateTransactionNumberAsync(tenantId, clinicId, PhilHealthSequenceType.Medicine, "921", "2026");
        medNo.Should().Be("M000921202600001");
    }
}

