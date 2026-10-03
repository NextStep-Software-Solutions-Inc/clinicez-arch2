using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class YakapClinicalMapperTests
{
    private readonly YakapClinicalMapper _mapper = new();

    [Theory]
    [InlineData("1990-05-15", "2026-10-03", "36 YR(S), 4 MO(S), 18 DAY(S)")]
    [InlineData("2025-10-03", "2026-10-03", "1 YR(S), 0 MO(S), 0 DAY(S)")]
    [InlineData("2026-09-03", "2026-10-03", "0 YR(S), 1 MO(S), 0 DAY(S)")]
    public void FormatPhilHealthAge_CalculatesCorrectComponents(string dobStr, string asOfStr, string expected)
    {
        var dob = DateOnly.Parse(dobStr);
        var asOf = DateTime.Parse(asOfStr);

        var result = _mapper.FormatPhilHealthAge(dob, asOf);

        result.Should().Be(expected);
    }

    [Theory]
    [InlineData("12-345678901-2", "123456789012")]
    [InlineData("123456789012", "123456789012")]
    [InlineData("12345", "000000012345")]
    [InlineData("", "000000000000")]
    [InlineData(null, "000000000000")]
    public void NormalizePin_FormatsValidTwelveDigits(string? input, string expected)
    {
        var result = _mapper.NormalizePin(input!);
        result.Should().Be(expected);
    }

    [Theory]
    [InlineData("AMOXICILLIN500", "AMOXICILLIN5000000000000000000")]
    [InlineData("METFORMIN500MG_TAB_EXTENDED_REL_12345", "METFORMIN500MGTABEXTENDEDREL12")]
    [InlineData("", "NOMED0000000000000000000000000")]
    [InlineData(null, "NOMED0000000000000000000000000")]
    public void FormatDrugCode_AlwaysProducesThirtyCharacters(string? input, string expected)
    {
        var result = _mapper.FormatDrugCode(input!);
        result.Length.Should().Be(30);
        result.Should().Be(expected);
    }

    [Fact]
    public void MapToYakapReportDocument_Tranche1_GeneratesCompliantPlaceholders()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var encounterId = Guid.NewGuid();

        var settings = new ClinicSettings
        {
            TenantId = "tenant_1",
            ClinicId = clinicId,
            ClinicName = "Manila Health Clinic",
            AccreditationNumber = "09214"
        };

        var patient = new ClinicPatient
        {
            Id = patientId,
            TenantId = "tenant_1",
            ClinicId = clinicId,
            PatientCode = "PAT-2026-0001",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            DateOfBirth = new DateOnly(1985, 6, 20),
            Gender = "Male",
            ContactNumber = "09171234567",
            PhilHealthNumber = "12-345678901-2",
            BloodType = "A+"
        };

        var encounter = new ConsultationEncounter
        {
            Id = encounterId,
            TenantId = "tenant_1",
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Juan Dela Cruz",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Jose Rizal",
            EncounterDate = new DateTime(2026, 10, 3, 8, 30, 0, DateTimeKind.Utc),
            Subjective = "Routine health baseline checkup",
            Objective = "Alert, oriented",
            Assessment = "Generally healthy",
            Plan = "Annual follow-up"
        };

        var vitals = new TriageVitals
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_1",
            ClinicId = clinicId,
            QueueItemId = Guid.NewGuid(),
            PatientId = patientId,
            SystolicBp = 120,
            DiastolicBp = 80,
            HeartRateBpm = 72,
            RespiratoryRateBreathsPerMin = 18,
            TemperatureCelsius = 36.6m,
            HeightCm = 170m,
            WeightKg = 68m,
            Bmi = 23.5m
        };

        var patients = new Dictionary<Guid, ClinicPatient> { [patientId] = patient };
        var vitalsMap = new Dictionary<Guid, TriageVitals> { [encounterId] = vitals };

        // Act
        var doc = _mapper.MapToYakapReportDocument(
            reportTagging: "1",
            effectiveYear: "2026",
            settings: settings,
            encounters: [encounter],
            patients: patients,
            vitalsMap: vitalsMap,
            transmittalNumber: "RHCI09214202610030001");

        // Assert
        doc.HciAccreNo.Should().Be("09214");
        doc.HciTransmittalNumber.Should().Be("RHCI09214202610030001");
        doc.Enlistments.Should().HaveCount(1);
        doc.Enlistments[0].PatientPin.Should().Be("123456789012");
        doc.Enlistments[0].PatientFname.Should().Be("Juan");
        doc.Enlistments[0].PatientLname.Should().Be("Dela Cruz");

        doc.Profiles.Should().HaveCount(1);
        doc.Profiles[0].BloodType.Should().Be("A+");
        doc.Profiles[0].PhysicalExam.Systolic.Should().Be("120");
        doc.Profiles[0].PhysicalExam.Diastolic.Should().Be("80");

        // First tranche requires placeholder SOAP and MEDICINE for DTD validity
        doc.Soaps.Should().HaveCount(1);
        doc.Soaps[0].IcdCodes.Should().Contain("Z00.0");
        doc.Medicines.Should().HaveCount(1);
        doc.Medicines[0].DrugCode.Should().Be("NOMED0000000000000000000000000");
    }

    [Fact]
    public void MapToYakapReportDocument_Tranche2_MapsFullEncounterAndMedicines()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var encounterId = Guid.NewGuid();

        var settings = new ClinicSettings
        {
            TenantId = "tenant_1",
            ClinicId = clinicId,
            ClinicName = "Manila Health Clinic",
            AccreditationNumber = "09214"
        };

        var patient = new ClinicPatient
        {
            Id = patientId,
            TenantId = "tenant_1",
            ClinicId = clinicId,
            PatientCode = "PAT-2026-0002",
            FirstName = "Maria",
            LastName = "Clara",
            DateOfBirth = new DateOnly(1992, 4, 12),
            Gender = "Female",
            ContactNumber = "09189998877",
            PhilHealthNumber = "24-250000477-4",
            BloodType = "B+",
            ChronicConditions = "Essential Hypertension"
        };

        var encounter = new ConsultationEncounter
        {
            Id = encounterId,
            TenantId = "tenant_1",
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Maria Clara",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Jose Rizal",
            EncounterDate = new DateTime(2026, 10, 3, 9, 15, 0, DateTimeKind.Utc),
            Subjective = "Patient has persistent dry cough and elevated blood pressure",
            Objective = "BP 145/95, chest clear",
            Assessment = "Stage 1 Hypertension; Acute Bronchitis",
            Plan = "Start Amlodipine 5mg OD, Salbutamol nebulization",
            RxDispenseStatus = PrescriptionDispenseStatus.DispensedAtPartnerPharmacy,
            RxDispensedAt = new DateTime(2026, 10, 3, 10, 0, 0, DateTimeKind.Utc),
            RxDispensedPharmacistName = "Pharm. Gabriela Silang",
            Diagnoses = new List<EncounterDiagnosis>
            {
                new() { Id = Guid.NewGuid(), ConsultationEncounterId = encounterId, Icd10Code = "I10", Description = "Essential hypertension", IsPrimary = true },
                new() { Id = Guid.NewGuid(), ConsultationEncounterId = encounterId, Icd10Code = "J20.9", Description = "Acute bronchitis, unspecified", IsPrimary = false }
            },
            Prescriptions = new List<PrescriptionItem>
            {
                new() { Id = Guid.NewGuid(), ConsultationEncounterId = encounterId, GenericName = "AMLODIPINE5MG", Dosage = "5mg", Form = "Tablet", Sig = "1 tab OD", Quantity = 30 }
            }
        };

        var vitals = new TriageVitals
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_1",
            ClinicId = clinicId,
            QueueItemId = Guid.NewGuid(),
            PatientId = patientId,
            SystolicBp = 145,
            DiastolicBp = 95,
            HeartRateBpm = 82,
            RespiratoryRateBreathsPerMin = 20,
            TemperatureCelsius = 37.1m,
            HeightCm = 160m,
            WeightKg = 58m,
            Bmi = 22.7m
        };

        var patients = new Dictionary<Guid, ClinicPatient> { [patientId] = patient };
        var vitalsMap = new Dictionary<Guid, TriageVitals> { [encounterId] = vitals };

        // Act
        var doc = _mapper.MapToYakapReportDocument(
            reportTagging: "2",
            effectiveYear: "2026",
            settings: settings,
            encounters: [encounter],
            patients: patients,
            vitalsMap: vitalsMap,
            transmittalNumber: "RHCI09214202610030002");

        // Assert
        doc.Soaps.Should().HaveCount(1);
        var soap = doc.Soaps[0];
        soap.SignsSymptoms.Should().Be("1"); // Cough mapped to "1"
        soap.IcdCodes.Should().Contain("I10");
        soap.IcdCodes.Should().Contain("J20.9");
        soap.PhysicalExam.Systolic.Should().Be("145");
        soap.PhysicalExam.Diastolic.Should().Be("95");

        doc.Medicines.Should().HaveCount(1);
        var med = doc.Medicines[0];
        med.GenericCode.Should().Be("AMLODIPINE5MG");
        med.DrugCode.Length.Should().Be(30);
        med.IsDispensed.Should().Be("Y");
        med.DispensingPersonnel.Should().Be("Pharm. Gabriela Silang");
        med.Quantity.Should().Be("30");
    }
}
