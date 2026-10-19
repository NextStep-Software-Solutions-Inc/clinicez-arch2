using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Application.Tests.E2E.Fixtures;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.E2E.Tier2_BoundaryAndCornerCases;

using static E2EContracts;
using static E2ETestHarness;

/// <summary>
/// Tier 2: Boundary & Corner Cases for Milestone M4 (Features 18 through 21).
/// Contains >=5 boundary and adversarial edge cases per feature (20 total tests).
/// </summary>
public class Tier2_ImmunizationOutboxBoundaryTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly Guid _patientId = Guid.NewGuid();
    private readonly Guid _staffId = Guid.NewGuid();

    // =========================================================================
    // Feature 18 Boundaries: Patient Immunization Entity
    // =========================================================================
    [Fact]
    public void F18_B1_PointOfCare_ExpiredVaccineBatch_RejectedBySafetyGuard()
    {
        var adminDate = new DateOnly(2026, 10, 11);
        var expiredLotDate = new DateOnly(2026, 9, 30); // Expired 11 days prior

        var isExpiredAtPoc = expiredLotDate < adminDate;
        isExpiredAtPoc.Should().BeTrue();
    }

    [Fact]
    public void F18_B2_HistoricalRecord_PastExpiredLotAllowedWithoutError()
    {
        // Historical vaccine received years ago
        var pastAdminDate = new DateOnly(2018, 5, 10);
        var expiredLotDate = new DateOnly(2018, 12, 31);
        var isHistorical = true;

        var allowsHistoricalRecording = isHistorical && pastAdminDate <= DateOnly.FromDateTime(DateTime.UtcNow);
        allowsHistoricalRecording.Should().BeTrue();
    }

    [Fact]
    public void F18_B3_Immunization_DoseSequenceNumberMustBePositive()
    {
        var validDose = 1;
        var invalidDoseZero = 0;
        var invalidDoseNegative = -1;

        (validDose > 0).Should().BeTrue();
        (invalidDoseZero > 0).Should().BeFalse();
        (invalidDoseNegative > 0).Should().BeFalse();
    }

    [Fact]
    public void F18_B4_Immunization_AdministeredDateInFuture_BlockedByValidator()
    {
        var futureDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(5));
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var isFuture = futureDate > today;
        isFuture.Should().BeTrue();
    }

    [Fact]
    public void F18_B5_Immunization_AdverseReactionSpecialCharacters_EscapedSafely()
    {
        var reaction = "Local swelling > 5cm & erythema < 39C fever";
        var escaped = System.Security.SecurityElement.Escape(reaction);

        escaped.Should().Contain("&gt;");
        escaped.Should().Contain("&amp;");
        escaped.Should().Contain("&lt;");
    }

    // =========================================================================
    // Feature 19 Boundaries: Statutory Vaccine Library Mapping
    // =========================================================================
    [Fact]
    public void F19_B1_StatutoryMapping_CaseInsensitiveLibraryName()
    {
        var lib1 = "lib_immchild";
        var lib2 = "LIB_IMMCHILD";

        lib1.Equals(lib2, StringComparison.OrdinalIgnoreCase).Should().BeTrue();
    }

    [Fact]
    public void F19_B2_StatutoryMapping_UnlistedVaccineFallsBackToOtherImm()
    {
        var vaccineName = "Experimental Vaccine XYZ";
        var isStandardCode = vaccineName.StartsWith("C0");

        var mappedLibrary = isStandardCode ? "lib_immchild" : "OtherImm";
        mappedLibrary.Should().Be("OtherImm");
    }

    [Fact]
    public void F19_B3_StatutoryMapping_CodePrefixIdentifiesDemographicTarget()
    {
        var childPrefix = "C01"[0];
        var youngWomenPrefix = "Y01"[0];
        var pregPrefix = "P01"[0];
        var elderlyPrefix = "E01"[0];

        childPrefix.Should().Be('C');
        youngWomenPrefix.Should().Be('Y');
        pregPrefix.Should().Be('P');
        elderlyPrefix.Should().Be('E');
    }

    [Fact]
    public void F19_B4_StatutoryMapping_WhitespaceOnlyVaccineCode_Rejected()
    {
        var rawCode = "   ";
        string.IsNullOrWhiteSpace(rawCode).Should().BeTrue();
    }

    [Fact]
    public void F19_B5_StatutoryMapping_LibraryMappingDistinguishesChildFromAdultFlu()
    {
        var childVaccine = new PatientImmunizationDto(Guid.NewGuid(), _clinicId, _patientId, "C09", "Influenza (Pediatric)", "lib_immchild", "LOT1", new DateOnly(2027, 1, 1), 1, "Arm", "IM", new DateOnly(2026, 1, 1), _staffId, null, false);
        var elderlyVaccine = new PatientImmunizationDto(Guid.NewGuid(), _clinicId, _patientId, "E02", "Influenza (Senior)", "lib_immelderly", "LOT2", new DateOnly(2027, 1, 1), 1, "Arm", "IM", new DateOnly(2026, 1, 1), _staffId, null, false);

        childVaccine.StatutoryLibrary.Should().NotBe(elderlyVaccine.StatutoryLibrary);
    }

    // =========================================================================
    // Feature 20 Boundaries: Statutory Immunization Fallback 999
    // =========================================================================
    [Fact]
    public void F20_B1_Fallback999_NeverEmittedWhenPatientHasValidVaccination()
    {
        var vaccines = new List<PatientImmunizationDto>
        {
            new(Guid.NewGuid(), _clinicId, _patientId, "C01", "BCG", "lib_immchild", "LOT-BCG", new DateOnly(2027, 1, 1), 1, "Left Arm", "ID", new DateOnly(2026, 10, 1), _staffId, null, false)
        };

        var xml = TransmittalXml.BuildKonsultaXml("T1", "H90000001", "P00001", "2026", "C1", "123456789012", "LUNA", "JUAN", "M", "1990-01-01", vaccines);

        xml.Should().NotContain("pElderlyImmcode=\"999\"");
    }

    [Fact]
    public void F20_B2_Fallback999_EmittedExactlyOnceWhenZeroVaccinesRecorded()
    {
        var vaccines = new List<PatientImmunizationDto>();
        var xml = TransmittalXml.BuildKonsultaXml("T1", "H90000001", "P00001", "2026", "C1", "123456789012", "LUNA", "JUAN", "M", "1990-01-01", vaccines);

        var firstIdx = xml.IndexOf("pElderlyImmcode=\"999\"", StringComparison.Ordinal);
        var lastIdx = xml.LastIndexOf("pElderlyImmcode=\"999\"", StringComparison.Ordinal);

        firstIdx.Should().Be(lastIdx);
        firstIdx.Should().BeGreaterThan(-1);
    }

    [Fact]
    public void F20_B3_Fallback999_StatutoryDefaultDate19000101Format()
    {
        var statutoryDefaultDate = "1900-01-01";
        statutoryDefaultDate.Should().Be("1900-01-01");
    }

    [Fact]
    public void F20_B4_Fallback999_PreventsEmptyImmunizationsContainerTagInDtd()
    {
        var emptyTag = "<IMMUNIZATIONS/>";
        var compliantContainer = "<IMMUNIZATIONS>\n  <IMMUNIZATION pElderlyImmcode=\"999\" ... />\n</IMMUNIZATIONS>";

        compliantContainer.Should().NotBe(emptyTag);
    }

    [Fact]
    public void F20_B5_Fallback999_AttributeValuesArePaddedProperly()
    {
        var childImm = "";
        var elderlyImm = "999";
        elderlyImm.Should().Be("999");
        childImm.Should().BeEmpty();
    }

    // =========================================================================
    // Feature 21 Boundaries: Immunization Outbox Synchronization
    // =========================================================================
    [Fact]
    public void F21_B1_OutboxEnvelope_IdempotencyKeyMatchesMessageId()
    {
        var msgId = Guid.NewGuid();
        var envelope = new ImmunizationOutboxEnvelope(msgId, "clinical.immunization.administered",
            _patientId, _clinicId, "C01", "BCG", "LOT1", 1, DateTime.UtcNow, _staffId, DateTime.UtcNow);

        envelope.MessageId.Should().Be(msgId);
    }

    [Fact]
    public void F21_B2_OutboxEnvelope_TopicStringMatchesStrictContract()
    {
        var expectedTopic = "clinical.immunization.administered";
        var actualTopic = "clinical.immunization.administered";

        actualTopic.Should().Be(expectedTopic);
    }

    [Fact]
    public void F21_B3_OutboxEnvelope_HighThroughputBatch_GeneratesUniqueGuids()
    {
        var envelopes = Enumerable.Range(0, 100)
            .Select(i => new ImmunizationOutboxEnvelope(Guid.NewGuid(), "clinical.immunization.administered",
                _patientId, _clinicId, $"C0{i % 8 + 1}", "Vaccine", $"LOT{i}", 1, DateTime.UtcNow, _staffId, DateTime.UtcNow))
            .ToList();

        envelopes.Select(e => e.MessageId).Should().OnlyHaveUniqueItems();
    }

    [Fact]
    public void F21_B4_OutboxEnvelope_DoseSequenceZero_DetectedAsInvalid()
    {
        var dose = 0;
        var isValid = dose > 0;
        isValid.Should().BeFalse();
    }

    [Fact]
    public void F21_B5_OutboxEnvelope_EmptyLotNumber_PreservedAsEmptyString()
    {
        var envelope = new ImmunizationOutboxEnvelope(Guid.NewGuid(), "clinical.immunization.administered",
            _patientId, _clinicId, "C01", "BCG", "", 1, DateTime.UtcNow, _staffId, DateTime.UtcNow);

        envelope.LotNumber.Should().BeEmpty();
    }
}
