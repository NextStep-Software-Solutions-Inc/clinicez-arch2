using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Xml.Linq;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Infrastructure.PhilHealth.Catalog;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Yakap;

/// <summary>
/// Empirical Adversarial Stress Test Suite for Milestone 3 (YakapClinicalMapper).
/// Tests:
/// 1. Multi-year isolation: patient with 2024, 2025, 2026 enlistments in CustomFields["yakap_enlistments"].
///    Ensures an encounter in 2025 generates XML with 2025 control numbers and 2025 pEnlistDate, NOT 2026 or 2024.
/// 2. Date formats: ISO-8601 with timestamps ("2026-01-15T08:30:00Z"), unpadded dates ("2026-1-5"),
///    and edge dates (leap day "2024-02-29", Dec 31 "2025-12-31").
/// 3. Verification that <ENLISTMENT pEnlistDate="..."> outputs exact statutory date and does NOT mirror encounter date.
/// 4. Fallback behavior: patient with no enlistment custom field, verifying fallback to clean patient code and encounter date without crashing.
/// </summary>
public sealed class YakapClinicalMapperAdversarialTests
{
    private readonly YakapClinicalMapper _mapper = new(PhilHealthCatalogLookup.FromBundledSeed());

    private static (ClinicSettings Settings, ClinicPatient Patient, ConsultationEncounter Encounter, TriageVitals Vitals)
        CreateHarness(string effectiveYear, DateTime encounterDate, string patientCode = "PAT-2026-0001")
    {
        var clinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var encounterId = Guid.NewGuid();

        var settings = new ClinicSettings
        {
            TenantId = "tenant_adv_xml",
            ClinicId = clinicId,
            ClinicName = "ClinicEZ Adversarial Health Center",
            AccreditationNumber = "000921"
        };

        var patient = new ClinicPatient
        {
            Id = patientId,
            TenantId = "tenant_adv_xml",
            ClinicId = clinicId,
            PatientCode = patientCode,
            FirstName = "Maria",
            LastName = "Clara",
            DateOfBirth = new DateOnly(1992, 8, 20),
            Gender = "Female",
            ContactNumber = "09179876543",
            PhilHealthNumber = "03-026307850-7",
            BloodType = "A+"
        };

        var encounter = new ConsultationEncounter
        {
            Id = encounterId,
            TenantId = "tenant_adv_xml",
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Maria Clara",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Jose Rizal",
            EncounterDate = encounterDate,
            Subjective = "Comprehensive health check",
            Objective = "Vitals stable, asymptomatic",
            Assessment = "Healthy adult",
            Plan = "Annual maintenance",
            PhilHealthSoapTransNo = $"S000921{effectiveYear}00001",
            IsSigned = true
        };

        var vitals = new TriageVitals
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_adv_xml",
            ClinicId = clinicId,
            PatientId = patientId,
            SystolicBp = 115,
            DiastolicBp = 75,
            HeartRateBpm = 68,
            RespiratoryRateBreathsPerMin = 16,
            TemperatureCelsius = 36.6m,
            HeightCm = 160m,
            WeightKg = 54m,
            Bmi = 21.09m
        };

        return (settings, patient, encounter, vitals);
    }

    private static string BuildEnlistmentXmlTag(YakapEnlistmentDto dto)
    {
        var element = new XElement("ENLISTMENT",
            new XAttribute("pHciCaseNo", dto.HciCaseNo),
            new XAttribute("pHciTransNo", dto.HciTransNo),
            new XAttribute("pEffYear", dto.EffYear),
            new XAttribute("pEnlistStat", dto.EnlistStat),
            new XAttribute("pEnlistDate", dto.EnlistDate),
            new XAttribute("pPackageType", dto.PackageType),
            new XAttribute("pMemPin", dto.MemPin),
            new XAttribute("pPatientPin", dto.PatientPin),
            new XAttribute("pPatientType", dto.PatientType)
        );
        return element.ToString();
    }

    // =========================================================================
    // 1. Multi-Year Isolation Stress Tests
    // =========================================================================

    [Fact]
    public void MultiYearIsolation_2025Encounter_Generates2025ControlNumbersAndEnlistDate_Not2024Or2026()
    {
        // Arrange: Patient with 3 distinct consecutive years of YAKAP enlistments
        var date2025 = new DateTime(2025, 7, 15, 10, 0, 0, DateTimeKind.Utc);
        var (settings, patient, encounter2025, vitals2025) = CreateHarness("2025", date2025);

        patient.CustomFields["yakap_enlistments"] = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2024-02-01",
                ["valid_until"] = "2024-12-31",
                ["effective_year"] = 2024,
                ["status"] = "Expired",
                ["source"] = "ClinicEnlistment",
                ["case_no"] = "C000921202400010",
                ["enlistment_no"] = "E000921202400010",
                ["profiling_trans_no"] = "P000921202400010"
            },
            new()
            {
                ["enlisted_at"] = "2025-03-20",
                ["valid_until"] = "2025-12-31",
                ["effective_year"] = 2025,
                ["status"] = "Expired", // Expired historical year during audit claim
                ["source"] = "PhilHealthMasterlist",
                ["case_no"] = "C000921202500020",
                ["enlistment_no"] = "E000921202500020",
                ["profiling_trans_no"] = "P000921202500020"
            },
            new()
            {
                ["enlisted_at"] = "2026-01-08",
                ["valid_until"] = "2026-12-31",
                ["effective_year"] = 2026,
                ["status"] = "Active",
                ["source"] = "ClinicEnlistment",
                ["case_no"] = "C000921202600030",
                ["enlistment_no"] = "E000921202600030",
                ["profiling_trans_no"] = "P000921202600030"
            }
        };

        // Act: Map transmittal for 2025 claim
        var doc = _mapper.MapToYakapReportDocument(
            reportTagging: "1",
            effectiveYear: "2025",
            settings: settings,
            encounters: [encounter2025],
            patients: new Dictionary<Guid, ClinicPatient> { [patient.Id] = patient },
            vitalsMap: new Dictionary<Guid, TriageVitals> { [encounter2025.Id] = vitals2025 },
            transmittalNumber: "R0009212025071500001");

        // Assert: Ensure strict isolation to 2025
        doc.Enlistments.Should().ContainSingle();
        var enlist = doc.Enlistments[0];

        enlist.EffYear.Should().Be("2025", "Transmittal is for benefit year 2025");
        enlist.HciCaseNo.Should().Be("C000921202500020", "Case number must be from 2025");
        enlist.HciTransNo.Should().Be("E000921202500020", "Enlistment trans number must be from 2025");
        enlist.EnlistDate.Should().Be("2025-03-20", "Statutory enlist date must be from 2025");

        // Verify it NEVER leaks 2024 or 2026
        enlist.HciCaseNo.Should().NotBe("C000921202400010");
        enlist.HciCaseNo.Should().NotBe("C000921202600030");
        enlist.HciTransNo.Should().NotBe("E000921202400010");
        enlist.HciTransNo.Should().NotBe("E000921202600030");
        enlist.EnlistDate.Should().NotBe("2024-02-01");
        enlist.EnlistDate.Should().NotBe("2026-01-08");

        // Check Profile section
        doc.Profiles.Should().ContainSingle();
        doc.Profiles[0].HciCaseNo.Should().Be("C000921202500020");
        doc.Profiles[0].HciTransNo.Should().Be("P000921202500020");

        // Verify XML serialization contains the 2025 attributes
        var xmlTag = BuildEnlistmentXmlTag(enlist);
        xmlTag.Should().Contain("pHciCaseNo=\"C000921202500020\"");
        xmlTag.Should().Contain("pHciTransNo=\"E000921202500020\"");
        xmlTag.Should().Contain("pEffYear=\"2025\"");
        xmlTag.Should().Contain("pEnlistDate=\"2025-03-20\"");
    }

    [Fact]
    public void MultiYearIsolation_BlankEffectiveYear_Resolves2025EnlistmentViaEncounterDate()
    {
        // Arrange
        var date2025 = new DateTime(2025, 9, 14, 11, 0, 0, DateTimeKind.Utc);
        var (settings, patient, encounter2025, vitals2025) = CreateHarness("2025", date2025);

        patient.CustomFields["yakap_enlistments"] = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2024-01-10",
                ["valid_until"] = "2024-12-31",
                ["effective_year"] = 2024,
                ["status"] = "Expired",
                ["case_no"] = "C000921202400001",
                ["enlistment_no"] = "E000921202400001",
                ["profiling_trans_no"] = "P000921202400001"
            },
            new()
            {
                ["enlisted_at"] = "2025-02-15",
                ["valid_until"] = "2025-12-31",
                ["effective_year"] = 2025,
                ["status"] = "Expired",
                ["case_no"] = "C000921202500002",
                ["enlistment_no"] = "E000921202500002",
                ["profiling_trans_no"] = "P000921202500002"
            },
            new()
            {
                ["enlisted_at"] = "2026-01-05",
                ["valid_until"] = "2026-12-31",
                ["effective_year"] = 2026,
                ["status"] = "Active",
                ["case_no"] = "C000921202600003",
                ["enlistment_no"] = "E000921202600003",
                ["profiling_trans_no"] = "P000921202600003"
            }
        };

        // Act: Map with empty effectiveYear ("")
        var doc = _mapper.MapToYakapReportDocument(
            reportTagging: "1",
            effectiveYear: "", // Blank effective year
            settings: settings,
            encounters: [encounter2025],
            patients: new Dictionary<Guid, ClinicPatient> { [patient.Id] = patient },
            vitalsMap: new Dictionary<Guid, TriageVitals> { [encounter2025.Id] = vitals2025 },
            transmittalNumber: "R0009212025091400001");

        // Assert: Resolved to 2025 entry via encounter date coverage
        doc.Enlistments.Should().ContainSingle();
        doc.Enlistments[0].HciCaseNo.Should().Be("C000921202500002");
        doc.Enlistments[0].HciTransNo.Should().Be("E000921202500002");
        doc.Enlistments[0].EnlistDate.Should().Be("2025-02-15");
    }

    [Fact]
    public void MultiYearIsolation_SequentialTransmittals_IsolatesEachBenefitYearIndependently()
    {
        // Arrange
        var d2024 = new DateTime(2024, 6, 1, 8, 0, 0, DateTimeKind.Utc);
        var d2025 = new DateTime(2025, 6, 1, 8, 0, 0, DateTimeKind.Utc);
        var d2026 = new DateTime(2026, 6, 1, 8, 0, 0, DateTimeKind.Utc);

        var (settings, patient, enc2024, vit2024) = CreateHarness("2024", d2024);
        var enc2025 = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = patient.TenantId,
            ClinicId = patient.ClinicId,
            PatientId = patient.Id,
            PatientName = $"{patient.FirstName} {patient.LastName}",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Jose Rizal",
            EncounterDate = d2025,
            PhilHealthSoapTransNo = "S000921202500001",
            IsSigned = true
        };
        var enc2026 = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = patient.TenantId,
            ClinicId = patient.ClinicId,
            PatientId = patient.Id,
            PatientName = $"{patient.FirstName} {patient.LastName}",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Jose Rizal",
            EncounterDate = d2026,
            PhilHealthSoapTransNo = "S000921202600001",
            IsSigned = true
        };

        patient.CustomFields["yakap_enlistments"] = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2024-01-15",
                ["valid_until"] = "2024-12-31",
                ["effective_year"] = 2024,
                ["status"] = "Expired",
                ["case_no"] = "C2024_A",
                ["enlistment_no"] = "E2024_A",
                ["profiling_trans_no"] = "P2024_A"
            },
            new()
            {
                ["enlisted_at"] = "2025-02-10",
                ["valid_until"] = "2025-12-31",
                ["effective_year"] = 2025,
                ["status"] = "Expired",
                ["case_no"] = "C2025_B",
                ["enlistment_no"] = "E2025_B",
                ["profiling_trans_no"] = "P2025_B"
            },
            new()
            {
                ["enlisted_at"] = "2026-03-05",
                ["valid_until"] = "2026-12-31",
                ["effective_year"] = 2026,
                ["status"] = "Active",
                ["case_no"] = "C2026_C",
                ["enlistment_no"] = "E2026_C",
                ["profiling_trans_no"] = "P2026_C"
            }
        };

        var patientsMap = new Dictionary<Guid, ClinicPatient> { [patient.Id] = patient };

        // Act 1: 2024
        var doc2024 = _mapper.MapToYakapReportDocument("1", "2024", settings, [enc2024], patientsMap,
            new Dictionary<Guid, TriageVitals> { [enc2024.Id] = vit2024 }, "R2024");
        // Act 2: 2025
        var doc2025 = _mapper.MapToYakapReportDocument("1", "2025", settings, [enc2025], patientsMap,
            new Dictionary<Guid, TriageVitals> { [enc2025.Id] = vit2024 }, "R2025");
        // Act 3: 2026
        var doc2026 = _mapper.MapToYakapReportDocument("1", "2026", settings, [enc2026], patientsMap,
            new Dictionary<Guid, TriageVitals> { [enc2026.Id] = vit2024 }, "R2026");

        // Assert 1: 2024
        doc2024.Enlistments[0].HciCaseNo.Should().Be("C2024_A");
        doc2024.Enlistments[0].EnlistDate.Should().Be("2024-01-15");
        doc2024.Enlistments[0].EffYear.Should().Be("2024");

        // Assert 2: 2025
        doc2025.Enlistments[0].HciCaseNo.Should().Be("C2025_B");
        doc2025.Enlistments[0].EnlistDate.Should().Be("2025-02-10");
        doc2025.Enlistments[0].EffYear.Should().Be("2025");

        // Assert 3: 2026
        doc2026.Enlistments[0].HciCaseNo.Should().Be("C2026_C");
        doc2026.Enlistments[0].EnlistDate.Should().Be("2026-03-05");
        doc2026.Enlistments[0].EffYear.Should().Be("2026");
    }

    // =========================================================================
    // 2. Date Formats & Edge Dates Stress Tests
    // =========================================================================

    [Theory]
    [InlineData("2026-01-15T08:30:00Z", "2026-01-15")]
    [InlineData("2026-01-15T08:30:00+08:00", "2026-01-15")]
    [InlineData("2026-01-15T00:00:00", "2026-01-15")]
    [InlineData("2026-1-5", "2026-01-05")]
    [InlineData("2026-01-05", "2026-01-05")]
    [InlineData("2024-02-29", "2024-02-29")] // Leap day
    [InlineData("2025-12-31", "2025-12-31")] // End of year
    [InlineData("2026-01-01", "2026-01-01")] // Start of year
    public void DateFormats_StressTesting_NormalizesCorrectlyToIsoDate(string rawEnlistedAt, string expectedEnlistDate)
    {
        // Arrange
        var encDate = new DateTime(2026, 6, 15, 10, 0, 0, DateTimeKind.Utc);
        var (settings, patient, encounter, vitals) = CreateHarness("2026", encDate);

        patient.CustomFields["yakap_enlistments"] = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = rawEnlistedAt,
                ["valid_until"] = "2026-12-31",
                ["effective_year"] = 2026,
                ["status"] = "Active",
                ["case_no"] = "C000921202699999",
                ["enlistment_no"] = "E000921202699999",
                ["profiling_trans_no"] = "P000921202699999"
            }
        };

        // Act
        var doc = _mapper.MapToYakapReportDocument(
            reportTagging: "1",
            effectiveYear: "2026",
            settings: settings,
            encounters: [encounter],
            patients: new Dictionary<Guid, ClinicPatient> { [patient.Id] = patient },
            vitalsMap: new Dictionary<Guid, TriageVitals> { [encounter.Id] = vitals },
            transmittalNumber: "R0009212026061500001");

        // Assert
        doc.Enlistments.Should().ContainSingle();
        doc.Enlistments[0].EnlistDate.Should().Be(expectedEnlistDate);

        var xml = BuildEnlistmentXmlTag(doc.Enlistments[0]);
        xml.Should().Contain($"pEnlistDate=\"{expectedEnlistDate}\"");
    }

    [Fact]
    public void DateFormats_LeapDay2024_In2024Enlistment_MaintainsLeapDayStatutoryDate()
    {
        // Arrange: 2024 is a leap year; patient registered on Feb 29, 2024
        var encDate = new DateTime(2024, 7, 10, 14, 0, 0, DateTimeKind.Utc);
        var (settings, patient, encounter, vitals) = CreateHarness("2024", encDate);

        patient.CustomFields["yakap_enlistments"] = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2024-02-29",
                ["valid_until"] = "2024-12-31",
                ["effective_year"] = 2024,
                ["status"] = "Active",
                ["case_no"] = "C000921202400229",
                ["enlistment_no"] = "E000921202400229",
                ["profiling_trans_no"] = "P000921202400229"
            }
        };

        // Act
        var doc = _mapper.MapToYakapReportDocument(
            reportTagging: "1",
            effectiveYear: "2024",
            settings: settings,
            encounters: [encounter],
            patients: new Dictionary<Guid, ClinicPatient> { [patient.Id] = patient },
            vitalsMap: new Dictionary<Guid, TriageVitals> { [encounter.Id] = vitals },
            transmittalNumber: "R0009212024071000001");

        // Assert
        doc.Enlistments[0].EnlistDate.Should().Be("2024-02-29");
        var xml = BuildEnlistmentXmlTag(doc.Enlistments[0]);
        xml.Should().Contain("pEnlistDate=\"2024-02-29\"");
    }

    // =========================================================================
    // 3. Exact Statutory Date vs Encounter Date Non-Mirroring
    // =========================================================================

    [Fact]
    public void StatutoryDate_DoesNotMirrorEncounterDate_WhenStatutoryDateDiffers()
    {
        // Arrange: Statutory enlistment date is Jan 5, 2026; encounter is Oct 25, 2026
        var encounterDate = new DateTime(2026, 10, 25, 14, 30, 0, DateTimeKind.Utc);
        var statutoryDate = "2026-01-05";
        var (settings, patient, encounter, vitals) = CreateHarness("2026", encounterDate);

        patient.CustomFields["yakap_enlistments"] = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = statutoryDate,
                ["valid_until"] = "2026-12-31",
                ["effective_year"] = 2026,
                ["status"] = "Active",
                ["case_no"] = "C000921202600123",
                ["enlistment_no"] = "E000921202600123",
                ["profiling_trans_no"] = "P000921202600123"
            }
        };

        // Act
        var doc = _mapper.MapToYakapReportDocument(
            reportTagging: "1",
            effectiveYear: "2026",
            settings: settings,
            encounters: [encounter],
            patients: new Dictionary<Guid, ClinicPatient> { [patient.Id] = patient },
            vitalsMap: new Dictionary<Guid, TriageVitals> { [encounter.Id] = vitals },
            transmittalNumber: "R0009212026102500001");

        // Assert
        var enlistment = doc.Enlistments[0];
        enlistment.EnlistDate.Should().Be(statutoryDate);
        enlistment.EnlistDate.Should().NotBe(encounterDate.ToString("yyyy-MM-dd"));

        var xml = BuildEnlistmentXmlTag(enlistment);
        xml.Should().Contain($"pEnlistDate=\"{statutoryDate}\"");
        xml.Should().NotContain($"pEnlistDate=\"{encounterDate:yyyy-MM-dd}\"");
    }

    // =========================================================================
    // 4. Fallback Behavior Tests
    // =========================================================================

    [Fact]
    public void Fallback_NoEnlistmentsInCustomFields_FallsBackToCleanPatientCodeAndEncounterDate()
    {
        // Arrange: Patient has completely empty CustomFields
        var encounterDate = new DateTime(2026, 8, 12, 9, 15, 0, DateTimeKind.Utc);
        var (settings, patient, encounter, vitals) = CreateHarness("2026", encounterDate, "PAT-88-99-001");
        patient.CustomFields.Clear();

        // Act
        var doc = _mapper.MapToYakapReportDocument(
            reportTagging: "1",
            effectiveYear: "2026",
            settings: settings,
            encounters: [encounter],
            patients: new Dictionary<Guid, ClinicPatient> { [patient.Id] = patient },
            vitalsMap: new Dictionary<Guid, TriageVitals> { [encounter.Id] = vitals },
            transmittalNumber: "R0009212026081200001");

        // Assert
        doc.Enlistments.Should().ContainSingle();
        var enlistment = doc.Enlistments[0];

        // Clean code stripped of dashes: PAT8899001
        enlistment.HciCaseNo.Should().Be("CPAT8899001");
        enlistment.HciTransNo.Should().Be("EPAT8899001");
        enlistment.EnlistDate.Should().Be("2026-08-12", "EnlistDate falls back to encounter date when no statutory enlistment exists");

        doc.Profiles.Should().ContainSingle();
        doc.Profiles[0].HciCaseNo.Should().Be("CPAT8899001");
        doc.Profiles[0].HciTransNo.Should().Be("PPAT8899001");

        var xml = BuildEnlistmentXmlTag(enlistment);
        xml.Should().Contain("pHciCaseNo=\"CPAT8899001\"");
        xml.Should().Contain("pHciTransNo=\"EPAT8899001\"");
        xml.Should().Contain("pEnlistDate=\"2026-08-12\"");
    }

    [Fact]
    public void Fallback_NullCustomFields_DoesNotThrowNullReferenceException()
    {
        // Arrange: Patient with null CustomFields dictionary
        var encounterDate = new DateTime(2026, 9, 1, 10, 0, 0, DateTimeKind.Utc);
        var (settings, patient, encounter, vitals) = CreateHarness("2026", encounterDate, "PAT-2026-XYZ");
        patient.CustomFields = null!;

        // Act
        var act = () => _mapper.MapToYakapReportDocument(
            reportTagging: "1",
            effectiveYear: "2026",
            settings: settings,
            encounters: [encounter],
            patients: new Dictionary<Guid, ClinicPatient> { [patient.Id] = patient },
            vitalsMap: new Dictionary<Guid, TriageVitals> { [encounter.Id] = vitals },
            transmittalNumber: "R0009212026090100001");

        // Assert: Never crash
        act.Should().NotThrow();
        var doc = act();
        doc.Enlistments[0].HciCaseNo.Should().Be("CPAT2026XYZ");
        doc.Enlistments[0].HciTransNo.Should().Be("EPAT2026XYZ");
        doc.Enlistments[0].EnlistDate.Should().Be("2026-09-01");
    }

    [Fact]
    public void Fallback_WhitespaceEnlistedAt_FallsBackToEncounterDate()
    {
        // Arrange: Enlistment entry exists but enlisted_at is empty/whitespace
        var encounterDate = new DateTime(2026, 5, 20, 11, 0, 0, DateTimeKind.Utc);
        var (settings, patient, encounter, vitals) = CreateHarness("2026", encounterDate);

        patient.CustomFields["yakap_enlistments"] = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "   ", // whitespace
                ["valid_until"] = "2026-12-31",
                ["effective_year"] = 2026,
                ["status"] = "Active",
                ["case_no"] = "C000921202600555",
                ["enlistment_no"] = "E000921202600555",
                ["profiling_trans_no"] = "P000921202600555"
            }
        };

        // Act
        var doc = _mapper.MapToYakapReportDocument(
            reportTagging: "1",
            effectiveYear: "2026",
            settings: settings,
            encounters: [encounter],
            patients: new Dictionary<Guid, ClinicPatient> { [patient.Id] = patient },
            vitalsMap: new Dictionary<Guid, TriageVitals> { [encounter.Id] = vitals },
            transmittalNumber: "R0009212026052000001");

        // Assert: Falls back to encounter date without crashing
        doc.Enlistments[0].EnlistDate.Should().Be("2026-05-20");
        doc.Enlistments[0].HciCaseNo.Should().Be("C000921202600555");
    }

    [Fact]
    public void MultiYearIsolation_OutOfOrderArray_Resolves2025Correctly()
    {
        // Arrange: Array has 2026 first, then 2024, then 2025
        var encDate = new DateTime(2025, 8, 14, 10, 0, 0, DateTimeKind.Utc);
        var (settings, patient, encounter, vitals) = CreateHarness("2025", encDate);

        patient.CustomFields["yakap_enlistments"] = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2026-01-02",
                ["valid_until"] = "2026-12-31",
                ["effective_year"] = 2026,
                ["status"] = "Active",
                ["case_no"] = "C2026_OUT",
                ["enlistment_no"] = "E2026_OUT",
                ["profiling_trans_no"] = "P2026_OUT"
            },
            new()
            {
                ["enlisted_at"] = "2024-03-01",
                ["valid_until"] = "2024-12-31",
                ["effective_year"] = 2024,
                ["status"] = "Expired",
                ["case_no"] = "C2024_OUT",
                ["enlistment_no"] = "E2024_OUT",
                ["profiling_trans_no"] = "P2024_OUT"
            },
            new()
            {
                ["enlisted_at"] = "2025-04-10",
                ["valid_until"] = "2025-12-31",
                ["effective_year"] = 2025,
                ["status"] = "Expired",
                ["case_no"] = "C2025_OUT",
                ["enlistment_no"] = "E2025_OUT",
                ["profiling_trans_no"] = "P2025_OUT"
            }
        };

        // Act
        var doc = _mapper.MapToYakapReportDocument(
            reportTagging: "1",
            effectiveYear: "2025",
            settings: settings,
            encounters: [encounter],
            patients: new Dictionary<Guid, ClinicPatient> { [patient.Id] = patient },
            vitalsMap: new Dictionary<Guid, TriageVitals> { [encounter.Id] = vitals },
            transmittalNumber: "R0009212025081400001");

        // Assert
        doc.Enlistments.Should().ContainSingle();
        doc.Enlistments[0].HciCaseNo.Should().Be("C2025_OUT");
        doc.Enlistments[0].HciTransNo.Should().Be("E2025_OUT");
        doc.Enlistments[0].EnlistDate.Should().Be("2025-04-10");
        doc.Enlistments[0].EffYear.Should().Be("2025");
    }

    [Fact]
    public void MultiPatientBatch_IsolatesEnlistmentControlNumbersPerPatient()
    {
        // Arrange: Patient 1 has 2025 custom enlistment; Patient 2 has no enlistment
        var encDate = new DateTime(2025, 5, 10, 9, 0, 0, DateTimeKind.Utc);
        var (settings, patient1, enc1, vit1) = CreateHarness("2025", encDate, "PAT-001");
        var (_, patient2, enc2, vit2) = CreateHarness("2025", encDate, "PAT-002");
        patient2.PhilHealthNumber = "12-345678901-2";
        patient2.CustomFields.Clear();

        patient1.CustomFields["yakap_enlistments"] = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2025-01-20",
                ["valid_until"] = "2025-12-31",
                ["effective_year"] = 2025,
                ["status"] = "Active",
                ["case_no"] = "C_PAT1_2025",
                ["enlistment_no"] = "E_PAT1_2025",
                ["profiling_trans_no"] = "P_PAT1_2025"
            }
        };

        var patientsMap = new Dictionary<Guid, ClinicPatient>
        {
            [patient1.Id] = patient1,
            [patient2.Id] = patient2
        };
        var vitalsMap = new Dictionary<Guid, TriageVitals>
        {
            [enc1.Id] = vit1,
            [enc2.Id] = vit2
        };

        // Act
        var doc = _mapper.MapToYakapReportDocument(
            reportTagging: "1",
            effectiveYear: "2025",
            settings: settings,
            encounters: [enc1, enc2],
            patients: patientsMap,
            vitalsMap: vitalsMap,
            transmittalNumber: "R0009212025051000001");

        // Assert
        doc.Enlistments.Should().HaveCount(2);

        var enl1 = doc.Enlistments.First(e => e.PatientPin == patient1.PhilHealthNumber!.Replace("-", ""));
        enl1.HciCaseNo.Should().Be("C_PAT1_2025");
        enl1.HciTransNo.Should().Be("E_PAT1_2025");
        enl1.EnlistDate.Should().Be("2025-01-20");

        var enl2 = doc.Enlistments.First(e => e.PatientPin == patient2.PhilHealthNumber!.Replace("-", ""));
        enl2.HciCaseNo.Should().Be("CPAT002");
        enl2.HciTransNo.Should().Be("EPAT002");
        enl2.EnlistDate.Should().Be("2025-05-10");
    }

    [Fact]
    public void MultiEncounterPatient_EmitsSingleEnlistmentWithMatchingControlNumbers()
    {
        // Arrange: Patient with 2 encounters in 2025
        var d1 = new DateTime(2025, 3, 1, 9, 0, 0, DateTimeKind.Utc);
        var d2 = new DateTime(2025, 9, 1, 14, 0, 0, DateTimeKind.Utc);
        var (settings, patient, enc1, vit1) = CreateHarness("2025", d1);

        var enc2 = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = patient.TenantId,
            ClinicId = patient.ClinicId,
            PatientId = patient.Id,
            PatientName = $"{patient.FirstName} {patient.LastName}",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Jose Rizal",
            EncounterDate = d2,
            PhilHealthSoapTransNo = "S000921202500002",
            IsSigned = true
        };

        patient.CustomFields["yakap_enlistments"] = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2025-01-10",
                ["valid_until"] = "2025-12-31",
                ["effective_year"] = 2025,
                ["status"] = "Active",
                ["case_no"] = "C000921202500777",
                ["enlistment_no"] = "E000921202500777",
                ["profiling_trans_no"] = "P000921202500777"
            }
        };

        // Act
        var doc = _mapper.MapToYakapReportDocument(
            reportTagging: "2", // Tranche 2 maps consultations
            effectiveYear: "2025",
            settings: settings,
            encounters: [enc1, enc2],
            patients: new Dictionary<Guid, ClinicPatient> { [patient.Id] = patient },
            vitalsMap: new Dictionary<Guid, TriageVitals> { [enc1.Id] = vit1 },
            transmittalNumber: "R0009212025090100001");

        // Assert: 1 enlistment emitted, 2 soaps emitted
        doc.Enlistments.Should().ContainSingle();
        doc.Enlistments[0].HciCaseNo.Should().Be("C000921202500777");
        doc.Enlistments[0].EnlistDate.Should().Be("2025-01-10");

        doc.Soaps.Should().HaveCount(2);
        doc.Soaps.All(s => s.HciCaseNo == "C000921202500777").Should().BeTrue();
    }

    [Theory]
    [InlineData("2026-01-15 08:30:00", "2026-01-15")]
    [InlineData("2026-01-15T23:59:59.999Z", "2026-01-15")]
    [InlineData("2026-01-15 23:59:59.999Z", "2026-01-15")]
    [InlineData("2026-01-15 01:00:00", "2026-01-15")]
    [InlineData("2026-01-15T01:00:00+08:00", "2026-01-15")]
    [InlineData("2026-01-15T23:00:00-05:00", "2026-01-15")]
    [InlineData("  2026-01-15T23:59:59.999Z  ", "2026-01-15")]
    [InlineData("2026-01-15t12:00:00", "2026-01-15")]
    public void DateFormat_SpaceAndHighPrecisionTimestamp_NormalizesToIsoDate(string inputDate, string expectedDate)
    {
        // Arrange
        var encDate = new DateTime(2026, 6, 20, 10, 0, 0, DateTimeKind.Utc);
        var (settings, patient, encounter, vitals) = CreateHarness("2026", encDate);

        patient.CustomFields["yakap_enlistments"] = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = inputDate,
                ["valid_until"] = "2026-12-31",
                ["effective_year"] = 2026,
                ["status"] = "Active",
                ["case_no"] = "C2026_TIME",
                ["enlistment_no"] = "E2026_TIME",
                ["profiling_trans_no"] = "P2026_TIME"
            }
        };

        // Act
        var doc = _mapper.MapToYakapReportDocument(
            reportTagging: "1",
            effectiveYear: "2026",
            settings: settings,
            encounters: [encounter],
            patients: new Dictionary<Guid, ClinicPatient> { [patient.Id] = patient },
            vitalsMap: new Dictionary<Guid, TriageVitals> { [encounter.Id] = vitals },
            transmittalNumber: "R0009212026062000001");

        // Assert
        doc.Enlistments[0].EnlistDate.Should().Be(expectedDate);
    }

    [Fact]
    public void Fallback_NullPatientCode_DoesNotThrowAndGeneratesPrefixOnly()
    {
        // Arrange: Patient with null PatientCode and no enlistments
        var encDate = new DateTime(2026, 7, 1, 10, 0, 0, DateTimeKind.Utc);
        var (settings, patient, encounter, vitals) = CreateHarness("2026", encDate);
        patient.PatientCode = null!;
        patient.CustomFields.Clear();

        // Act
        var doc = _mapper.MapToYakapReportDocument(
            reportTagging: "1",
            effectiveYear: "2026",
            settings: settings,
            encounters: [encounter],
            patients: new Dictionary<Guid, ClinicPatient> { [patient.Id] = patient },
            vitalsMap: new Dictionary<Guid, TriageVitals> { [encounter.Id] = vitals },
            transmittalNumber: "R0009212026070100001");

        // Assert
        doc.Enlistments[0].HciCaseNo.Should().Be("C");
        doc.Enlistments[0].HciTransNo.Should().Be("E");
        doc.Profiles[0].HciCaseNo.Should().Be("C");
        doc.Profiles[0].HciTransNo.Should().Be("P");
        doc.Enlistments[0].EnlistDate.Should().Be("2026-07-01");
    }

    [Fact]
    public void JsonStringFormat_InCustomFields_ParsesCorrectlyAndMapsEnlistment()
    {
        // Arrange: CustomFields["yakap_enlistments"] stored as a raw JSON string
        var encDate = new DateTime(2026, 4, 18, 9, 0, 0, DateTimeKind.Utc);
        var (settings, patient, encounter, vitals) = CreateHarness("2026", encDate);

        var rawJson = @"[
            {
                ""enlisted_at"": ""2026-02-14"",
                ""valid_until"": ""2026-12-31"",
                ""effective_year"": 2026,
                ""status"": ""Active"",
                ""case_no"": ""C000921202600999"",
                ""enlistment_no"": ""E000921202600999"",
                ""profiling_trans_no"": ""P000921202600999""
            }
        ]";
        patient.CustomFields["yakap_enlistments"] = rawJson;

        // Act
        var doc = _mapper.MapToYakapReportDocument(
            reportTagging: "1",
            effectiveYear: "2026",
            settings: settings,
            encounters: [encounter],
            patients: new Dictionary<Guid, ClinicPatient> { [patient.Id] = patient },
            vitalsMap: new Dictionary<Guid, TriageVitals> { [encounter.Id] = vitals },
            transmittalNumber: "R0009212026041800001");

        // Assert
        doc.Enlistments[0].EnlistDate.Should().Be("2026-02-14");
        doc.Enlistments[0].HciCaseNo.Should().Be("C000921202600999");
        doc.Enlistments[0].HciTransNo.Should().Be("E000921202600999");
    }
}
