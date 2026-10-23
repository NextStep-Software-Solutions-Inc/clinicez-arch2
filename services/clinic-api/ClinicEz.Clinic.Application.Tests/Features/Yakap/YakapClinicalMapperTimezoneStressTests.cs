using System;
using System.Collections.Generic;
using System.Linq;
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
/// Empirical adversarial stress test harness specifically challenging timezone offset variations (UTC-12 to UTC+14),
/// day/month/year boundary timestamps, leap days, and delimiter permutations against YakapClinicalMapper and PhilHealthDateParser.
/// </summary>
public sealed class YakapClinicalMapperTimezoneStressTests
{
    private readonly YakapClinicalMapper _mapper = new(PhilHealthCatalogLookup.FromBundledSeed());

    private static (ClinicSettings Settings, ClinicPatient Patient, ConsultationEncounter Encounter, TriageVitals Vitals)
        CreateHarness(string effectiveYear, DateTime encounterDate, string patientCode = "PAT-STRESS-001")
    {
        var clinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var encounterId = Guid.NewGuid();

        var settings = new ClinicSettings
        {
            TenantId = "tenant_stress_tz",
            ClinicId = clinicId,
            ClinicName = "ClinicEZ Timezone Stress Center",
            AccreditationNumber = "000921"
        };

        var patient = new ClinicPatient
        {
            Id = patientId,
            TenantId = "tenant_stress_tz",
            ClinicId = clinicId,
            PatientCode = patientCode,
            FirstName = "Juan",
            LastName = "Dela Cruz",
            DateOfBirth = new DateOnly(1985, 4, 15),
            Gender = "Male",
            ContactNumber = "09171234567",
            PhilHealthNumber = "03-026307850-7",
            BloodType = "O+"
        };

        var encounter = new ConsultationEncounter
        {
            Id = encounterId,
            TenantId = "tenant_stress_tz",
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Juan Dela Cruz",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Jose Rizal",
            EncounterDate = encounterDate,
            Subjective = "Stress testing encounter",
            Objective = "Vitals stable",
            Assessment = "Normal",
            Plan = "Testing",
            PhilHealthSoapTransNo = $"S000921{effectiveYear}00001",
            IsSigned = true
        };

        var vitals = new TriageVitals
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_stress_tz",
            ClinicId = clinicId,
            PatientId = patientId,
            SystolicBp = 120,
            DiastolicBp = 80,
            HeartRateBpm = 72,
            RespiratoryRateBreathsPerMin = 18,
            TemperatureCelsius = 36.5m,
            HeightCm = 170m,
            WeightKg = 70m,
            Bmi = 24.22m
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
    // 1. Comprehensive Matrix of Timezone Offsets from UTC-12:00 to UTC+14:00
    // =========================================================================

    [Theory]
    // UTC-12 to UTC-01
    [InlineData("2026-06-15T00:00:00-12:00", "2026-06-15")] // Baker Island midnight
    [InlineData("2026-06-15T12:00:00-12:00", "2026-06-15")]
    [InlineData("2026-06-15T23:59:59.999-12:00", "2026-06-15")] // Baker Island near rollover
    [InlineData("2026-06-15T23:59:59.999-11:00", "2026-06-15")] // Niue / Samoa
    [InlineData("2026-06-15T23:59:59.999-10:00", "2026-06-15")] // Hawaii HST
    [InlineData("2026-06-15T23:59:59.999-09:30", "2026-06-15")] // Marquesas Islands
    [InlineData("2026-06-15T23:59:59.999-09:00", "2026-06-15")] // Alaska AKDT
    [InlineData("2026-06-15T23:59:59.999-08:00", "2026-06-15")] // Pacific PDT
    [InlineData("2026-06-15T23:59:59.999-07:00", "2026-06-15")] // Mountain MDT
    [InlineData("2026-06-15T23:59:59.999-06:00", "2026-06-15")] // Central CDT
    [InlineData("2026-06-15T23:59:59.999-05:00", "2026-06-15")] // Eastern EDT
    [InlineData("2026-06-15T23:59:59.999-04:00", "2026-06-15")] // Atlantic AST
    [InlineData("2026-06-15T23:59:59.999-03:30", "2026-06-15")] // Newfoundland NDT
    [InlineData("2026-06-15T23:59:59.999-03:00", "2026-06-15")] // Buenos Aires / Brazil
    [InlineData("2026-06-15T23:59:59.999-02:00", "2026-06-15")] // South Georgia
    [InlineData("2026-06-15T23:59:59.999-01:00", "2026-06-15")] // Cape Verde
    // UTC+00 to UTC+14
    [InlineData("2026-06-15T00:00:00.000Z", "2026-06-15")] // UTC midnight
    [InlineData("2026-06-15T12:00:00.000Z", "2026-06-15")] // UTC noon
    [InlineData("2026-06-15T23:59:59.999Z", "2026-06-15")] // UTC end of day
    [InlineData("2026-06-15T00:00:00.000+00:00", "2026-06-15")]
    [InlineData("2026-06-15T23:59:59.999+00:00", "2026-06-15")]
    [InlineData("2026-06-15T23:59:59.999+01:00", "2026-06-15")] // London BST / CET
    [InlineData("2026-06-15T23:59:59.999+02:00", "2026-06-15")] // Cairo / EET
    [InlineData("2026-06-15T23:59:59.999+03:00", "2026-06-15")] // Riyadh / Moscow
    [InlineData("2026-06-15T23:59:59.999+03:30", "2026-06-15")] // Tehran IRST
    [InlineData("2026-06-15T23:59:59.999+04:00", "2026-06-15")] // Dubai GST
    [InlineData("2026-06-15T23:59:59.999+04:30", "2026-06-15")] // Kabul AFT
    [InlineData("2026-06-15T23:59:59.999+05:00", "2026-06-15")] // Karachi PKT
    [InlineData("2026-06-15T23:59:59.999+05:30", "2026-06-15")] // India IST
    [InlineData("2026-06-15T23:59:59.999+05:45", "2026-06-15")] // Nepal NPT
    [InlineData("2026-06-15T23:59:59.999+06:00", "2026-06-15")] // Dhaka BST
    [InlineData("2026-06-15T23:59:59.999+06:30", "2026-06-15")] // Myanmar MMT
    [InlineData("2026-06-15T23:59:59.999+07:00", "2026-06-15")] // Bangkok / Jakarta
    [InlineData("2026-06-15T00:00:00.000+08:00", "2026-06-15")] // Philippine PST midnight
    [InlineData("2026-06-15T12:00:00.000+08:00", "2026-06-15")] // Philippine PST noon
    [InlineData("2026-06-15T23:59:59.999+08:00", "2026-06-15")] // Philippine PST late night
    [InlineData("2026-06-15T23:59:59.999+08:45", "2026-06-15")] // Eucla ACWST
    [InlineData("2026-06-15T23:59:59.999+09:00", "2026-06-15")] // Tokyo JST
    [InlineData("2026-06-15T23:59:59.999+09:30", "2026-06-15")] // Adelaide ACST
    [InlineData("2026-06-15T23:59:59.999+10:00", "2026-06-15")] // Sydney AEST
    [InlineData("2026-06-15T23:59:59.999+10:30", "2026-06-15")] // Lord Howe Island
    [InlineData("2026-06-15T23:59:59.999+11:00", "2026-06-15")] // Solomon Islands
    [InlineData("2026-06-15T23:59:59.999+12:00", "2026-06-15")] // Auckland NZST
    [InlineData("2026-06-15T23:59:59.999+12:45", "2026-06-15")] // Chatham Islands CHAST
    [InlineData("2026-06-15T23:59:59.999+13:00", "2026-06-15")] // Tonga TOT / Samoa Summer
    [InlineData("2026-06-15T00:00:00.000+14:00", "2026-06-15")] // Line Islands / Kiritimati midnight
    [InlineData("2026-06-15T12:00:00.000+14:00", "2026-06-15")] // Line Islands noon
    [InlineData("2026-06-15T23:59:59.999+14:00", "2026-06-15")] // Line Islands end of day
    // Space delimited timestamps across extreme offsets
    [InlineData("2026-06-15 00:00:00-12:00", "2026-06-15")]
    [InlineData("2026-06-15 23:59:59.999-12:00", "2026-06-15")]
    [InlineData("2026-06-15 00:00:00+14:00", "2026-06-15")]
    [InlineData("2026-06-15 23:59:59.999+14:00", "2026-06-15")]
    [InlineData("2026-06-15 16:30:45.123+08:00", "2026-06-15")]
    public void YakapClinicalMapper_TimezoneOffsets_NormalizesStatutoryDateWithoutRollover(string rawDate, string expectedDate)
    {
        // Arrange
        var encDate = new DateTime(2026, 8, 20, 10, 0, 0, DateTimeKind.Utc);
        var (settings, patient, encounter, vitals) = CreateHarness("2026", encDate);

        patient.CustomFields["yakap_enlistments"] = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = rawDate,
                ["valid_until"] = "2026-12-31",
                ["effective_year"] = 2026,
                ["status"] = "Active",
                ["case_no"] = "C000921202688888",
                ["enlistment_no"] = "E000921202688888",
                ["profiling_trans_no"] = "P000921202688888"
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
            transmittalNumber: "R0009212026082000001");

        // Assert
        doc.Enlistments.Should().ContainSingle();
        doc.Enlistments[0].EnlistDate.Should().Be(expectedDate,
            $"Raw input '{rawDate}' should preserve calendar date without local server clock skew");

        var xml = BuildEnlistmentXmlTag(doc.Enlistments[0]);
        xml.Should().Contain($"pEnlistDate=\"{expectedDate}\"");
    }

    // =========================================================================
    // 2. Calendar Boundary Dates (Leap Day, Year Start, Year End) Across Extreme Offsets
    // =========================================================================

    [Theory]
    // Leap day 2024-02-29
    [InlineData("2024-02-29T23:59:59.999-12:00", "2024-02-29", "2024")]
    [InlineData("2024-02-29T00:00:00.000+14:00", "2024-02-29", "2024")]
    [InlineData("2024-02-29T23:59:59.999+14:00", "2024-02-29", "2024")]
    [InlineData("2024-02-29 23:59:59-12:00", "2024-02-29", "2024")]
    [InlineData("2024-02-29 00:00:00+14:00", "2024-02-29", "2024")]
    // Year End 2025-12-31
    [InlineData("2025-12-31T23:59:59.999-12:00", "2025-12-31", "2025")]
    [InlineData("2025-12-31T00:00:00.000+14:00", "2025-12-31", "2025")]
    [InlineData("2025-12-31T23:59:59.999+14:00", "2025-12-31", "2025")]
    [InlineData("2025-12-31 23:59:59.999Z", "2025-12-31", "2025")]
    // Year Start 2026-01-01
    [InlineData("2026-01-01T00:00:00.000-12:00", "2026-01-01", "2026")]
    [InlineData("2026-01-01T23:59:59.999-12:00", "2026-01-01", "2026")]
    [InlineData("2026-01-01T00:00:00.000+14:00", "2026-01-01", "2026")]
    [InlineData("2026-01-01T23:59:59.999+14:00", "2026-01-01", "2026")]
    [InlineData("2026-01-01 00:00:00.000Z", "2026-01-01", "2026")]
    public void BoundaryDates_AcrossExtremeTimezones_PreservesStatutoryDateAndYear(
        string rawDate, string expectedDate, string effectiveYear)
    {
        // Arrange
        var encDate = new DateTime(int.Parse(effectiveYear), 6, 1, 10, 0, 0, DateTimeKind.Utc);
        var (settings, patient, encounter, vitals) = CreateHarness(effectiveYear, encDate);

        patient.CustomFields["yakap_enlistments"] = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["enlisted_at"] = rawDate,
                ["valid_until"] = $"{effectiveYear}-12-31",
                ["effective_year"] = int.Parse(effectiveYear),
                ["status"] = "Active",
                ["case_no"] = $"C{effectiveYear}_BOUND",
                ["enlistment_no"] = $"E{effectiveYear}_BOUND",
                ["profiling_trans_no"] = $"P{effectiveYear}_BOUND"
            }
        };

        // Act
        var doc = _mapper.MapToYakapReportDocument(
            reportTagging: "1",
            effectiveYear: effectiveYear,
            settings: settings,
            encounters: [encounter],
            patients: new Dictionary<Guid, ClinicPatient> { [patient.Id] = patient },
            vitalsMap: new Dictionary<Guid, TriageVitals> { [encounter.Id] = vitals },
            transmittalNumber: $"R000921{effectiveYear}060100001");

        // Assert
        doc.Enlistments.Should().ContainSingle();
        doc.Enlistments[0].EnlistDate.Should().Be(expectedDate);
        doc.Enlistments[0].EffYear.Should().Be(effectiveYear);

        var xml = BuildEnlistmentXmlTag(doc.Enlistments[0]);
        xml.Should().Contain($"pEnlistDate=\"{expectedDate}\"");
        xml.Should().Contain($"pEffYear=\"{effectiveYear}\"");
    }

    // =========================================================================
    // 3. PhilHealthDateParser Direct Verification Across All UTC Offsets
    // =========================================================================

    [Theory]
    [InlineData("2026-06-15T00:00:00-12:00", "2026-06-15")]
    [InlineData("2026-06-15T23:59:59.999-12:00", "2026-06-15")]
    [InlineData("2026-06-15T23:59:59.999-11:00", "2026-06-15")]
    [InlineData("2026-06-15T23:59:59.999-10:00", "2026-06-15")]
    [InlineData("2026-06-15T23:59:59.999-09:30", "2026-06-15")]
    [InlineData("2026-06-15T23:59:59.999-08:00", "2026-06-15")]
    [InlineData("2026-06-15T23:59:59.999-05:00", "2026-06-15")]
    [InlineData("2026-06-15T23:59:59.999-03:30", "2026-06-15")]
    [InlineData("2026-06-15T23:59:59.999Z", "2026-06-15")]
    [InlineData("2026-06-15T23:59:59.999+00:00", "2026-06-15")]
    [InlineData("2026-06-15T23:59:59.999+05:30", "2026-06-15")]
    [InlineData("2026-06-15T23:59:59.999+05:45", "2026-06-15")]
    [InlineData("2026-06-15T00:00:00.000+08:00", "2026-06-15")]
    [InlineData("2026-06-15T23:59:59.999+08:00", "2026-06-15")]
    [InlineData("2026-06-15T23:59:59.999+12:45", "2026-06-15")]
    [InlineData("2026-06-15T00:00:00.000+14:00", "2026-06-15")]
    [InlineData("2026-06-15T23:59:59.999+14:00", "2026-06-15")]
    public void PhilHealthDateParser_TryNormalizeDate_AllOffsets_PreservesDate(string input, string expected)
    {
        var ok = PhilHealthDateParser.TryNormalizeDate(input, out var normalized);
        ok.Should().BeTrue();
        normalized.Should().Be(expected);

        var okDate = PhilHealthDateParser.TryParseDate(input, out var dateOnly);
        okDate.Should().BeTrue();
        dateOnly.ToString("yyyy-MM-dd").Should().Be(expected);
    }
}
