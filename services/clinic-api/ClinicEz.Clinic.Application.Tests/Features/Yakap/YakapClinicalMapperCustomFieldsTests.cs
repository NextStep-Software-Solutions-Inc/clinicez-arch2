using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Infrastructure.PhilHealth.Catalog;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Yakap;

public class YakapClinicalMapperCustomFieldsTests
{
    private readonly YakapClinicalMapper _mapper = new(PhilHealthCatalogLookup.FromBundledSeed());

    private static (ClinicSettings Settings, ClinicPatient Patient, ConsultationEncounter Encounter, TriageVitals Vitals)
        CreateTestHarness(string effectiveYear, DateTime encounterDate, string patientCode = "PAT-2026-0001")
    {
        var clinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var encounterId = Guid.NewGuid();

        var settings = new ClinicSettings
        {
            TenantId = "tenant_test",
            ClinicId = clinicId,
            ClinicName = "ClinicEZ Metro Health Facility",
            AccreditationNumber = "000921"
        };

        var patient = new ClinicPatient
        {
            Id = patientId,
            TenantId = "tenant_test",
            ClinicId = clinicId,
            PatientCode = patientCode,
            FirstName = "Juan",
            LastName = "Dela Cruz",
            DateOfBirth = new DateOnly(1988, 5, 12),
            Gender = "Male",
            ContactNumber = "09171234567",
            PhilHealthNumber = "03-026307850-7",
            BloodType = "O+"
        };

        var encounter = new ConsultationEncounter
        {
            Id = encounterId,
            TenantId = "tenant_test",
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Juan Dela Cruz",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Jose Rizal",
            EncounterDate = encounterDate,
            Subjective = "Routine annual health assessment",
            Objective = "Alert, oriented, stable vital signs",
            Assessment = "Healthy adult baseline",
            Plan = "Regular diet and exercise; annual follow-up",
            PhilHealthSoapTransNo = $"S000921{effectiveYear}00001",
            IsSigned = true
        };

        var vitals = new TriageVitals
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_test",
            ClinicId = clinicId,
            PatientId = patientId,
            SystolicBp = 120,
            DiastolicBp = 80,
            HeartRateBpm = 72,
            RespiratoryRateBreathsPerMin = 18,
            TemperatureCelsius = 36.6m,
            HeightCm = 172m,
            WeightKg = 70m,
            Bmi = 23.66m
        };

        return (settings, patient, encounter, vitals);
    }

    [Fact]
    public void MapToYakapReportDocument_PopulatesEnlistDate_FromMatchingEnlistmentEnlistedAt()
    {
        // Arrange
        var encounterDate = new DateTime(2026, 7, 22, 9, 30, 0, DateTimeKind.Utc);
        var (settings, patient, encounter, vitals) = CreateTestHarness("2026", encounterDate);

        patient.CustomFields["yakap_enlistments"] = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2026-01-10",
                ["valid_until"] = "2026-12-31",
                ["effective_year"] = 2026,
                ["status"] = "Active",
                ["source"] = "PhilHealthMasterlist",
                ["case_no"] = "C000921202600001",
                ["enlistment_no"] = "E000921202600001",
                ["profiling_trans_no"] = "P000921202600001"
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
            transmittalNumber: "R0009212026072200001");

        // Assert
        doc.Enlistments.Should().ContainSingle();
        var enlistment = doc.Enlistments[0];
        enlistment.EnlistDate.Should().Be("2026-01-10", "pEnlistDate must reflect the statutory enlistment date from CustomFields");
        enlistment.EnlistDate.Should().NotBe(encounterDate.ToString("yyyy-MM-dd"), "pEnlistDate must not default to encounter date when enlisted_at is present");
        enlistment.EffYear.Should().Be("2026");
    }

    [Fact]
    public void MapToYakapReportDocument_PopulatesControlNumbers_FromMatchingEntry()
    {
        // Arrange
        var encounterDate = new DateTime(2026, 4, 15, 10, 0, 0, DateTimeKind.Utc);
        var (settings, patient, encounter, vitals) = CreateTestHarness("2026", encounterDate);

        patient.CustomFields["yakap_enlistments"] = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2026-02-01",
                ["valid_until"] = "2026-12-31",
                ["effective_year"] = 2026,
                ["status"] = "Active",
                ["source"] = "ClinicEnlistment",
                ["case_no"] = "C000921202600888",
                ["enlistment_no"] = "E000921202600888",
                ["profiling_trans_no"] = "P000921202600888"
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
            transmittalNumber: "R0009212026041500001");

        // Assert
        doc.Enlistments.Should().ContainSingle();
        doc.Enlistments[0].HciCaseNo.Should().Be("C000921202600888");
        doc.Enlistments[0].HciTransNo.Should().Be("E000921202600888");

        doc.Profiles.Should().ContainSingle();
        doc.Profiles[0].HciCaseNo.Should().Be("C000921202600888");
        doc.Profiles[0].HciTransNo.Should().Be("P000921202600888");
    }

    [Fact]
    public void MapToYakapReportDocument_MultiYearEnlistments_SelectsCorrectBenefitYearData()
    {
        // Arrange
        var date2025 = new DateTime(2025, 6, 15, 8, 0, 0, DateTimeKind.Utc);
        var date2026 = new DateTime(2026, 6, 20, 9, 0, 0, DateTimeKind.Utc);

        var (settings, patient, encounter2025, vitals2025) = CreateTestHarness("2025", date2025);
        var encounter2026 = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = patient.TenantId,
            ClinicId = patient.ClinicId,
            PatientId = patient.Id,
            PatientName = $"{patient.FirstName} {patient.LastName}",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Jose Rizal",
            EncounterDate = date2026,
            Subjective = "2026 Annual Checkup",
            Objective = "Normotensive",
            Assessment = "Healthy",
            Plan = "Annual monitoring",
            PhilHealthSoapTransNo = "S000921202600001",
            IsSigned = true
        };
        var vitals2026 = new TriageVitals
        {
            Id = Guid.NewGuid(),
            TenantId = patient.TenantId,
            ClinicId = patient.ClinicId,
            PatientId = patient.Id,
            SystolicBp = 118,
            DiastolicBp = 78,
            HeartRateBpm = 70,
            RespiratoryRateBreathsPerMin = 16,
            TemperatureCelsius = 36.5m,
            HeightCm = 172m,
            WeightKg = 70m,
            Bmi = 23.66m
        };

        patient.CustomFields["yakap_enlistments"] = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = "2025-01-15",
                ["valid_until"] = "2025-12-31",
                ["effective_year"] = 2025,
                ["status"] = "Expired",
                ["source"] = "PhilHealthMasterlist",
                ["case_no"] = "C000921202500111",
                ["enlistment_no"] = "E000921202500111",
                ["profiling_trans_no"] = "P000921202500111"
            },
            new()
            {
                ["enlisted_at"] = "2026-02-20",
                ["valid_until"] = "2026-12-31",
                ["effective_year"] = 2026,
                ["status"] = "Active",
                ["source"] = "ClinicEnlistment",
                ["case_no"] = "C000921202600222",
                ["enlistment_no"] = "E000921202600222",
                ["profiling_trans_no"] = "P000921202600222"
            }
        };

        var patientsMap = new Dictionary<Guid, ClinicPatient> { [patient.Id] = patient };

        // Act 1: 2025 Transmittal
        var doc2025 = _mapper.MapToYakapReportDocument(
            reportTagging: "1",
            effectiveYear: "2025",
            settings: settings,
            encounters: [encounter2025],
            patients: patientsMap,
            vitalsMap: new Dictionary<Guid, TriageVitals> { [encounter2025.Id] = vitals2025 },
            transmittalNumber: "R0009212025061500001");

        // Act 2: 2026 Transmittal
        var doc2026 = _mapper.MapToYakapReportDocument(
            reportTagging: "1",
            effectiveYear: "2026",
            settings: settings,
            encounters: [encounter2026],
            patients: patientsMap,
            vitalsMap: new Dictionary<Guid, TriageVitals> { [encounter2026.Id] = vitals2026 },
            transmittalNumber: "R0009212026062000001");

        // Assert 1: 2025 Document reflects 2025 enlistment entry
        doc2025.Enlistments.Should().ContainSingle();
        doc2025.Enlistments[0].EffYear.Should().Be("2025");
        doc2025.Enlistments[0].EnlistDate.Should().Be("2025-01-15");
        doc2025.Enlistments[0].HciCaseNo.Should().Be("C000921202500111");
        doc2025.Enlistments[0].HciTransNo.Should().Be("E000921202500111");
        doc2025.Profiles[0].HciCaseNo.Should().Be("C000921202500111");
        doc2025.Profiles[0].HciTransNo.Should().Be("P000921202500111");

        // Assert 2: 2026 Document reflects 2026 enlistment entry
        doc2026.Enlistments.Should().ContainSingle();
        doc2026.Enlistments[0].EffYear.Should().Be("2026");
        doc2026.Enlistments[0].EnlistDate.Should().Be("2026-02-20");
        doc2026.Enlistments[0].HciCaseNo.Should().Be("C000921202600222");
        doc2026.Enlistments[0].HciTransNo.Should().Be("E000921202600222");
        doc2026.Profiles[0].HciCaseNo.Should().Be("C000921202600222");
        doc2026.Profiles[0].HciTransNo.Should().Be("P000921202600222");
    }

    [Fact]
    public void MapToYakapReportDocument_Fallback_WhenNoEnlistment_UsesEncounterDateAndCleanCode()
    {
        // Arrange
        var encounterDate = new DateTime(2026, 8, 10, 14, 0, 0, DateTimeKind.Utc);
        var (settings, patient, encounter, vitals) = CreateTestHarness("2026", encounterDate, "PAT-2026-9999");
        patient.CustomFields.Clear(); // No yakap_enlistments

        // Act
        var doc = _mapper.MapToYakapReportDocument(
            reportTagging: "1",
            effectiveYear: "2026",
            settings: settings,
            encounters: [encounter],
            patients: new Dictionary<Guid, ClinicPatient> { [patient.Id] = patient },
            vitalsMap: new Dictionary<Guid, TriageVitals> { [encounter.Id] = vitals },
            transmittalNumber: "R0009212026081000001");

        // Assert
        doc.Enlistments.Should().ContainSingle();
        doc.Enlistments[0].EnlistDate.Should().Be("2026-08-10");
        doc.Enlistments[0].HciCaseNo.Should().Be("CPAT20269999");
        doc.Enlistments[0].HciTransNo.Should().Be("EPAT20269999");
        doc.Profiles[0].HciCaseNo.Should().Be("CPAT20269999");
        doc.Profiles[0].HciTransNo.Should().Be("PPAT20269999");
    }

    [Fact]
    public void MapToYakapReportDocument_DeserializesJsonElementFormatFromEfCore()
    {
        // Arrange
        var encounterDate = new DateTime(2026, 9, 5, 11, 0, 0, DateTimeKind.Utc);
        var (settings, patient, encounter, vitals) = CreateTestHarness("2026", encounterDate);

        var json = @"[
            {
                ""enlisted_at"": ""2026-01-25"",
                ""valid_until"": ""2026-12-31"",
                ""effective_year"": 2026,
                ""status"": ""Active"",
                ""source"": ""PhilHealthMasterlist"",
                ""case_no"": ""C000921202600555"",
                ""enlistment_no"": ""E000921202600555"",
                ""profiling_trans_no"": ""P000921202600555""
            }
        ]";

        using var jsonDoc = JsonDocument.Parse(json);
        patient.CustomFields["yakap_enlistments"] = jsonDoc.RootElement.Clone();

        // Act
        var doc = _mapper.MapToYakapReportDocument(
            reportTagging: "1",
            effectiveYear: "2026",
            settings: settings,
            encounters: [encounter],
            patients: new Dictionary<Guid, ClinicPatient> { [patient.Id] = patient },
            vitalsMap: new Dictionary<Guid, TriageVitals> { [encounter.Id] = vitals },
            transmittalNumber: "R0009212026090500001");

        // Assert
        doc.Enlistments.Should().ContainSingle();
        doc.Enlistments[0].EnlistDate.Should().Be("2026-01-25");
        doc.Enlistments[0].HciCaseNo.Should().Be("C000921202600555");
        doc.Enlistments[0].HciTransNo.Should().Be("E000921202600555");
        doc.Profiles[0].HciCaseNo.Should().Be("C000921202600555");
        doc.Profiles[0].HciTransNo.Should().Be("P000921202600555");
    }
}
