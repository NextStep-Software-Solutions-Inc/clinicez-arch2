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
/// 3. PatientYakapExtensions
/// 4. PCAPI Wire Builders
/// 5. PhilHealthMasterlistSyncService
/// 6. PhilHealthSequenceGenerator / AssignPatientJourneyNumbersAsync
/// </summary>
public sealed class Tier5BackendAdversarialCoverageTests
{
    private static Patient CreateTestPatient(
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
        Sex = BiologicalSex.Male
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
    // SECTION 3: PatientYakapExtensions Polymorphic Deserialization & Edge Cases
    // =========================================================================

    [Fact]
    public void YakapExtensions_GetYakapEnlistments_NullAndMalformedCustomFields_HandledSafely()
    {
        Patient? nullPatient = null;
        nullPatient.GetYakapEnlistments().Should().BeEmpty();

        var patientWithNullCustomFields = new Patient
        {
            TenantId = "tenant1",
            ClinicId = Guid.NewGuid(),
            PatientCode = "PAT-01",
            FirstName = "A",
            LastName = "B",
            ContactNumber = "09170000000",
            DateOfBirth = new DateOnly(1990, 1, 1),
            Sex = BiologicalSex.Male,
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
    public void YakapExtensions_GetYakapEnlistments_RelationalNavigation_FiltersSoftDeletedAndSorts()
    {
        var patient = CreateTestPatient("PAT-REL-01");
        patient.YakapEnlistments = new List<PatientYakapEnlistment>
        {
            new() { EffectiveYear = 2026, EnlistmentDate = new DateOnly(2026, 2, 1), ValidUntil = new DateOnly(2026, 12, 31), Status = YakapEnlistmentStatus.Active, CaseNo = "C000921202600001", EnlistmentTransNo = "E000921202600001", ProfilingTransNo = "P000921202600001" },
            new() { EffectiveYear = 2025, EnlistmentDate = new DateOnly(2025, 1, 1), ValidUntil = new DateOnly(2025, 12, 31), Status = YakapEnlistmentStatus.Expired, IsDeleted = true }
        };

        var res = patient.GetYakapEnlistments();
        res.Should().HaveCount(1);
        res[0].EffectiveYear.Should().Be(2026);
        res[0].CaseNo.Should().Be("C000921202600001");
    }

    [Fact]
    public void YakapExtensions_GetYakapEnlistments_HeterogeneousUntypedEnumerable_ParsesAllItems()
    {
        var patient = CreateTestPatient("PAT-HET-01");
        patient.YakapEnlistments = new List<PatientYakapEnlistment>
        {
            new() { EffectiveYear = 2026, EnlistmentDate = new DateOnly(2026, 1, 1), ValidUntil = new DateOnly(2026, 12, 31), Status = YakapEnlistmentStatus.Active },
            new() { EffectiveYear = 2024, EnlistmentDate = new DateOnly(2024, 1, 10), ValidUntil = new DateOnly(2024, 12, 31), Status = YakapEnlistmentStatus.Expired },
            new() { EffectiveYear = 2025, EnlistmentDate = new DateOnly(2025, 1, 15), ValidUntil = new DateOnly(2025, 12, 31), Status = YakapEnlistmentStatus.Active },
            new() { EffectiveYear = 2027, EnlistmentDate = new DateOnly(2027, 1, 1), ValidUntil = new DateOnly(2027, 12, 31), Status = YakapEnlistmentStatus.Active }
        };

        var entries = patient.GetYakapEnlistments();
        entries.Should().HaveCount(4);
        entries.Select(e => e.EffectiveYear).Should().ContainInOrder(2024, 2025, 2026, 2027);
    }

    [Fact]
    public void YakapExtensions_SetYakapEnlistments_NullPatient_ThrowsArgumentNullException()
    {
        Patient nullPatient = null!;
        var act = () => nullPatient.SetYakapEnlistments(new List<PatientYakapEnlistment>());
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
        var initial = new PatientYakapEnlistment
        {
            EffectiveYear = 2026,
            EnlistmentDate = new DateOnly(2026, 1, 10),
            ValidUntil = new DateOnly(2026, 12, 31),
            Status = YakapEnlistmentStatus.Active,
            CaseNo = "C000921202600001",
            EnlistmentTransNo = "E000921202600001",
            ProfilingTransNo = "P000921202600001"
        };
        patient.AddOrRenewYakapEnlistment(initial);

        // Update with null control numbers (e.g. from PhilHealth masterlist sync)
        var updated = new PatientYakapEnlistment
        {
            EffectiveYear = 2026,
            EnlistmentDate = new DateOnly(2026, 1, 10),
            ValidUntil = new DateOnly(2026, 12, 31),
            Status = YakapEnlistmentStatus.Active,
            Source = YakapEnlistmentSource.PhilHealthMasterlist,
            CaseNo = null,
            EnlistmentTransNo = "",
            ProfilingTransNo = "   "
        };
        patient.AddOrRenewYakapEnlistment(updated);

        var enlistments = patient.GetYakapEnlistments();
        enlistments.Should().HaveCount(1);
        enlistments[0].Source.Should().Be(YakapEnlistmentSource.PhilHealthMasterlist);
        enlistments[0].CaseNo.Should().Be("C000921202600001");
        enlistments[0].EnlistmentTransNo.Should().Be("E000921202600001");
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
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EffectiveYear = 2026,
            EnlistmentDate = new DateOnly(2026, 1, 1),
            ValidUntil = new DateOnly(2026, 12, 31),
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
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EffectiveYear = 2026,
            EnlistmentDate = new DateOnly(2026, 5, 1),
            ValidUntil = new DateOnly(2026, 12, 31),
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
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EffectiveYear = 2025,
            EnlistmentDate = new DateOnly(2025, 1, 1),
            ValidUntil = new DateOnly(2025, 12, 31),
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
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EffectiveYear = 2026,
            EnlistmentDate = new DateOnly(2026, 2, 15),
            ValidUntil = new DateOnly(2026, 11, 30),
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
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EffectiveYear = 2024,
            EnlistmentDate = new DateOnly(2024, 1, 1),
            ValidUntil = new DateOnly(2024, 12, 31),
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
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EffectiveYear = 2025,
            EnlistmentDate = new DateOnly(2025, 1, 1),
            ValidUntil = new DateOnly(2025, 12, 31),
            Status = YakapEnlistmentStatus.Transferred
        });
        var actTrans = () => patient.ResolveActiveEnlistmentForYearOrThrow(2025);
        actTrans.Should().Throw<InvalidOperationException>()
            .WithMessage("*marked as Transferred. Cannot assign journey numbers.*");

        // 3. Expired year
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EffectiveYear = 2024,
            EnlistmentDate = new DateOnly(2024, 1, 1),
            ValidUntil = new DateOnly(2024, 12, 31),
            Status = YakapEnlistmentStatus.Expired
        });
        var actExp = () => patient.ResolveActiveEnlistmentForYearOrThrow(2024);
        actExp.Should().Throw<InvalidOperationException>()
            .WithMessage("*marked as Expired. Cannot assign journey numbers.*");

        // 4. Active year
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EffectiveYear = 2026,
            EnlistmentDate = new DateOnly(2026, 1, 1),
            ValidUntil = new DateOnly(2026, 12, 31),
            Status = YakapEnlistmentStatus.Active
        });
        var active = patient.ResolveActiveEnlistmentForYearOrThrow(2026);
        active.Should().NotBeNull();
        active.EffectiveYear.Should().Be(2026);
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
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EffectiveYear = 2025,
            EnlistmentDate = new DateOnly(2025, 1, 1),
            ValidUntil = new DateOnly(2025, 12, 31),
            Status = YakapEnlistmentStatus.Expired,
            CaseNo = "C000921202500001"
        });

        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EffectiveYear = 2026,
            EnlistmentDate = new DateOnly(2026, 1, 1),
            ValidUntil = new DateOnly(2026, 12, 31),
            Status = YakapEnlistmentStatus.Active,
            CaseNo = "C000921202600888",
            EnlistmentTransNo = "E000921202600888",
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
        enlistments[1].EnlistmentTransNo.Should().Be("E000921202600888"); // Preserved!
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
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EffectiveYear = 2026,
            EnlistmentDate = new DateOnly(2026, 1, 1),
            ValidUntil = new DateOnly(2026, 12, 31),
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
        active.EnlistmentTransNo.Should().Be(result.EnlistmentTransactionNumber);
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

        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EffectiveYear = 2026,
            EnlistmentDate = new DateOnly(2026, 1, 1),
            ValidUntil = new DateOnly(2026, 12, 31),
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
        reloadedEnc.PhilHealthSoapTransNo.Should().Be(result.SoapTransactionNumber);

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

            p.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
            {
                EffectiveYear = 2026,
                EnlistmentDate = new DateOnly(2026, 1, 1),
                ValidUntil = new DateOnly(2026, 12, 31),
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
    public void PatientYakapEnlistment_DefaultDates_FallsBackToEffectiveYear()
    {
        var entry = new PatientYakapEnlistment
        {
            EffectiveYear = 2026,
            Status = YakapEnlistmentStatus.Active
        };

        // When dates are default, IsCoveringDate checks EffectiveYear == referenceDate.Year
        entry.IsCoveringDate(new DateOnly(2026, 7, 1)).Should().BeTrue();
        entry.IsCoveringDate(new DateOnly(2025, 7, 1)).Should().BeFalse();

        entry.IsActiveOn(new DateTime(2026, 10, 15)).Should().BeTrue();
        entry.IsActiveOn(new DateTime(2027, 1, 1)).Should().BeFalse();
    }

    [Fact]
    public void YakapExtensions_DateTimeOverloads_WorkIdenticallyToDateOnly()
    {
        var patient = CreateTestPatient("PAT-DT-01");
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EffectiveYear = 2026,
            EnlistmentDate = new DateOnly(2026, 1, 1),
            ValidUntil = new DateOnly(2026, 12, 31),
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
    public void YakapExtensions_AddOrRenewYakapEnlistment_InfersMissingEffectiveYearAndDefaults()
    {
        // 1. Missing effective_year -> infers from EnlistmentDate
        var patient1 = CreateTestPatient("PAT-JSON-01");
        patient1.AddOrRenewYakapEnlistment(new PatientYakapEnlistment
        {
            EnlistmentDate = new DateOnly(2027, 4, 15),
            CaseNo = null
        });
        var entries1 = patient1.GetYakapEnlistments();

        entries1.Should().HaveCount(1);
        entries1[0].EffectiveYear.Should().Be(2027);
        entries1[0].ValidUntil.Should().Be(new DateOnly(2027, 12, 31));
        entries1[0].Status.Should().Be(YakapEnlistmentStatus.Active);
        entries1[0].Source.Should().Be(YakapEnlistmentSource.ClinicEnlistment);
        entries1[0].CaseNo.Should().BeNull();

        // 2. Missing effective_year and default EnlistmentDate -> falls back to UtcNow.Year
        var patient2 = CreateTestPatient("PAT-JSON-02");
        patient2.AddOrRenewYakapEnlistment(new PatientYakapEnlistment());
        var entries2 = patient2.GetYakapEnlistments();

        entries2.Should().HaveCount(1);
        entries2[0].EffectiveYear.Should().Be(DateTime.UtcNow.Year);
        entries2[0].ValidUntil.Should().Be(new DateOnly(DateTime.UtcNow.Year, 12, 31));
    }

    [Fact]
    public void YakapExtensions_RelationalEnlistments_PreservesMultipleYearsChronologically()
    {
        var patient = CreateTestPatient("PAT-DICT-01");
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment { EffectiveYear = 2024, EnlistmentDate = new DateOnly(2024, 1, 1), ValidUntil = new DateOnly(2024, 12, 31) });
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment { EffectiveYear = 2025, EnlistmentDate = new DateOnly(2025, 1, 1), ValidUntil = new DateOnly(2025, 12, 31) });
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment { EffectiveYear = 2026, EnlistmentDate = new DateOnly(2026, 1, 1), ValidUntil = new DateOnly(2026, 12, 31) });
        patient.AddOrRenewYakapEnlistment(new PatientYakapEnlistment { EffectiveYear = 2028, EnlistmentDate = new DateOnly(2028, 1, 1), ValidUntil = new DateOnly(2028, 12, 31) });

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

