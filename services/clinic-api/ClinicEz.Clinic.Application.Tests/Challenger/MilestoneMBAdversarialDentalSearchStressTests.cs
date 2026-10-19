using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Dental.Search;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Search;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Challenger;

/// <summary>
/// Empirical Adversarial Challenger Test Suite for Milestone MB:
/// Pluggable Dental Search Provider (DentalChartSearchProvider).
/// 
/// Stress-tests:
/// 1. Multi-Tenant Isolation: 4-clinic cross-tenant quarantine, zero cross-tenant leakage.
/// 2. Adversarial Query Syntax: Whitespace permutations, symbols, casing, child teeth, invalid numbers.
/// 3. Surface Matching: Single/multi-surface permutations ("MOD", "mod", "o", "b", "l").
/// 4. Clinical Notes Hardening: Special characters, SQL injection probes, long text (4000+ chars), Unicode/diacritics.
/// 5. Null Safety & Defensive Formatting: Teeth with null PatientName, null Surface, null Notes.
/// 6. General Dental Query Keywords: "dental", "tooth", "teeth", "chart", "odontogram".
/// 7. High-Concurrency Stress: Concurrent search requests under load.
/// </summary>
public class MilestoneMBAdversarialDentalSearchStressTests
{
    private readonly Guid _clinic1 = Guid.NewGuid();
    private readonly Guid _clinic2 = Guid.NewGuid();
    private readonly Guid _clinic3 = Guid.NewGuid();
    private readonly Guid _clinic4 = Guid.NewGuid();
    private readonly IClinicContext _clinicContext;

    public MilestoneMBAdversarialDentalSearchStressTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinic1);
        _clinicContext.HasPermission(Arg.Any<string>()).Returns(true);
    }

    private static DentalToothRecord BuildTooth(
        Guid clinicId,
        string tenantId,
        Guid patientId,
        string? patientName,
        int toothNumber,
        ToothStatus status,
        string? surface = null,
        string? notes = null,
        bool isDeleted = false)
    {
        return new DentalToothRecord
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientId = patientId,
            PatientName = patientName,
            ToothNumber = toothNumber,
            Status = status,
            Surface = surface,
            Notes = notes,
            IsDeleted = isDeleted,
            CreatedAt = DateTime.UtcNow
        };
    }

    #region Challenge 1: Multi-Tenant Isolation Stress (4-Clinic Quarantine)

    [Fact]
    public async Task Challenge1_MultiTenantQuarantine_StrictlyZeroCrossTenantLeakageAcrossFourClinics()
    {
        // ARRANGE: Seed identical records across 4 different clinics
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var provider = new DentalChartSearchProvider(toothRepo);

        var patientId1 = Guid.NewGuid();
        var patientId2 = Guid.NewGuid();
        var patientId3 = Guid.NewGuid();
        var patientId4 = Guid.NewGuid();

        // Each clinic has Tooth 16, same patient name "Maria Clara", same note "Caries"
        var toothC1 = BuildTooth(_clinic1, "tenant-1", patientId1, "Maria Clara", 16, ToothStatus.Decay, "MOD", "Severe occlusal caries");
        var toothC2 = BuildTooth(_clinic2, "tenant-2", patientId2, "Maria Clara", 16, ToothStatus.Filled, "MOD", "Severe occlusal caries");
        var toothC3 = BuildTooth(_clinic3, "tenant-3", patientId3, "Maria Clara", 16, ToothStatus.Crown, "MOD", "Severe occlusal caries");
        var toothC4 = BuildTooth(_clinic4, "tenant-4", patientId4, "Maria Clara", 16, ToothStatus.Extraction, "MOD", "Severe occlusal caries");

        // Clinic 1 only has tooth 21
        var toothC1Extra = BuildTooth(_clinic1, "tenant-1", patientId1, "Unique C1 Patient", 21, ToothStatus.Healthy, notes: "Unique to C1");

        // Clinic 2 only has tooth 36 with soft-delete
        var toothC2Deleted = BuildTooth(_clinic2, "tenant-2", patientId2, "Deleted in C2", 36, ToothStatus.Decay, isDeleted: true);

        context.DentalToothRecords.AddRange(toothC1, toothC2, toothC3, toothC4, toothC1Extra, toothC2Deleted);
        await context.SaveChangesAsync();

        // ACT & ASSERT: Search Clinic 1 for "Maria Clara"
        var resC1 = await provider.SearchAsync("Maria Clara", _clinic1, 50, CancellationToken.None);
        resC1.Should().HaveCount(1);
        resC1[0].Id.Should().Be($"dental-{toothC1.Id}");
        resC1[0].BadgeText.Should().Be("Decay");

        // Search Clinic 2 for "Maria Clara"
        var resC2 = await provider.SearchAsync("Maria Clara", _clinic2, 50, CancellationToken.None);
        resC2.Should().HaveCount(1);
        resC2[0].Id.Should().Be($"dental-{toothC2.Id}");
        resC2[0].BadgeText.Should().Be("Filled");

        // Search Clinic 3 for "Maria Clara"
        var resC3 = await provider.SearchAsync("Maria Clara", _clinic3, 50, CancellationToken.None);
        resC3.Should().HaveCount(1);
        resC3[0].Id.Should().Be($"dental-{toothC3.Id}");
        resC3[0].BadgeText.Should().Be("Crown");

        // Search Clinic 4 for "Maria Clara"
        var resC4 = await provider.SearchAsync("Maria Clara", _clinic4, 50, CancellationToken.None);
        resC4.Should().HaveCount(1);
        resC4[0].Id.Should().Be($"dental-{toothC4.Id}");
        resC4[0].BadgeText.Should().Be("Extraction");

        // Search Clinic 2 for Clinic 1's unique tooth 21
        var resC2Extra = await provider.SearchAsync("21", _clinic2, 50, CancellationToken.None);
        resC2Extra.Should().BeEmpty("Tooth 21 exists only in Clinic 1 and must strictly not leak into Clinic 2");

        // Search Clinic 2 for its soft-deleted tooth 36
        var resC2Del = await provider.SearchAsync("36", _clinic2, 50, CancellationToken.None);
        resC2Del.Should().BeEmpty("Soft-deleted tooth 36 in Clinic 2 must strictly be excluded");

        // Search non-existent random clinic
        var randomClinicId = Guid.NewGuid();
        var resRandom = await provider.SearchAsync("16", randomClinicId, 50, CancellationToken.None);
        resRandom.Should().BeEmpty("Random clinic ID with no teeth must strictly return zero results");

        // Search Guid.Empty clinic
        var resEmptyGuid = await provider.SearchAsync("16", Guid.Empty, 50, CancellationToken.None);
        resEmptyGuid.Should().BeEmpty("Guid.Empty clinic must strictly return zero results");
    }

    #endregion

    #region Challenge 2: Adversarial Query Syntax & Permutation Stress

    [Theory]
    // Variations of tooth 16
    [InlineData("  # 16  ", 16)]
    [InlineData("tooth   16", 16)]
    [InlineData("TOOTH#16", 16)]
    [InlineData("t16", 16)]
    [InlineData("t 16", 16)]
    [InlineData("t#16", 16)]
    [InlineData("t  #  16", 16)]
    [InlineData("   tooth    #    16   ", 16)]
    [InlineData("\ttooth 16\n", 16)]
    [InlineData("Tooth 16", 16)]
    [InlineData("TOOTH 16", 16)]
    [InlineData("  tooth16  ", 16)]
    // Deciduous child teeth (51-85)
    [InlineData("55", 55)]
    [InlineData("#55", 55)]
    [InlineData("tooth 55", 55)]
    [InlineData("Tooth #55", 55)]
    [InlineData("t55", 55)]
    [InlineData("  # 55  ", 55)]
    [InlineData("85", 85)]
    [InlineData("#85", 85)]
    [InlineData("tooth   85", 85)]
    [InlineData("TOOTH#85", 85)]
    [InlineData("t85", 85)]
    public async Task Challenge2_AdversarialQuerySyntax_PermutationsAccuratelyResolveTargetTooth(
        string adversarialQuery, int expectedToothNumber)
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var provider = new DentalChartSearchProvider(toothRepo);

        var tooth16 = BuildTooth(_clinic1, "tenant-1", Guid.NewGuid(), "Patient Adult", 16, ToothStatus.Decay, "MOD");
        var tooth55 = BuildTooth(_clinic1, "tenant-1", Guid.NewGuid(), "Patient Child A", 55, ToothStatus.Filled, "O");
        var tooth85 = BuildTooth(_clinic1, "tenant-1", Guid.NewGuid(), "Patient Child B", 85, ToothStatus.Missing);
        var otherTooth = BuildTooth(_clinic1, "tenant-1", Guid.NewGuid(), "Patient Other", 26, ToothStatus.Healthy);

        context.DentalToothRecords.AddRange(tooth16, tooth55, tooth85, otherTooth);
        await context.SaveChangesAsync();

        var results = await provider.SearchAsync(adversarialQuery, _clinic1, 10, CancellationToken.None);

        results.Should().NotBeEmpty($"Query '{adversarialQuery}' must resolve to tooth #{expectedToothNumber}");
        results.Should().Contain(r => r.RouteParams!["toothNumber"] == expectedToothNumber.ToString());
    }

    [Theory]
    [InlineData("99")]
    [InlineData("0")]
    [InlineData("-1")]
    [InlineData("-16")]
    [InlineData("100")]
    [InlineData("999")]
    [InlineData("tooth 99")]
    [InlineData("tooth -1")]
    [InlineData("tooth 0")]
    [InlineData("#99")]
    [InlineData("t99")]
    public async Task Challenge2_InvalidAndOutOfRangeToothNumbers_ReturnZeroResultsWithoutThrowing(string invalidQuery)
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var provider = new DentalChartSearchProvider(toothRepo);

        var validTooth = BuildTooth(_clinic1, "tenant-1", Guid.NewGuid(), "Regular Patient", 16, ToothStatus.Healthy);
        context.DentalToothRecords.Add(validTooth);
        await context.SaveChangesAsync();

        var results = await provider.SearchAsync(invalidQuery, _clinic1, 10, CancellationToken.None);

        results.Should().BeEmpty($"Invalid tooth number query '{invalidQuery}' must return 0 results");
    }

    [Theory]
    [InlineData("#")]
    [InlineData("##")]
    [InlineData("###")]
    [InlineData("--")]
    [InlineData("//")]
    [InlineData("!@#$%^&*()")]
    [InlineData("tooth #!@$%")]
    [InlineData("t")]
    public async Task Challenge2_MalformedPunctuationAndSymbolQueries_HandledSafelyWithoutExceptions(string malformedQuery)
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var provider = new DentalChartSearchProvider(toothRepo);

        var tooth = BuildTooth(_clinic1, "tenant-1", Guid.NewGuid(), "John Doe", 11, ToothStatus.Healthy);
        context.DentalToothRecords.Add(tooth);
        await context.SaveChangesAsync();

        // Must execute cleanly without exception
        var results = await provider.SearchAsync(malformedQuery, _clinic1, 10, CancellationToken.None);
        results.Should().NotBeNull();
    }

    #endregion

    #region Challenge 3: Surface Matching Stress (Single, Multiple & Substring Permutations)

    [Theory]
    [InlineData("MOD", 16)]
    [InlineData("mod", 16)]
    [InlineData("Mod", 16)]
    [InlineData("mOd", 16)]
    [InlineData("MO", 16)]
    [InlineData("OD", 16)]
    [InlineData("O", 16)]
    [InlineData("M", 16)]
    [InlineData("D", 16)]
    [InlineData("B", 14)]
    [InlineData("b", 14)]
    [InlineData("L", 35)]
    [InlineData("l", 35)]
    [InlineData("DO", 25)]
    public async Task Challenge3_SurfaceMatching_AccuratelyMatchesSingleAndMultiSurfacesCaseInsensitively(
        string surfaceQuery, int expectedToothNumber)
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var provider = new DentalChartSearchProvider(toothRepo);

        var teeth = new[]
        {
            BuildTooth(_clinic1, "tenant-1", Guid.NewGuid(), "Patient A", 14, ToothStatus.Decay, "B"),
            BuildTooth(_clinic1, "tenant-1", Guid.NewGuid(), "Patient B", 16, ToothStatus.Filled, "MOD"),
            BuildTooth(_clinic1, "tenant-1", Guid.NewGuid(), "Patient C", 25, ToothStatus.Decay, "DO"),
            BuildTooth(_clinic1, "tenant-1", Guid.NewGuid(), "Patient D", 35, ToothStatus.Decay, "L")
        };

        context.DentalToothRecords.AddRange(teeth);
        await context.SaveChangesAsync();

        var results = await provider.SearchAsync(surfaceQuery, _clinic1, 10, CancellationToken.None);

        results.Should().NotBeEmpty($"Query for surface '{surfaceQuery}' should match tooth #{expectedToothNumber}");
        results.Should().Contain(r => r.RouteParams!["toothNumber"] == expectedToothNumber.ToString());
    }

    #endregion

    #region Challenge 4: Clinical Notes Hardening (Special Chars, SQL Injection, Long Text, Unicode)

    [Theory]
    [InlineData("root-canal")]
    [InlineData("(apicoectomy)")]
    [InlineData("crown!")]
    [InlineData("pulp exposure")]
    [InlineData("@ mesial")]
    [InlineData("> 3mm")]
    [InlineData("(-)")]
    [InlineData("'sharp pain'")]
    [InlineData("test='positive'")]
    public async Task Challenge4_ClinicalNotesWithSpecialCharacters_AccuratelyFound(string specialCharQuery)
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var provider = new DentalChartSearchProvider(toothRepo);

        var note1 = "Tooth root-canal (apicoectomy) & crown! Completed successfully.";
        var note2 = "Class II caries; pulp exposure @ mesial margin.";
        var note3 = "Caries > 3mm deep, pulp test: (-)";
        var note4 = "Patient complained of 'sharp pain' upon biting, test='positive'";

        var tooth1 = BuildTooth(_clinic1, "tenant-1", Guid.NewGuid(), "Special P1", 16, ToothStatus.Filled, notes: note1);
        var tooth2 = BuildTooth(_clinic1, "tenant-1", Guid.NewGuid(), "Special P2", 21, ToothStatus.Decay, notes: note2);
        var tooth3 = BuildTooth(_clinic1, "tenant-1", Guid.NewGuid(), "Special P3", 31, ToothStatus.Decay, notes: note3);
        var tooth4 = BuildTooth(_clinic1, "tenant-1", Guid.NewGuid(), "Special P4", 46, ToothStatus.Decay, notes: note4);

        context.DentalToothRecords.AddRange(tooth1, tooth2, tooth3, tooth4);
        await context.SaveChangesAsync();

        var results = await provider.SearchAsync(specialCharQuery, _clinic1, 10, CancellationToken.None);

        results.Should().NotBeEmpty($"Query '{specialCharQuery}' must match corresponding clinical note");
        results[0].Subtitle.ToLower().Should().Contain(specialCharQuery.ToLower());
    }

    [Theory]
    [InlineData("'; DROP TABLE teeth; --")]
    [InlineData("' OR '1'='1")]
    [InlineData("1' OR '1' = '1")]
    [InlineData("\" OR \"\"=\"")]
    [InlineData("admin' --")]
    [InlineData("1 UNION SELECT * FROM teeth")]
    public async Task Challenge4_SqlInjectionProbes_TreatedAsLiteralTextWithoutExecutionOrException(string sqlProbe)
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var provider = new DentalChartSearchProvider(toothRepo);

        var normalTooth = BuildTooth(_clinic1, "tenant-1", Guid.NewGuid(), "Patient Safe", 16, ToothStatus.Healthy, notes: "Routine checkup");
        context.DentalToothRecords.Add(normalTooth);
        await context.SaveChangesAsync();

        // Must not execute SQL or throw exception
        var results = await provider.SearchAsync(sqlProbe, _clinic1, 10, CancellationToken.None);

        results.Should().BeEmpty("SQL injection probes must not match routine checkup notes");
    }

    [Fact]
    public async Task Challenge4_LongTextClinicalNote_AccuratelyMatchesBuriedKeywordIn4000Chars()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var provider = new DentalChartSearchProvider(toothRepo);

        // Build a 4500-character clinical narrative with a unique buried keyword
        var filler = string.Join(" ", Enumerable.Repeat("Patient examined under local anesthesia with continuous monitoring of vital signs.", 50));
        var massiveNote = filler + " Acute severe pericoronitis detected under distal operculum. " + filler;

        var tooth = BuildTooth(_clinic1, "tenant-1", Guid.NewGuid(), "Narrative Patient", 38, ToothStatus.Decay, notes: massiveNote);
        context.DentalToothRecords.Add(tooth);
        await context.SaveChangesAsync();

        var results = await provider.SearchAsync("pericoronitis", _clinic1, 10, CancellationToken.None);

        results.Should().HaveCount(1);
        results[0].RouteParams!["toothNumber"].Should().Be("38");
        results[0].Subtitle.Should().Contain("pericoronitis");
    }

    [Fact]
    public async Task Challenge4_ExtremelyLongQueryString_HandledGracefullyWithoutBufferOverflow()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var provider = new DentalChartSearchProvider(toothRepo);

        var tooth = BuildTooth(_clinic1, "tenant-1", Guid.NewGuid(), "Normal Patient", 16, ToothStatus.Healthy, notes: "Normal tooth");
        context.DentalToothRecords.Add(tooth);
        await context.SaveChangesAsync();

        // 600-character adversarial query string
        var longAdversarialQuery = new string('x', 600);

        var results = await provider.SearchAsync(longAdversarialQuery, _clinic1, 10, CancellationToken.None);
        results.Should().BeEmpty();
    }

    [Theory]
    [InlineData("gilagid")]
    [InlineData("sumasakit")]
    [InlineData("peña")]
    [InlineData("Peña")]
    public async Task Challenge4_PhilippineLanguageAndDiacritics_MatchesCaseInsensitively(string filipinoQuery)
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var provider = new DentalChartSearchProvider(toothRepo);

        var tooth1 = BuildTooth(_clinic1, "tenant-1", Guid.NewGuid(), "Jose Rizal", 16, ToothStatus.Decay, notes: "May nana at pamamaga sa gilagid");
        var tooth2 = BuildTooth(_clinic1, "tenant-1", Guid.NewGuid(), "Andres Bonifacio", 21, ToothStatus.Filled, notes: "Sumasakit kapag umiinom ng malamig");
        var tooth3 = BuildTooth(_clinic1, "tenant-1", Guid.NewGuid(), "Doktora Peña", 31, ToothStatus.Crown, notes: "Konsultasyon kay Dr. Peña");

        context.DentalToothRecords.AddRange(tooth1, tooth2, tooth3);
        await context.SaveChangesAsync();

        var results = await provider.SearchAsync(filipinoQuery, _clinic1, 10, CancellationToken.None);

        results.Should().NotBeEmpty($"Query '{filipinoQuery}' must match Filipino clinical note or patient name");
    }

    #endregion

    #region Challenge 5: Null Safety & Defensive Formatting

    [Fact]
    public async Task Challenge5_NullFieldsInDatabase_DoesNotThrowNullReferenceAndFormatsCleanly()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var provider = new DentalChartSearchProvider(toothRepo);

        // Record with null PatientName, null Surface, null Notes
        var toothNulls = BuildTooth(_clinic1, "tenant-1", Guid.NewGuid(), null, 16, ToothStatus.Healthy, surface: null, notes: null);
        context.DentalToothRecords.Add(toothNulls);
        await context.SaveChangesAsync();

        // Search tooth 16
        var results = await provider.SearchAsync("16", _clinic1, 10, CancellationToken.None);

        results.Should().HaveCount(1);
        var item = results[0];
        item.Title.Should().Be("Tooth #16 — Healthy");
        item.Subtitle.Should().Be("Patient: Unknown");
        item.BadgeText.Should().Be("Healthy");
        item.BadgeVariant.Should().Be(SearchBadgeVariant.Neutral);
    }

    #endregion

    #region Challenge 6: General Dental Query Keywords

    [Theory]
    [InlineData("dental")]
    [InlineData("DENTAL")]
    [InlineData("tooth")]
    [InlineData("TOOTH")]
    [InlineData("teeth")]
    [InlineData("TEETH")]
    [InlineData("chart")]
    [InlineData("CHART")]
    [InlineData("odontogram")]
    [InlineData("ODONTOGRAM")]
    public async Task Challenge6_GeneralDentalKeywords_ReturnsAllTeethForTenantUpToLimit(string keyword)
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var provider = new DentalChartSearchProvider(toothRepo);

        // Seed 3 teeth in Clinic 1
        var tooth1 = BuildTooth(_clinic1, "tenant-1", Guid.NewGuid(), "P1", 11, ToothStatus.Healthy);
        var tooth2 = BuildTooth(_clinic1, "tenant-1", Guid.NewGuid(), "P2", 21, ToothStatus.Decay);
        var tooth3 = BuildTooth(_clinic1, "tenant-1", Guid.NewGuid(), "P3", 31, ToothStatus.Crown);

        // Seed 2 teeth in Clinic 2 (must not be returned!)
        var toothC2 = BuildTooth(_clinic2, "tenant-2", Guid.NewGuid(), "P4", 41, ToothStatus.Missing);

        context.DentalToothRecords.AddRange(tooth1, tooth2, tooth3, toothC2);
        await context.SaveChangesAsync();

        var results = await provider.SearchAsync(keyword, _clinic1, 10, CancellationToken.None);

        results.Should().HaveCount(3, $"General dental query '{keyword}' should return all 3 teeth in Clinic 1");
        results.Select(r => r.RouteParams!["toothNumber"]).Should().ContainInOrder("11", "21", "31");
        results.Should().NotContain(r => r.RouteParams!["toothNumber"] == "41", "Clinic 2 teeth must not be returned");
    }

    #endregion

    #region Challenge 7: High-Concurrency Stress Test

    [Fact]
    public async Task Challenge7_ConcurrentSearches_MaintainsThreadSafetyAndDataQuarantineUnderParallelLoad()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var provider = new DentalChartSearchProvider(toothRepo);

        // Seed 20 teeth across Clinic 1 and Clinic 2
        for (int i = 11; i <= 28; i++)
        {
            context.DentalToothRecords.Add(BuildTooth(_clinic1, "tenant-1", Guid.NewGuid(), $"C1-Patient-{i}", i, ToothStatus.Decay, "MOD", $"Note {i}"));
            context.DentalToothRecords.Add(BuildTooth(_clinic2, "tenant-2", Guid.NewGuid(), $"C2-Patient-{i}", i, ToothStatus.Filled, "O", $"Note {i}"));
        }
        await context.SaveChangesAsync();

        // 60 concurrent searches mixing tooth numbers, names, notes, and general terms
        var tasks = Enumerable.Range(0, 60).Select(async idx =>
        {
            var isClinic1 = idx % 2 == 0;
            var targetClinic = isClinic1 ? _clinic1 : _clinic2;
            var query = (idx % 5) switch
            {
                0 => "16",
                1 => "Decay",
                2 => "Filled",
                3 => "MOD",
                _ => "dental"
            };

            var res = await provider.SearchAsync(query, targetClinic, 10, CancellationToken.None);
            res.Should().NotBeNull();

            // Verify tenant quarantine in every single concurrent execution
            if (isClinic1 && query == "Filled")
            {
                // Clinic 1 only has Decay teeth
                res.Should().BeEmpty();
            }
            else if (!isClinic1 && query == "Decay")
            {
                // Clinic 2 only has Filled teeth
                res.Should().BeEmpty();
            }
        });

        await Task.WhenAll(tasks);
    }

    #endregion
}
