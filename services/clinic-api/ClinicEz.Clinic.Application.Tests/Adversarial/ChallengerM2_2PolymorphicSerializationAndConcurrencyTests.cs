using System;
using System.Collections;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Services;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Empirical Adversarial Stress Test Suite for Milestone 2 Challenger 2:
/// 1. Polymorphic deserialization of CustomFields["yakap_enlistments"] across heterogeneous formats.
/// 2. Effective year variations (int, string, missing, fallback).
/// 3. Case-insensitive key matching (snake_case, PascalCase, mixed-case, uppercase).
/// 4. Roundtrip serialization from domain record to dictionary, JSON, and back.
/// 5. Sequence generator concurrency stress testing and race condition resilience.
/// </summary>
public sealed class ChallengerM2_2PolymorphicSerializationAndConcurrencyTests
{
    private static ClinicPatient CreatePatientWithRawEnlistments(object? raw)
    {
        var patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_adv_m2",
            ClinicId = Guid.NewGuid(),
            PatientCode = "PAT-ADV-001",
            FirstName = "Andres",
            LastName = "Bonifacio",
            ContactNumber = "09181234567"
        };

        if (raw != null)
        {
            patient.CustomFields[ClinicPatientYakapExtensions.YakapEnlistmentsKey] = raw;
        }

        return patient;
    }

    // =========================================================================
    // SECTION 1: HETEROGENEOUS DESERIALIZATION FORMATS
    // =========================================================================

    [Fact]
    public void Deserialization_WhenPatientOrCustomFieldsNull_ReturnsEmptyListWithoutException()
    {
        ClinicPatient? nullPatient = null;
        nullPatient.GetYakapEnlistments().Should().BeEmpty();

        var patientWithNullDict = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_adv_m2",
            ClinicId = Guid.NewGuid(),
            PatientCode = "PAT-ADV-002",
            FirstName = "Gregoria",
            LastName = "de Jesus",
            ContactNumber = "09187654321"
        };
        patientWithNullDict.CustomFields = null!;
        patientWithNullDict.GetYakapEnlistments().Should().BeEmpty();
    }

    [Fact]
    public void Deserialization_WhenKeyMissingOrNull_ReturnsEmptyList()
    {
        var patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_adv_m2",
            ClinicId = Guid.NewGuid(),
            PatientCode = "PAT-ADV-003",
            FirstName = "Apolinario",
            LastName = "Mabini",
            ContactNumber = "09189998877"
        };
        // Key missing
        patient.GetYakapEnlistments().Should().BeEmpty();

        // Key explicitly null
        patient.CustomFields[ClinicPatientYakapExtensions.YakapEnlistmentsKey] = null;
        patient.GetYakapEnlistments().Should().BeEmpty();
    }

    [Fact]
    public void Deserialization_WhenRawJsonString_ValidArray_ParsesCorrectly()
    {
        var json = """
        [
            {
                "enlisted_at": "2026-02-15",
                "valid_until": "2026-12-31",
                "effective_year": 2026,
                "status": "Active",
                "source": "ClinicEnlistment",
                "case_no": "C000921202600100",
                "enlistment_no": "E000921202600100",
                "profiling_trans_no": "P000921202600100"
            }
        ]
        """;
        var patient = CreatePatientWithRawEnlistments(json);
        var entries = patient.GetYakapEnlistments();

        entries.Should().HaveCount(1);
        entries[0].EnlistedAt.Should().Be("2026-02-15");
        entries[0].ValidUntil.Should().Be("2026-12-31");
        entries[0].EffectiveYear.Should().Be(2026);
        entries[0].Status.Should().Be(YakapEnlistmentStatus.Active);
        entries[0].Source.Should().Be(YakapEnlistmentSource.ClinicEnlistment);
        entries[0].CaseNo.Should().Be("C000921202600100");
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t\n")]
    public void Deserialization_WhenRawJsonString_EmptyOrWhitespace_ReturnsEmptyList(string raw)
    {
        var patient = CreatePatientWithRawEnlistments(raw);
        patient.GetYakapEnlistments().Should().BeEmpty();
    }

    [Theory]
    [InlineData("invalid json string!")]
    [InlineData("{\"not\": \"an array\"}")]
    [InlineData("12345")]
    [InlineData("true")]
    public void Deserialization_WhenRawJsonString_MalformedOrNonArray_ReturnsEmptyListWithoutCrashing(string raw)
    {
        var patient = CreatePatientWithRawEnlistments(raw);
        var entries = patient.GetYakapEnlistments();
        entries.Should().BeEmpty();
    }

    [Fact]
    public void Deserialization_WhenRawJsonString_ArrayWithNullAndPrimitiveElements_FiltersSafely()
    {
        var json = """
        [
            null,
            42,
            "just a string",
            true,
            {
                "enlisted_at": "2026-03-01",
                "valid_until": "2026-12-31",
                "effective_year": 2026,
                "status": "Active"
            },
            null
        ]
        """;
        var patient = CreatePatientWithRawEnlistments(json);
        var entries = patient.GetYakapEnlistments();

        entries.Should().HaveCount(1);
        entries[0].EnlistedAt.Should().Be("2026-03-01");
        entries[0].EffectiveYear.Should().Be(2026);
    }

    [Fact]
    public void Deserialization_WhenJsonElementArray_ParsesCorrectly()
    {
        var json = """
        [
            {
                "enlisted_at": "2025-01-10",
                "valid_until": "2025-12-31",
                "effective_year": 2025,
                "status": "Expired",
                "source": "PhilHealthMasterlist"
            },
            {
                "enlisted_at": "2026-01-15",
                "valid_until": "2026-12-31",
                "effective_year": 2026,
                "status": "Active",
                "source": "ClinicEnlistment"
            }
        ]
        """;
        using var doc = JsonDocument.Parse(json);
        var patient = CreatePatientWithRawEnlistments(doc.RootElement.Clone());

        var entries = patient.GetYakapEnlistments();
        entries.Should().HaveCount(2);
        entries[0].EffectiveYear.Should().Be(2025);
        entries[1].EffectiveYear.Should().Be(2026);
    }

    [Fact]
    public void Deserialization_WhenJsonElementString_ParsesNestedJsonCorrectly()
    {
        var innerJson = """[{"enlisted_at":"2026-04-01","valid_until":"2026-12-31","effective_year":2026,"status":"Active"}]""";
        using var doc = JsonDocument.Parse(JsonSerializer.Serialize(innerJson));
        var patient = CreatePatientWithRawEnlistments(doc.RootElement.Clone());

        var entries = patient.GetYakapEnlistments();
        entries.Should().HaveCount(1);
        entries[0].EnlistedAt.Should().Be("2026-04-01");
        entries[0].EffectiveYear.Should().Be(2026);
    }

    [Fact]
    public void Deserialization_WhenJsonElementNonArray_ReturnsEmptyListWithoutCrashing()
    {
        using var docNumber = JsonDocument.Parse("123");
        CreatePatientWithRawEnlistments(docNumber.RootElement.Clone()).GetYakapEnlistments().Should().BeEmpty();

        using var docObject = JsonDocument.Parse("{\"enlisted_at\": \"2026-01-01\"}");
        CreatePatientWithRawEnlistments(docObject.RootElement.Clone()).GetYakapEnlistments().Should().BeEmpty();

        using var docNull = JsonDocument.Parse("null");
        CreatePatientWithRawEnlistments(docNull.RootElement.Clone()).GetYakapEnlistments().Should().BeEmpty();
    }

    [Fact]
    public void Deserialization_WhenUntypedEnumerableOrArrayList_ParsesCorrectly()
    {
        var arrayList = new ArrayList
        {
            new Dictionary<string, object?>
            {
                ["enlisted_at"] = "2026-05-01",
                ["valid_until"] = "2026-12-31",
                ["effective_year"] = 2026,
                ["status"] = "Active"
            }
        };

        var patient = CreatePatientWithRawEnlistments(arrayList);
        var entries = patient.GetYakapEnlistments();
        entries.Should().HaveCount(1);
        entries[0].EnlistedAt.Should().Be("2026-05-01");
    }

    // =========================================================================
    // SECTION 2: EFFECTIVE YEAR VARIATIONS & FALLBACKS
    // =========================================================================

    [Theory]
    [InlineData(2026, 2026)]
    [InlineData("2026", 2026)]
    [InlineData(" 2027 ", 2027)]
    public void EffectiveYear_AsIntegerOrString_ParsesSuccessfully(object inputYear, int expectedYear)
    {
        var list = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2026-01-01",
                ["valid_until"] = "2026-12-31",
                ["effective_year"] = inputYear,
                ["status"] = "Active"
            }
        };
        var patient = CreatePatientWithRawEnlistments(list);
        var entries = patient.GetYakapEnlistments();

        entries.Should().HaveCount(1);
        entries[0].EffectiveYear.Should().Be(expectedYear);
    }

    [Fact]
    public void EffectiveYear_WhenMissing_FallsBackToEnlistedAtYear()
    {
        var list = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2028-07-20",
                ["valid_until"] = "2028-12-31",
                ["status"] = "Active"
            }
        };
        var patient = CreatePatientWithRawEnlistments(list);
        var entries = patient.GetYakapEnlistments();

        entries.Should().HaveCount(1);
        entries[0].EffectiveYear.Should().Be(2028);
    }

    [Fact]
    public void EffectiveYear_WhenMissingAndEnlistedAtMissing_FallsBackToCurrentUtcYear()
    {
        var list = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["status"] = "Active"
            }
        };
        var patient = CreatePatientWithRawEnlistments(list);
        var entries = patient.GetYakapEnlistments();

        entries.Should().HaveCount(1);
        entries[0].EffectiveYear.Should().Be(DateTime.UtcNow.Year);
        entries[0].ValidUntil.Should().Be($"{DateTime.UtcNow.Year}-12-31");
    }

    [Fact]
    public void EffectiveYear_NumericTypeVariations_InDictionary_ExtractsCorrectly()
    {
        var list = new List<Dictionary<string, object?>>
        {
            new() { ["effective_year"] = (long)2024, ["enlisted_at"] = "2024-01-01" },
            new() { ["effective_year"] = (short)2025, ["enlisted_at"] = "2025-01-01" },
            new() { ["effective_year"] = 2026, ["enlisted_at"] = "2026-01-01" }
        };
        var patient = CreatePatientWithRawEnlistments(list);
        var entries = patient.GetYakapEnlistments();

        entries.Should().HaveCount(3);
        entries[0].EffectiveYear.Should().Be(2024);
        entries[1].EffectiveYear.Should().Be(2025);
        entries[2].EffectiveYear.Should().Be(2026);
    }

    // =========================================================================
    // SECTION 3: CASE-INSENSITIVE KEY MATCHING
    // =========================================================================

    [Fact]
    public void KeyMatching_PascalCase_InDictionary_ExtractsAllFields()
    {
        var list = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["EnlistedAt"] = "2026-03-15",
                ["ValidUntil"] = "2026-12-31",
                ["EffectiveYear"] = 2026,
                ["Status"] = "Active",
                ["Source"] = "SelfReported",
                ["CaseNo"] = "C000921202600007",
                ["EnlistmentNo"] = "E000921202600007",
                ["ProfilingTransNo"] = "P000921202600007"
            }
        };
        var patient = CreatePatientWithRawEnlistments(list);
        var entries = patient.GetYakapEnlistments();

        entries.Should().HaveCount(1);
        var entry = entries[0];
        entry.EnlistedAt.Should().Be("2026-03-15");
        entry.ValidUntil.Should().Be("2026-12-31");
        entry.EffectiveYear.Should().Be(2026);
        entry.Status.Should().Be(YakapEnlistmentStatus.Active);
        entry.Source.Should().Be(YakapEnlistmentSource.SelfReported);
        entry.CaseNo.Should().Be("C000921202600007");
        entry.EnlistmentNo.Should().Be("E000921202600007");
        entry.ProfilingTransNo.Should().Be("P000921202600007");
    }

    [Fact]
    public void KeyMatching_AllUpperCase_InDictionary_ExtractsAllFields()
    {
        var list = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["ENLISTED_AT"] = "2026-05-10",
                ["VALID_UNTIL"] = "2026-12-31",
                ["EFFECTIVE_YEAR"] = 2026,
                ["STATUS"] = "Active",
                ["SOURCE"] = "ClinicEnlistment",
                ["CASE_NO"] = "C000921202600099",
                ["ENLISTMENT_NO"] = "E000921202600099",
                ["PROFILING_TRANS_NO"] = "P000921202600099"
            }
        };
        var patient = CreatePatientWithRawEnlistments(list);
        var entries = patient.GetYakapEnlistments();

        entries.Should().HaveCount(1);
        entries[0].EnlistedAt.Should().Be("2026-05-10");
        entries[0].CaseNo.Should().Be("C000921202600099");
    }

    [Fact]
    public void KeyMatching_PascalCase_InJsonElement_ExtractsAllFields()
    {
        var json = """
        [
            {
                "EnlistedAt": "2026-06-01",
                "ValidUntil": "2026-12-31",
                "EffectiveYear": 2026,
                "Status": "Active",
                "Source": "ClinicEnlistment",
                "CaseNo": "C000921202600055",
                "EnlistmentNo": "E000921202600055",
                "ProfilingTransNo": "P000921202600055"
            }
        ]
        """;
        using var doc = JsonDocument.Parse(json);
        var patient = CreatePatientWithRawEnlistments(doc.RootElement.Clone());
        var entries = patient.GetYakapEnlistments();

        entries.Should().HaveCount(1);
        entries[0].EnlistedAt.Should().Be("2026-06-01");
        entries[0].CaseNo.Should().Be("C000921202600055");
        entries[0].EnlistmentNo.Should().Be("E000921202600055");
        entries[0].ProfilingTransNo.Should().Be("P000921202600055");
    }

    // =========================================================================
    // SECTION 4: ROUNDTRIP SERIALIZATION INTEGRITY
    // =========================================================================

    [Fact]
    public void Roundtrip_DomainRecord_ToDictionary_ToJson_BackToDomain_PreservesAllFields()
    {
        var original = new YakapEnlistmentEntry
        {
            EnlistedAt = "2026-04-18",
            ValidUntil = "2026-12-31",
            EffectiveYear = 2026,
            Status = YakapEnlistmentStatus.Active,
            Source = YakapEnlistmentSource.ClinicEnlistment,
            CaseNo = "C000921202600777",
            EnlistmentNo = "E000921202600777",
            ProfilingTransNo = "P000921202600777"
        };

        // 1. Record -> Dictionary
        var dict = original.ToDictionary();
        dict["enlisted_at"].Should().Be("2026-04-18");
        dict["case_no"].Should().Be("C000921202600777");

        // 2. Dictionary -> JSON String
        var json = JsonSerializer.Serialize(new[] { dict });

        // 3. JSON String -> JsonElement (simulating EF Core Postgres JSONB deserialization)
        using var doc = JsonDocument.Parse(json);
        var patient = CreatePatientWithRawEnlistments(doc.RootElement.Clone());

        // 4. JsonElement -> Domain Record
        var reconstituted = patient.GetYakapEnlistments();
        reconstituted.Should().HaveCount(1);
        reconstituted[0].Should().BeEquivalentTo(original);
    }

    [Fact]
    public void SetYakapEnlistments_EnforcesChronologicalOrdering()
    {
        var patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_adv_m2",
            ClinicId = Guid.NewGuid(),
            PatientCode = "PAT-ADV-ORDER",
            FirstName = "Melchora",
            LastName = "Aquino",
            ContactNumber = "09183334444"
        };

        var unsorted = new[]
        {
            new YakapEnlistmentEntry { EnlistedAt = "2027-01-10", EffectiveYear = 2027 },
            new YakapEnlistmentEntry { EnlistedAt = "2025-05-01", EffectiveYear = 2025 },
            new YakapEnlistmentEntry { EnlistedAt = "2026-01-01", EffectiveYear = 2026 }
        };

        patient.SetYakapEnlistments(unsorted);

        var retrieved = patient.GetYakapEnlistments();
        retrieved.Should().HaveCount(3);
        retrieved[0].EffectiveYear.Should().Be(2025);
        retrieved[1].EffectiveYear.Should().Be(2026);
        retrieved[2].EffectiveYear.Should().Be(2027);
    }

    [Fact]
    public void AddOrRenewYakapEnlistment_PreservesExistingControlNumbers_WhenUpdatingDates()
    {
        var patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_adv_m2",
            ClinicId = Guid.NewGuid(),
            PatientCode = "PAT-ADV-RENEW",
            FirstName = "Emilio",
            LastName = "Aguinaldo",
            ContactNumber = "09185556666"
        };

        patient.AddOrRenewYakapEnlistment(new YakapEnlistmentEntry
        {
            EnlistedAt = "2026-01-01",
            ValidUntil = "2026-12-31",
            EffectiveYear = 2026,
            Status = YakapEnlistmentStatus.Active,
            CaseNo = "C000921202600123",
            EnlistmentNo = "E000921202600123",
            ProfilingTransNo = "P000921202600123"
        });

        // Extend validity into next year without specifying control numbers
        patient.AddOrRenewYakapEnlistment(new YakapEnlistmentEntry
        {
            EnlistedAt = "2026-01-01",
            ValidUntil = "2027-03-31",
            EffectiveYear = 2026,
            Status = YakapEnlistmentStatus.Active
        });

        var entries = patient.GetYakapEnlistments();
        entries.Should().HaveCount(1);
        entries[0].ValidUntil.Should().Be("2027-03-31");
        entries[0].CaseNo.Should().Be("C000921202600123");
        entries[0].EnlistmentNo.Should().Be("E000921202600123");
        entries[0].ProfilingTransNo.Should().Be("P000921202600123");
    }

    // =========================================================================
    // SECTION 5: STRICT NO-AUTO-RENEWAL GUARD VERIFICATION
    // =========================================================================

    [Fact]
    public void StrictGuard_ThrowsWhenEnlistmentExpired()
    {
        var patient = CreatePatientWithRawEnlistments(new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2025-01-01",
                ["valid_until"] = "2025-12-31",
                ["effective_year"] = 2025,
                ["status"] = "Expired"
            }
        });

        var act = () => patient.ResolveActiveEnlistmentOrThrow(new DateOnly(2026, 4, 15));
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*no active PhilHealth YAKAP enlistment covering the encounter date 2026-04-15*")
            .WithMessage("*expired on 2025-12-31*");
    }

    [Fact]
    public void StrictGuard_ThrowsWhenEnlistmentTransferred()
    {
        var patient = CreatePatientWithRawEnlistments(new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2026-01-01",
                ["valid_until"] = "2026-12-31",
                ["effective_year"] = 2026,
                ["status"] = "Transferred"
            }
        });

        var act = () => patient.ResolveActiveEnlistmentOrThrow(new DateOnly(2026, 5, 20));
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*is marked as Transferred*");
    }

    // =========================================================================
    // SECTION 6: SEQUENCE ALLOCATION CONCURRENCY & IDEMPOTENCY
    // =========================================================================

    [Fact]
    public async Task Concurrency_SequentialAllocations_IncrementDeterministically()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_seq_adv_1";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContext);
        var generator = new PhilHealthSequenceGenerator(dbContext, NullLogger<PhilHealthSequenceGenerator>.Instance);

        var c1 = await generator.GenerateCaseNumberAsync(tenantId, clinicId, "000921", "2026");
        var c2 = await generator.GenerateCaseNumberAsync(tenantId, clinicId, "000921", "2026");
        var c3 = await generator.GenerateCaseNumberAsync(tenantId, clinicId, "000921", "2026");

        c1.Should().Be("C000921202600001");
        c2.Should().Be("C000921202600002");
        c3.Should().Be("C000921202600003");
    }

    [Fact]
    public async Task Concurrency_AssignPatientJourneyNumbersAsync_IsIdempotentOnRepeatedCalls()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_seq_adv_idemp";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContext);
        var generator = new PhilHealthSequenceGenerator(dbContext, NullLogger<PhilHealthSequenceGenerator>.Instance);

        var patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientCode = "PAT-ADV-IDEMP",
            FirstName = "Juan",
            LastName = "Luna",
            ContactNumber = "09181112233",
            DateOfBirth = new DateOnly(1980, 10, 23)
        };
        patient.CustomFields["yakap_enlistments"] = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2026-01-01",
                ["valid_until"] = "2026-12-31",
                ["effective_year"] = 2026,
                ["status"] = "Active"
            }
        };
        dbContext.Patients.Add(patient);

        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = patient.Id,
            PatientName = "Juan Luna",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Rizal",
            EncounterDate = new DateTime(2026, 6, 1, 10, 0, 0, DateTimeKind.Utc),
            IsYakapEligible = true
        };
        dbContext.Consultations.Add(encounter);
        await dbContext.SaveChangesAsync();

        // Call 1
        var result1 = await generator.AssignPatientJourneyNumbersAsync(
            tenantId, clinicId, patient.Id, encounter.Id, "000921", "2026");

        // Call 2
        var result2 = await generator.AssignPatientJourneyNumbersAsync(
            tenantId, clinicId, patient.Id, encounter.Id, "000921", "2026");

        // Call 3
        var result3 = await generator.AssignPatientJourneyNumbersAsync(
            tenantId, clinicId, patient.Id, encounter.Id, "000921", "2026");

        // Numbers must be completely identical across all calls
        result2.CaseNumber.Should().Be(result1.CaseNumber);
        result2.EnlistmentTransactionNumber.Should().Be(result1.EnlistmentTransactionNumber);
        result2.ProfilingTransactionNumber.Should().Be(result1.ProfilingTransactionNumber);
        result2.SoapTransactionNumber.Should().Be(result1.SoapTransactionNumber);

        result3.CaseNumber.Should().Be(result1.CaseNumber);
    }

    [Fact]
    public async Task Concurrency_MultiplePatients_AllocatesUniqueSequentialNumbers()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_seq_adv_multi";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (dbContext, _, _) = TestDbHelper.CreateTestContext(clinicContext);
        var generator = new PhilHealthSequenceGenerator(dbContext, NullLogger<PhilHealthSequenceGenerator>.Instance);

        const int patientCount = 20;
        var allocatedCaseNumbers = new List<string>();

        for (int i = 1; i <= patientCount; i++)
        {
            var patient = new ClinicPatient
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                PatientCode = $"PAT-MULTI-{i:D3}",
                FirstName = $"Patient{i}",
                LastName = "Test",
                ContactNumber = "09180000000"
            };
            patient.CustomFields["yakap_enlistments"] = new List<Dictionary<string, object?>>
            {
                new()
                {
                    ["enlisted_at"] = "2026-01-01",
                    ["valid_until"] = "2026-12-31",
                    ["effective_year"] = 2026,
                    ["status"] = "Active"
                }
            };
            dbContext.Patients.Add(patient);
            await dbContext.SaveChangesAsync();

            var result = await generator.AssignPatientJourneyNumbersAsync(
                tenantId, clinicId, patient.Id, null, "000921", "2026");

            allocatedCaseNumbers.Add(result.CaseNumber);
        }

        // Verify all 20 case numbers are strictly unique
        allocatedCaseNumbers.Should().HaveCount(patientCount);
        allocatedCaseNumbers.Distinct().Should().HaveCount(patientCount);

        // Verify strictly formatted and sequential from 1 to 20
        for (int i = 1; i <= patientCount; i++)
        {
            allocatedCaseNumbers[i - 1].Should().Be($"C0009212026{i:D5}");
        }
    }

    [Fact]
    public async Task Concurrency_ParallelTasks_WithSharedDb_AllocatesUniqueCaseNumbers()
    {
        var dbName = $"ClinicEz_SharedTestDb_{Guid.NewGuid()}";
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_seq_adv_parallel";
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        // Pre-seed tracker with sequence 0
        var (setupDb, _, _) = TestDbHelper.CreateSharedTestContext(dbName, clinicContext);
        await using (setupDb)
        {
            var tracker = new PhilHealthSequenceTracker
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                SequenceType = PhilHealthSequenceType.Case,
                EffectiveYear = "2026",
                CurrentSequence = 0,
                LastAssignedAt = DateTime.UtcNow
            };
            setupDb.PhilHealthSequenceTrackers.Add(tracker);
            await setupDb.SaveChangesAsync();
        }

        const int concurrencyDegree = 10;
        var generatedNumbers = new ConcurrentBag<string>();

        // Run sequential batch across distinct contexts to verify sequence increment
        var tasks = Enumerable.Range(1, concurrencyDegree).Select(async i =>
        {
            // Simulate separate scoped DbContext per request
            var (ctx, _, _) = TestDbHelper.CreateSharedTestContext(dbName, clinicContext);
            var gen = new PhilHealthSequenceGenerator(ctx, NullLogger<PhilHealthSequenceGenerator>.Instance);
            var num = await gen.GenerateCaseNumberAsync(tenantId, clinicId, "000921", "2026");
            generatedNumbers.Add(num);
        });

        await Task.WhenAll(tasks);

        // All numbers must be distinct
        generatedNumbers.Should().HaveCount(concurrencyDegree);
        generatedNumbers.Distinct().Should().HaveCount(concurrencyDegree);
    }

    // =========================================================================
    // SECTION 7: BOUNDARY CONDITIONS & MULTI-YEAR RESOLUTION
    // =========================================================================

    [Fact]
    public void Boundary_IsCoveringDate_ExactStartAndEndDates_CoverAccurately()
    {
        var entry = new YakapEnlistmentEntry
        {
            EnlistedAt = "2026-03-01",
            ValidUntil = "2026-03-31",
            EffectiveYear = 2026,
            Status = YakapEnlistmentStatus.Active
        };

        // Day before start
        entry.IsCoveringDate(new DateOnly(2026, 2, 28)).Should().BeFalse();
        // Exact start day
        entry.IsCoveringDate(new DateOnly(2026, 3, 1)).Should().BeTrue();
        // Mid period
        entry.IsCoveringDate(new DateOnly(2026, 3, 15)).Should().BeTrue();
        // Exact end day
        entry.IsCoveringDate(new DateOnly(2026, 3, 31)).Should().BeTrue();
        // Day after end
        entry.IsCoveringDate(new DateOnly(2026, 4, 1)).Should().BeFalse();
    }

    [Fact]
    public void Boundary_LeapYear_HandlesFebruary29WithoutCrash()
    {
        var entry = new YakapEnlistmentEntry
        {
            EnlistedAt = "2024-02-29",
            ValidUntil = "2024-12-31",
            EffectiveYear = 2024,
            Status = YakapEnlistmentStatus.Active
        };

        entry.IsCoveringDate(new DateOnly(2024, 2, 29)).Should().BeTrue();
        entry.IsCoveringDate(new DateOnly(2024, 3, 1)).Should().BeTrue();
        entry.IsCoveringDate(new DateOnly(2024, 2, 28)).Should().BeFalse();
    }

    [Fact]
    public void Robustness_UnknownExtraPropertiesInJson_IgnoredGracefully()
    {
        var json = """
        [
            {
                "enlisted_at": "2026-01-01",
                "valid_until": "2026-12-31",
                "effective_year": 2026,
                "status": "Active",
                "source": "ClinicEnlistment",
                "extra_unknown_field_1": "some value",
                "extra_nested_object": { "nested": 123 },
                "legacy_v1_payload": [1, 2, 3]
            }
        ]
        """;
        var patient = CreatePatientWithRawEnlistments(json);
        var entries = patient.GetYakapEnlistments();

        entries.Should().HaveCount(1);
        entries[0].EffectiveYear.Should().Be(2026);
        entries[0].EnlistedAt.Should().Be("2026-01-01");
    }

    [Fact]
    public void MultiYear_TransferredInCurrentYear_DoesNotBlockPriorActiveYearResolution()
    {
        var patient = CreatePatientWithRawEnlistments(new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2025-01-01",
                ["valid_until"] = "2025-12-31",
                ["effective_year"] = 2025,
                ["status"] = "Active",
                ["case_no"] = "C000921202500001"
            },
            new()
            {
                ["enlisted_at"] = "2026-01-01",
                ["valid_until"] = "2026-12-31",
                ["effective_year"] = 2026,
                ["status"] = "Transferred",
                ["case_no"] = "C000921202600001"
            }
        });

        // Historical encounter in 2025 resolves the 2025 active entry successfully
        var resolved2025 = patient.ResolveActiveEnlistmentOrThrow(new DateOnly(2025, 7, 15), 2025);
        resolved2025.EffectiveYear.Should().Be(2025);
        resolved2025.CaseNo.Should().Be("C000921202500001");

        // Encounter in 2026 must be blocked by the Transferred guard
        var act2026 = () => patient.ResolveActiveEnlistmentOrThrow(new DateOnly(2026, 7, 15), 2026);
        act2026.Should().Throw<InvalidOperationException>()
            .WithMessage("*is marked as Transferred*");
    }
}

