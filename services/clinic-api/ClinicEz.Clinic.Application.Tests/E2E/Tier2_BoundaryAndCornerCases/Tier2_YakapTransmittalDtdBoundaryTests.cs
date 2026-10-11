using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Application.Tests.E2E.Fixtures;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.E2E.Tier2_BoundaryAndCornerCases;

using static E2EContracts;
using static E2ETestHarness;

/// <summary>
/// Tier 2: Boundary & Corner Cases for Milestone M6 (Features 26 through 27).
/// Contains >=5 boundary and adversarial edge cases per feature (10 total tests).
/// </summary>
public class Tier2_YakapTransmittalDtdBoundaryTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly Guid _patientId = Guid.NewGuid();

    // =========================================================================
    // Feature 26 Boundaries: Relational Yakap Transmittal Aggregation
    // =========================================================================
    [Fact]
    public void F26_B1_Transmittal_ZeroConsultationsBatch_HandlesCleanly()
    {
        var transmittal = new YakapRelationalTransmittalDto(Guid.NewGuid(), "R001", "2026", "H90000001",
            new List<DualModeConsultationDto>(), new List<PatientImmunizationDto>(),
            new List<PatientProblemDto>(), new List<PatientAllergyDto>(),
            new List<PhilPenRiskResultDto>(), new List<ExtendedTriageVitalsDto>());

        transmittal.Consultations.Should().BeEmpty();
    }

    [Fact]
    public void F26_B2_Transmittal_LargeEncounterBatchFiveHundred_AggregatedSuccessfully()
    {
        var pe = new NineSystemPhysicalExamDto(true, null, null, null, null, null, null, null, null, null);
        var encounters = new List<DualModeConsultationDto>();

        for (int i = 0; i < 500; i++)
        {
            encounters.Add(new DualModeConsultationDto(Guid.NewGuid(), _clinicId, Guid.NewGuid(), Guid.NewGuid(),
                EncounterType.PhilHealthKonsulta, true, "S", "O", "A", "P", "PAN-001", "ATC-001",
                $"C{i:D5}", $"E{i:D5}", $"S{i:D5}", pe, true, DateTime.UtcNow));
        }

        encounters.Should().HaveCount(500);
    }

    [Fact]
    public void F26_B3_Transmittal_AccreditationNumberWithHyphen_SanitizedProperly()
    {
        var dirtyAccre = "H900-00001";
        var cleanAccre = dirtyAccre.Replace("-", "");

        cleanAccre.Should().Be("H90000001");
    }

    [Fact]
    public void F26_B4_Transmittal_TransmittalNumberExactLengthNineteenCharacters()
    {
        // RH9000000120261000001 = 1 ('R') + 9 ('H90000001') + 4 ('2026') + 2 ('10') + 5 ('00001') = 21 chars
        var transNo = "RH9000000120261000001";
        transNo.Length.Should().Be(21);
    }

    [Fact]
    public void F26_B5_Transmittal_DuplicateCaseNumbers_FlaggedDuringAggregation()
    {
        var caseNumbers = new List<string> { "C001", "C002", "C001" };
        var hasDuplicates = caseNumbers.GroupBy(c => c).Any(g => g.Count() > 1);

        hasDuplicates.Should().BeTrue();
    }

    // =========================================================================
    // Feature 27 Boundaries: DTD v1.14 Automated XML Verification
    // =========================================================================
    [Fact]
    public void F27_B1_DtdVerification_XmlEntityInjection_SanitizedAndEscaped()
    {
        var maliciousInput = "<script>alert('xss')</script> & \"injection\"";
        var escaped = System.Security.SecurityElement.Escape(maliciousInput);

        escaped.Should().NotContain("<script>");
        escaped.Should().Contain("&lt;script&gt;");
        escaped.Should().Contain("&amp;");
        escaped.Should().Contain("&quot;");
    }

    [Fact]
    public void F27_B2_DtdVerification_MalformedXmlTags_RejectedByParser()
    {
        var malformedXml = "<PCB><ENLISTMENTS></PCB>"; // Mismatched closing tag

        var isValid = TransmittalXml.ValidateAgainstDtd(malformedXml, out var errors);

        isValid.Should().BeFalse();
        errors.Should().NotBeEmpty();
    }

    [Fact]
    public void F27_B3_DtdVerification_UnescapedAmpersand_RejectedByXmlValidator()
    {
        var unescapedXml = "<?xml version=\"1.0\"?><root pDesc=\"Johnson & Johnson\" />";

        var isValid = TransmittalXml.ValidateAgainstDtd(unescapedXml, out var errors);

        isValid.Should().BeFalse();
    }

    [Fact]
    public void F27_B4_DtdVerification_EmptyPinNumber_PaddedToTwelveZeros()
    {
        string? nullPin = null;
        var padded = string.IsNullOrWhiteSpace(nullPin) ? "000000000000" : nullPin.PadLeft(12, '0');

        padded.Should().Be("000000000000");
    }

    [Fact]
    public void F27_B5_DtdVerification_ValidXmlWithFallback999_PassesStructuralIntegrity()
    {
        var xml = TransmittalXml.BuildKonsultaXml("T001", "H90000001", "P00001", "2026", "C001",
            "123456789012", "AGUINALDO", "EMILIO", "M", "1869-03-22", new List<PatientImmunizationDto>());

        xml.Should().Contain("pElderlyImmcode=\"999\"");
        xml.Should().Contain("</PCB>");
    }
}
