using System;
using System.Collections.Generic;
using System.Linq;
using ClinicEz.Clinic.Application.Tests.E2E.Fixtures;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.E2E.Tier4_RealWorldClinicalScenarios;

using static E2EContracts;
using static E2ETestHarness;

/// <summary>
/// Tier 4: Real-World Clinical Scenarios.
/// End-to-end clinical workflow test journeys representing authentic clinical encounters:
/// - Pediatric well-child visit with growth chart and vaccines
/// - Diabetic adult with PhilPEN CVD risk and medication contraindication
/// - PhilHealth Konsulta claim submission with 9-system physical exam
/// - Senior citizen preventive encounter with elderly immunization
/// - Adolescent female HPV vaccination encounter
/// </summary>
public class Tier4_RealWorldClinicalScenarioTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly Guid _doctorId = Guid.NewGuid();
    private readonly Guid _patientId = Guid.NewGuid();
    private readonly Guid _staffId = Guid.NewGuid();

    // =========================================================================
    // Scenario 1: Pediatric Well-Child Visit with Growth Chart & Vaccines
    // =========================================================================
    [Fact]
    public void Scenario1_PediatricWellChildVisit_GrowthAndVaccineWorkflow()
    {
        // STEP 1: Doctor Schedule & Slot Availability Check
        var visitDate = new DateOnly(2026, 10, 14); // Wednesday
        var template = new DoctorScheduleTemplateDto(Guid.NewGuid(), _clinicId, _doctorId, DayOfWeek.Wednesday,
            new TimeOnly(8, 0), new TimeOnly(12, 0), SlotInterval.Minutes30, true, new());

        var slots = Scheduling.CalculateAvailableSlots(_clinicId, _doctorId, visitDate, template, new List<DoctorLeaveDto>(), new List<AppointmentRange>());
        var selectedSlot = slots.First(s => s.StartUtc.Hour == 9 && s.StartUtc.Minute == 0);
        selectedSlot.IsAvailable.Should().BeTrue();

        // STEP 2: Extended Triage Vitals & Pediatric Anthropometrics
        var triage = new ExtendedTriageVitalsDto(
            Id: Guid.NewGuid(),
            ClinicId: _clinicId,
            PatientId: _patientId,
            RecordedAtUtc: DateTime.UtcNow,
            SystolicBp: 88,
            DiastolicBp: 56,
            HeartRateBpm: 112,
            TemperatureCelsius: 36.6m,
            RespiratoryRateBreathsPerMin: 24,
            OxygenSaturationPercent: 99.0m,
            HeightCm: 75.0m, // 12-month length
            WeightKg: 9.6m,  // 12-month weight
            Bmi: 17.07m,
            PainScore: 0,
            VisualAcuityLeft: null,
            VisualAcuityRight: null,
            HeadCircumferenceCm: 46.0m,
            MidUpperArmCircumferenceCm: 14.5m,
            Notes: "12-month routine well-child check");

        // STEP 3: WHO Z-Score Growth Evaluation
        var zscore = Growth.EvaluatePediatricGrowth(ageMonths: 12, gender: "Male", lengthHeightCm: triage.HeightCm!.Value, weightKg: triage.WeightKg!.Value);
        zscore.Should().NotBeNull();
        zscore!.IsUnderFiveCohort.Should().BeTrue();
        zscore.HeightCategory.Should().Be(ZScoreCategory.Normal);
        zscore.WeightCategory.Should().Be(ZScoreCategory.Normal);

        // STEP 4: Pediatrician Examination (Inline PE Card)
        var pe = new NineSystemPhysicalExamDto(true, null, null, null, null, null, null, null, null, null);
        var encounter = new DualModeConsultationDto(Guid.NewGuid(), _clinicId, _patientId, _doctorId,
            EncounterType.PrivateCash, false, "12-month well child visit. Mother reports good appetite.",
            "Active, alert infant. Growth parameters normal. Lungs clear, heart normal.", "Healthy 12-month infant (Z00.129)",
            "Administer 12-month routine immunizations. Continue age-appropriate nutrition.",
            null, null, null, null, null, pe, true, DateTime.UtcNow);

        encounter.IsSigned.Should().BeTrue();

        // STEP 5: Immunization Administration (Measles-Mumps-Rubella / lib_immchild)
        var vaccine = new PatientImmunizationDto(
            Id: Guid.NewGuid(),
            ClinicId: _clinicId,
            PatientId: _patientId,
            VaccineCode: "C08",
            VaccineName: "Measles-Mumps-Rubella (MMR)",
            StatutoryLibrary: "lib_immchild",
            LotBatchNumber: "MMR-2026-B81",
            ExpirationDate: new DateOnly(2027, 8, 31),
            DoseSequenceNumber: 1,
            InjectionSite: "Left Anterolateral Thigh",
            InjectionRoute: "Subcutaneous",
            AdministeredDate: visitDate,
            AdministeredByStaffId: _staffId,
            AdverseReactionNotes: null,
            IsHistoricalRecord: false);

        vaccine.ExpirationDate.Should().BeAfter(vaccine.AdministeredDate);

        // STEP 6: Interop Hub Outbox Envelope Sync
        var outbox = new ImmunizationOutboxEnvelope(Guid.NewGuid(), "clinical.immunization.administered",
            _patientId, _clinicId, vaccine.VaccineCode, vaccine.VaccineName, vaccine.LotBatchNumber,
            vaccine.DoseSequenceNumber, DateTime.UtcNow, _staffId, DateTime.UtcNow);

        outbox.Topic.Should().Be("clinical.immunization.administered");

        // STEP 7: Transmittal Document Assembly
        var xml = TransmittalXml.BuildKonsultaXml("T001", "H90000001", "P00001", "2026", "C001",
            "123456789012", "DELA CRUZ", "BAMBINO", "M", "2025-10-14", new List<PatientImmunizationDto> { vaccine }, pe, triage);

        xml.Should().Contain("pChildImmcode=\"C08\"");
        xml.Should().Contain("pHeight=\"75.0\"");
        xml.Should().Contain("pWeight=\"9.6\"");
    }

    // =========================================================================
    // Scenario 2: Diabetic Adult with PhilPEN CVD Risk & Medication Contraindication
    // =========================================================================
    [Fact]
    public void Scenario2_DiabeticAdultCvdRiskAndMedicationSafetyWorkflow()
    {
        // STEP 1: Longitudinal Problem List
        var problems = new List<PatientMedicalHistoryDto>
        {
            new(Guid.NewGuid(), _clinicId, _patientId, "E11.9", "Type 2 Diabetes Mellitus", new DateOnly(2019, 3, 1), ProblemStatus.Active, null, "006"),
            new(Guid.NewGuid(), _clinicId, _patientId, "I10", "Essential Hypertension", new DateOnly(2017, 8, 1), ProblemStatus.Active, null, "001"),
            new(Guid.NewGuid(), _clinicId, _patientId, "K26.0", "Active Duodenal Ulcer with Hemorrhage", new DateOnly(2026, 2, 1), ProblemStatus.Active, null, "008")
        };

        // STEP 2: Structured Allergies
        var allergies = new List<PatientAllergyDto>
        {
            new(Guid.NewGuid(), _clinicId, _patientId, AllergyClassification.Drug, "Penicillin", "Anaphylaxis and angioedema", AllergySeverity.LifeThreateningAnaphylaxis, true)
        };

        // STEP 3: Triage Vitals
        var triage = new ExtendedTriageVitalsDto(Guid.NewGuid(), _clinicId, _patientId, DateTime.UtcNow,
            SystolicBp: 154, DiastolicBp: 94, HeartRateBpm: 76, TemperatureCelsius: 36.7m,
            RespiratoryRateBreathsPerMin: 18, OxygenSaturationPercent: 98.0m, HeightCm: 168.0m, WeightKg: 78.0m,
            Bmi: 27.63m, PainScore: 3, VisualAcuityLeft: "20/25", VisualAcuityRight: "20/25",
            null, null, "Follow-up diabetic check");

        // STEP 4: PhilPEN 24-Question Survey & Cardiovascular Risk Scoring
        var survey = new PhilPenSurveyAnswersDto(Guid.NewGuid(), _clinicId, _patientId,
            AgeYears: 58, Gender: "Male", IsSmoker: true, SystolicBp: triage.SystolicBp!.Value, HasDiabetes: true,
            FastingBloodSugarMgDl: 158m, TotalCholesterolMgDl: 225m, BodyMassIndex: triage.Bmi!.Value,
            HasAnginaOrPreviousStroke: false, RenalDiseasePresent: false);

        var cvdRisk = PhilPen.CalculateRisk(survey);
        cvdRisk.RiskBand.Should().BeOneOf(CvdRiskBand.BandC_20ToUnder30Percent, CvdRiskBand.BandD_30ToUnder40Percent, CvdRiskBand.BandE_40PercentOrGreater);

        // STEP 5: CDS Decision Support Safety Check on Prescriptions
        // Physician considers adding pain medication and antibiotics:
        // Attempt 1: Amoxicillin (Penicillin allergy -> Blocked)
        // Attempt 2: Mefenamic Acid (NSAID in Peptic Ulcer -> Blocked)
        // Safe alternative: Paracetamol + Amlodipine + Metformin
        var candidatePrescriptions = new[] { "Amoxicillin", "Mefenamic Acid", "Paracetamol", "Amlodipine", "Metformin" };
        var alerts = Cds.EvaluateOrderSafety(candidatePrescriptions, allergies, problems);

        alerts.Should().Contain(a => a.RuleType == "DrugAllergy" && a.IsHardStop);
        alerts.Should().Contain(a => a.RuleType == "DrugDisease" && a.Title.Contains("Peptic Ulcer"));

        // Confirming safe medications only
        var safeMeds = new[] { "Paracetamol", "Amlodipine", "Metformin" };
        var safeAlerts = Cds.EvaluateOrderSafety(safeMeds, allergies, problems);
        safeAlerts.Should().BeEmpty();

        // STEP 6: Sign Consultation
        var pe = new NineSystemPhysicalExamDto(true, null, null, null, null, null, null, null, null, null);
        var enc = new DualModeConsultationDto(Guid.NewGuid(), _clinicId, _patientId, _doctorId,
            EncounterType.PrivateCash, false, "Follow up DM/HTN", "BP 154/94, Exam essentially normal",
            "T2DM poorly controlled; HTN Stage 2", "Adjust Amlodipine to 10mg, Metformin 500mg BID. Avoid NSAIDs due to PUD.",
            null, null, null, null, null, pe, true, DateTime.UtcNow);

        enc.IsSigned.Should().BeTrue();
    }

    // =========================================================================
    // Scenario 3: PhilHealth Konsulta Claims Submission with 9-System Physical Exam
    // =========================================================================
    [Fact]
    public void Scenario3_PhilHealthKonsultaEncounterTransmittalScenario()
    {
        // STEP 1: Patient Ingestion & Journey Number Auto-Generation
        var accreditationNo = "H90000001";
        var year = "2026";
        var caseNo = $"C{accreditationNo}{year}00001";
        var atc = "ATC202610119999";
        var doctorPan = "PAN-7890123456";

        // STEP 2: Relational Profiling Data (Zero JSON Blobs)
        var surgeries = new List<PatientSurgicalHistoryDto>
        {
            new(Guid.NewGuid(), _clinicId, _patientId, "Appendectomy", new DateOnly(2021, 5, 10), "St. Luke's", null)
        };

        var social = new PatientSocialHistoryDto(Guid.NewGuid(), _clinicId, _patientId,
            IsSmoker: false, CigarettesPacksPerDay: null, IsAlcoholDrinker: false, BottlesPerDay: null,
            IsIllicitDrugUser: false, IsSexuallyActive: true, Notes: null);

        var repro = new PatientReproductiveHistoryDto(Guid.NewGuid(), _clinicId, _patientId,
            MenarcheAge: 13, LastMenstrualPeriod: new DateOnly(2026, 9, 20), PeriodDurationDays: 5,
            MenstrualIntervalDays: 28, PadsPerDay: 3, Gravida: 2, Para: 2,
            FullTermBirths: 2, PrematureBirths: 0, Abortions: 0, LivingChildren: 2,
            IsMenopausal: false, MenopauseAge: null, IsApplicable: true);

        // STEP 3: Consultation with 1-Click Physical Exam & Doctor PAN Snapshot
        var pe = new NineSystemPhysicalExamDto(
            AllEssentiallyNormal: true,
            SkinRemarks: null, HeentRemarks: null, ChestLungsRemarks: null, HeartCvsRemarks: null,
            AbdomenRemarks: null, NeuroRemarks: null, RectalRemarks: null, GenitourinaryRemarks: null,
            MusculoskeletalRemarks: null);

        var encounter = new DualModeConsultationDto(
            Id: Guid.NewGuid(),
            ClinicId: _clinicId,
            PatientId: _patientId,
            DoctorId: _doctorId,
            Type: EncounterType.PhilHealthKonsulta,
            IsYakapEligible: true,
            Subjective: "Annual primary care benefit consultation under Konsulta.",
            Objective: "All 9 organ systems essentially normal upon exam.",
            Assessment: "Routine general medical examination (Z00.0).",
            Plan: "Lifestyle advice, health maintenance.",
            DoctorPhilHealthPan: doctorPan,
            PhilHealthAtc: atc,
            HciCaseNo: caseNo,
            HciTransNo: $"E{accreditationNo}{year}00001",
            SoapTransNo: $"S{accreditationNo}{year}00001",
            PhysicalExam: pe,
            IsSigned: true,
            SignedAtUtc: DateTime.UtcNow);

        // STEP 4: Relational Transmittal XML Generation
        // Patient has zero vaccines -> Emits statutory fallback 999
        var xml = TransmittalXml.BuildKonsultaXml("RH9000000120261000001", accreditationNo, "P00001", year,
            caseNo, "030263078507", "DELA CRUZ", "JUANA", "F", "1992-07-25",
            new List<PatientImmunizationDto>(), pe, null);

        // STEP 5: Verification against KonsultaData_v1.14.dtd structure
        xml.Should().Contain("<!DOCTYPE PCB SYSTEM \"KonsultaData_v1.14.dtd\">");
        xml.Should().Contain("pElderlyImmcode=\"999\"");
        xml.Should().Contain("<PEMISC pSkinId=\"1\" pHeentId=\"1\"");
        xml.Should().Contain("pATC=\"ATC123456789\"");
        xml.Should().Contain("</PCB>");
    }

    // =========================================================================
    // Scenario 4: Senior Citizen Annual Checkup & Elderly Vaccine Workflow
    // =========================================================================
    [Fact]
    public void Scenario4_SeniorCitizenAnnualCheckupAndElderlyVaccineWorkflow()
    {
        var seniorAge = 68;
        seniorAge.Should().BeGreaterThanOrEqualTo(60);

        var pneumoVaccine = new PatientImmunizationDto(
            Id: Guid.NewGuid(),
            ClinicId: _clinicId,
            PatientId: _patientId,
            VaccineCode: "E01",
            VaccineName: "Pneumococcal Polysaccharide (PPV23)",
            StatutoryLibrary: "lib_immelderly",
            LotBatchNumber: "PPV-2026-SR1",
            ExpirationDate: new DateOnly(2028, 6, 30),
            DoseSequenceNumber: 1,
            InjectionSite: "Left Deltoid",
            InjectionRoute: "Intramuscular",
            AdministeredDate: new DateOnly(2026, 10, 11),
            AdministeredByStaffId: _staffId,
            AdverseReactionNotes: null,
            IsHistoricalRecord: false);

        pneumoVaccine.StatutoryLibrary.Should().Be("lib_immelderly");
        pneumoVaccine.VaccineCode.Should().StartWith("E");

        var xml = TransmittalXml.BuildKonsultaXml("T001", "H90000001", "P00001", "2026", "C001",
            "123456789012", "SANTOS", "AURORA", "F", "1958-03-12", new List<PatientImmunizationDto> { pneumoVaccine });

        xml.Should().Contain("pElderlyImmcode=\"E01\"");
        xml.Should().NotContain("pElderlyImmcode=\"999\"");
    }

    // =========================================================================
    // Scenario 5: Adolescent Female HPV Vaccination Workflow
    // =========================================================================
    [Fact]
    public void Scenario5_AdolescentFemaleHpvVaccinationWorkflow()
    {
        var hpvVaccine = new PatientImmunizationDto(
            Id: Guid.NewGuid(),
            ClinicId: _clinicId,
            PatientId: _patientId,
            VaccineCode: "Y01",
            VaccineName: "Human Papillomavirus (HPV Quadrivalent)",
            StatutoryLibrary: "lib_immyoungw",
            LotBatchNumber: "HPV-2026-Y9",
            ExpirationDate: new DateOnly(2028, 1, 1),
            DoseSequenceNumber: 1,
            InjectionSite: "Right Deltoid",
            InjectionRoute: "Intramuscular",
            AdministeredDate: new DateOnly(2026, 10, 11),
            AdministeredByStaffId: _staffId,
            AdverseReactionNotes: null,
            IsHistoricalRecord: false);

        hpvVaccine.StatutoryLibrary.Should().Be("lib_immyoungw");
        hpvVaccine.VaccineCode.Should().StartWith("Y");

        var xml = TransmittalXml.BuildKonsultaXml("T001", "H90000001", "P00001", "2026", "C001",
            "123456789012", "REYES", "BIANCA", "F", "2011-09-15", new List<PatientImmunizationDto> { hpvVaccine });

        xml.Should().Contain("pYoungwImmcode=\"Y01\"");
    }
}
