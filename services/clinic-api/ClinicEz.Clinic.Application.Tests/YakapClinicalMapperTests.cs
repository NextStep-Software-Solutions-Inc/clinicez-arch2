using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class YakapClinicalMapperTests
{
    private readonly YakapClinicalMapper _mapper = new(ClinicEz.Clinic.Infrastructure.PhilHealth.Catalog.PhilHealthCatalogLookup.FromBundledSeed());

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
        soap.SignsSymptoms.Should().Be("09"); // COUGH in lib_signs_symptoms
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

    [Fact]
    public void MapToYakapReportDocument_PediatricMale_EnforcesPediatricRulesAndDisablesMensAndPreg()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var encounterId = Guid.NewGuid();

        var settings = new ClinicSettings { TenantId = "tenant_1", ClinicId = clinicId, ClinicName = "Manila Clinic", AccreditationNumber = "09214" };
        var patient = new ClinicPatient
        {
            Id = patientId,
            TenantId = "tenant_1",
            ClinicId = clinicId,
            PatientCode = "PAT-PED-001",
            FirstName = "Totoy",
            LastName = "Bato",
            DateOfBirth = new DateOnly(2022, 1, 1), // 4-year-old boy
            Gender = "Male",
            ContactNumber = "09171112233",
            PhilHealthNumber = "12-345678901-2"
        };

        var encounter = new ConsultationEncounter
        {
            Id = encounterId,
            TenantId = "tenant_1",
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Totoy Bato",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Jose Rizal",
            EncounterDate = new DateTime(2026, 10, 3, 8, 0, 0, DateTimeKind.Utc),
            Subjective = "Pediatric wellness check"
        };

        var doc = _mapper.MapToYakapReportDocument(
            reportTagging: "1",
            effectiveYear: "2026",
            settings: settings,
            encounters: [encounter],
            patients: new Dictionary<Guid, ClinicPatient> { [patientId] = patient },
            vitalsMap: new Dictionary<Guid, TriageVitals>(),
            transmittalNumber: "RHCI09214202610030003");

        // Assert
        var profile = doc.Profiles[0];
        profile.MenstrualHistory.IsApplicable.Should().Be("N");
        profile.PregnancyHistory.IsApplicable.Should().Be("N");
        profile.SocialHistory.IsSmoker.Should().Be("N");
        profile.SocialHistory.IsAdrinker.Should().Be("N");
        profile.Immunizations.Should().ContainSingle(i => i.OtherImm == "999");
        profile.NcdAnswers.Qid1Yn.Should().Be("N"); // Pediatric defaults to N
    }

    [Fact]
    public void MapToYakapReportDocument_AdolescentFemale_EnablesMenstrualHistory()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var encounterId = Guid.NewGuid();

        var settings = new ClinicSettings { TenantId = "tenant_1", ClinicId = clinicId, ClinicName = "Manila Clinic", AccreditationNumber = "09214" };
        var patient = new ClinicPatient
        {
            Id = patientId,
            TenantId = "tenant_1",
            ClinicId = clinicId,
            PatientCode = "PAT-TEEN-001",
            FirstName = "Angelica",
            LastName = "Dela Cruz",
            DateOfBirth = new DateOnly(2012, 6, 15), // 14-year-old girl
            Gender = "Female",
            ContactNumber = "09171112244",
            PhilHealthNumber = "12-345678901-2"
        };

        var encounter = new ConsultationEncounter
        {
            Id = encounterId,
            TenantId = "tenant_1",
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Angelica Dela Cruz",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Jose Rizal",
            EncounterDate = new DateTime(2026, 10, 3, 8, 0, 0, DateTimeKind.Utc),
            Subjective = "Adolescent checkup"
        };

        var doc = _mapper.MapToYakapReportDocument(
            reportTagging: "1",
            effectiveYear: "2026",
            settings: settings,
            encounters: [encounter],
            patients: new Dictionary<Guid, ClinicPatient> { [patientId] = patient },
            vitalsMap: new Dictionary<Guid, TriageVitals>(),
            transmittalNumber: "RHCI09214202610030004");

        // Assert
        var profile = doc.Profiles[0];
        profile.MenstrualHistory.IsApplicable.Should().Be("Y");
        profile.MenstrualHistory.MenarchePeriod.Should().BeEmpty(); // Unopinionated: blank until answered
        profile.PregnancyHistory.IsApplicable.Should().Be("N"); // Defaults to false/N
        profile.PregnancyHistory.PregCnt.Should().BeEmpty(); // Blank fallback per DTD
        profile.PregnancyHistory.DeliveryCnt.Should().BeEmpty();
        profile.Immunizations.Should().ContainSingle(i => i.OtherImm == "999");
    }

    [Fact]
    public void MapToYakapReportDocument_AdolescentFemalePregnant_OverwritableAndProducesActivePregnancyHistory()
    {
        // Adolescent female age 16 who is pregnant (Gravida 1, Para 0)
        var clinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var encounterId = Guid.NewGuid();

        var settings = new ClinicSettings { TenantId = "tenant_1", ClinicId = clinicId, ClinicName = "Manila Clinic", AccreditationNumber = "09214" };
        var patient = new ClinicPatient
        {
            Id = patientId,
            TenantId = "tenant_1",
            ClinicId = clinicId,
            PatientCode = "PAT-TEEN-002",
            FirstName = "Maria",
            LastName = "Clara",
            DateOfBirth = new DateOnly(2010, 8, 20), // 16-year-old adolescent
            Gender = "Female",
            ContactNumber = "09171112245",
            PhilHealthNumber = "12-345678901-2"
        };

        // Explicitly recorded pregnancy history in CustomFields
        patient.CustomFields["philhealth_profile"] = new PhilHealthPatientProfileDto
        {
            Pin = "123456789012",
            MenstrualApplicable = true,
            MenarcheAge = "12",
            LastMensPeriod = "2026-03-01",
            PregnancyApplicable = true,
            Gravida = 1,
            Para = 0,
            DeliveryType = "V",
            FullTermCount = 0,
            PrematureCount = 0,
            AbortionCount = 0,
            LivingChildrenCount = 0,
            PreEclampsiaHypertension = false,
            FamilyPlanningCounseling = true
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
            EncounterDate = new DateTime(2026, 10, 3, 8, 0, 0, DateTimeKind.Utc),
            Subjective = "Adolescent prenatal baseline"
        };

        var doc = _mapper.MapToYakapReportDocument(
            reportTagging: "1",
            effectiveYear: "2026",
            settings: settings,
            encounters: [encounter],
            patients: new Dictionary<Guid, ClinicPatient> { [patientId] = patient },
            vitalsMap: new Dictionary<Guid, TriageVitals>(),
            transmittalNumber: "RHCI09214202610030004B");

        var profile = doc.Profiles[0];
        profile.MenstrualHistory.IsApplicable.Should().Be("Y");
        profile.PregnancyHistory.IsApplicable.Should().Be("Y");
        profile.PregnancyHistory.PregCnt.Should().Be("1");
        profile.PregnancyHistory.DeliveryCnt.Should().Be("0");
        profile.PregnancyHistory.WFamPlan.Should().Be("Y");
    }

    [Fact]
    public void MapToYakapReportDocument_FemaleOverwritesMenstrualToFalse_OutputsBlankFallbacks()
    {
        var clinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var encounterId = Guid.NewGuid();

        var settings = new ClinicSettings { TenantId = "tenant_1", ClinicId = clinicId, ClinicName = "Manila Clinic", AccreditationNumber = "09214" };
        var patient = new ClinicPatient
        {
            Id = patientId,
            TenantId = "tenant_1",
            ClinicId = clinicId,
            PatientCode = "PAT-FEM-003",
            FirstName = "Luz",
            LastName = "Vi Minda",
            DateOfBirth = new DateOnly(2000, 1, 1),
            Gender = "Female",
            ContactNumber = "09171112246",
            PhilHealthNumber = "12-345678901-2"
        };

        // Explicitly set MenstrualApplicable to false
        patient.CustomFields["philhealth_profile"] = new PhilHealthPatientProfileDto
        {
            Pin = "123456789012",
            MenstrualApplicable = false,
            PregnancyApplicable = false
        };

        var encounter = new ConsultationEncounter
        {
            Id = encounterId,
            TenantId = "tenant_1",
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Luz Vi Minda",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Jose Rizal",
            EncounterDate = new DateTime(2026, 10, 3, 8, 0, 0, DateTimeKind.Utc),
            Subjective = "General checkup"
        };

        var doc = _mapper.MapToYakapReportDocument(
            reportTagging: "1",
            effectiveYear: "2026",
            settings: settings,
            encounters: [encounter],
            patients: new Dictionary<Guid, ClinicPatient> { [patientId] = patient },
            vitalsMap: new Dictionary<Guid, TriageVitals>(),
            transmittalNumber: "RHCI09214202610030004C");

        var profile = doc.Profiles[0];
        profile.MenstrualHistory.IsApplicable.Should().Be("N");
        profile.MenstrualHistory.MenarchePeriod.Should().BeEmpty();
        profile.MenstrualHistory.PeriodDuration.Should().BeEmpty();
        profile.PregnancyHistory.IsApplicable.Should().Be("N");
        profile.PregnancyHistory.PregCnt.Should().BeEmpty();
    }

    [Fact]
    public void MapToYakapReportDocument_WithStandaloneProfileCustomField_UsesCustomData()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var encounterId = Guid.NewGuid();

        var settings = new ClinicSettings { TenantId = "tenant_1", ClinicId = clinicId, ClinicName = "Manila Clinic", AccreditationNumber = "09214" };
        var patient = new ClinicPatient
        {
            Id = patientId,
            TenantId = "tenant_1",
            ClinicId = clinicId,
            PatientCode = "PAT-STANDALONE-001",
            FirstName = "Corazon",
            LastName = "Aquino",
            DateOfBirth = new DateOnly(1975, 1, 25), // 51-year-old female
            Gender = "Female",
            ContactNumber = "09171112255",
            PhilHealthNumber = "12-345678901-2"
        };

        // Standalone profile stored in CustomFields["philhealth_profile"]
        var standaloneProfile = new PhilHealthPatientProfileDto
        {
            Pin = "123456789012",
            BloodType = "AB+",
            MenstrualApplicable = true,
            MenarcheAge = "11",
            PeriodDurationDays = "4",
            CycleIntervalDays = "28",
            PadsPerDay = "3",
            IsMenopause = true,
            MenopauseAge = "50",
            PregnancyApplicable = true,
            Gravida = 3,
            Para = 3,
            DeliveryType = "V",
            FullTermCount = 3,
            LivingChildrenCount = 3,
            MedicalHistories = [new PhilHealthConditionEntryDto("011", "Hypertension Stage 2")],
            SurgicalHistories = [new PhilHealthSurgicalEntryDto("Appendectomy", "2010-05-12")],
            FamilyHistories = [new PhilHealthConditionEntryDto("006", "T2DM maternal")],
            SkinId = "1",
            ChestId = "1",
            ChestRemarks = "Clear breath sounds",
            NcdAnswers = new YakapNcdAnswersDto(Qid1Yn: "Y", Qid2Yn: "N")
        };

        patient.CustomFields["philhealth_profile"] = standaloneProfile;

        var encounter = new ConsultationEncounter
        {
            Id = encounterId,
            TenantId = "tenant_1",
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Corazon Aquino",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Jose Rizal",
            EncounterDate = new DateTime(2026, 10, 3, 8, 0, 0, DateTimeKind.Utc),
            Subjective = "Annual health check"
        };

        var doc = _mapper.MapToYakapReportDocument(
            reportTagging: "1",
            effectiveYear: "2026",
            settings: settings,
            encounters: [encounter],
            patients: new Dictionary<Guid, ClinicPatient> { [patientId] = patient },
            vitalsMap: new Dictionary<Guid, TriageVitals>(),
            transmittalNumber: "RHCI09214202610030005");

        // Assert
        var profile = doc.Profiles[0];
        profile.BloodType.Should().Be("AB+");
        profile.MenstrualHistory.IsApplicable.Should().Be("Y");
        profile.MenstrualHistory.MenarchePeriod.Should().Be("11");
        profile.MenstrualHistory.IsMenopause.Should().Be("Y");
        profile.MenstrualHistory.MenopauseAge.Should().Be("50");

        profile.PregnancyHistory.IsApplicable.Should().Be("Y");
        profile.PregnancyHistory.PregCnt.Should().Be("3");
        profile.PregnancyHistory.DeliveryCnt.Should().Be("3");

        profile.MedicalHistories.Should().ContainSingle(m => m.MdiseaseCode == "011");
        profile.MedicalSpecifics.Should().ContainSingle(m => m.SpecificDesc == "Hypertension Stage 2");
        profile.SurgicalHistories.Should().ContainSingle(s => s.SurgDesc == "Appendectomy");
        profile.FamilyHistories.Should().ContainSingle(f => f.MdiseaseCode == "006");

        profile.NcdAnswers.Qid1Yn.Should().Be("Y");
    }

    [Fact]
    public void MapToYakapReportDocument_WhenPatientIsDependent_MapsSponsorAndDependentCredentialsAccurately()
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

        // Pediatric patient (Dependent)
        var patient = new ClinicPatient
        {
            Id = patientId,
            TenantId = "tenant_1",
            ClinicId = clinicId,
            PatientCode = "PAT-PED-001",
            FirstName = "Maria Clara",
            MiddleName = "Santos",
            LastName = "Ibarra",
            Suffix = "Jr",
            DateOfBirth = new DateOnly(2020, 4, 10), // 6-year-old child
            Gender = "Female",
            ContactNumber = "09170001122",
            PhilHealthNumber = "998877665544" // Child's PIN / Dependent PIN
        };

        // Standalone profile configured as Dependent of father Crisostomo Ibarra
        var dependentProfile = new PhilHealthPatientProfileDto
        {
            Pin = "998877665544",
            MemberType = "DD",
            MemberPin = "123456789012",
            MemberFirstName = "Crisostomo",
            MemberMiddleName = "Magsaysay",
            MemberLastName = "Ibarra",
            MemberSuffix = "Sr",
            MemberBirthDate = "1988-11-20",
            DependentRelationship = "C",
            BloodType = "B+"
        };

        patient.CustomFields["philhealth_profile"] = dependentProfile;

        var encounter = new ConsultationEncounter
        {
            Id = encounterId,
            TenantId = "tenant_1",
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Maria Clara Ibarra",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Jose Rizal",
            EncounterDate = new DateTime(2026, 10, 3, 10, 0, 0, DateTimeKind.Utc),
            Subjective = "Routine pediatric wellness check",
            Plan = "Normal growth and development"
        };

        // Act - Tranche 1
        var docTranche1 = _mapper.MapToYakapReportDocument(
            reportTagging: "1",
            effectiveYear: "2026",
            settings: settings,
            encounters: [encounter],
            patients: new Dictionary<Guid, ClinicPatient> { [patientId] = patient },
            vitalsMap: new Dictionary<Guid, TriageVitals>(),
            transmittalNumber: "RHCI09214202610030099");

        // Assert - Enlistment
        var enlistment = docTranche1.Enlistments[0];
        enlistment.PatientType.Should().Be("DD");
        enlistment.PatientPin.Should().Be("998877665544");
        enlistment.PatientFname.Should().Be("Maria Clara");
        enlistment.PatientLname.Should().Be("Ibarra");
        enlistment.MemPin.Should().Be("123456789012");
        enlistment.MemFname.Should().Be("CRISOSTOMO");
        enlistment.MemMname.Should().Be("MAGSAYSAY");
        enlistment.MemLname.Should().Be("IBARRA");
        enlistment.MemExtname.Should().Be("SR");
        enlistment.MemDob.Should().Be("1988-11-20");

        // Assert - Profile
        var profile = docTranche1.Profiles[0];
        profile.PatientType.Should().Be("DD");
        profile.PatientPin.Should().Be("998877665544");
        profile.MemPin.Should().Be("123456789012");

        // Assert - Soap
        var soap = docTranche1.Soaps[0];
        soap.PatientType.Should().Be("DD");
        soap.PatientPin.Should().Be("998877665544");
        soap.MemPin.Should().Be("123456789012");

        // Act - Tranche 2
        var docTranche2 = _mapper.MapToYakapReportDocument(
            reportTagging: "2",
            effectiveYear: "2026",
            settings: settings,
            encounters: [encounter],
            patients: new Dictionary<Guid, ClinicPatient> { [patientId] = patient },
            vitalsMap: new Dictionary<Guid, TriageVitals>(),
            transmittalNumber: "RHCI09214202610030099");

        var soapTranche2 = docTranche2.Soaps[0];
        soapTranche2.PatientType.Should().Be("DD");
        soapTranche2.PatientPin.Should().Be("998877665544");
        soapTranche2.MemPin.Should().Be("123456789012");
    }

    [Fact]
    public void MapToYakapReportDocument_WhenPatientIsPrincipalMember_DefaultsPatientTypeToMMAndMirrorsPatientPin()
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
            PatientCode = "PAT-ADULT-001",
            FirstName = "Juan",
            MiddleName = "Santos",
            LastName = "Dela Cruz",
            DateOfBirth = new DateOnly(1985, 5, 15),
            Gender = "Male",
            ContactNumber = "09171234567",
            PhilHealthNumber = "030263078507"
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
            EncounterDate = new DateTime(2026, 10, 3, 9, 0, 0, DateTimeKind.Utc),
            Subjective = "Health baseline profiling"
        };

        // Act
        var doc = _mapper.MapToYakapReportDocument(
            reportTagging: "1",
            effectiveYear: "2026",
            settings: settings,
            encounters: [encounter],
            patients: new Dictionary<Guid, ClinicPatient> { [patientId] = patient },
            vitalsMap: new Dictionary<Guid, TriageVitals>(),
            transmittalNumber: "RHCI09214202610030098");

        // Assert
        doc.Enlistments[0].PatientType.Should().Be("MM");
        doc.Enlistments[0].PatientPin.Should().Be("030263078507");
        doc.Enlistments[0].MemPin.Should().Be("030263078507");
        doc.Enlistments[0].MemFname.Should().Be("Juan");
        doc.Enlistments[0].MemLname.Should().Be("Dela Cruz");

        doc.Profiles[0].PatientType.Should().Be("MM");
        doc.Profiles[0].MemPin.Should().Be("030263078507");

        doc.Soaps[0].PatientType.Should().Be("MM");
        doc.Soaps[0].MemPin.Should().Be("030263078507");
    }
    [Fact]
    public void MapToYakapReportDocument_WithRelationalHistoriesAndImmunizations_MapsEntitiesAndFallbacks()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var encounterId = Guid.NewGuid();

        var settings = new ClinicSettings
        {
            Id = Guid.NewGuid(),
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
            PatientCode = "PAT-REL-001",
            FirstName = "Maria",
            LastName = "Santos",
            DateOfBirth = new DateOnly(1990, 8, 20),
            Gender = "Female",
            ContactNumber = "09171234567",
            PhilHealthNumber = "123456789012"
        };

        var encounter = new ConsultationEncounter
        {
            Id = encounterId,
            TenantId = "tenant_1",
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Maria Santos",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Rizal",
            EncounterDate = new DateTime(2026, 10, 5, 10, 0, 0, DateTimeKind.Utc),
            Subjective = "First Patient Encounter"
        };

        var immunizations = new List<PatientImmunization>
        {
            new()
            {
                Id = Guid.NewGuid(),
                TenantId = "tenant_1",
                ClinicId = clinicId,
                PatientId = patientId,
                PatientName = "Maria Santos",
                PhilHealthLibrary = "lib_immchild",
                PhilHealthCode = "C01",
                VaccineName = "BCG",
                LotBatchNumber = "LOT-01",
                ExpirationDate = new DateOnly(2028, 1, 1),
                DoseSequence = 1,
                Route = "ID",
                InjectionSite = "Right Deltoid",
                AdministeredAtUtc = DateTime.UtcNow.AddYears(-1),
                AdministeredByStaffId = Guid.NewGuid(),
                AdministeredByStaffName = "Nurse"
            }
        };

        var problems = new List<PatientProblem>
        {
            new()
            {
                Id = Guid.NewGuid(),
                TenantId = "tenant_1",
                ClinicId = clinicId,
                PatientId = patientId,
                Icd10Code = "E11.9",
                ProblemTitle = "Type 2 diabetes mellitus",
                PhilHealthMdiseaseCode = "006",
                Status = ProblemStatus.Active,
                RecordedByDoctorId = Guid.NewGuid(),
                RecordedByDoctorName = "Dr. Rizal"
            }
        };

        var surgical = new List<PatientSurgicalHistory>
        {
            new()
            {
                Id = Guid.NewGuid(),
                TenantId = "tenant_1",
                ClinicId = clinicId,
                PatientId = patientId,
                ProcedureName = "Appendectomy",
                SurgeryDate = new DateOnly(2022, 4, 15)
            }
        };

        var social = new PatientSocialHistory
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_1",
            ClinicId = clinicId,
            PatientId = patientId,
            IsSmoker = true,
            CigarettesPerDay = 5,
            IsAlcoholDrinker = false,
            UsesIllicitDrugs = false,
            IsSexuallyActive = true
        };

        var reproductive = new PatientReproductiveHistory
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_1",
            ClinicId = clinicId,
            PatientId = patientId,
            IsApplicable = true,
            MenarcheAge = 12,
            LastMenstrualPeriod = new DateOnly(2026, 9, 20),
            PeriodDurationDays = 5,
            CycleIntervalDays = 28,
            PadsPerDay = 3,
            ContraceptiveMethod = "None",
            IsMenopausal = false
        };

        // Act
        var doc = _mapper.MapToYakapReportDocument(
            reportTagging: "1",
            effectiveYear: "2026",
            settings: settings,
            encounters: [encounter],
            patients: new Dictionary<Guid, ClinicPatient> { [patientId] = patient },
            vitalsMap: new Dictionary<Guid, TriageVitals>(),
            transmittalNumber: "RHCI09214202610050001",
            immunizationsMap: new Dictionary<Guid, List<PatientImmunization>> { [patientId] = immunizations },
            problemsMap: new Dictionary<Guid, List<PatientProblem>> { [patientId] = problems },
            socialHistoriesMap: new Dictionary<Guid, PatientSocialHistory> { [patientId] = social },
            reproductiveHistoriesMap: new Dictionary<Guid, PatientReproductiveHistory> { [patientId] = reproductive },
            surgicalHistoriesMap: new Dictionary<Guid, List<PatientSurgicalHistory>> { [patientId] = surgical });

        // Assert
        doc.Profiles.Should().HaveCount(1);
        var prof = doc.Profiles[0];

        // Immunization mapping
        prof.Immunizations.Should().HaveCount(1);
        prof.Immunizations[0].ChildImmcode.Should().Be("C01");

        // Medical history mapping
        prof.MedicalHistories.Should().Contain(m => m.MdiseaseCode == "006");
        prof.MedicalSpecifics.Should().Contain(s => s.MdiseaseCode == "006" && s.SpecificDesc == "Type 2 diabetes mellitus");

        // Surgical history mapping
        prof.SurgicalHistories.Should().HaveCount(1);
        prof.SurgicalHistories[0].SurgDesc.Should().Be("Appendectomy");
        prof.SurgicalHistories[0].SurgDate.Should().Be("2022-04-15");

        // Social history mapping
        prof.SocialHistory.IsSmoker.Should().Be("Y");
        prof.SocialHistory.NoCigpk.Should().Be("5");
        prof.SocialHistory.IsAdrinker.Should().Be("N");

        // Reproductive history mapping
        prof.MenstrualHistory.IsApplicable.Should().Be("Y");
        prof.MenstrualHistory.MenarchePeriod.Should().Be("12");
        prof.MenstrualHistory.LastMensPeriod.Should().Be("2026-09-20");
    }
}
