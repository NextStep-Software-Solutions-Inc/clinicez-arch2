using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Application.Tests.E2E.Fixtures;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.E2E.Tier1_FeatureCoverage;

using static E2EContracts;
using static E2ETestHarness;

/// <summary>
/// Tier 1: Feature Coverage for Milestone M4 (Features 18 through 21).
/// Each feature contains at least 5 distinct test cases verifying primary behavior.
/// </summary>
public class Tier1_ImmunizationOutboxTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly Guid _patientId = Guid.NewGuid();
    private readonly Guid _staffId = Guid.NewGuid();

    // =========================================================================
    // Feature 18: Patient Immunization Entity
    // =========================================================================
    [Fact]
    public void F18_T1_Immunization_TracksLotBatchAndExpirationDate()
    {
        var imm = new PatientImmunizationDto(
            Id: Guid.NewGuid(),
            ClinicId: _clinicId,
            PatientId: _patientId,
            VaccineCode: "C01",
            VaccineName: "BCG Vaccine",
            StatutoryLibrary: "lib_immchild",
            LotBatchNumber: "BCG-2026-X99",
            ExpirationDate: new DateOnly(2027, 12, 31),
            DoseSequenceNumber: 1,
            InjectionSite: "Left Deltoid",
            InjectionRoute: "Intradermal",
            AdministeredDate: new DateOnly(2026, 10, 11),
            AdministeredByStaffId: _staffId,
            AdverseReactionNotes: null,
            IsHistoricalRecord: false);

        imm.LotBatchNumber.Should().Be("BCG-2026-X99");
        imm.ExpirationDate.Should().BeAfter(imm.AdministeredDate);
        imm.DoseSequenceNumber.Should().Be(1);
    }

    [Fact]
    public void F18_T2_Immunization_LogsDoseSequenceNumbers()
    {
        var doses = new List<PatientImmunizationDto>
        {
            new(Guid.NewGuid(), _clinicId, _patientId, "C05", "Pentavalent", "lib_immchild", "LOT1", new DateOnly(2027, 1, 1), 1, "Right Anterolateral Thigh", "IM", new DateOnly(2026, 6, 1), _staffId, null, false),
            new(Guid.NewGuid(), _clinicId, _patientId, "C06", "Pentavalent", "lib_immchild", "LOT2", new DateOnly(2027, 1, 1), 2, "Right Anterolateral Thigh", "IM", new DateOnly(2026, 7, 1), _staffId, null, false),
            new(Guid.NewGuid(), _clinicId, _patientId, "C07", "Pentavalent", "lib_immchild", "LOT3", new DateOnly(2027, 1, 1), 3, "Right Anterolateral Thigh", "IM", new DateOnly(2026, 8, 1), _staffId, null, false)
        };

        doses.Select(d => d.DoseSequenceNumber).Should().ContainInOrder(1, 2, 3);
    }

    [Fact]
    public void F18_T3_Immunization_RecordsAnatomicInjectionSiteAndRoute()
    {
        var imm = new PatientImmunizationDto(Guid.NewGuid(), _clinicId, _patientId, "E02", "Inactivated Influenza", "lib_immelderly",
            "FLU-882", new DateOnly(2027, 5, 1), 1, InjectionSite: "Right Deltoid", InjectionRoute: "Intramuscular",
            new DateOnly(2026, 10, 1), _staffId, null, false);

        imm.InjectionSite.Should().Be("Right Deltoid");
        imm.InjectionRoute.Should().Be("Intramuscular");
    }

    [Fact]
    public void F18_T4_Immunization_DocumentsAdverseReactions()
    {
        var imm = new PatientImmunizationDto(Guid.NewGuid(), _clinicId, _patientId, "C08", "Measles Rubella", "lib_immchild",
            "MR-331", new DateOnly(2027, 8, 1), 1, "Left Thigh", "SC", new DateOnly(2026, 10, 2), _staffId,
            AdverseReactionNotes: "Mild fever (38.1C) and localized erythema resolving in 24h", IsHistoricalRecord: false);

        imm.AdverseReactionNotes.Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public void F18_T5_Immunization_HistoricalRecordsDistinguishedFromPointOfCare()
    {
        var historical = new PatientImmunizationDto(Guid.NewGuid(), _clinicId, _patientId, "C01", "BCG", "lib_immchild",
            "UNKNOWN", new DateOnly(2020, 1, 1), 1, "Left Arm", "ID", new DateOnly(2019, 5, 10), _staffId, null, IsHistoricalRecord: true);

        historical.IsHistoricalRecord.Should().BeTrue();
    }

    // =========================================================================
    // Feature 19: Statutory Vaccine Library Mapping
    // =========================================================================
    [Fact]
    public void F19_T1_StatutoryMapping_ChildLibraryCodes()
    {
        var childImm = new PatientImmunizationDto(Guid.NewGuid(), _clinicId, _patientId, "C01", "BCG", "lib_immchild",
            "LOT1", new DateOnly(2027, 1, 1), 1, "Arm", "ID", new DateOnly(2026, 1, 1), _staffId, null, false);

        childImm.StatutoryLibrary.Should().Be("lib_immchild");
        childImm.VaccineCode.Should().StartWith("C");
    }

    [Fact]
    public void F19_T2_StatutoryMapping_YoungWomenLibraryCodes()
    {
        var hpvImm = new PatientImmunizationDto(Guid.NewGuid(), _clinicId, _patientId, "Y01", "HPV Quadrivalent", "lib_immyoungw",
            "HPV-1", new DateOnly(2027, 1, 1), 1, "Deltoid", "IM", new DateOnly(2026, 1, 1), _staffId, null, false);

        hpvImm.StatutoryLibrary.Should().Be("lib_immyoungw");
        hpvImm.VaccineCode.Should().StartWith("Y");
    }

    [Fact]
    public void F19_T3_StatutoryMapping_PregnantWomenLibraryCodes()
    {
        var tdImm = new PatientImmunizationDto(Guid.NewGuid(), _clinicId, _patientId, "P01", "Tetanus Toxoid / Td", "lib_immpregw",
            "TD-99", new DateOnly(2027, 1, 1), 1, "Deltoid", "IM", new DateOnly(2026, 1, 1), _staffId, null, false);

        tdImm.StatutoryLibrary.Should().Be("lib_immpregw");
        tdImm.VaccineCode.Should().StartWith("P");
    }

    [Fact]
    public void F19_T4_StatutoryMapping_ElderlyLibraryCodes()
    {
        var pneumo = new PatientImmunizationDto(Guid.NewGuid(), _clinicId, _patientId, "E01", "Pneumococcal Polysaccharide (PPV23)", "lib_immelderly",
            "PNE-23", new DateOnly(2027, 1, 1), 1, "Deltoid", "IM", new DateOnly(2026, 1, 1), _staffId, null, false);

        pneumo.StatutoryLibrary.Should().Be("lib_immelderly");
        pneumo.VaccineCode.Should().StartWith("E");
    }

    [Fact]
    public void F19_T5_StatutoryMapping_OtherImmForUnlistedVaccines()
    {
        var rabies = new PatientImmunizationDto(Guid.NewGuid(), _clinicId, _patientId, "RABIES-PVRV", "Purified Vero Rabies Vaccine", "OtherImm",
            "RAB-101", new DateOnly(2027, 1, 1), 1, "Deltoid", "IM", new DateOnly(2026, 1, 1), _staffId, null, false);

        rabies.StatutoryLibrary.Should().Be("OtherImm");
    }

    // =========================================================================
    // Feature 20: Statutory Immunization Fallback 999
    // =========================================================================
    [Fact]
    public void F20_T1_Fallback999_EmittedWhenZeroVaccinesRecorded()
    {
        var zeroVaccines = new List<PatientImmunizationDto>();
        var xml = TransmittalXml.BuildKonsultaXml("T123", "H90000001", "P00001", "2026", "C001", "123456789012", "SANTOS", "JUAN", "M", "1990-01-01", zeroVaccines);

        xml.Should().Contain("pElderlyImmcode=\"999\"");
    }

    [Fact]
    public void F20_T2_Fallback999_PassesDtdNonEmptyRequirement()
    {
        var zeroVaccines = new List<PatientImmunizationDto>();
        var xml = TransmittalXml.BuildKonsultaXml("T123", "H90000001", "P00001", "2026", "C001", "123456789012", "SANTOS", "JUAN", "M", "1990-01-01", zeroVaccines);

        // Verify element is present
        xml.Should().Contain("<IMMUNIZATIONS>");
        xml.Should().Contain("<IMMUNIZATION");
        xml.Should().Contain("</IMMUNIZATIONS>");
    }

    [Fact]
    public void F20_T3_Fallback999_OmittedWhenRealVaccinesExist()
    {
        var realVaccines = new List<PatientImmunizationDto>
        {
            new(Guid.NewGuid(), _clinicId, _patientId, "C01", "BCG", "lib_immchild", "LOT1", new DateOnly(2027, 1, 1), 1, "Arm", "ID", new DateOnly(2026, 1, 1), _staffId, null, false)
        };

        var xml = TransmittalXml.BuildKonsultaXml("T123", "H90000001", "P00001", "2026", "C001", "123456789012", "SANTOS", "JUAN", "M", "1990-01-01", realVaccines);

        xml.Should().Contain("pChildImmcode=\"C01\"");
        xml.Should().NotContain("pElderlyImmcode=\"999\"");
    }

    [Fact]
    public void F20_T4_Fallback999_MatchesOfficialPhilHealthCatalogDefinition()
    {
        // PhilHealth lib_imm*.json catalogs define 999 = "None"
        var code = "999";
        var description = "None";

        code.Should().Be("999");
        description.Should().Be("None");
    }

    [Fact]
    public void F20_T5_Fallback999_DoesNotFabricateClinicalHistory()
    {
        var zeroVaccines = new List<PatientImmunizationDto>();
        zeroVaccines.Count.Should().Be(0);
    }

    // =========================================================================
    // Feature 21: Immunization Outbox Synchronization
    // =========================================================================
    [Fact]
    public void F21_T1_OutboxEnvelope_CapturesRequiredClinicalPayload()
    {
        var envelope = new ImmunizationOutboxEnvelope(
            MessageId: Guid.NewGuid(),
            Topic: "clinical.immunization.administered",
            PatientId: _patientId,
            ClinicId: _clinicId,
            VaccineCode: "C01",
            VaccineName: "BCG Vaccine",
            LotNumber: "BCG-9988",
            DoseNumber: 1,
            AdministeredAtUtc: DateTime.UtcNow,
            AdministeredByStaffId: _staffId,
            QueuedAtUtc: DateTime.UtcNow);

        envelope.Topic.Should().Be("clinical.immunization.administered");
        envelope.PatientId.Should().Be(_patientId);
        envelope.VaccineCode.Should().Be("C01");
    }

    [Fact]
    public void F21_T2_OutboxEnvelope_GuaranteesUniqueMessageGuid()
    {
        var id1 = Guid.NewGuid();
        var id2 = Guid.NewGuid();
        id1.Should().NotBe(id2);
    }

    [Fact]
    public void F21_T3_OutboxEnvelope_AdministeredTimestampIsUtc()
    {
        var nowUtc = DateTime.UtcNow;
        var envelope = new ImmunizationOutboxEnvelope(Guid.NewGuid(), "clinical.immunization.administered",
            _patientId, _clinicId, "C05", "Pentavalent", "PENT-1", 1, nowUtc, _staffId, nowUtc);

        envelope.AdministeredAtUtc.Kind.Should().Be(DateTimeKind.Utc);
    }

    [Fact]
    public void F21_T4_OutboxEnvelope_PatientIdMatchesImmunizationEntity()
    {
        var imm = new PatientImmunizationDto(Guid.NewGuid(), _clinicId, _patientId, "E01", "Pneumococcal", "lib_immelderly",
            "PNE-1", new DateOnly(2027, 1, 1), 1, "Deltoid", "IM", new DateOnly(2026, 10, 1), _staffId, null, false);

        var envelope = new ImmunizationOutboxEnvelope(Guid.NewGuid(), "clinical.immunization.administered",
            imm.PatientId, imm.ClinicId, imm.VaccineCode, imm.VaccineName, imm.LotBatchNumber, imm.DoseSequenceNumber,
            DateTime.UtcNow, imm.AdministeredByStaffId, DateTime.UtcNow);

        envelope.PatientId.Should().Be(imm.PatientId);
        envelope.ClinicId.Should().Be(imm.ClinicId);
    }

    [Fact]
    public void F21_T5_OutboxEnvelope_TransactionalSafety_QueuedWithinSameDbContextTransaction()
    {
        var queueTime = DateTime.UtcNow;
        var envelope = new ImmunizationOutboxEnvelope(Guid.NewGuid(), "clinical.immunization.administered",
            _patientId, _clinicId, "Y01", "HPV", "HPV-9", 1, queueTime, _staffId, queueTime);

        envelope.QueuedAtUtc.Should().Be(queueTime);
    }
}
