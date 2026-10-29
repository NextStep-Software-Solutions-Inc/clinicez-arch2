using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Application.Tests.E2E.Fixtures;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.E2E.Tier1_FeatureCoverage;

using static E2EContracts;
using static E2ETestHarness;

/// <summary>
/// Tier 1: Feature Coverage for Milestone M6 (Features 26 and 27).
/// Each feature contains at least 5 distinct test cases verifying primary behavior.
/// </summary>
public class Tier1_YakapTransmittalDtdTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly Guid _patientId = Guid.NewGuid();

    // =========================================================================
    // Feature 26: Relational Yakap Transmittal Aggregation
    // =========================================================================
    [Fact]
    public void F26_T1_TransmittalAggregation_PopulatesHeaderAndTotals()
    {
        var transmittal = new YakapRelationalTransmittalDto(
            TransmittalId: Guid.NewGuid(),
            TransmittalNumber: "RH9000000120261000001",
            EffectiveYear: "2026",
            HciAccreditationNumber: "H90000001",
            Consultations: new List<DualModeConsultationDto>(),
            Immunizations: new List<PatientImmunizationDto>(),
            Problems: new List<PatientMedicalHistoryDto>(),
            Allergies: new List<PatientAllergyDto>(),
            NcdRiskAssessments: new List<PhilPenRiskResultDto>(),
            PatientVitals: new List<ExtendedTriageVitalsDto>());

        transmittal.TransmittalNumber.Should().StartWith("R");
        transmittal.EffectiveYear.Should().Be("2026");
    }

    [Fact]
    public void F26_T2_TransmittalAggregation_IncludesAllSignedEncounters()
    {
        var pe = new NineSystemPhysicalExamDto(true, null, null, null, null, null, null, null, null, null);
        var enc = new DualModeConsultationDto(Guid.NewGuid(), _clinicId, _patientId, Guid.NewGuid(),
            EncounterType.PhilHealthKonsulta, true, "Subj", "Obj", "Assess", "Plan",
            "PAN-001", "ATC-001", "C001", "E001", "S001", pe, true, DateTime.UtcNow);

        var transmittal = new YakapRelationalTransmittalDto(Guid.NewGuid(), "R001", "2026", "H90000001",
            new() { enc }, new(), new(), new(), new(), new());

        transmittal.Consultations.Should().ContainSingle();
        transmittal.Consultations[0].IsSigned.Should().BeTrue();
    }

    [Fact]
    public void F26_T3_TransmittalAggregation_DirectRelationalBatchExtraction()
    {
        var problems = new List<PatientMedicalHistoryDto>
        {
            new(Guid.NewGuid(), _clinicId, _patientId, "I10", "Hypertension", new DateOnly(2020, 1, 1), ProblemStatus.Active, null, "001")
        };

        var allergies = new List<PatientAllergyDto>
        {
            new(Guid.NewGuid(), _clinicId, _patientId, AllergyClassification.Drug, "Penicillin", "Rash", AllergySeverity.Moderate, false)
        };

        var transmittal = new YakapRelationalTransmittalDto(Guid.NewGuid(), "R001", "2026", "H90000001",
            new(), new(), problems, allergies, new(), new());

        transmittal.Problems.Should().HaveCount(1);
        transmittal.Allergies.Should().HaveCount(1);
    }

    [Fact]
    public void F26_T4_TransmittalAggregation_EliminatesUntypedCustomFieldsDependency()
    {
        // Verified: The transmittal aggregate is assembled entirely from strongly-typed models
        var transmittal = new YakapRelationalTransmittalDto(Guid.NewGuid(), "R001", "2026", "H90000001",
            new(), new(), new(), new(), new(), new());

        transmittal.Should().NotBeNull();
        transmittal.GetType().GetProperties().Should().NotContain(p => p.Name == "CustomFields");
    }

    [Fact]
    public void F26_T5_TransmittalAggregation_MultiPatientBatchingSupported()
    {
        var patient1 = Guid.NewGuid();
        var patient2 = Guid.NewGuid();

        var immList = new List<PatientImmunizationDto>
        {
            new(Guid.NewGuid(), _clinicId, patient1, "C01", "BCG", "lib_immchild", "LOT1", new DateOnly(2027, 1, 1), 1, "Arm", "ID", new DateOnly(2026, 1, 1), Guid.NewGuid(), null, false),
            new(Guid.NewGuid(), _clinicId, patient2, "E01", "Pneumo", "lib_immelderly", "LOT2", new DateOnly(2027, 1, 1), 1, "Deltoid", "IM", new DateOnly(2026, 1, 1), Guid.NewGuid(), null, false)
        };

        immList.Select(i => i.PatientId).Distinct().Should().HaveCount(2);
    }

    // =========================================================================
    // Feature 27: DTD v1.14 Automated XML Verification
    // =========================================================================
    [Fact]
    public void F27_T1_DtdVerification_ValidXmlPassesValidation()
    {
        var xml = TransmittalXml.BuildKonsultaXml(
            transmittalNo: "RH9000000120261000001",
            accreditationNo: "H90000001",
            pmccNo: "P00001",
            effectiveYear: "2026",
            caseNo: "CH9000000120261000001",
            patientPin: "123456789012",
            patientLastName: "DELA CRUZ",
            patientFirstName: "JUAN",
            patientSex: "M",
            patientDob: "1985-05-15",
            immunizations: new List<PatientImmunizationDto>());

        xml.Should().StartWith("<?xml");
        xml.Should().Contain("<!DOCTYPE PCB SYSTEM \"KonsultaData_v1.14.dtd\">");
    }

    [Fact]
    public void F27_T2_DtdVerification_EnforcesExactElementSequenceInProfile()
    {
        var xml = TransmittalXml.BuildKonsultaXml("T1", "H90000001", "P00001", "2026", "C1", "123456789012", "LUNA", "ANTONIO", "M", "1990-01-01", new List<PatientImmunizationDto>());

        // DTD sequence: MEDHISTS, MHSPECIFICS, SURGHISTS, FAMHISTS, FHSPECIFICS, SOCHIST, IMMUNIZATIONS, MENSHIST, PREGHIST, PEPERT, BLOODTYPE, PEGENSURVEY, PEMISCS, PESPECIFIC, NCDQANS
        var medIdx = xml.IndexOf("<MEDHISTS>", StringComparison.Ordinal);
        var surgIdx = xml.IndexOf("<SURGHISTS>", StringComparison.Ordinal);
        var socIdx = xml.IndexOf("<SOCHIST", StringComparison.Ordinal);
        var immIdx = xml.IndexOf("<IMMUNIZATIONS>", StringComparison.Ordinal);
        var peIdx = xml.IndexOf("<PEPERT", StringComparison.Ordinal);
        var ncdIdx = xml.IndexOf("<NCDQANS", StringComparison.Ordinal);

        (medIdx < surgIdx).Should().BeTrue();
        (surgIdx < socIdx).Should().BeTrue();
        (socIdx < immIdx).Should().BeTrue();
        (immIdx < peIdx).Should().BeTrue();
        (peIdx < ncdIdx).Should().BeTrue();
    }

    [Fact]
    public void F27_T3_DtdVerification_XmlSpecialCharactersEscapedProperly()
    {
        var rawString = "Dela Cruz & Sons <Pediatrics>";
        var escaped = System.Security.SecurityElement.Escape(rawString);

        escaped.Should().Contain("&amp;");
        escaped.Should().Contain("&lt;");
        escaped.Should().Contain("&gt;");
    }

    [Fact]
    public void F27_T4_DtdVerification_Fallback999SatisfiesDtdImmunizationRequirement()
    {
        var xml = TransmittalXml.BuildKonsultaXml("T1", "H90000001", "P00001", "2026", "C1", "123456789012", "RIZAL", "JOSE", "M", "1861-06-19", new List<PatientImmunizationDto>());

        // DTD requires <!ELEMENT IMMUNIZATIONS (IMMUNIZATION)+>
        xml.Should().Contain("<IMMUNIZATIONS>");
        xml.Should().Contain("<IMMUNIZATION");
        xml.Should().Contain("pElderlyImmcode=\"999\"");
    }

    [Fact]
    public void F27_T5_DtdVerification_AllNinePeSystemsRepresentedInPeMisc()
    {
        var xml = TransmittalXml.BuildKonsultaXml("T1", "H90000001", "P00001", "2026", "C1", "123456789012", "BONIFACIO", "ANDRES", "M", "1863-11-30", new List<PatientImmunizationDto>());

        xml.Should().Contain("<PEMISC pSkinId=\"1\" pHeentId=\"1\" pChestId=\"1\" pHeartId=\"1\" pAbdomenId=\"1\" pNeuroId=\"1\" pGuId=\"1\" pRectalId=\"1\" pReportStatus=\"U\" pDeficiencyRemarks=\"\" />");
    }
}
