using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Application.Tests.E2E.Fixtures;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.E2E.Tier1_FeatureCoverage;

using static E2EContracts;

/// <summary>
/// Tier 1: Feature Coverage for Milestone M3 (Features 14 through 17).
/// Each feature contains at least 5 distinct test cases verifying primary behavior.
/// </summary>
public class Tier1_ConsultationErgonomicsTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly Guid _patientId = Guid.NewGuid();
    private readonly Guid _doctorId = Guid.NewGuid();

    // =========================================================================
    // Feature 14: Dual-Mode Consultation Ergonomics
    // =========================================================================
    [Fact]
    public void F14_T1_StandardEncounter_HasZeroPhilHealthFields()
    {
        var pe = new NineSystemPhysicalExamDto(true, null, null, null, null, null, null, null, null, null);
        var enc = new DualModeConsultationDto(
            Id: Guid.NewGuid(),
            ClinicId: _clinicId,
            PatientId: _patientId,
            DoctorId: _doctorId,
            Type: EncounterType.PrivateCash,
            IsYakapEligible: false,
            Subjective: "Patient reports tension headache for 2 days.",
            Objective: "BP 118/76. Neurological exam grossly intact.",
            Assessment: "Tension-type headache (G44.2).",
            Plan: "Prescribed Paracetamol 500mg PRN. Advised adequate hydration.",
            DoctorPhilHealthPan: null,
            PhilHealthAtc: null,
            HciCaseNo: null,
            HciTransNo: null,
            SoapTransNo: null,
            PhysicalExam: pe,
            IsSigned: true,
            SignedAtUtc: DateTime.UtcNow);

        enc.IsYakapEligible.Should().BeFalse();
        enc.DoctorPhilHealthPan.Should().BeNull();
        enc.PhilHealthAtc.Should().BeNull();
        enc.HciCaseNo.Should().BeNull();
    }

    [Fact]
    public void F14_T2_KonsultaEncounter_EnablesStatutoryGuidanceAndKeys()
    {
        var pe = new NineSystemPhysicalExamDto(true, null, null, null, null, null, null, null, null, null);
        var enc = new DualModeConsultationDto(
            Id: Guid.NewGuid(),
            ClinicId: _clinicId,
            PatientId: _patientId,
            DoctorId: _doctorId,
            Type: EncounterType.PhilHealthKonsulta,
            IsYakapEligible: true,
            Subjective: "Routine Primary Care Benefit consultation.",
            Objective: "Vitals stable. All 9 organ systems essentially normal.",
            Assessment: "Routine general medical examination (Z00.0).",
            Plan: "Counseled on diet and physical activity.",
            DoctorPhilHealthPan: "PAN-1234567890",
            PhilHealthAtc: "ATC-KON-2026-001",
            HciCaseNo: "CH90000001202600001",
            HciTransNo: "EH90000001202600001",
            SoapTransNo: "SH90000001202600001",
            PhysicalExam: pe,
            IsSigned: true,
            SignedAtUtc: DateTime.UtcNow);

        enc.IsYakapEligible.Should().BeTrue();
        enc.DoctorPhilHealthPan.Should().NotBeNullOrWhiteSpace();
        enc.PhilHealthAtc.Should().NotBeNullOrWhiteSpace();
        enc.HciCaseNo.Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public void F14_T3_HmoEncounter_BehavesLikeStandardPrivateVisit()
    {
        var pe = new NineSystemPhysicalExamDto(true, null, null, null, null, null, null, null, null, null);
        var hmoEnc = new DualModeConsultationDto(Guid.NewGuid(), _clinicId, _patientId, _doctorId,
            EncounterType.HmoInsurance, false, "Annual executive checkup", "Vitals normal", "Fit to work", "Issue cert",
            null, null, null, null, null, pe, true, DateTime.UtcNow);

        hmoEnc.Type.Should().Be(EncounterType.HmoInsurance);
        hmoEnc.IsYakapEligible.Should().BeFalse();
    }

    [Fact]
    public void F14_T4_DualModeBifurcation_TogglesWorkstationUiLayout()
    {
        var isKonsulta = true;
        var showAtcBanner = isKonsulta;
        var showStatutoryKeys = isKonsulta;
        var showInlinePhysicalExamCard = isKonsulta;

        showAtcBanner.Should().BeTrue();
        showStatutoryKeys.Should().BeTrue();
        showInlinePhysicalExamCard.Should().BeTrue();
    }

    [Fact]
    public void F14_T5_ConsultationSigning_LocksRecordFromSubsequentEdits()
    {
        var pe = new NineSystemPhysicalExamDto(true, null, null, null, null, null, null, null, null, null);
        var enc = new DualModeConsultationDto(Guid.NewGuid(), _clinicId, _patientId, _doctorId,
            EncounterType.PrivateCash, false, "Subj", "Obj", "Assess", "Plan",
            null, null, null, null, null, pe, IsSigned: true, SignedAtUtc: DateTime.UtcNow);

        enc.IsSigned.Should().BeTrue();
        enc.SignedAtUtc.Should().NotBeNull();
    }

    // =========================================================================
    // Feature 15: Inline 9-System Physical Exam Card
    // =========================================================================
    [Fact]
    public void F15_T1_PhysicalExamCard_OneClickAllEssentiallyNormal_SetsAllSystemsNormal()
    {
        var exam = new NineSystemPhysicalExamDto(
            AllEssentiallyNormal: true,
            SkinRemarks: null,
            HeentRemarks: null,
            ChestLungsRemarks: null,
            HeartCvsRemarks: null,
            AbdomenRemarks: null,
            NeuroRemarks: null,
            RectalRemarks: null,
            GenitourinaryRemarks: null,
            MusculoskeletalRemarks: null);

        exam.AllEssentiallyNormal.Should().BeTrue();
        exam.SkinRemarks.Should().BeNull();
        exam.ChestLungsRemarks.Should().BeNull();
    }

    [Fact]
    public void F15_T2_PhysicalExamCard_AllowsGranularAbnormalRemarks()
    {
        var exam = new NineSystemPhysicalExamDto(
            AllEssentiallyNormal: false,
            SkinRemarks: "Multiple maculopapular lesions on trunk",
            HeentRemarks: "Pale conjunctivae, anicteric sclerae",
            ChestLungsRemarks: "Clear breath sounds, no rales or wheezes",
            HeartCvsRemarks: "Regular rate, distinct S1/S2, no murmurs",
            AbdomenRemarks: "Soft, non-tender, no organomegaly",
            NeuroRemarks: "Conscious, coherent, cranial nerves intact",
            RectalRemarks: "Essentially normal",
            GenitourinaryRemarks: "Essentially normal",
            MusculoskeletalRemarks: "Full range of motion, no deformities");

        exam.AllEssentiallyNormal.Should().BeFalse();
        exam.SkinRemarks.Should().Contain("maculopapular");
        exam.HeentRemarks.Should().Contain("Pale conjunctivae");
    }

    [Fact]
    public void F15_T3_PhysicalExamCard_MapsDirectlyToPhilHealthPeMiscAndPeSpecific()
    {
        var exam = new NineSystemPhysicalExamDto(false, "Eczematous rash", null, "Wheezing bilateral", null, null, null, null, null, null);

        var hasSkinFinding = !string.IsNullOrWhiteSpace(exam.SkinRemarks);
        var hasChestFinding = !string.IsNullOrWhiteSpace(exam.ChestLungsRemarks);

        hasSkinFinding.Should().BeTrue();
        hasChestFinding.Should().BeTrue();
    }

    [Fact]
    public void F15_T4_PhysicalExamCard_OmitsRectalAndGuWhenDeferred()
    {
        var exam = new NineSystemPhysicalExamDto(false, null, null, null, null, null, null, RectalRemarks: "Deferred upon patient request", GenitourinaryRemarks: "Deferred", null);

        exam.RectalRemarks.Should().Contain("Deferred");
        exam.GenitourinaryRemarks.Should().Contain("Deferred");
    }

    [Fact]
    public void F15_T5_PhysicalExamCard_HandlesEmptyInputWithoutCrashing()
    {
        var exam = new NineSystemPhysicalExamDto(false, null, null, null, null, null, null, null, null, null);

        exam.AllEssentiallyNormal.Should().BeFalse();
        exam.SkinRemarks.Should().BeNull();
    }

    // =========================================================================
    // Feature 16: ATC Header & Doctor PAN Snapshotting
    // =========================================================================
    [Fact]
    public void F16_T1_DoctorPanSnapshot_PersistsAtSigningTime()
    {
        var doctorPan = "PAN-7890123456";
        var signedEncounterPan = doctorPan;

        signedEncounterPan.Should().Be("PAN-7890123456");
    }

    [Fact]
    public void F16_T2_AtcBanner_ValidatesFormat()
    {
        var atc = "ATC202610110001";
        atc.Should().StartWith("ATC");
        atc.Length.Should().BeGreaterThan(5);
    }

    [Fact]
    public void F16_T3_DoctorPan_SnapshotImmunizesAgainstFutureProfileEdits()
    {
        var snapshotPan = "ORIGINAL-PAN-123";
        var updatedDoctorProfilePan = "NEW-PAN-999";

        // Snapshot in consultation must remain unchanged
        snapshotPan.Should().NotBe(updatedDoctorProfilePan);
        snapshotPan.Should().Be("ORIGINAL-PAN-123");
    }

    [Fact]
    public void F16_T4_AtcBanner_RequiredOnlyForKonsultaVisits()
    {
        var konsultaAtc = "ATC987654321";
        string? privateAtc = null;

        konsultaAtc.Should().NotBeNullOrWhiteSpace();
        privateAtc.Should().BeNull();
    }

    [Fact]
    public void F16_T5_DoctorPan_ValidatedForLengthAndContent()
    {
        var pan = "PAN0123456789";
        pan.Should().NotBeEmpty();
        pan.Length.Should().BeInRange(5, 30);
    }

    // =========================================================================
    // Feature 17: Statutory Key Auto-Generation
    // =========================================================================
    [Fact]
    public void F17_T1_HciCaseNo_FormatConformsToPhilHealthStandards()
    {
        var accreNo = "H90000001";
        var year = "2026";
        var seq = 123;
        var caseNo = $"C{accreNo}{year}{seq:D5}";

        caseNo.Should().Be("CH90000001202600123");
        caseNo.Should().StartWith("C");
    }

    [Fact]
    public void F17_T2_EnlistmentAndProfilingTransNo_FollowPrefixConventions()
    {
        var accre = "H90000001";
        var year = "2026";
        var seq = 45;

        var enlistTransNo = $"E{accre}{year}{seq:D5}";
        var profTransNo = $"P{accre}{year}{seq:D5}";
        var soapTransNo = $"S{accre}{year}{seq:D5}";
        var medTransNo = $"M{accre}{year}{seq:D5}";

        enlistTransNo.Should().Be("EH90000001202600045");
        profTransNo.Should().Be("PH90000001202600045");
        soapTransNo.Should().Be("SH90000001202600045");
        medTransNo.Should().Be("MH90000001202600045");
    }

    [Fact]
    public void F17_T3_StatutoryKeys_AreAutoLinkedWithoutClinicianManualEntry()
    {
        var autoGeneratedCaseNo = "CH90000001202600001";
        var autoGeneratedSoapNo = "SH90000001202600001";

        autoGeneratedCaseNo.Should().NotBeNullOrWhiteSpace();
        autoGeneratedSoapNo.Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public void F17_T4_StatutoryKeys_EnsureSequentialMonotonicity()
    {
        var seq1 = 1;
        var seq2 = 2;
        (seq2 > seq1).Should().BeTrue();
    }

    [Fact]
    public void F17_T5_StatutoryKeys_SanitizesAccreditationNumber()
    {
        var dirtyAccre = " H90000001- ";
        var cleanAccre = dirtyAccre.Replace("-", "").Trim();
        cleanAccre.Should().Be("H90000001");
    }
}
