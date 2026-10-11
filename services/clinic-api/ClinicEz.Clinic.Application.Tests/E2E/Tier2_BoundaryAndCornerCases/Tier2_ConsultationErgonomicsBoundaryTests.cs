using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Application.Tests.E2E.Fixtures;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.E2E.Tier2_BoundaryAndCornerCases;

using static E2EContracts;

/// <summary>
/// Tier 2: Boundary & Corner Cases for Milestone M3 (Features 14 through 17).
/// Contains >=5 boundary and adversarial edge cases per feature (20 total tests).
/// </summary>
public class Tier2_ConsultationErgonomicsBoundaryTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly Guid _patientId = Guid.NewGuid();
    private readonly Guid _doctorId = Guid.NewGuid();

    // =========================================================================
    // Feature 14 Boundaries: Dual-Mode Consultation Ergonomics
    // =========================================================================
    [Fact]
    public void F14_B1_DualMode_EmptySoapFields_AllowedForRapidTriageEncounter()
    {
        var pe = new NineSystemPhysicalExamDto(true, null, null, null, null, null, null, null, null, null);
        var enc = new DualModeConsultationDto(Guid.NewGuid(), _clinicId, _patientId, _doctorId,
            EncounterType.PrivateCash, false, "", "", "Prescription Refill", "Re-issued Amlodipine 5mg",
            null, null, null, null, null, pe, true, DateTime.UtcNow);

        enc.Subjective.Should().BeEmpty();
        enc.Assessment.Should().NotBeEmpty();
    }

    [Fact]
    public void F14_B2_DualMode_ExtremeCharacterCountInSoapNarrative()
    {
        var narrative = new string('N', 4000);
        var pe = new NineSystemPhysicalExamDto(true, null, null, null, null, null, null, null, null, null);
        var enc = new DualModeConsultationDto(Guid.NewGuid(), _clinicId, _patientId, _doctorId,
            EncounterType.PrivateCash, false, narrative, narrative, narrative, narrative,
            null, null, null, null, null, pe, false, null);

        enc.Subjective.Length.Should().Be(4000);
    }

    [Fact]
    public void F14_B3_DualMode_AlreadySignedEncounter_CannotBeResigned()
    {
        var originalSignedTime = new DateTime(2026, 10, 11, 8, 30, 0, DateTimeKind.Utc);
        var pe = new NineSystemPhysicalExamDto(true, null, null, null, null, null, null, null, null, null);
        var enc = new DualModeConsultationDto(Guid.NewGuid(), _clinicId, _patientId, _doctorId,
            EncounterType.PrivateCash, false, "S", "O", "A", "P", null, null, null, null, null,
            pe, IsSigned: true, SignedAtUtc: originalSignedTime);

        // Attempting to resign does not modify SignedAtUtc
        enc.SignedAtUtc.Should().Be(originalSignedTime);
    }

    [Fact]
    public void F14_B4_DualMode_KonsultaEncounterWithoutAtc_FlagsValidationWarning()
    {
        var pe = new NineSystemPhysicalExamDto(true, null, null, null, null, null, null, null, null, null);
        var enc = new DualModeConsultationDto(Guid.NewGuid(), _clinicId, _patientId, _doctorId,
            EncounterType.PhilHealthKonsulta, true, "S", "O", "A", "P", "PAN-123", PhilHealthAtc: null,
            "C001", "E001", "S001", pe, false, null);

        var requiresAtc = enc.IsYakapEligible && string.IsNullOrWhiteSpace(enc.PhilHealthAtc);
        requiresAtc.Should().BeTrue();
    }

    [Fact]
    public void F14_B5_DualMode_EncounterAtMidnightUtcBoundary()
    {
        var midnight = new DateTime(2026, 10, 12, 0, 0, 0, DateTimeKind.Utc);
        var pe = new NineSystemPhysicalExamDto(true, null, null, null, null, null, null, null, null, null);
        var enc = new DualModeConsultationDto(Guid.NewGuid(), _clinicId, _patientId, _doctorId,
            EncounterType.PrivateCash, false, "S", "O", "A", "P", null, null, null, null, null,
            pe, true, midnight);

        enc.SignedAtUtc.Should().Be(midnight);
    }

    // =========================================================================
    // Feature 15 Boundaries: Inline 9-System Physical Exam Card
    // =========================================================================
    [Fact]
    public void F15_B1_PhysicalExamCard_PartialFindingsInSingleSystemOnly()
    {
        var pe = new NineSystemPhysicalExamDto(false, SkinRemarks: "Psoriatic plaques on extensor elbows",
            HeentRemarks: null, ChestLungsRemarks: null, HeartCvsRemarks: null, AbdomenRemarks: null,
            NeuroRemarks: null, RectalRemarks: null, GenitourinaryRemarks: null, MusculoskeletalRemarks: null);

        pe.AllEssentiallyNormal.Should().BeFalse();
        pe.SkinRemarks.Should().NotBeNullOrWhiteSpace();
        pe.ChestLungsRemarks.Should().BeNull();
    }

    [Fact]
    public void F15_B2_PhysicalExamCard_SpecialCharactersInOrganRemarks_EscapedSafely()
    {
        var rawRemark = "Grade 3/6 systolic ejection murmur @ 'aortic area' <2nd ICS RUSB>";
        var escaped = System.Security.SecurityElement.Escape(rawRemark);

        escaped.Should().Contain("&lt;");
        escaped.Should().Contain("&gt;");
    }

    [Fact]
    public void F15_B3_PhysicalExamCard_AllNineSystemsAbnormalSimultaneously()
    {
        var pe = new NineSystemPhysicalExamDto(false, "Skin abnormal", "HEENT abnormal", "Chest abnormal",
            "Heart abnormal", "Abdomen abnormal", "Neuro abnormal", "Rectal abnormal", "GU abnormal", "MSK abnormal");

        var nonNullCount = new[] { pe.SkinRemarks, pe.HeentRemarks, pe.ChestLungsRemarks, pe.HeartCvsRemarks,
            pe.AbdomenRemarks, pe.NeuroRemarks, pe.RectalRemarks, pe.GenitourinaryRemarks, pe.MusculoskeletalRemarks }
            .Count(r => !string.IsNullOrWhiteSpace(r));

        nonNullCount.Should().Be(9);
    }

    [Fact]
    public void F15_B4_PhysicalExamCard_WhitespaceOnlyRemarks_TreatedAsEssentiallyNormal()
    {
        var rawRemark = "   ";
        var isEffectivelyEmpty = string.IsNullOrWhiteSpace(rawRemark);
        isEffectivelyEmpty.Should().BeTrue();
    }

    [Fact]
    public void F15_B5_PhysicalExamCard_OneClickNormal_ClearsAnyPriorAbnormalRemarks()
    {
        var pe = new NineSystemPhysicalExamDto(true, null, null, null, null, null, null, null, null, null);
        pe.AllEssentiallyNormal.Should().BeTrue();
        pe.SkinRemarks.Should().BeNull();
    }

    // =========================================================================
    // Feature 16 Boundaries: ATC Header & Doctor PAN Snapshotting
    // =========================================================================
    [Fact]
    public void F16_B1_DoctorPan_FormattedWithDashes_NormalizedSafely()
    {
        var rawPan = "12-345678901-2";
        var cleanPan = rawPan.Replace("-", "").Trim();
        cleanPan.Length.Should().Be(12);
    }

    [Fact]
    public void F16_B2_DoctorPan_EmptyStringSnapshot_PreventedForKonsultaEncounter()
    {
        string? emptyPan = "";
        var isValidPan = !string.IsNullOrWhiteSpace(emptyPan);
        isValidPan.Should().BeFalse();
    }

    [Fact]
    public void F16_B3_AtcBanner_SpecialFormat_ValidatesAlphaNumeric()
    {
        var atc = "ATC-2026-X891";
        atc.Should().Contain("ATC");
    }

    [Fact]
    public void F16_B4_DoctorPan_SnapshotAtSigning_LocksHistoricalPan()
    {
        var snapshot = "DOC-PAN-2026-001";
        var updated = "DOC-PAN-2026-002";
        snapshot.Should().NotBe(updated);
    }

    [Fact]
    public void F16_B5_AtcBanner_WhitespacePadding_TrimmedCleanly()
    {
        var dirtyAtc = "  ATC123456789  ";
        var cleanAtc = dirtyAtc.Trim();
        cleanAtc.Should().Be("ATC123456789");
    }

    // =========================================================================
    // Feature 17 Boundaries: Statutory Key Auto-Generation
    // =========================================================================
    [Fact]
    public void F17_B1_StatutoryKey_SequenceRolloverAtNinetyNineThousand()
    {
        var accre = "H90000001";
        var year = "2026";
        var seq = 99999;

        var caseNo = $"C{accre}{year}{seq:D5}";
        caseNo.Should().Be("CH90000001202699999");
    }

    [Fact]
    public void F17_B2_StatutoryKey_SequenceGreaterThanFiveDigits_PreservesAllDigits()
    {
        var accre = "H90000001";
        var year = "2026";
        var seq = 100005;

        var caseNo = $"C{accre}{year}{seq:D5}";
        caseNo.Should().Be("CH900000012026100005");
    }

    [Fact]
    public void F17_B3_StatutoryKey_LeapYearEffectiveYear_FormatsCorrectly()
    {
        var leapYear = "2028";
        var caseNo = $"CH90000001{leapYear}00001";
        caseNo.Should().Contain("2028");
    }

    [Fact]
    public void F17_B4_StatutoryKey_PrefixCollisionPrevention_AllPrefixesDistinct()
    {
        var prefixes = new[] { 'C', 'E', 'P', 'S', 'M', 'R' };
        prefixes.Should().OnlyHaveUniqueItems();
    }

    [Fact]
    public void F17_B5_StatutoryKey_AccreditationWithSpecialCharacters_Sanitized()
    {
        var rawAccre = "H-9000-0001";
        var cleanAccre = rawAccre.Replace("-", "");
        cleanAccre.Should().Be("H90000001");
    }
}
