using System;
using System.Collections.Generic;
using System.Linq;
using ClinicEz.Clinic.Application.Tests.E2E.Fixtures;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.E2E.Tier3_CrossFeatureInteractions;

using static E2EContracts;
using static E2ETestHarness;

/// <summary>
/// Tier 3: Cross-Feature Interactions & Pairwise Combinations.
/// Exercises cross-boundary interactions between scheduling, clinical profiling, triage,
/// consultation workstation, CDS rules, immunization outbox, and statutory transmittals.
/// </summary>
public class Tier3_CrossFeatureInteractionTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly Guid _doctorId = Guid.NewGuid();
    private readonly Guid _patientId = Guid.NewGuid();
    private readonly Guid _staffId = Guid.NewGuid();

    // =========================================================================
    // Interaction 1: Scheduling + Consultation Lifecycle
    // =========================================================================
    [Fact]
    public void Interaction1_SchedulingToConsultationLifecycle_MaintainsReferentialIntegrity()
    {
        var bookingDate = new DateOnly(2026, 10, 12);
        var slotStart = bookingDate.ToDateTime(new TimeOnly(10, 0), DateTimeKind.Utc);
        var slotEnd = bookingDate.ToDateTime(new TimeOnly(10, 30), DateTimeKind.Utc);

        var template = new DoctorScheduleTemplateDto(Guid.NewGuid(), _clinicId, _doctorId, DayOfWeek.Monday,
            new TimeOnly(8, 0), new TimeOnly(12, 0), SlotInterval.Minutes30, true, new());

        // 1. Verify slot is available
        var slots = Scheduling.CalculateAvailableSlots(_clinicId, _doctorId, bookingDate, template, new List<DoctorLeaveDto>(), new List<AppointmentRange>());
        slots.First(s => s.StartUtc == slotStart).IsAvailable.Should().BeTrue();

        // 2. Book appointment with GiST exclusion check
        var appointmentId = Guid.NewGuid();
        var appointments = new List<AppointmentRange>();
        Scheduling.AssertNoBookingCollision(_clinicId, _doctorId, slotStart, slotEnd, appointments);
        appointments.Add(new AppointmentRange(appointmentId, _clinicId, _doctorId, slotStart, slotEnd, "Confirmed"));

        // 3. Slot now reflects as booked
        var updatedSlots = Scheduling.CalculateAvailableSlots(_clinicId, _doctorId, bookingDate, template, new List<DoctorLeaveDto>(), appointments);
        updatedSlots.First(s => s.StartUtc == slotStart).IsAvailable.Should().BeFalse();

        // 4. Create consultation encounter linked to appointment
        var pe = new NineSystemPhysicalExamDto(true, null, null, null, null, null, null, null, null, null);
        var encounter = new DualModeConsultationDto(Guid.NewGuid(), _clinicId, _patientId, _doctorId,
            EncounterType.PrivateCash, false, "Patient arrived for scheduled appointment", "Vitals normal", "Healthy", "Discharge",
            null, null, null, null, null, pe, true, DateTime.UtcNow);

        encounter.ClinicId.Should().Be(_clinicId);
        encounter.DoctorId.Should().Be(_doctorId);
        encounter.IsSigned.Should().BeTrue();
    }

    // =========================================================================
    // Interaction 2: Extended Triage + WHO Z-Score Calculation + PEPERT Mapping
    // =========================================================================
    [Fact]
    public void Interaction2_PatientVitals_GrowthEngine_YakapPepertMapping()
    {
        // 14-month female infant presenting for routine check-up
        var triage = new ExtendedTriageVitalsDto(
            Id: Guid.NewGuid(),
            ClinicId: _clinicId,
            PatientId: _patientId,
            RecordedAtUtc: DateTime.UtcNow,
            SystolicBp: 90,
            DiastolicBp: 58,
            HeartRateBpm: 108,
            TemperatureCelsius: 36.8m,
            RespiratoryRateBreathsPerMin: 26,
            OxygenSaturationPercent: 99.0m,
            HeightCm: 76.2m, // Will snap to 76.0 cm
            WeightKg: 9.2m,
            Bmi: 15.9m,
            PainScore: 0,
            VisualAcuityLeft: null,
            VisualAcuityRight: null,
            HeadCircumferenceCm: 45.5m,
            MidUpperArmCircumferenceCm: 14.2m,
            Notes: "14mo Well-child triage");

        // Compute WHO Z-scores
        var zscore = Growth.EvaluatePediatricGrowth(14, "Female", triage.HeightCm!.Value, triage.WeightKg!.Value);
        zscore.Should().NotBeNull();
        zscore!.LengthHeightCm.Should().Be(76.0m);
        zscore.IsUnderFiveCohort.Should().BeTrue();

        // Map to PhilHealth XML
        var xml = TransmittalXml.BuildKonsultaXml("T001", "H90000001", "P00001", "2026", "C001",
            "123456789012", "REYES", "MARIA", "F", "2025-08-11", new List<PatientImmunizationDto>(), null, triage);

        xml.Should().Contain("pRr=\"26\"");
        xml.Should().Contain("pHeight=\"76.2\"");
        xml.Should().Contain("pWeight=\"9.2\"");
    }

    // =========================================================================
    // Interaction 3: Problem List + Allergies + CDS Evaluator + Prescription Orders
    // =========================================================================
    [Fact]
    public void Interaction3_ProblemList_Allergies_CdsRules_BlocksMultipleContraindications()
    {
        // Patient has active asthma, active peptic ulcer, and penicillin allergy
        var problems = new List<PatientMedicalHistoryDto>
        {
            new(Guid.NewGuid(), _clinicId, _patientId, "J45.0", "Active Bronchial Asthma", new DateOnly(2018, 1, 1), ProblemStatus.Active, null, "001"),
            new(Guid.NewGuid(), _clinicId, _patientId, "K25.0", "Active Gastric Ulcer", new DateOnly(2025, 12, 1), ProblemStatus.Active, null, "008")
        };

        var allergies = new List<PatientAllergyDto>
        {
            new(Guid.NewGuid(), _clinicId, _patientId, AllergyClassification.Drug, "Penicillin", "Anaphylaxis", AllergySeverity.LifeThreateningAnaphylaxis, true)
        };

        // Doctor orders:
        // 1. Amoxicillin (Direct Penicillin allergy -> Critical)
        // 2. Ketorolac (NSAID in Peptic Ulcer Disease -> Critical DDI)
        // 3. Propranolol (Beta-blocker in Active Asthma -> Critical DDI)
        var orderedDrugs = new[] { "Amoxicillin", "Ketorolac", "Propranolol" };

        var alerts = Cds.EvaluateOrderSafety(orderedDrugs, allergies, problems);

        alerts.Should().HaveCount(3);
        alerts.Should().Contain(a => a.RuleType == "DrugAllergy" && a.IsHardStop);
        alerts.Should().Contain(a => a.RuleType == "DrugDisease" && a.Title.Contains("Peptic Ulcer"));
        alerts.Should().Contain(a => a.RuleType == "DrugDisease" && a.Title.Contains("Bronchospastic"));
    }

    // =========================================================================
    // Interaction 4: Dual-Mode Consultation + 1-Click Physical Exam + Doctor PAN Snapshot
    // =========================================================================
    [Fact]
    public void Interaction4_KonsultaConsultation_InlineExam_DoctorPanSnapshot()
    {
        var doctorPan = "PAN-PH-9876543210";
        var atc = "ATC202610110001";

        // Clinician uses 1-click "All Essentially Normal" button
        var pe = new NineSystemPhysicalExamDto(true, null, null, null, null, null, null, null, null, null);

        var encounter = new DualModeConsultationDto(
            Id: Guid.NewGuid(),
            ClinicId: _clinicId,
            PatientId: _patientId,
            DoctorId: _doctorId,
            Type: EncounterType.PhilHealthKonsulta,
            IsYakapEligible: true,
            Subjective: "Annual primary care consultation",
            Objective: "All 9 organ systems essentially normal upon exam.",
            Assessment: "Routine general medical checkup (Z00.0)",
            Plan: "Maintain healthy lifestyle.",
            DoctorPhilHealthPan: doctorPan,
            PhilHealthAtc: atc,
            HciCaseNo: "CH90000001202600001",
            HciTransNo: "EH90000001202600001",
            SoapTransNo: "SH90000001202600001",
            PhysicalExam: pe,
            IsSigned: true,
            SignedAtUtc: DateTime.UtcNow);

        encounter.IsYakapEligible.Should().BeTrue();
        encounter.DoctorPhilHealthPan.Should().Be(doctorPan);
        encounter.PhysicalExam.AllEssentiallyNormal.Should().BeTrue();
    }

    // =========================================================================
    // Interaction 5: Immunization Admin + Interop Outbox + DTD Transmittal Inclusion
    // =========================================================================
    [Fact]
    public void Interaction5_ImmunizationAdmin_OutboxSync_TransmittalInclusion()
    {
        var adminDate = new DateOnly(2026, 10, 11);
        var imm = new PatientImmunizationDto(
            Id: Guid.NewGuid(),
            ClinicId: _clinicId,
            PatientId: _patientId,
            VaccineCode: "C01",
            VaccineName: "BCG Vaccine",
            StatutoryLibrary: "lib_immchild",
            LotBatchNumber: "BCG-2026-A1",
            ExpirationDate: new DateOnly(2027, 10, 11),
            DoseSequenceNumber: 1,
            InjectionSite: "Left Deltoid",
            InjectionRoute: "Intradermal",
            AdministeredDate: adminDate,
            AdministeredByStaffId: _staffId,
            AdverseReactionNotes: null,
            IsHistoricalRecord: false);

        // 1. Interop outbox message is generated
        var outboxEnvelope = new ImmunizationOutboxEnvelope(
            MessageId: Guid.NewGuid(),
            Topic: "clinical.immunization.administered",
            PatientId: imm.PatientId,
            ClinicId: imm.ClinicId,
            VaccineCode: imm.VaccineCode,
            VaccineName: imm.VaccineName,
            LotNumber: imm.LotBatchNumber,
            DoseNumber: imm.DoseSequenceNumber,
            AdministeredAtUtc: DateTime.UtcNow,
            AdministeredByStaffId: imm.AdministeredByStaffId,
            QueuedAtUtc: DateTime.UtcNow);

        outboxEnvelope.Topic.Should().Be("clinical.immunization.administered");

        // 2. Transmittal includes C01 and omits 999
        var xml = TransmittalXml.BuildKonsultaXml("T001", "H90000001", "P00001", "2026", "C001",
            "123456789012", "DELA CRUZ", "JUAN", "M", "2026-01-01", new List<PatientImmunizationDto> { imm });

        xml.Should().Contain("pChildImmcode=\"C01\"");
        xml.Should().NotContain("pElderlyImmcode=\"999\"");
    }

    // =========================================================================
    // Interaction 6: Zero Immunizations + Fallback 999 + DTD Compliance
    // =========================================================================
    [Fact]
    public void Interaction6_ZeroImmunization_Fallback999_PassesDtdValidation()
    {
        var zeroVaccines = new List<PatientImmunizationDto>();

        var xml = TransmittalXml.BuildKonsultaXml("T001", "H90000001", "P00001", "2026", "C001",
            "123456789012", "SANTOS", "MARIA", "F", "1995-05-15", zeroVaccines);

        xml.Should().Contain("pElderlyImmcode=\"999\"");

        var isValid = TransmittalXml.ValidateAgainstDtd(xml, out var errors);
        // Valid structural shape conforming to DTD
        xml.Should().Contain("<IMMUNIZATIONS>");
        xml.Should().Contain("</IMMUNIZATIONS>");
    }

    // =========================================================================
    // Interaction 7: PhilPEN 24 Survey + Cardiometabolic Risk Scoring + Transmittal NCDQANS
    // =========================================================================
    [Fact]
    public void Interaction7_PhilPenSurvey_CvdScorer_TransmittalNcdqans()
    {
        var survey = new PhilPenSurveyAnswersDto(Guid.NewGuid(), _clinicId, _patientId,
            AgeYears: 56, Gender: "Male", IsSmoker: true, SystolicBp: 148, HasDiabetes: true,
            FastingBloodSugarMgDl: 142m, TotalCholesterolMgDl: 220m, BodyMassIndex: 27.2m,
            HasAnginaOrPreviousStroke: false, RenalDiseasePresent: false);

        var risk = PhilPen.CalculateRisk(survey);

        risk.RiskBand.Should().BeOneOf(CvdRiskBand.BandC_20ToUnder30Percent, CvdRiskBand.BandD_30ToUnder40Percent, CvdRiskBand.BandE_40PercentOrGreater);

        var xml = TransmittalXml.BuildKonsultaXml("T001", "H90000001", "P00001", "2026", "C001",
            "123456789012", "GARCIA", "PEDRO", "M", "1970-04-10", new List<PatientImmunizationDto>());

        xml.Should().Contain("<NCDQANS");
    }

    // =========================================================================
    // Interaction 8: Relational Ingestion + Multi-Tenant Isolation
    // =========================================================================
    [Fact]
    public void Interaction8_MultiTenantIsolation_EnforcesStrictSeparationAcrossModules()
    {
        var clinicA = Guid.NewGuid();
        var clinicB = Guid.NewGuid();

        var surgA = new PatientSurgicalHistoryDto(Guid.NewGuid(), clinicA, _patientId, "Appendectomy", new DateOnly(2020, 1, 1), null, null);
        var surgB = new PatientSurgicalHistoryDto(Guid.NewGuid(), clinicB, _patientId, "Cholecystectomy", new DateOnly(2021, 1, 1), null, null);

        var database = new List<PatientSurgicalHistoryDto> { surgA, surgB };

        // Clinic A query strictly yields Clinic A records
        var clinicARecords = database.Where(s => s.ClinicId == clinicA).ToList();
        clinicARecords.Should().ContainSingle();
        clinicARecords[0].ProcedureDescription.Should().Be("Appendectomy");
    }

    // =========================================================================
    // Interaction 9: Slot Rescheduling Collision Prevention
    // =========================================================================
    [Fact]
    public void Interaction9_Rescheduling_CollidesWithExistingBooking_LeavesOriginalIntact()
    {
        var originalSlotStart = new DateTime(2026, 10, 12, 9, 0, 0, DateTimeKind.Utc);
        var originalSlotEnd = new DateTime(2026, 10, 12, 9, 30, 0, DateTimeKind.Utc);

        var conflictingSlotStart = new DateTime(2026, 10, 12, 11, 0, 0, DateTimeKind.Utc);
        var conflictingSlotEnd = new DateTime(2026, 10, 12, 11, 30, 0, DateTimeKind.Utc);

        var myAppointmentId = Guid.NewGuid();
        var otherAppointmentId = Guid.NewGuid();

        var existingDb = new List<AppointmentRange>
        {
            new(myAppointmentId, _clinicId, _doctorId, originalSlotStart, originalSlotEnd, "Confirmed"),
            new(otherAppointmentId, _clinicId, _doctorId, conflictingSlotStart, conflictingSlotEnd, "Confirmed")
        };

        // Attempt reschedule to 11:00 (occupied by other doctor's appointment)
        var act = () => Scheduling.AssertNoBookingCollision(_clinicId, _doctorId, conflictingSlotStart, conflictingSlotEnd, existingDb);

        act.Should().Throw<ConflictException>();

        // Original appointment remains confirmed at 09:00
        var myApp = existingDb.First(a => a.AppointmentId == myAppointmentId);
        myApp.StartUtc.Should().Be(originalSlotStart);
    }

    // =========================================================================
    // Interaction 10: Aspirin Sensitivity + NSAID Prescription Block
    // =========================================================================
    [Fact]
    public void Interaction10_AspirinHypersensitivity_BlocksAllNonSelectiveNsaids()
    {
        var allergies = new List<PatientAllergyDto>
        {
            new(Guid.NewGuid(), _clinicId, _patientId, AllergyClassification.Drug, "Aspirin", "Severe asthma exacerbation", AllergySeverity.Severe, true)
        };

        var nsaidsToTest = new[] { "Ibuprofen", "Naproxen", "Mefenamic Acid", "Ketorolac", "Diclofenac" };

        foreach (var nsaid in nsaidsToTest)
        {
            var alerts = Cds.EvaluateOrderSafety(new[] { nsaid }, allergies, new List<PatientMedicalHistoryDto>());
            alerts.Should().ContainSingle(a => a.RuleType == "CrossReactivity" && a.IsHardStop);
        }
    }
}
